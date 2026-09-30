import { analyzeMove, boardFromMoves, index, SIZE, type Color, type Move } from '../../src/domains/games/renju/rules';
import { advanceClock, finishMoveClock, freshClock, timeoutAfter } from '../../src/domains/games/renju/clock';
import {
  DEFAULT_SETTINGS,
  DISCONNECT_GRACE_MS,
  REMATCH_WINDOW_MS,
  ROLES,
  validSettings,
  type ClockState,
  type FinishReason,
  type GameSettings,
  type GameStatus,
  type PlayerRole,
  type RoomRole,
  type RoomSnapshot,
  type PlayerIdentity,
  type ChatMessage,
  type PublicRoom,
} from '../../src/domains/games/renju/protocol';

interface Env {
  ROOMS: DurableObjectNamespace;
  LOBBY: DurableObjectNamespace;
}
type Visitor = PlayerIdentity & { ip: string };
type Room = {
  publicId?: string;
  createdAt?: number;
  lobbyVersion?: number;
  lobbySignature?: string;
  hostHash: string;
  guestHash?: string;
  moves: Move[];
  status: GameStatus;
  winner?: PlayerRole | 'draw';
  reason?: FinishReason;
  version: number;
  ready: Record<PlayerRole, boolean>;
  rematchDeadline?: number | null;
  rematchClosed?: boolean;
  settings: GameSettings;
  clocks: Record<PlayerRole, ClockState> | null;
  activeSince: number | null;
  disconnects: Partial<Record<PlayerRole, number>>;
  public?: boolean;
  players?: Record<PlayerRole, PlayerIdentity | null>;
  chat?: ChatMessage[];
};
type CachedRoom = PublicRoom & { version: number; updatedAt: number };
const LOBBY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type SocketData = { role: RoomRole; visitor: Visitor; lastChat: number };
type Message = {
  type?: 'ready' | 'rematch' | 'rematch-decline' | 'settings' | 'move' | 'resign' | 'chat';
  ready?: boolean;
  settings?: unknown;
  x?: number;
  y?: number;
  text?: string;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const token = () => crypto.randomUUID() + crypto.randomUUID();
const publicIdentity = ({ name, country, maskedIp }: PlayerIdentity): PlayerIdentity => ({ name, country, maskedIp });
function maskIp(ip: string) {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip.replace(/\.\d+$/, '.xxx');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}::****`;
  return 'unknown';
}
function visitor(request: Request, name: unknown): Visitor {
  const value = typeof name === 'string' && /^[A-Za-z][A-Za-z0-9 -]{2,29}$/.test(name.trim()) ? name.trim() : 'Guest';
  const cf = request.cf as { country?: string } | undefined;
  const country = cf?.country && /^[A-Z]{2}$/.test(cf.country) ? cf.country : 'XX';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return { name: value, country, ip, maskedIp: maskIp(ip) };
}
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
    if (url.pathname.startsWith('/api/public/')) {
      const lobby = env.LOBBY.get(env.LOBBY.idFromName('global'));
      if (url.pathname === '/api/public/rooms' && request.method === 'GET')
        return cors(await lobby.fetch(new Request(`${url.origin}/rooms`)), origin);
      if ((url.pathname === '/api/public/rooms' || url.pathname === '/api/public/match') && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { name?: unknown };
        const target = url.pathname.endsWith('/match') ? '/match' : '/create';
        return cors(
          await lobby.fetch(
            new Request(`${url.origin}${target}`, {
              method: 'POST',
              body: JSON.stringify({ visitor: visitor(request, body.name) }),
            }),
          ),
          origin,
        );
      }
      return cors(json({ error: 'not-found' }, 404), origin);
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { name?: unknown };
      const id = crypto.randomUUID();
      const secret = token();
      const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(
        new Request(`${url.origin}/init`, {
          method: 'POST',
          body: JSON.stringify({ secret, visitor: visitor(request, body.name), public: false }),
        }),
      );
      if (!response.ok) return cors(response, origin);
      return cors(json({ id, token: secret, role: 'black' }, 201), origin);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([0-9a-f-]{36})(?:\/(enter|join|ws|session|leave))?$/);
    if (!match) return cors(json({ error: 'not-found' }, 404), origin);
    const [, id, operation] = match;
    const target =
      operation === 'enter' || operation === 'join'
        ? '/enter'
        : operation === 'ws'
          ? '/ws'
          : operation === 'session' || operation === 'leave'
            ? `/${operation}`
            : '/snapshot';
    const roomUrl = new URL(target, url.origin);
    roomUrl.search = url.search;
    let forwarded: Request;
    if (operation === 'enter' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { name?: unknown };
      forwarded = new Request(roomUrl, {
        method: 'POST',
        body: JSON.stringify({ visitor: visitor(request, body.name) }),
      });
    } else {
      forwarded = new Request(roomUrl, request);
      if (operation === 'ws') {
        const headers = new Headers(forwarded.headers);
        const identity = visitor(request, url.searchParams.get('name'));
        headers.set('X-Renju-Name', identity.name);
        headers.set('X-Renju-Country', identity.country);
        headers.set('X-Renju-IP', identity.ip);
        forwarded = new Request(forwarded, { headers });
      }
    }
    const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(forwarded);
    return operation === 'ws' ? response : cors(response, origin);
  },
};

export class RenjuLobby {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}
  private async entries(): Promise<CachedRoom[]> {
    const stored = (await this.ctx.storage.get<Array<CachedRoom | { id: string; createdAt: number }>>('rooms')) ?? [];
    const entries: CachedRoom[] = [];
    let changed = false;
    for (const entry of stored.slice(0, 80)) {
      if (Date.now() - (('updatedAt' in entry && entry.updatedAt) || entry.createdAt) > LOBBY_MAX_AGE_MS) {
        changed = true;
        continue;
      }
      if ('status' in entry) {
        if (entry.status === 'waiting' && !entry.connected) {
          changed = true;
          const state = await this.inspect(entry.id);
          if (!state?.public) continue;
          entry.status = state.status;
          entry.joined = state.joined;
          entry.connected = state.connected;
          entry.players = state.players;
          entry.spectators = state.spectators;
          entry.settings = state.settings;
          entry.version = Math.max(entry.version, state.version);
          if (state.connected.black) entry.updatedAt = Date.now();
        }
        if (
          entry.status === 'waiting' &&
          !entry.connected?.black &&
          Date.now() - entry.updatedAt > DISCONNECT_GRACE_MS
        ) {
          changed = true;
          continue;
        }
        entries.push(entry);
        continue;
      }
      // Older deployments stored only room IDs. Convert these once, then serve the cached list.
      changed = true;
      const state = await this.inspect(entry.id);
      if (!state?.public) continue;
      const cached: CachedRoom = {
        id: entry.id,
        status: state.status,
        joined: state.joined,
        connected: state.connected,
        players: state.players,
        spectators: state.spectators,
        settings: state.settings,
        createdAt: entry.createdAt,
        version: state.version,
        updatedAt: state.connected.black ? Date.now() : entry.createdAt,
      };
      if (
        cached.status === 'waiting' &&
        !cached.connected?.black &&
        Date.now() - cached.updatedAt > DISCONNECT_GRACE_MS
      )
        continue;
      entries.push(cached);
      await this.env.ROOMS.get(this.env.ROOMS.idFromName(entry.id)).fetch(
        new Request('https://room.internal/index', {
          method: 'POST',
          body: JSON.stringify({ id: entry.id, createdAt: entry.createdAt, version: state.version }),
        }),
      );
    }
    if (changed || stored.length > 80) await this.ctx.storage.put('rooms', entries);
    return entries;
  }
  private async inspect(id: string): Promise<RoomSnapshot | null> {
    const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(id)).fetch('https://room.internal/snapshot');
    return response.ok ? response.json<RoomSnapshot>() : null;
  }
  private async create(visitor: Visitor) {
    const id = crypto.randomUUID(),
      secret = token();
    const createdAt = Date.now();
    const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(id)).fetch(
      new Request('https://room.internal/init', {
        method: 'POST',
        body: JSON.stringify({ secret, visitor, public: true, id, createdAt }),
      }),
    );
    if (!response.ok) return json({ error: 'create-failed' }, 502);
    const list = await this.entries();
    list.unshift({
      id,
      status: 'waiting',
      joined: false,
      connected: { black: false, white: false },
      players: { black: publicIdentity(visitor), white: null },
      spectators: 0,
      settings: DEFAULT_SETTINGS,
      createdAt,
      version: 0,
      updatedAt: createdAt,
    });
    await this.ctx.storage.put('rooms', list.slice(0, 80));
    return json({ id, token: secret, role: 'black' }, 201);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/rooms' && request.method === 'GET') {
      return json({ rooms: (await this.entries()).filter((entry) => entry.status !== 'finished').slice(0, 40) });
    }
    if (url.pathname === '/sync' && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const update = (await request.json()) as CachedRoom;
        const entries = await this.entries();
        const previous = entries.find((entry) => entry.id === update.id);
        if (previous && previous.version >= update.version) return json({ ok: true });
        const next = [update, ...entries.filter((entry) => entry.id !== update.id)].slice(0, 80);
        await this.ctx.storage.put('rooms', next);
        return json({ ok: true });
      });
    }
    if ((url.pathname === '/create' || url.pathname === '/match') && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const { visitor } = (await request.json()) as { visitor: Visitor };
        if (url.pathname === '/match') {
          for (const entry of (await this.entries()).slice(0, 40)) {
            if (entry.status !== 'waiting' || entry.joined) continue;
            const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(entry.id)).fetch(
              new Request('https://room.internal/enter', {
                method: 'POST',
                body: JSON.stringify({ visitor }),
              }),
            );
            if (!response.ok) continue;
            const entered = await response.json<{ role: RoomRole; token?: string }>();
            if (entered.role === 'white' && entered.token) return json({ id: entry.id, ...entered });
          }
        }
        return this.create(visitor);
      });
    }
    return json({ error: 'not-found' }, 404);
  }
}

export class RenjuRoom {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private async read(): Promise<Room | undefined> {
    const stored = await this.ctx.storage.get<Room>('room');
    if (!stored) return undefined;
    // Rooms created before ready/clocks shipped remain viewable and playable.
    return {
      ...stored,
      ready: stored.ready ?? { black: false, white: false },
      rematchDeadline: stored.rematchDeadline ?? null,
      rematchClosed: stored.rematchClosed ?? (stored.status === 'finished' && !stored.rematchDeadline),
      settings: stored.settings ?? DEFAULT_SETTINGS,
      clocks: stored.clocks ?? null,
      activeSince: stored.activeSince ?? null,
      disconnects: stored.disconnects ?? {},
      public: stored.public ?? false,
      players: stored.players ?? { black: null, white: null },
      chat: stored.chat ?? [],
    };
  }
  private publicSummary(room: Room): PublicRoom {
    const state = this.snapshot(room);
    return {
      id: room.publicId!,
      status: state.status,
      joined: state.joined,
      connected: state.connected,
      players: state.players,
      spectators: state.spectators,
      settings: state.settings,
      createdAt: room.createdAt!,
    };
  }
  private async write(room: Room, publish = true) {
    let update: CachedRoom | null = null;
    if (publish && room.public && room.publicId && room.createdAt) {
      const summary = this.publicSummary(room);
      const signature = JSON.stringify({
        status: summary.status,
        joined: summary.joined,
        connected: summary.connected,
        players: summary.players,
        spectators: summary.spectators,
        settings: summary.settings,
      });
      if (signature !== room.lobbySignature) {
        room.lobbySignature = signature;
        room.lobbyVersion = (room.lobbyVersion ?? 0) + 1;
        update = { ...summary, version: room.lobbyVersion, updatedAt: Date.now() };
      }
    }
    await this.ctx.storage.put('room', room);
    if (update) {
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
      this.ctx.waitUntil(
        lobby.fetch(new Request('https://lobby.internal/sync', { method: 'POST', body: JSON.stringify(update) })),
      );
    }
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
    const players = room.players ?? { black: null, white: null };
    return {
      moves: room.moves,
      status: room.status,
      winner: room.winner,
      reason: room.reason,
      version: room.version,
      joined: !!room.guestHash,
      ready: room.ready,
      rematchDeadline: room.rematchDeadline ?? null,
      rematchClosed: !!room.rematchClosed,
      connected: { black: this.connected('black'), white: this.connected('white') },
      spectators: this.sockets().filter((ws) => this.roleOf(ws) === 'spectator').length,
      settings: room.settings,
      clocks: room.clocks,
      activeSince: room.activeSince,
      disconnects: room.disconnects,
      serverNow: Date.now(),
      public: !!room.public,
      players: {
        black: players.black
          ? { name: players.black.name, country: players.black.country, maskedIp: players.black.maskedIp }
          : null,
        white: players.white
          ? { name: players.white.name, country: players.white.country, maskedIp: players.white.maskedIp }
          : null,
      },
      chat: room.chat ?? [],
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
    room.ready = { black: false, white: false };
    room.rematchDeadline = Date.now() + REMATCH_WINDOW_MS;
    room.rematchClosed = false;
    room.version++;
  }
  private closeWaitingRoom(room: Room) {
    room.status = 'finished';
    room.reason = 'disconnect';
    room.rematchDeadline = null;
    room.rematchClosed = true;
    room.ready = { black: false, white: false };
    room.disconnects = {};
    room.version++;
  }
  private async schedule(room: Room) {
    const deadlines = Object.values(room.disconnects).filter((v): v is number => typeof v === 'number');
    if (room.status === 'finished' && !room.rematchClosed && room.rematchDeadline) deadlines.push(room.rematchDeadline);
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
      (room.status !== 'waiting' &&
        (room.status !== 'finished' || room.rematchClosed || !room.rematchDeadline || now >= room.rematchDeadline)) ||
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
    room.rematchDeadline = null;
    room.rematchClosed = false;
  }
  private expireDisconnects(room: Room, now: number) {
    if (
      room.status === 'waiting' &&
      room.disconnects.black &&
      room.disconnects.black <= now &&
      !this.connected('black')
    ) {
      this.closeWaitingRoom(room);
      return;
    }
    if (
      room.status === 'waiting' &&
      room.disconnects.white &&
      room.disconnects.white <= now &&
      !this.connected('white')
    ) {
      room.guestHash = undefined;
      if (room.players) room.players.white = null;
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
      const {
        secret,
        visitor,
        public: isPublic,
        id,
        createdAt,
      } = (await request.json()) as {
        secret: string;
        visitor?: Visitor;
        public?: boolean;
        id?: string;
        createdAt?: number;
      };
      const room: Room = {
        publicId: isPublic ? id : undefined,
        createdAt: isPublic ? createdAt : undefined,
        hostHash: await hash(secret),
        moves: [],
        status: 'waiting',
        version: 0,
        ready: { black: false, white: false },
        rematchDeadline: null,
        rematchClosed: false,
        settings: DEFAULT_SETTINGS,
        clocks: null,
        activeSince: null,
        disconnects: { black: Date.now() + DISCONNECT_GRACE_MS },
        public: !!isPublic,
        players: { black: visitor ? publicIdentity(visitor) : null, white: null },
        chat: [],
      };
      if (room.publicId && room.createdAt) {
        const summary = this.publicSummary(room);
        room.lobbySignature = JSON.stringify({
          status: summary.status,
          joined: summary.joined,
          connected: summary.connected,
          players: summary.players,
          spectators: summary.spectators,
          settings: summary.settings,
        });
        room.lobbyVersion = 0;
      }
      await this.write(room, false);
      await this.schedule(room);
      return json({ ok: true });
    }
    const room = await this.read();
    if (!room) return json({ error: 'not-found' }, 404);
    if (url.pathname === '/index' && request.method === 'POST') {
      const { id, createdAt, version } = (await request.json()) as {
        id: string;
        createdAt: number;
        version: number;
      };
      if (!room.public) return json({ error: 'not-public' }, 400);
      room.publicId = id;
      room.createdAt = createdAt;
      room.lobbyVersion = version;
      const summary = this.publicSummary(room);
      room.lobbySignature = JSON.stringify({
        status: summary.status,
        joined: summary.joined,
        connected: summary.connected,
        players: summary.players,
        spectators: summary.spectators,
        settings: summary.settings,
      });
      await this.write(room, false);
      await this.schedule(room);
      return json({ ok: true });
    }
    if (url.pathname === '/snapshot' && request.method === 'GET') return json(this.snapshot(room));
    if (url.pathname === '/session' && request.method === 'GET') {
      const secret = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!secret) return json({ error: 'unauthorized' }, 401);
      const hashed = await hash(secret);
      const role: PlayerRole | undefined =
        hashed === room.hostHash ? 'black' : hashed === room.guestHash ? 'white' : undefined;
      return role ? json({ role }) : json({ error: 'unauthorized' }, 401);
    }
    if (url.pathname === '/leave' && request.method === 'POST') {
      const secret = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!secret) return json({ error: 'unauthorized' }, 401);
      const hashed = await hash(secret);
      return this.ctx.blockConcurrencyWhile(async () => {
        const latest = (await this.read())!;
        const role = hashed === latest.hostHash ? 'black' : hashed === latest.guestHash ? 'white' : null;
        if (!role) return json({ error: 'unauthorized' }, 401);
        if (latest.status !== 'waiting') return json({ ok: true });
        if (role === 'black') this.closeWaitingRoom(latest);
        else {
          latest.guestHash = undefined;
          if (latest.players) latest.players.white = null;
          latest.ready.white = false;
          delete latest.disconnects.white;
          latest.version++;
        }
        await this.write(latest);
        await this.schedule(latest);
        this.broadcast(latest);
        return json({ ok: true });
      });
    }
    if (url.pathname === '/enter' && request.method === 'POST') {
      const { visitor } = (await request.json()) as { visitor?: Visitor };
      return this.ctx.blockConcurrencyWhile(async () => {
        const latest = (await this.read())!;
        this.expireDisconnects(latest, Date.now());
        if (latest.status === 'waiting' && !latest.guestHash) {
          const secret = token();
          latest.guestHash = await hash(secret);
          latest.players = {
            ...(latest.players ?? { black: null, white: null }),
            white: visitor ? publicIdentity(visitor) : null,
          };
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
        const identity: Visitor = {
          name: request.headers.get('X-Renju-Name') || 'Guest',
          country: request.headers.get('X-Renju-Country') || 'XX',
          ip: request.headers.get('X-Renju-IP') || 'unknown',
          maskedIp: maskIp(request.headers.get('X-Renju-IP') || 'unknown'),
        };
        const seatVisitor =
          role === 'spectator' ? identity : { ...identity, name: latest.players?.[role]?.name ?? identity.name };
        server.serializeAttachment({ role, visitor: seatVisitor, lastChat: 0 } satisfies SocketData);
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
    if (!room || !role) return;
    let message: Message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      socket.send(JSON.stringify({ type: 'error', error: 'invalid-message' }));
      return;
    }
    const now = Date.now();
    this.expireDisconnects(room, now);
    if (message.type === 'chat') {
      const data = socket.deserializeAttachment() as SocketData;
      const value = typeof message.text === 'string' ? message.text.trim().replace(/[\u0000-\u001f\u007f]/g, '') : '';
      if (!value || value.length > 200 || now - data.lastChat < 800) return;
      data.lastChat = now;
      socket.serializeAttachment(data);
      room.chat = [
        ...(room.chat ?? []),
        {
          id: crypto.randomUUID(),
          name: data.visitor.name,
          country: data.visitor.country,
          maskedIp: data.visitor.maskedIp,
          role,
          text: value,
          at: now,
        },
      ].slice(-50);
      room.version++;
      await this.write(room);
      this.broadcast(room);
      return;
    }
    if (role === 'spectator') return;
    if (
      room.status === 'finished' &&
      message.type !== 'rematch' &&
      message.type !== 'rematch-decline' &&
      message.type !== 'settings'
    ) {
      await this.write(room);
      await this.schedule(room);
      this.broadcast(room);
      return;
    }
    if (message.type === 'settings') {
      if (role !== 'black' || room.status !== 'waiting' || !validSettings(message.settings)) return;
      room.settings = message.settings;
      room.ready = { black: false, white: false };
      room.version++;
    } else if (message.type === 'ready') {
      if (room.status !== 'waiting' || typeof message.ready !== 'boolean') return;
      room.ready[role] = message.ready;
      this.startIfReady(room, now);
      room.version++;
    } else if (message.type === 'rematch' || message.type === 'rematch-decline') {
      if (room.status !== 'finished' || room.rematchClosed || !room.rematchDeadline) return;
      if (now >= room.rematchDeadline || message.type === 'rematch-decline') {
        room.rematchClosed = true;
        room.rematchDeadline = null;
        room.ready = { black: false, white: false };
      } else {
        room.ready[role] = true;
        this.startIfReady(room, now);
      }
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
          if (room.status === 'waiting') room.disconnects[role] = now + DISCONNECT_GRACE_MS;
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
      if (room.status === 'finished' && room.rematchDeadline && now >= room.rematchDeadline) {
        room.rematchDeadline = null;
        room.rematchClosed = true;
        room.ready = { black: false, white: false };
        room.version++;
      }
      if (room.status === 'playing' && !Object.keys(room.disconnects).length) this.settleTurn(room, now);
      if (room.status === 'playing' && room.activeSince === null) room.activeSince = now;
      await this.write(room);
      await this.schedule(room);
      this.broadcast(room);
    });
  }
}
