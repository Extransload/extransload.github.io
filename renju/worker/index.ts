import { analyzeMove, boardFromMoves, index, SIZE, type Color, type Move } from '../../src/domains/games/renju/rules';

interface Env {
  ROOMS: DurableObjectNamespace;
}
type Role = 'black' | 'white';
type Room = {
  hostHash: string;
  guestHash?: string;
  moves: Move[];
  status: 'waiting' | 'playing' | 'finished';
  winner?: Role | 'draw';
  reason?: string;
  version: number;
};
type SocketData = { role: Role };

const json = (body: unknown, status = 200) => Response.json(body, { status });
const token = () => crypto.randomUUID() + crypto.randomUUID();
async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
function publicState(room: Room) {
  return {
    moves: room.moves,
    status: room.status,
    winner: room.winner,
    reason: room.reason,
    version: room.version,
    joined: !!room.guestHash,
  };
}
function authorizedOrigin(origin: string | null) {
  if (!origin) return true;
  return origin === 'https://extransload.github.io' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}
function cors(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers, webSocket: response.webSocket });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!authorizedOrigin(origin)) return json({ error: 'origin' }, 403);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const id = crypto.randomUUID();
      const secret = token();
      const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(
        new Request(`${url.origin}/init`, { method: 'POST', body: JSON.stringify({ secret }) }),
      );
      if (!response.ok) return cors(response, origin);
      return cors(json({ id, token: secret, role: 'black' }, 201), origin);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([0-9a-f-]{36})(?:\/(join|ws|session))?$/);
    if (!match) return cors(json({ error: 'not-found' }, 404), origin);
    const [, id, operation] = match;
    const target =
      operation === 'join' ? '/join' : operation === 'ws' ? '/ws' : operation === 'session' ? '/session' : '/snapshot';
    const roomUrl = new URL(target, url.origin);
    roomUrl.search = url.search;
    const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request(roomUrl, request));
    return operation === 'ws' ? response : cors(response, origin);
  },
};

export class RenjuRoom {
  constructor(
    private ctx: DurableObjectState,
    _env: Env,
  ) {}

  private async read(): Promise<Room | undefined> {
    return this.ctx.storage.get<Room>('room');
  }
  private async write(room: Room) {
    await this.ctx.storage.put('room', room);
  }
  private broadcast(room: Room) {
    const payload = JSON.stringify({ type: 'state', state: publicState(room) });
    for (const socket of this.ctx.getWebSockets())
      try {
        socket.send(payload);
      } catch {
        socket.close();
      }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.read()) return json({ error: 'exists' }, 409);
      const { secret } = (await request.json()) as { secret: string };
      await this.write({ hostHash: await hash(secret), moves: [], status: 'waiting', version: 0 });
      return json({ ok: true });
    }
    const room = await this.read();
    if (!room) return json({ error: 'not-found' }, 404);
    if (url.pathname === '/snapshot' && request.method === 'GET') return json(publicState(room));
    if (url.pathname === '/session' && request.method === 'GET') {
      const secret = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!secret) return json({ error: 'unauthorized' }, 401);
      const hashed = await hash(secret);
      const role: Role | undefined =
        hashed === room.hostHash ? 'black' : hashed === room.guestHash ? 'white' : undefined;
      return role ? json({ role }) : json({ error: 'unauthorized' }, 401);
    }
    if (url.pathname === '/join' && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const latest = await this.read();
        if (!latest || latest.guestHash || latest.status !== 'waiting') return json({ error: 'full' }, 409);
        const secret = token();
        latest.guestHash = await hash(secret);
        latest.status = 'playing';
        latest.version++;
        await this.write(latest);
        this.broadcast(latest);
        return json({ token: secret, role: 'white' });
      });
    }
    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const secret = url.searchParams.get('token');
      if (!secret) return json({ error: 'unauthorized' }, 401);
      const hashed = await hash(secret);
      const role: Role | undefined =
        hashed === room.hostHash ? 'black' : hashed === room.guestHash ? 'white' : undefined;
      if (!role) return json({ error: 'unauthorized' }, 401);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role } satisfies SocketData);
      server.send(JSON.stringify({ type: 'state', state: publicState(room) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return json({ error: 'not-found' }, 404);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(() => this.applyMessage(socket, raw));
  }

  private async applyMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const attachment = socket.deserializeAttachment() as SocketData | null;
    const room = await this.read();
    if (!room || !attachment) return;
    let message: { type?: string; x?: number; y?: number };
    try {
      message = JSON.parse(String(raw));
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'invalid-message' }));
      return;
    }
    const role = attachment.role;
    if (message.type === 'resign' && room.status === 'playing') {
      room.status = 'finished';
      room.winner = role === 'black' ? 'white' : 'black';
      room.reason = 'resign';
      room.version++;
    } else if (message.type === 'move') {
      if (room.status !== 'playing') return;
      const color: Color = room.moves.length % 2 === 0 ? 1 : 2;
      if ((color === 1 ? 'black' : 'white') !== role) return;
      const x = message.x,
        y = message.y;
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x === undefined ||
        y === undefined ||
        x < 0 ||
        y < 0 ||
        x >= SIZE ||
        y >= SIZE
      )
        return;
      if (room.moves.length === 0 && (x !== 7 || y !== 7)) {
        socket.send(JSON.stringify({ type: 'error', error: 'center-first' }));
        return;
      }
      const board = boardFromMoves(room.moves);
      if (board[index(x, y)]) return;
      const verdict = analyzeMove(board, x, y, color);
      if (!verdict.legal) {
        socket.send(JSON.stringify({ type: 'error', error: verdict.forbidden ?? 'illegal' }));
        return;
      }
      room.moves.push({ x, y, color });
      if (verdict.win) {
        room.status = 'finished';
        room.winner = role;
        room.reason = 'five';
      } else if (room.moves.length === SIZE * SIZE) {
        room.status = 'finished';
        room.winner = 'draw';
        room.reason = 'full';
      }
      room.version++;
    } else return;
    await this.write(room);
    this.broadcast(room);
  }
}
