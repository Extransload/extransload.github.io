import { RenjuBoard, coordinate } from './board-3d';
import type { Move, Point } from './rules';
import { mountRulesHelp } from './rules-help';

type Role = 'black' | 'white';
type State = {
  moves: Move[];
  status: 'waiting' | 'playing' | 'finished';
  winner?: Role | 'draw';
  reason?: string;
  version: number;
  joined: boolean;
};
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const api = (
  document.body.dataset.apiUrl ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8787' : '')
).replace(/\/$/, '');
const board = new RenjuBoard($('#canvas'));
const roomId = new URLSearchParams(location.search).get('room');
let currentRoom = roomId;
let role: Role | null = null;
let secret: string | null = null;
let state: State | null = null;
let socket: WebSocket | null = null;
let retry = 0;
let replayMove = 0;
let offline = false;

function status(message: string, kind: 'ready' | 'error' | 'idle' = 'idle') {
  $('#status').textContent = message;
  $('#connection-dot').className = `connection-dot ${kind === 'ready' ? 'connected' : kind === 'error' ? 'error' : ''}`;
}
function setToken(id: string, value: string, seat: Role) {
  localStorage.setItem(`renju:${id}`, JSON.stringify({ token: value, role: seat }));
  secret = value;
  role = seat;
}
function loadToken(id: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(`renju:${id}`) || 'null') as { token: string; role: Role } | null;
    if (saved && (saved.role === 'black' || saved.role === 'white')) {
      secret = saved.token;
      role = saved.role;
    }
  } catch {
    /* ignore corrupt local storage */
  }
}
function render() {
  const playing = state?.status === 'playing';
  const finished = state?.status === 'finished';
  const waiting = state?.status === 'waiting';
  const turn: Role = (state?.moves.length || 0) % 2 === 0 ? 'black' : 'white';
  const myTurn = playing && role === turn && !offline;
  const moves = finished ? state!.moves.slice(0, replayMove) : state?.moves || [];
  board.setState(moves, role === 'black' ? 1 : role === 'white' ? 2 : null, !!myTurn);
  $('#black-player').classList.toggle('active', !!playing && turn === 'black');
  $('#white-player').classList.toggle('active', !!playing && turn === 'white');
  $('#black-name').textContent = role === 'black' ? '나' : '상대';
  $('#white-name').textContent = role === 'white' ? '나' : '상대';
  if (!role) {
    $('#black-name').textContent = '흑';
    $('#white-name').textContent = '백';
  }
  $('#black-detail').textContent = role === 'black' ? '흑' : '흑 · 방장';
  $('#white-detail').textContent = !state?.joined ? '백 · 대기 중' : role === 'white' ? '백' : '백 · 상대';
  if (finished) {
    const result = state!.winner === 'draw' ? '무승부' : `${state!.winner === 'black' ? '흑' : '백'} 승리`;
    status(`${result}${state!.reason === 'resign' ? ' · 기권' : ''}`, 'ready');
  } else if (waiting) status('상대를 기다리는 중', offline ? 'error' : 'ready');
  else if (playing) status(offline ? '연결 복구 중' : myTurn ? '내 차례' : '상대 차례', offline ? 'error' : 'ready');
  $('#lobby').hidden = !!role || (!!currentRoom && state?.status !== 'waiting');
  $('#create').hidden = !!currentRoom;
  $('#join').hidden = !currentRoom || !!role || state?.status !== 'waiting';
  $('#share').hidden = !currentRoom || role !== 'black' || !waiting;
  $('#resign').hidden = !playing || !role;
  $('#new-game').hidden = !finished;
  $('#replay').hidden = !finished;
  $('#stage-hint').textContent =
    !state?.moves.length && playing ? '첫 수는 중앙에서 시작합니다' : finished ? '화살표로 기보를 넘겨보세요' : '';
  if (finished) {
    $('#move-count').textContent = `${replayMove} / ${state!.moves.length}`;
    const move = state!.moves[replayMove - 1];
    $('#move-label').textContent = move ? `${coordinate(move.x, move.y)} · ${move.color === 1 ? '흑' : '백'}` : '시작';
    ($('#prev') as HTMLButtonElement).disabled = replayMove === 0;
    ($('#next') as HTMLButtonElement).disabled = replayMove === state!.moves.length;
  }
}
async function request(path: string, method = 'GET') {
  const response = await fetch(`${api}${path}`, { method });
  if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
  return response.json();
}
function connect() {
  if (!api || !currentRoom || !secret) return;
  socket?.close();
  const url = new URL(`${api}/api/rooms/${currentRoom}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', secret);
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    offline = false;
    if (state) render();
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as { type: string; state?: State; error?: string };
    if (message.type === 'state' && message.state) {
      state = message.state;
      if (state.status === 'finished') replayMove = state.moves.length;
      render();
    } else if (message.type === 'error')
      status(message.error === 'center-first' ? '첫 수는 중앙에 놓으세요' : '착수할 수 없는 자리입니다', 'error');
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    offline = true;
    if (state?.status !== 'finished') render();
    const delay = Math.min(15000, 800 * 2 ** retry++);
    window.setTimeout(() => {
      if (socket === ws && currentRoom && secret) connect();
    }, delay);
  };
  ws.onerror = () => ws.close();
}
async function openRoom(id: string) {
  currentRoom = id;
  loadToken(id);
  try {
    state = (await request(`/api/rooms/${id}`)) as State;
    if (secret) {
      const validation = await fetch(`${api}/api/rooms/${id}/session`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!validation.ok) {
        localStorage.removeItem(`renju:${id}`);
        secret = null;
        role = null;
      }
    }
    if (role) connect();
    else if (state.status === 'waiting') status('초대받은 대국', 'ready');
    else status('이미 시작된 대국입니다');
    render();
  } catch {
    status('대국을 찾을 수 없습니다', 'error');
    $('#lobby-note').textContent = '링크를 다시 확인해주세요.';
  }
}

board.onPlay = (point: Point) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'move', ...point }));
};
board.onForbidden = (point, verdict, screen) => {
  const tip = $('#forbidden-tip');
  if (!point || !verdict?.forbidden || !screen) {
    tip.hidden = true;
    return;
  }
  const explanation = {
    overline: '장목 · 여섯 개 이상 이어집니다.',
    'double-four': '4·4 · 두 개의 4가 동시에 생깁니다.',
    'double-three': '3·3 · 열린 4로 이어지는 3이 두 개 생깁니다.',
  }[verdict.forbidden];
  tip.textContent = `${coordinate(point.x, point.y)} · ${explanation} 붉은 돌을 확인하세요.`;
  tip.hidden = false;
  tip.style.left = `${Math.min(screen.x + 18, tip.parentElement!.clientWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(screen.y + 18, tip.parentElement!.clientHeight - tip.offsetHeight - 8)}px`;
};
$('#create').addEventListener('click', async () => {
  if (!api) {
    status('대국 서버 설정이 필요합니다', 'error');
    return;
  }
  try {
    ($('#create') as HTMLButtonElement).disabled = true;
    const created = (await request('/api/rooms', 'POST')) as { id: string; token: string; role: Role };
    setToken(created.id, created.token, created.role);
    history.replaceState(null, '', `${location.pathname}?room=${created.id}`);
    await openRoom(created.id);
  } catch (error) {
    if (error instanceof TypeError) {
      status('실시간 서버에 연결할 수 없습니다', 'error');
      $('#lobby-note').textContent =
        location.hostname === 'localhost' || location.hostname === '127.0.0.1'
          ? '개발 서버를 종료하고 npm run dev로 다시 시작하세요.'
          : '잠시 후 다시 시도해주세요.';
    } else {
      status('대국을 만들지 못했습니다', 'error');
      $('#lobby-note').textContent = error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.';
    }
  } finally {
    ($('#create') as HTMLButtonElement).disabled = false;
  }
});
$('#join').addEventListener('click', async () => {
  if (!currentRoom) return;
  try {
    ($('#join') as HTMLButtonElement).disabled = true;
    const joined = (await request(`/api/rooms/${currentRoom}/join`, 'POST')) as { token: string; role: Role };
    setToken(currentRoom, joined.token, joined.role);
    connect();
    state = (await request(`/api/rooms/${currentRoom}`)) as State;
    render();
  } catch {
    status('참여할 수 없습니다', 'error');
  } finally {
    ($('#join') as HTMLButtonElement).disabled = false;
  }
});
$('#share').addEventListener('click', async () => {
  if (!currentRoom) return;
  try {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${currentRoom}`);
    $('#share').textContent = '✓ 링크 복사됨';
    window.setTimeout(() => {
      $('#share').textContent = '↗ 초대 링크 복사';
    }, 2200);
  } catch {
    status('링크 복사에 실패했습니다', 'error');
  }
});
$('#resign').addEventListener('click', () => {
  if (window.confirm('대국을 기권하시겠습니까?')) socket?.send(JSON.stringify({ type: 'resign' }));
});
$('#new-game').addEventListener('click', () => {
  socket?.close();
  currentRoom = null;
  role = null;
  secret = null;
  state = null;
  history.replaceState(null, '', location.pathname);
  status('새 대국을 시작하세요');
  render();
});
$('#prev').addEventListener('click', () => {
  replayMove = Math.max(0, replayMove - 1);
  render();
});
$('#next').addEventListener('click', () => {
  replayMove = Math.min(state?.moves.length || 0, replayMove + 1);
  render();
});
$('#view').addEventListener('click', () => {
  const top = board.toggleTop();
  $('#view').classList.toggle('active', top);
  $('#view').setAttribute('aria-label', top ? '입체 시점' : '위에서 보기');
});
$('#zoom-in').addEventListener('click', () => board.zoom(0.78));
$('#zoom-out').addEventListener('click', () => board.zoom(1.28));
$('#reset').addEventListener('click', () => {
  board.reset();
  $('#view').classList.remove('active');
  $('#view').setAttribute('aria-label', '위에서 보기');
});
$('#help').addEventListener('click', () => {
  $('#board-help').hidden = !$('#board-help').hidden;
});
mountRulesHelp();
if (!api) status('대국 서버 설정이 필요합니다', 'error');
else if (roomId) void openRoom(roomId);
else {
  status('새 대국을 시작하세요');
  render();
}
