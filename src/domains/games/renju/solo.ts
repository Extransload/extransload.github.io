import { RenjuBoard, coordinate } from './board-3d';
import { analyzeMove, boardFromMoves, openingMove, SIZE, type Color, type Move, type Point } from './rules';
import type { Difficulty } from './ai';
import { mountRulesHelp } from './rules-help';
import { mountMoveConfirm } from './move-confirm';
import { mountGameSound } from './sound';
import { appearanceForSeat, DEFAULT_APPEARANCE, watchAppearance, type Appearance } from './appearance';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const board = new RenjuBoard($('#canvas'));
let appearance: Appearance = { ...DEFAULT_APPEARANCE };
function applySeatAppearance() {
  const mySeat = $<HTMLButtonElement>('#side-white').classList.contains('selected') ? 'white' : 'black';
  board.setAppearance('black', appearanceForSeat('black', mySeat, appearance));
  board.setAppearance('white', appearanceForSeat('white', mySeat, appearance));
}
watchAppearance((next) => {
  appearance = next;
  board.setBoardStyle(next.board);
  applySeatAppearance();
});
const sound = mountGameSound();
board.onMoveCommitted = () => sound.playStone();
const moveConfirm = mountMoveConfirm(board, (point) => {
  if (!playing || thinking || (moves.length % 2 ? 2 : 1) !== player) return;
  if (add(point, player)) {
    render();
    aiTurn();
  }
});
let worker: Worker;
let generation = 0;
let moves: Move[] = [];
let player: Color = 1;
let playing = false;
let finished = false;
let thinking = false;
let replayMove = 0;
let winner: Color | 'draw' | null = null;
let wonByFive = false;
let lastBoardSignature = '';

