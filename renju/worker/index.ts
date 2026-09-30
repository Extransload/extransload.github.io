import { analyzeMove, boardFromMoves, index, SIZE, type Color, type Move } from '../../src/domains/games/renju/rules';
import { advanceClock, finishMoveClock, freshClock, timeoutAfter } from '../../src/domains/games/renju/clock';
import {
  DEFAULT_SETTINGS,
  DISCONNECT_GRACE_MS,
  ROLES,
  validSettings,
  type ClockState,
  type FinishReason,
  type GameSettings,
  type GameStatus,
  type PlayerRole,
  type RoomRole,
  type RoomSnapshot,
} from '../../src/domains/games/renju/protocol';

interface Env {
  ROOMS: DurableObjectNamespace;
}
type Room = {
  hostHash: string;
  guestHash?: string;
  moves: Move[];
  status: GameStatus;
  winner?: PlayerRole | 'draw';
  reason?: FinishReason;
  version: number;
  ready: Record<PlayerRole, boolean>;
  settings: GameSettings;
  clocks: Record<PlayerRole, ClockState> | null;
  activeSince: number | null;
  disconnects: Partial<Record<PlayerRole, number>>;
};
type SocketData = { role: RoomRole };
type Message = {
  type?: 'ready' | 'settings' | 'move' | 'resign';
  ready?: boolean;
  settings?: unknown;
  x?: number;
  y?: number;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const token = () => crypto.randomUUID() + crypto.randomUUID();
async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
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
    const match = url.pathname.match(/^\/api\/rooms\/([0-9a-f-]{36})(?:\/(enter|join|ws|session))?$/);
    if (!match) return cors(json({ error: 'not-found' }, 404), origin);
    const [, id, operation] = match;
    const target =
      operation === 'enter' || operation === 'join'
        ? '/enter'
        : operation === 'ws'
          ? '/ws'
          : operation === 'session'
            ? '/session'
            : '/snapshot';
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
    const stored = await this.ctx.storage.get<Room>('room');
    if (!stored) return undefined;
    // Rooms created before ready/clocks shipped remain viewable and playable.
    return {
      ...stored,
      ready: stored.ready ?? { black: false, white: false },
      settings: stored.settings ?? DEFAULT_SETTINGS,
      clocks: stored.clocks ?? null,
      activeSince: stored.activeSince ?? null,
      disconnects: stored.disconnects ?? {},
    };
  }
  private async write(room: Room) {
    await this.ctx.storage.put('room', room);
  }
  private sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === 1);
  }
  private roleOf(socket: WebSocket): RoomRole | null {
    return (socket.deserializeAttachment() as SocketData | null)?.role ?? null;
  }
  private connected(role: PlayerRole, except?: WebSocket) {
    return this.sockets(except).some((ws) => this.roleOf(ws) === role);
  }
  private snapshot(room: Room): RoomSnapshot {
    return {
      moves: room.moves,
      status: room.status,
      winner: room.winner,
      reason: room.reason,
      version: room.version,
      joined: !!room.guestHash,
      ready: room.ready,
      connected: { black: this.connected('black'), white: this.connected('white') },
      spectators: this.sockets().filter((ws) => this.roleOf(ws) === 'spectator').length,
      settings: room.settings,
      clocks: room.clocks,
      activeSince: room.activeSince,
      disconnects: room.disconnects,
      serverNow: Date.now(),
    };
  }
  private broadcast(room: Room) {
    const payload = JSON.stringify({ type: 'state', state: this.snapshot(room) });
    for (const socket of this.sockets())
      try {
        socket.send(payload);
      } catch {
        socket.close();
      }
  }
  private finish(room: Room, winner: PlayerRole | 'draw', reason: FinishReason) {
    room.status = 'finished';
    room.winner = winner;
    room.reason = reason;
    room.activeSince = null;
    room.disconnects = {};
    room.version++;
  }
  private async schedule(room: Room) {
    const deadlines = Object.values(room.disconnects).filter((v): v is number => typeof v === 'number');
    if (room.status === 'playing' && room.clocks && room.activeSince !== null && !deadlines.length) {
      const turn: PlayerRole = room.moves.length % 2 === 0 ? 'black' : 'white';
      deadlines.push(room.activeSince + timeoutAfter(room.clocks[turn], room.settings));
    }
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private settleTurn(room: Room, now: number) {
    if (room.status !== 'playing' || !room.clocks || room.activeSince === null) return false;
    const turn: PlayerRole = room.moves.length % 2 === 0 ? 'black' : 'white';
    const advanced = advanceClock(room.clocks[turn], now - room.activeSince, room.settings);
    room.clocks[turn] = advanced.clock;
    room.activeSince = null;
    if (advanced.expired) this.finish(room, turn === 'black' ? 'white' : 'black', 'time');
    return advanced.expired;
  }
  private startIfReady(room: Room, now: number) {
    if (
      (room.status !== 'waiting' && room.status !== 'finished') ||
      !room.guestHash ||
      !room.ready.black ||
      !room.ready.white
    )
      return;
    if (!this.connected('black') || !this.connected('white')) return;
    room.status = 'playing';
    room.moves = [];
    room.winner = undefined;
    room.reason = undefined;
    room.ready = { black: false, white: false };
    room.clocks = { black: freshClock(room.settings), white: freshClock(room.settings) };
    room.activeSince = now;
    room.disconnects = {};
  }
  private expireDisconnects(room: Room, now: number) {
    if (
      room.status === 'waiting' &&
      room.disconnects.white &&
      room.disconnects.white <= now &&
      !this.connected('white')
    ) {
      room.guestHash = undefined;
      room.ready.white = false;
      delete room.disconnects.white;
      room.version++;
    }
    if (room.status !== 'playing') return;
    const expired = ROLES.filter(
      (role) => room.disconnects[role] && room.disconnects[role]! <= now && !this.connected(role),
    );
    if (!expired.length) return;
    const winner = expired.length === 2 ? 'draw' : expired[0] === 'black' ? 'white' : 'black';
    this.finish(room, winner, 'disconnect');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.read()) return json({ error: 'exists' }, 409);
      const { secret } = (await request.json()) as { secret: string };
      await this.write({
        hostHash: await hash(secret),
        moves: [],
        status: 'waiting',
        version: 0,
        ready: { black: false, white: false },
        settings: DEFAULT_SETTINGS,
        clocks: null,
        activeSince: null,
        disconnects: {},
      });
      return json({ ok: true });
    }
    const room = await this.read();
    if (!room) return json({ error: 'not-found' }, 404);
    if (url.pathname === '/snapshot' && request.method === 'GET') return json(this.snapshot(room));
    if (url.pathname === '/session' && request.method === 'GET') {
      const secret = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!secret) return json({ error: 'unauthorized' }, 401);
      const hashed = await hash(secret);
      const role: PlayerRole | undefined =
        hashed === room.hostHash ? 'black' : hashed === room.guestHash ? 'white' : undefined;
      return role ? json({ role }) : json({ error: 'unauthorized' }, 401);
    }
    if (url.pathname === '/enter' && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const latest = (await this.read())!;
        this.expireDisconnects(latest, Date.now());
        if (latest.status === 'waiting' && !latest.guestHash) {
          const secret = token();
          latest.guestHash = await hash(secret);
          latest.ready.white = false;
          latest.disconnects.white = Date.now() + DISCONNECT_GRACE_MS;
          latest.version++;
          await this.write(latest);
          await this.schedule(latest);
          this.broadcast(latest);
          return json({ token: secret, role: 'white' });
        }
        await this.write(latest);
        await this.schedule(latest);
        return json({ role: 'spectator' });
      });
    }
    if (url.pathname === '/ws' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const secret = url.searchParams.get('token');
      let role: RoomRole = 'spectator';
      if (secret) {
        const hashed = await hash(secret);
        if (hashed === room.hostHash) role = 'black';
        else if (hashed === room.guestHash) role = 'white';
        else return json({ error: 'unauthorized' }, 401);
      }
      return this.ctx.blockConcurrencyWhile(async () => {
        const latest = (await this.read())!;
        if (secret) {
          const hashed = await hash(secret);
          if ((role === 'black' && hashed !== latest.hostHash) || (role === 'white' && hashed !== latest.guestHash))
            return json({ error: 'unauthorized' }, 401);
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ role } satisfies SocketData);
        if (role !== 'spectator') {
          delete latest.disconnects[role];
          if (
            latest.status === 'playing' &&
            Object.keys(latest.disconnects).length === 0 &&
            latest.activeSince === null
          )
            latest.activeSince = Date.now();
        }
        latest.version++;
        await this.write(latest);
        await this.schedule(latest);
        this.broadcast(latest);
        return new Response(null, { status: 101, webSocket: client });
      });
    }
    return json({ error: 'not-found' }, 404);
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(() => this.applyMessage(socket, raw));
  }
  private async applyMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const role = this.roleOf(socket);
    const room = await this.read();
    if (!room || !role || role === 'spectator') return;
    let message: Message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'invalid-message' }));
      return;
    }
    const now = Date.now();
    this.expireDisconnects(room, now);
    if (room.status === 'finished' && message.type !== 'ready' && message.type !== 'settings') {
      await this.write(room);
      await this.schedule(room);
      this.broadcast(room);
      return;
    }
    if (message.type === 'settings') {
      if (
        role !== 'black' ||
        (room.status !== 'waiting' && room.status !== 'finished') ||
        !validSettings(message.settings)
      )
        return;
      room.settings = message.settings;
      room.ready = { black: false, white: false };
      room.version++;
    } else if (message.type === 'ready') {
      if ((room.status !== 'waiting' && room.status !== 'finished') || typeof message.ready !== 'boolean') return;
      room.ready[role] = message.ready;
      this.startIfReady(room, now);
      room.version++;
    } else if (message.type === 'resign') {
      if (room.status !== 'playing') return;
      this.finish(room, role === 'black' ? 'white' : 'black', 'resign');
    } else if (message.type === 'move') {
      if (room.status !== 'playing' || Object.keys(room.disconnects).length) return;
      const color: Color = room.moves.length % 2 === 0 ? 1 : 2;
      if ((color === 1 ? 'black' : 'white') !== role) return;
      if (this.settleTurn(room, now)) {
        await this.write(room);
        await this.schedule(room);
        this.broadcast(room);
        return;
      }
      const { x, y } = message;
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
      if (room.clocks) room.clocks[role] = finishMoveClock(room.clocks[role], room.settings);
      room.moves.push({ x, y, color });
      if (verdict.win) this.finish(room, role, 'five');
      else if (room.moves.length === SIZE * SIZE) this.finish(room, 'draw', 'full');
      else room.activeSince = now;
      room.version++;
    } else return;
    await this.write(room);
    await this.schedule(room);
    this.broadcast(room);
  }

  async webSocketClose(socket: WebSocket) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.read();
      if (!room) return;
      const role = this.roleOf(socket);
      const now = Date.now();
      if (role && role !== 'spectator' && !this.connected(role, socket)) {
        if (room.status === 'waiting' || room.status === 'finished') {
          room.ready[role] = false;
          if (role === 'white' && room.status === 'waiting') room.disconnects.white = now + DISCONNECT_GRACE_MS;
        } else if (room.status === 'playing') {
          this.settleTurn(room, now);
          if (room.status === 'playing') room.disconnects[role] = now + DISCONNECT_GRACE_MS;
        }
      }
      room.version++;
      await this.write(room);
      await this.schedule(room);
      this.broadcast(room);
    });
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.read();
      if (!room) return;
      const now = Date.now();
      this.expireDisconnects(room, now);
      if (room.status === 'playing' && !Object.keys(room.disconnects).length) this.settleTurn(room, now);
      if (room.status === 'playing' && room.activeSince === null) room.activeSince = now;
      await this.write(room);
      await this.schedule(room);
      this.broadcast(room);
    });
  }
}
