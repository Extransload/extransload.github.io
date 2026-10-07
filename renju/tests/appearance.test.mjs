import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const port = 18788;
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
  if (token) url.searchParams.set('token', token);
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

test('each player sees both classic and custom looks the opponent chose', { timeout: 30_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'omokmaru-looks-'));
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
    const black = connect(host.id, host.token, 'Host');
    const white = connect(host.id, guest.token, 'Guest');
    sockets.push(black.socket, white.socket);
    await until(() => black.states.at(-1)?.connected.white && white.states.at(-1)?.connected.black, 'both connected');

    black.socket.send(
      JSON.stringify({ type: 'appearance', appearance: { stone: 'classic', avatar: 'luna', dance: 'encore' } }),
    );
    white.socket.send(
      JSON.stringify({ type: 'appearance', appearance: { stone: 'rose', avatar: 'serin', dance: 'signature' } }),
    );
    const expected = {
      black: { stone: 'classic', avatar: 'luna', dance: 'encore' },
      white: { stone: 'rose', avatar: 'serin', dance: 'signature' },
    };
    await until(() => white.states.at(-1)?.looks?.black?.avatar === 'luna', 'guest sees host look');
    await until(() => black.states.at(-1)?.looks?.white?.avatar === 'serin', 'host sees guest look');
    assert.deepEqual(black.states.at(-1).looks, expected);
    assert.deepEqual(white.states.at(-1).looks, expected);

    expected.black.stone = 'rose';
    expected.white.stone = 'classic';
    black.socket.send(JSON.stringify({ type: 'appearance', appearance: expected.black }));
    white.socket.send(JSON.stringify({ type: 'appearance', appearance: expected.white }));
    await until(() => white.states.at(-1)?.looks?.black?.stone === 'rose', 'guest sees changed host stones');
    await until(() => black.states.at(-1)?.looks?.white?.stone === 'classic', 'host sees changed guest stones');
    assert.deepEqual(black.states.at(-1).looks, expected);
    assert.deepEqual(white.states.at(-1).looks, expected);

    expected.black = { stone: 'sovereign', avatar: 'seraphine', dance: 'apotheosis' };
    expected.white = { stone: 'opal', avatar: 'astra', dance: 'constellation' };
    black.socket.send(JSON.stringify({ type: 'appearance', appearance: expected.black }));
    white.socket.send(JSON.stringify({ type: 'appearance', appearance: expected.white }));
    await until(() => white.states.at(-1)?.looks?.black?.avatar === 'seraphine', 'guest sees S+ collection');
    await until(() => black.states.at(-1)?.looks?.white?.dance === 'constellation', 'host sees tier motion');
    assert.deepEqual(black.states.at(-1).looks, expected);
    assert.deepEqual(white.states.at(-1).looks, expected);

    expected.white = { stone: 'classic', avatar: 'aurelia', dance: 'encore' };
    white.socket.send(JSON.stringify({ type: 'appearance', appearance: expected.white }));
    await until(() => black.states.at(-1)?.looks?.white?.avatar === 'aurelia', 'host sees the additional S+ avatar');
    assert.deepEqual(black.states.at(-1).looks, expected);

    const watcher = connect(host.id, null, 'Watcher');
    sockets.push(watcher.socket);
    await until(() => watcher.states.at(-1), 'spectator state');
    assert.deepEqual(watcher.states.at(-1).looks, expected);
    watcher.socket.send(
      JSON.stringify({ type: 'appearance', appearance: { stone: 'rose', avatar: 'petal', dance: 'encore' } }),
    );
    white.socket.send(
      JSON.stringify({ type: 'appearance', appearance: { stone: '<b>', avatar: 'petal', dance: 'encore' } }),
    );
    black.socket.send(JSON.stringify({ type: 'chat', text: 'sync' }));
    await until(() => white.states.at(-1)?.chat.some((message) => message.text === 'sync'), 'later state');
    assert.deepEqual(white.states.at(-1).looks, expected);
  } finally {
    for (const socket of sockets) socket.close();
    child.kill('SIGTERM');
    await rm(dataDir, { recursive: true, force: true });
  }
});