function render() {
  for (const selector of ['#side-black', '#side-white', '#difficulty'])
    $<HTMLButtonElement | HTMLSelectElement>(selector).disabled = playing;
  const shown = finished ? moves.slice(0, replayMove) : moves;
  const interactive = playing && !thinking && (moves.length % 2 ? 2 : 1) === player;
  const boardSignature = `${shown.map((move) => `${move.x},${move.y}`).join(';')}|${player}|${interactive}`;
  if (boardSignature !== lastBoardSignature) {
    board.setState(shown, player, interactive, !finished);
    lastBoardSignature = boardSignature;
  }
  moveConfirm.setAvailable(interactive, player === 1 ? 'black' : 'white');
  board.setSeats(player === 1 ? 'black' : 'white', playing ? (moves.length % 2 ? 'white' : 'black') : null);
  if (finished && winner !== null && winner !== 'draw' && replayMove === moves.length)
    board.celebrate(winner === 1 ? 'black' : 'white', wonByFive);
  else if (finished && replayMove < moves.length && board.clearCelebration()) board.reset();
  for (const [color, seat] of [
    [1, 'black'],
    [2, 'white'],
  ] as const) {
    const mine = color === player;
    $(`#${seat}-name`).textContent = mine ? '나' : 'AI';
    $(`#${seat}-player`).classList.toggle('self', mine);
    $(`#${seat}-player`).classList.toggle('active', playing && (moves.length % 2 ? 2 : 1) === color);
    $(`#${seat}-player`).classList.toggle('thinking', playing && thinking && !mine);
    $(`#${seat}-detail`).textContent = finished
      ? winner === color
        ? '승리'
        : winner === 'draw'
          ? '무승부'
          : '대국 종료'
      : !playing
        ? '준비 중'
        : (moves.length % 2 ? 2 : 1) === color
          ? thinking && !mine
            ? '생각 중…'
            : '차례'
          : '대기 중';
  }
  $('#status').textContent = finished
    ? winner === 'draw'
      ? '무승부'
      : winner === player
        ? '승리!'
        : '패배'
    : playing
      ? thinking
        ? 'AI가 생각 중…'
        : '내 차례'
      : 'AI 대국 준비';
  $('#stage-hint').textContent = playing
    ? thinking
      ? 'AI가 생각 중…'
      : `내 차례${moves.length ? '' : ' · 첫 수는 중앙 H8'}`
    : finished
      ? '화살표로 기보를 넘겨보세요'
      : '';
  const overlay = $('#stage-overlay');
  overlay.hidden = playing;
  if (!playing) {
    $('#overlay-title').textContent = finished
      ? winner === 'draw'
        ? '무승부'
        : winner === player
          ? '승리!'
          : '패배'
      : 'AI 대국';
    $('#overlay-subtitle').textContent = finished ? '설정을 바꿔 다시 시작할 수 있습니다' : '돌과 난이도를 선택하세요';
    $('#overlay-kicker').textContent = finished ? 'GAME OVER' : 'SOLO';
    overlay.dataset.mode = finished ? 'result' : 'waiting';
  }
  $('#undo').hidden = !playing || moves.length < (player === 1 ? 3 : 2);
  $('#start').hidden = playing;
  $('#start').textContent = finished ? '다시 대국' : '대국 시작';
  $('#resign-solo').hidden = !playing;
  $('#replay').hidden = !finished;
  $('#decisive').hidden = !finished || !wonByFive;
  if (finished) {
    $('#move-count').textContent = `${replayMove} / ${moves.length}`;
    const move = moves[replayMove - 1];
    $('#move-label').textContent = move ? `${coordinate(move.x, move.y)} · ${move.color === 1 ? '흑' : '백'}` : '시작';
    $<HTMLButtonElement>('#prev').disabled = replayMove === 0;
    $<HTMLButtonElement>('#next').disabled = replayMove === moves.length;
  }
}
function finish(result: Color | 'draw') {
  playing = false;
  finished = true;
  thinking = false;
  winner = result;
  replayMove = moves.length;
  render();
}
function add(point: Point, color: Color) {
  const verdict = analyzeMove(boardFromMoves(moves), point.x, point.y, color);
  if (!verdict.legal) return false;
  moves.push({ ...point, color });
  if (verdict.win) {
    render();
    wonByFive = true;
    finish(color);
  } else if (moves.length === SIZE * SIZE) finish('draw');
  return true;
}
function aiTurn() {
  if (!playing || (moves.length % 2 ? 2 : 1) === player) return;
  thinking = true;
  render();
  const id = ++generation;
  worker.postMessage({
    board: boardFromMoves(moves),
    color: player === 1 ? 2 : 1,
    difficulty: $<HTMLSelectElement>('#difficulty').value as Difficulty,
    id,
  });
}
function onAiMessage(event: MessageEvent<{ point: Point | null; id: number }>) {
  if (event.data.id !== generation || !playing) return;
  thinking = false;
  const color: Color = player === 1 ? 2 : 1;
  if (!event.data.point) finish('draw');
  else {
    add(event.data.point, color);
    render();
  }
}
function makeWorker() {
  const active = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
  active.onmessage = onAiMessage;
  active.onerror = () => {
    if (active !== worker) return;
    playing = false;
    thinking = false;
    render();
    $('#status').textContent = 'AI 계산 오류 · 다시 시작해 주세요';
  };
  return active;
}
function restartWorker() {
  worker?.terminate();
  worker = makeWorker();
}
worker = makeWorker();
board.onForbidden = (point, verdict, screen) => {
  const tip = $('#forbidden-tip');
  if (!point || !verdict?.forbidden || !screen) {
    tip.hidden = true;
    return;
  }
  tip.textContent = `${coordinate(point.x, point.y)} · ${{ overline: '장목', 'double-four': '4·4', 'double-three': '3·3' }[verdict.forbidden]} 금수 · 붉은 돌을 확인하세요`;
  tip.hidden = false;
  tip.style.left = `${Math.min(screen.x + 18, tip.parentElement!.clientWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(screen.y + 18, tip.parentElement!.clientHeight - tip.offsetHeight - 8)}px`;
};
for (const [button, color] of [
  ['#side-black', 1],
  ['#side-white', 2],
] as const) {
  $(button).addEventListener('click', () => {
    if (playing) return;
    player = color;
    $('#side-black').classList.toggle('selected', color === 1);
    $('#side-white').classList.toggle('selected', color === 2);
    applySeatAppearance();
    if (!playing) render();
  });
}
$('#start').addEventListener('click', () => {
  if (playing) return;
  generation++;
  restartWorker();
  board.clearCelebration();
  board.reset();
  lastBoardSignature = '';
  moves = [openingMove()];
  winner = null;
  wonByFive = false;
  finished = false;
  playing = true;
  thinking = false;
  render();
  aiTurn();
  if (matchMedia('(max-width: 970px)').matches) requestAnimationFrame(() => window.scrollTo(0, 0));
});
$('#resign-solo').addEventListener('click', () => {
  if (!playing || !window.confirm('대국을 기권하시겠습니까?')) return;
  if (!playing) return;
  generation++;
  restartWorker();
  finish(player === 1 ? 2 : 1);
});
$('#undo').addEventListener('click', () => {
  if (!playing || moves.length < (player === 1 ? 3 : 2)) return;
  generation++;
  restartWorker();
  thinking = false;
  if (moves[moves.length - 1].color === player) moves.pop();
  else {
    moves.pop();
    if (moves.length && moves[moves.length - 1].color === player) moves.pop();
  }
  render();
  aiTurn();
});
$('#prev').addEventListener('click', () => {
  replayMove = Math.max(0, replayMove - 1);
  render();
});
$('#next').addEventListener('click', () => {
  replayMove = Math.min(moves.length, replayMove + 1);
  render();
});
$('#decisive').addEventListener('click', () => {
  replayMove = moves.length;
  board.reset();
  render();
});
$('#view').addEventListener('click', () => {
  $('#view').classList.toggle('active', board.toggleTop());
});
$('#zoom-in').addEventListener('click', () => board.zoom(0.78));
$('#zoom-out').addEventListener('click', () => board.zoom(1.28));
$('#reset').addEventListener('click', () => board.reset());
$('#help').addEventListener('click', () => {
  $('#board-help').hidden = !$('#board-help').hidden;
});
mountRulesHelp();
render();
