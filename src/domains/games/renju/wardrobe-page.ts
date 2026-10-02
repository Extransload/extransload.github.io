import { RenjuBoard } from './board-3d';
import {
  APPEARANCE_OPTIONS,
  ACCESSORIES,
  AVATARS,
  BOARDS,
  DEFAULT_APPEARANCE,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
  STONES,
  VICTORIES,
  type Appearance,
} from './appearance';
import type { Move } from './rules';

type Category = keyof Appearance;
type Seat = 'black' | 'white';
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const board = new RenjuBoard($('#studio-canvas'));
const names: Record<Category, [string, string]> = {
  stone: ['STONE COLLECTION', '돌 재질'],
  avatar: ['AVATAR COLLECTION', '아바타'],
  accessory: ['ACCESSORY COLLECTION', '머리 장식'],
  board: ['BOARD COLLECTION', '바둑판'],
  victory: ['VICTORY COLLECTION', '승리 연출'],
};
const slotKey = 'omokmaru-looks-v1';
const sampleMoves: Move[] = [
  { x: 7, y: 7, color: 1 },
  { x: 7, y: 8, color: 2 },
  { x: 8, y: 7, color: 1 },
  { x: 8, y: 8, color: 2 },
  { x: 6, y: 7, color: 1 },
  { x: 9, y: 8, color: 2 },
  { x: 6, y: 8, color: 1 },
  { x: 9, y: 7, color: 2 },
];
const winningMoves: Record<Seat, Move[]> = {
  black: [
    { x: 7, y: 7, color: 1 },
    { x: 7, y: 8, color: 2 },
    { x: 8, y: 7, color: 1 },
    { x: 8, y: 8, color: 2 },
    { x: 9, y: 7, color: 1 },
    { x: 9, y: 8, color: 2 },
    { x: 10, y: 7, color: 1 },
    { x: 10, y: 8, color: 2 },
    { x: 11, y: 7, color: 1 },
  ],
  white: [
    { x: 7, y: 7, color: 1 },
    { x: 7, y: 8, color: 2 },
    { x: 10, y: 10, color: 1 },
    { x: 8, y: 8, color: 2 },
    { x: 11, y: 10, color: 1 },
    { x: 9, y: 8, color: 2 },
    { x: 12, y: 10, color: 1 },
    { x: 10, y: 8, color: 2 },
    { x: 13, y: 10, color: 1 },
    { x: 11, y: 8, color: 2 },
  ],
};

let appearance = loadAppearance();
let category: Category = 'stone';
let seat: Seat = 'black';
let victoryPreview = false;

function optionName(key: Category, id: string) {
  return APPEARANCE_OPTIONS[key].find((option) => option.id === id)?.name ?? id;
}

function readSlots(): (Appearance | null)[] {
  try {
    const raw = JSON.parse(localStorage.getItem(slotKey) || 'null');
    if (!Array.isArray(raw)) return [null, null, null];
    return Array.from({ length: 3 }, (_, i) =>
      raw[i] && typeof raw[i] === 'object' ? normalizeAppearance(raw[i]) : null,
    );
  } catch {
    return [null, null, null];
  }
}

