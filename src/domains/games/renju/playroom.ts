import { RenjuBoard, coordinate } from './board-3d';
import { advanceClock } from './clock';
import type { PlayerRole, RoomRole, RoomSnapshot, GameSettings } from './protocol';
import type { PublicRoom } from './protocol';
import type { Point } from './rules';
import { mountRulesHelp } from './rules-help';
import { guestName } from './identity';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const api = (
  document.body.dataset.apiUrl ||
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8787' : '')
).replace(/\/$/, '');
const board = new RenjuBoard($('#canvas'));
let currentRoom = new URLSearchParams(location.search).get('room');
let role: RoomRole | null = null;
let secret: string | null = null;
let state: RoomSnapshot | null = null;
let socket: WebSocket | null = null;
let retry = 0;
let replayMove = 0;
let offline = false;
let overlayTimer = 0;
let briefOverlay = false;
let previousStatus: RoomSnapshot['status'] | null = null;
let serverOffset = 0;
let lastBoardSignature = '';
const name = guestName();
$('#guest-name').textContent = name;
let lastChatId = '';

function status(message: string, kind: 'ready' | 'error' | 'idle' = 'idle') {
  $('#status').textContent = message;
  $('#connection-dot').className = `connection-dot ${kind === 'ready' ? 'connected' : kind === 'error' ? 'error' : ''}`;
}
function setToken(id: string, value: string, seat: PlayerRole) {
  localStorage.setItem(`renju:${id}`, JSON.stringify({ token: value, role: seat }));
  secret = value;
  role = seat;
}
function loadToken(id: string) {
  role = null;
  secret = null;
  try {
    const saved = JSON.parse(localStorage.getItem(`renju:${id}`) || 'null') as {
      token: string;
      role: PlayerRole;
    } | null;
    if (saved && (saved.role === 'black' || saved.role === 'white')) {
      secret = saved.token;
      role = saved.role;
    }
  } catch {
    /* ignore corrupt local storage */
  }
}
function settingText(settings: GameSettings) {
  const main = settings.mainMinutes ? `${settings.mainMinutes}분` : '기본 시간 없음';
  return settings.byoSeconds ? `${main} · ${settings.byoSeconds}초 × ${settings.byoPeriods}회` : main;
}
function timeText(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function renderClocks() {
  const visible = !!state?.clocks && state.status !== 'waiting';
  $('#board-clocks').hidden = !visible;
  if (!visible || !state?.clocks) return;
  const turn: PlayerRole = state.moves.length % 2 ? 'white' : 'black';
  for (const seat of ['black', 'white'] as const) {
    const element = $(`#clock-${seat}`);
    let clock = state.clocks[seat];
    const ticking =
      state.status === 'playing' &&
      state.activeSince !== null &&
      !Object.keys(state.disconnects).length &&
      seat === turn;
    if (ticking)
      clock = advanceClock(clock, Math.max(0, Date.now() + serverOffset - state.activeSince!), state.settings).clock;
    const byo = clock.mainMs <= 0 && clock.periodsLeft > 0;
    element.querySelector('strong')!.textContent = timeText(byo ? clock.byoMs : clock.mainMs);
    element.querySelector('small')!.textContent = byo
      ? `초읽기 ${clock.periodsLeft}회`
      : state.settings.byoSeconds
        ? `+ ${state.settings.byoSeconds}초 × ${clock.periodsLeft}`
        : '기본 시간';
    element.classList.toggle('ticking', ticking);
    element.classList.toggle('urgent', ticking && (byo ? clock.byoMs : clock.mainMs) <= 10000);
  }
}
function renderOverlay() {
  const overlay = $('#stage-overlay');
  let title = '',
    subtitle = '',
    kicker = '',
    mode = '';
  const now = Date.now() + serverOffset;
  if (offline && currentRoom && state?.status !== 'finished') {
    title = '연결 복구 중';
    subtitle = '자동으로 다시 연결합니다';
    mode = 'waiting';
  } else if (state?.status === 'playing' && Object.keys(state.disconnects).length) {
    const deadlines = Object.values(state.disconnects).filter((value): value is number => typeof value === 'number');
    const seconds = Math.max(0, Math.ceil((Math.min(...deadlines) - now) / 1000));
    title = `${seconds}초`;
    subtitle = '상대가 나갔습니다 · 재접속 대기 중';
    kicker = 'PAUSED';
    mode = 'waiting';
  } else if (state?.status === 'finished') {
    if (state.winner === 'draw') title = '무승부';
    else if (role === 'spectator') title = `${state.winner === 'black' ? '흑' : '백'} 승리`;
    else title = state.winner === role ? '승리!' : '패배';
    subtitle =
      (
        {
          five: '오목이 완성되었습니다',
          resign: '기권으로 대국이 끝났습니다',
          full: '바둑판이 가득 찼습니다',
          time: '시간이 다 되었습니다',
          disconnect: '재접속 시간이 지났습니다',
        } as Record<string, string>
      )[state.reason || ''] || '대국이 끝났습니다';
    kicker = 'GAME OVER';
    const readyCount = Number(state.ready.black) + Number(state.ready.white);
    subtitle += ` · 재대국 ${readyCount}/2 준비`;
    mode = state.winner === 'draw' ? 'finished' : 'result';
  } else if (state?.status === 'waiting') {
    title = role === 'spectator' ? '관전 중' : '대국 준비';
    const readyCount = Number(state.ready.black) + Number(state.ready.white);
    subtitle =
      role === 'black' && !state.joined
        ? '초대 링크를 보내 상대를 불러보세요'
        : !state.connected.black || !state.connected.white
          ? '플레이어가 연결되기를 기다립니다'
          : `${readyCount}/2 준비 · 모두 준비하면 자동 시작`;
    kicker = role === 'spectator' ? 'SPECTATOR' : `READY ${readyCount}/2`;
    mode = 'waiting';
  } else if (briefOverlay) {
    title = '대국 시작';
    subtitle = '흑이 먼저 둡니다';
    kicker = 'START';
    mode = 'start';
  }
  overlay.hidden = !title;
  overlay.dataset.mode = mode;
  $('#overlay-title').textContent = title;
  $('#overlay-subtitle').textContent = subtitle;
  $('#overlay-kicker').textContent = kicker;
}
function render() {
  const playing = state?.status === 'playing';
  const finished = state?.status === 'finished';
  const waiting = state?.status === 'waiting';
  const online = socket?.readyState === WebSocket.OPEN;
  const turn: PlayerRole = (state?.moves.length || 0) % 2 === 0 ? 'black' : 'white';
  const myTurn = playing && role === turn && !offline && !Object.keys(state?.disconnects || {}).length;
  const moves = finished ? state!.moves.slice(0, replayMove) : state?.moves || [];
  const boardSignature = `${moves.map((move) => `${move.x},${move.y}`).join(';')}|${role}|${myTurn}`;
  if (boardSignature !== lastBoardSignature) {
    board.setState(moves, role === 'black' ? 1 : role === 'white' ? 2 : null, !!myTurn);
    lastBoardSignature = boardSignature;
  }
  board.setSeats(role, playing ? turn : null);
  if (finished && state?.winner && state.winner !== 'draw') board.celebrate(state.winner);
  for (const seat of ['black', 'white'] as const) {
    const card = $(`#${seat}-player`);
    const mine = role === seat;
    card.classList.toggle('self', mine);
    card.classList.toggle('opponent', role !== 'spectator' && !!role && !mine);
    card.classList.toggle('active', !!playing && turn === seat && !Object.keys(state?.disconnects || {}).length);
    card.classList.toggle('ready', !!(waiting || finished) && !!state?.ready[seat]);
    card.style.order = mine ? '0' : seat === 'black' ? '1' : '2';
    $(`#${seat}-name`).textContent = state?.players?.[seat]?.name ?? (mine ? name : seat === 'black' ? '흑' : '백');
    $(`#${seat}-badge`).textContent =
      `${seat === 'black' ? '흑' : '백'}${seat === 'black' ? ' · 방장' : ''}${mine ? ' · 나' : ''}`;
    $(`#${seat}-detail`).textContent = waiting
      ? !state?.connected[seat]
        ? '연결 대기'
        : state.ready[seat]
          ? '준비 완료'
          : '준비 전'
      : finished
        ? state?.winner === seat
          ? '승리'
          : state?.winner === 'draw'
            ? '무승부'
            : '대국 종료'
        : playing && turn === seat
          ? '차례'
          : '대기 중';
    const identity = state?.players?.[seat];
    if (identity && state?.connected[seat])
      $(`#${seat}-detail`).textContent += ` · ${identity.country} · ${identity.maskedIp || 'unknown'}`;
    $(`#${seat}-presence`).classList.toggle('online', !!state?.connected[seat]);
    $(`#${seat}-ready`).hidden = !(waiting || finished);
    $(`#${seat}-ready`).classList.toggle('is-ready', !!state?.ready[seat]);
  }
  if (finished) status('대국 종료', 'ready');
  else if (offline) status('연결 복구 중', 'error');
  else if (waiting)
    status(!online ? '서버 연결 중' : role === 'spectator' ? '관전 중' : '대국 준비 중', online ? 'ready' : 'idle');
  else if (playing) status(role === 'spectator' ? '관전 중' : myTurn ? '내 차례' : '상대 차례', 'ready');
  $('#lobby').hidden = !!currentRoom;
  $('#chat').hidden = !currentRoom;
  $<HTMLInputElement>('#chat-input').disabled = !online;
  $<HTMLButtonElement>('#chat-form button').disabled = !online;
  if (state?.chat?.length) {
    const newest = state.chat[state.chat.length - 1].id;
    if (newest !== lastChatId) {
      const log = $('#chat-messages');
      log.replaceChildren();
      for (const message of state.chat) {
        const item = document.createElement('div');
        item.className = 'chat-message';
        const author = document.createElement('strong');
        author.textContent = `${message.name} · ${message.country} · ${message.maskedIp || 'unknown'}`;
        const content = document.createElement('span');
        content.textContent = message.text;
        item.append(author, content);
        log.append(item);
      }
      log.scrollTop = log.scrollHeight;
      lastChatId = newest;
    }
  } else if (lastChatId) {
    $('#chat-messages').replaceChildren();
    lastChatId = '';
  }
  $('#create').hidden = !!currentRoom;
  $('#room-setup').hidden = !waiting && !finished;
  $('#settings').hidden = !(waiting || finished) || role !== 'black';
  $('.setup-heading strong').textContent = finished ? '다시 대국' : '대국 설정';
  $('#settings-summary').textContent = state ? settingText(state.settings) : '';
  $('#setup-note').textContent =
    role === 'black'
      ? '변경하면 준비 상태가 초기화됩니다'
      : role === 'spectator'
        ? '관전자는 설정할 수 없습니다'
        : '방장이 설정합니다';
  $('#ready').hidden = !(waiting || finished) || role === 'spectator' || !role;
  $<HTMLButtonElement>('#ready').disabled = !online;
  $('#ready').textContent = !online
    ? '연결 중…'
    : role && role !== 'spectator' && state?.ready[role]
      ? '✓ 준비 완료 · 취소'
      : '준비하기';
  for (const selector of ['#main-minutes', '#byo-seconds', '#byo-periods'])
    $<HTMLSelectElement>(selector).disabled = !online;
  $('#ready').classList.toggle('is-ready', !!role && role !== 'spectator' && !!state?.ready[role]);
  $('#ready-note').textContent =
    role === 'spectator'
      ? '대국을 실시간으로 볼 수 있습니다'
      : role === 'black' && !state?.joined
        ? '상대가 들어오면 함께 준비해 주세요'
        : '양쪽이 준비되면 바로 시작합니다';
  $('#share').hidden = !currentRoom || role !== 'black' || (!waiting && !finished);
  $('#resign').hidden = !playing || role === 'spectator' || !role;
  $('#new-game').hidden = !finished && role !== 'spectator';
  $('#replay').hidden = !finished;
  $('#spectators').hidden = !state || state.spectators === 0;
  $('#spectators').textContent = `◉ ${state?.spectators || 0}`;
  $('#stage-hint').textContent =
    !state?.moves.length && playing ? '첫 수는 중앙에서 시작합니다' : finished ? '화살표로 기보를 넘겨보세요' : '';
  if (state && (waiting || finished)) {
    $<HTMLSelectElement>('#main-minutes').value = String(state.settings.mainMinutes);
    $<HTMLSelectElement>('#byo-seconds').value = String(state.settings.byoSeconds);
    $<HTMLSelectElement>('#byo-periods').value = String(state.settings.byoPeriods);
  }
  if (finished) {
    $('#move-count').textContent = `${replayMove} / ${state!.moves.length}`;
    const move = state!.moves[replayMove - 1];
    $('#move-label').textContent = move ? `${coordinate(move.x, move.y)} · ${move.color === 1 ? '흑' : '백'}` : '시작';
    $<HTMLButtonElement>('#prev').disabled = replayMove === 0;
    $<HTMLButtonElement>('#next').disabled = replayMove === state!.moves.length;
  }
  renderClocks();
  renderOverlay();
}
async function request(path: string, method = 'GET', body?: object) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
  return response.json();
}
function connect() {
  if (!api || !currentRoom) return;
  socket?.close();
  const url = new URL(`${api}/api/rooms/${currentRoom}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (secret) url.searchParams.set('token', secret);
  url.searchParams.set('name', name);
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    offline = false;
    if (state) render();
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as { type: string; state?: RoomSnapshot; error?: string };
    if (message.type === 'state' && message.state) {
      const was = previousStatus;
      state = message.state;
      serverOffset = state.serverNow - Date.now();
      if (state.status === 'finished') replayMove = state.moves.length;
      if (was === 'finished' && state.status === 'playing') {
        board.clearCelebration();
        board.reset();
        replayMove = 0;
      }
      if ((was === 'waiting' || was === 'finished') && state.status === 'playing') {
        briefOverlay = true;
        window.clearTimeout(overlayTimer);
        overlayTimer = window.setTimeout(() => {
          briefOverlay = false;
          renderOverlay();
        }, 1900);
      }
      previousStatus = state.status;
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
      if (socket === ws && currentRoom && state?.status !== 'finished') connect();
    }, delay);
  };
  ws.onerror = () => ws.close();
}
async function openRoom(id: string) {
  currentRoom = id;
  loadToken(id);
  try {
    state = (await request(`/api/rooms/${id}`)) as RoomSnapshot;
    previousStatus = state.status;
    serverOffset = state.serverNow - Date.now();
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
    if (!role) {
      const entered = (await request(`/api/rooms/${id}/enter`, 'POST', { name })) as { token?: string; role: RoomRole };
      if (entered.role === 'white' && entered.token) setToken(id, entered.token, 'white');
      else role = 'spectator';
    }
    connect();
    render();
  } catch {
    status('대국을 찾을 수 없습니다', 'error');
    $('#lobby-note').textContent = '링크를 다시 확인해주세요.';
  }
}
setInterval(() => {
  renderClocks();
  renderOverlay();
}, 200);

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
async function createRoom(path: string) {
  if (!api) {
    status('대국 서버 설정이 필요합니다', 'error');
    return;
  }
  try {
    for (const button of ['#create', '#create-public', '#match']) $<HTMLButtonElement>(button).disabled = true;
    const created = (await request(path, 'POST', { name })) as { id: string; token: string; role: PlayerRole };
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
    for (const button of ['#create', '#create-public', '#match']) $<HTMLButtonElement>(button).disabled = false;
  }
}
$('#create').addEventListener('click', () => void createRoom('/api/rooms'));
$('#create-public').addEventListener('click', () => void createRoom('/api/public/rooms'));
$('#match').addEventListener('click', () => void createRoom('/api/public/match'));
async function refreshRooms() {
  if (!api || currentRoom) return;
  const list = $('#public-rooms');
  try {
    const { rooms } = (await request('/api/public/rooms')) as { rooms: PublicRoom[] };
    list.replaceChildren();
    if (!rooms.length) {
      list.textContent = '열린 대국이 없습니다. 새 방을 만들어 보세요.';
      return;
    }
    for (const room of rooms) {
      const button = document.createElement('button');
      button.className = 'room-row';
      const host = room.players.black;
      const guest = room.players.white;
      const title = document.createElement('strong');
      title.textContent = `${host?.name ?? 'Guest'} ${guest ? `vs ${guest.name}` : '· 상대 대기'}`;
      const detail = document.createElement('small');
      detail.textContent = `${host?.country ?? 'XX'} · ${host?.maskedIp ?? 'unknown'} · ${room.status === 'playing' ? '대국 중 · 관전' : room.joined ? '준비 중 · 관전' : '참가 가능'} · ◉ ${room.spectators}`;
      button.append(title, detail);
      button.addEventListener('click', () => {
        history.replaceState(null, '', `${location.pathname}?room=${room.id}`);
        void openRoom(room.id);
      });
      list.append(button);
    }
  } catch {
    list.textContent = '방 목록을 불러오지 못했습니다.';
  }
}
$('#refresh-rooms').addEventListener('click', () => void refreshRooms());
setInterval(() => {
  if (!currentRoom) void refreshRooms();
}, 10000);
$('#chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>('#chat-input');
  const text = input.value.trim();
  if (!text || socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'chat', text }));
  input.value = '';
});
$('#ready').addEventListener('click', () => {
  if (!state || !role || role === 'spectator' || socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'ready', ready: !state.ready[role] }));
});
for (const selector of ['#main-minutes', '#byo-seconds', '#byo-periods']) {
  $(selector).addEventListener('change', () => {
    if (role !== 'black' || socket?.readyState !== WebSocket.OPEN) return;
    const settings: GameSettings = {
      mainMinutes: Number($<HTMLSelectElement>('#main-minutes').value),
      byoSeconds: Number($<HTMLSelectElement>('#byo-seconds').value),
      byoPeriods: Number($<HTMLSelectElement>('#byo-periods').value),
    };
    if (!settings.byoSeconds) settings.byoPeriods = 0;
    else if (!settings.byoPeriods) settings.byoPeriods = 1;
    if (!settings.mainMinutes && !settings.byoSeconds) {
      settings.byoSeconds = 30;
      settings.byoPeriods = 3;
    }
    socket.send(JSON.stringify({ type: 'settings', settings }));
  });
}
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
  board.clearCelebration();
  board.reset();
  lastBoardSignature = '';
  currentRoom = null;
  role = null;
  secret = null;
  state = null;
  lastChatId = '';
  $('#chat-messages').replaceChildren();
  previousStatus = null;
  offline = false;
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
else {
  for (const button of ['#create', '#create-public', '#match']) $<HTMLButtonElement>(button).disabled = false;
  if (currentRoom) void openRoom(currentRoom);
  else {
    status('새 대국을 시작하세요');
    render();
    void refreshRooms();
  }
}
