import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const port = 18787;
const api = `http://127.0.0.1:${port}`;
const wsApi = `ws://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited: ${child.exitCode}`);
    try {
      if ((await fetch(`${api}/api/rooms`)).status === 404) return;
    } catch {
      // Server is starting.
    }
    await sleep(100);
  }
  throw new Error('Wrangler did not start');
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

function connect(id, token, name) {
  const url = new URL(`${wsApi}/api/rooms/${id}/ws`);
  url.searchParams.set('token', token);
  url.searchParams.set('name', name);
  url.searchParams.set('clientId', crypto.randomUUID());
  const socket = new WebSocket(url);
  const states = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') states.push(message.state);
  });
  return { socket, states };
}

async function until(check, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = check();
    if (result) return result;
    await sleep(50);
  }
  throw new Error(`Timed out: ${label}`);
}

test('two players can finish, reconnect, and accept a rematch', { timeout: 30_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'omokmaru-worker-'));
  const child = spawn('./node_modules/.bin/wrangler', ['dev', '--port', String(port), '--persist-to', dataDir], {
    cwd: new URL('..', import.meta.url),
    stdio: 'ignore',
  });
  const sockets = [];
  try {
    await waitForServer(child);
    const host = await request('/api/rooms', 'POST', { name: 'Host', clientId: crypto.randomUUID() });
    const guest = await request(`/api/rooms/${host.id}/enter`, 'POST', {
      name: 'Guest',
      clientId: crypto.randomUUID(),
    });
    assert.equal(guest.role, 'white');
    const black = connect(host.id, host.token, 'Host');
    const white = connect(host.id, guest.token, 'Guest');
    sockets.push(black.socket, white.socket);
    await until(() => black.states.at(-1)?.connected.white && white.states.at(-1)?.connected.black, 'both connected');
    black.socket.send(JSON.stringify({ type: 'ready', ready: true }));
    white.socket.send(JSON.stringify({ type: 'ready', ready: true }));
    await until(
      () => black.states.at(-1)?.status === 'playing' && white.states.at(-1)?.status === 'playing',
      'game started',
    );
    assert.deepEqual(black.states.at(-1).moves, [{ x: 7, y: 7, color: 1 }]);
    white.socket.send(JSON.stringify({ type: 'move', x: 7, y: 8 }));
    await until(() => black.states.at(-1)?.moves.length === 2, 'guest move');
    black.socket.send(JSON.stringify({ type: 'resign' }));
    await until(() => white.states.at(-1)?.status === 'finished', 'game finished');
    assert.equal(white.states.at(-1).winner, 'white');
    black.socket.close();
    const rejoined = connect(host.id, host.token, 'Host');
    sockets.push(rejoined.socket);
    await until(() => rejoined.states.at(-1)?.status === 'finished', 'host reconnected');
    rejoined.socket.send(JSON.stringify({ type: 'rematch' }));
    white.socket.send(JSON.stringify({ type: 'rematch' }));
    await until(
      () => rejoined.states.at(-1)?.status === 'playing' && white.states.at(-1)?.status === 'playing',
      'rematch started',
    );
    assert.deepEqual(rejoined.states.at(-1).moves, [{ x: 7, y: 7, color: 1 }]);
  } finally {
    for (const socket of sockets) socket.close();
    child.kill('SIGTERM');
    await rm(dataDir, { recursive: true, force: true });
  }
});