let slots = readSlots();
function writeSlots() {
  try {
    localStorage.setItem(slotKey, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

function showScene() {
  victoryPreview = false;
  board.clearCelebration();
  board.setState(sampleMoves, null, false, false);
  board.setSeats(seat, null);
  board.reset();
  $('#studio-victory').textContent = '✦ 승리 연출 재생';
}

function showVictory() {
  victoryPreview = true;
  board.clearCelebration();
  board.reset();
  board.setState(winningMoves[seat], null, false, false);
  board.setSeats(seat, null);
  board.celebrate(seat, true);
  $('#studio-victory').textContent = '↻ 승리 연출 다시 보기';
}

function renderItems() {
  const options = APPEARANCE_OPTIONS[category];
  $('#studio-category-kicker').textContent = names[category][0];
  $('#studio-category-title').textContent = names[category][1];
  $('#studio-count').textContent =
    `${String(options.findIndex((item) => item.id === appearance[category]) + 1).padStart(2, '0')} / ${String(options.length).padStart(2, '0')}`;
  const list = $('#studio-items');
  list.replaceChildren();
  for (const option of options) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'studio-item';
    card.dataset.category = category;
    card.dataset.itemId = option.id;
    card.setAttribute('aria-pressed', String(appearance[category] === option.id));
    card.style.setProperty('--item-a', option.colors[0]);
    card.style.setProperty('--item-b', option.colors[1]);
    const art = document.createElement('span');
    art.className = 'studio-item-art';
    art.setAttribute('aria-hidden', 'true');
    art.append(document.createElement('i'), document.createElement('i'));
    const title = document.createElement('strong');
    title.textContent = option.name;
    const detail = document.createElement('small');
    detail.textContent = option.detail;
    card.append(art, title, detail);
    if (appearance[category] === option.id) {
      const badge = document.createElement('span');
      badge.className = 'studio-item-badge';
      badge.textContent = '사용 중';
      card.append(badge);
    }
    card.addEventListener('click', () => setAppearance({ ...appearance, [category]: option.id }));
    list.append(card);
  }
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.studio-tabs [data-category]'))
    tab.setAttribute('aria-pressed', String(tab.dataset.category === category));
}

function renderSlots() {
  const host = $('#studio-slots');
  host.replaceChildren();
  slots.forEach((saved, index) => {
    const row = document.createElement('div');
    row.className = 'studio-slot';
    const copy = document.createElement('div');
    copy.className = 'studio-slot-copy';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}번 세트`;
    const detail = document.createElement('small');
    detail.textContent = saved
      ? `${optionName('stone', saved.stone)} · ${optionName('avatar', saved.avatar)} · ${optionName('accessory', saved.accessory)} · ${optionName('board', saved.board)}`
      : '비어 있음';
    copy.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'studio-slot-actions';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = '적용';
    apply.disabled = !saved;
    apply.addEventListener('click', () => {
      if (slots[index]) setAppearance(slots[index]!);
    });
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '저장';
    save.setAttribute('aria-label', `${index + 1}번 세트에 현재 조합 저장`);
    save.addEventListener('click', () => {
      slots[index] = { ...appearance };
      const saved = writeSlots();
      renderSlots();
      $('#studio-save-status').textContent = saved ? `${index + 1}번 세트 저장됨` : '브라우저 저장 불가';
    });
    actions.append(apply, save);
    row.append(copy, actions);
    host.append(row);
  });
}

function setAppearance(next: Appearance) {
  appearance = normalizeAppearance(next);
  const saved = saveAppearance(appearance);
  board.setBoardStyle(appearance.board);
  board.setAppearance('black', appearance);
  board.setAppearance('white', appearance);
  $('#studio-current-label').textContent =
    `${optionName('stone', appearance.stone)} · ${optionName('avatar', appearance.avatar)} · ${optionName('accessory', appearance.accessory)} · ${optionName('board', appearance.board)} · ${optionName('victory', appearance.victory)}`;
  $('#studio-save-status').textContent = saved ? '자동 저장됨' : '이 탭에서만 적용';
  renderItems();
  if (victoryPreview) showVictory();
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.studio-tabs [data-category]'))
  tab.addEventListener('click', () => {
    category = tab.dataset.category as Category;
    renderItems();
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-seat]'))
  button.addEventListener('click', () => {
    seat = button.dataset.seat as Seat;
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-seat]'))
      peer.setAttribute('aria-pressed', String(peer === button));
    showScene();
  });

$('#studio-victory').addEventListener('click', showVictory);
$('#studio-board-reset').addEventListener('click', showScene);
$('#studio-view').addEventListener('click', () => {
  $('#studio-view').classList.toggle('active', board.toggleTop());
});
$('#studio-zoom-in').addEventListener('click', () => board.zoom(0.78));
$('#studio-zoom-out').addEventListener('click', () => board.zoom(1.28));
$('#studio-reset-view').addEventListener('click', () => board.reset());
$('#studio-default').addEventListener('click', () => setAppearance({ ...DEFAULT_APPEARANCE }));
$('#studio-random').addEventListener('click', () => {
  const random = <T>(list: readonly T[]) => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
  setAppearance({
    stone: random(STONES),
    avatar: random(AVATARS),
    accessory: random(ACCESSORIES),
    board: random(BOARDS),
    victory: random(VICTORIES),
  });
});

showScene();
setAppearance(appearance);
renderSlots();
