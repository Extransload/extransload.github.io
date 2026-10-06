import { RenjuBoard } from './board-3d';
import {
  APPEARANCE_OPTIONS,
  AVATARS,
  BOARDS,
  DEFAULT_APPEARANCE,
  appearanceForSeat,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
  STONES,
  VICTORIES,
  type Appearance,
} from './appearance';
import type { Move } from './rules';
import type { AvatarMotion } from './petal-avatar';

type Category = keyof Appearance;
type Seat = 'black' | 'white';
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const board = new RenjuBoard($('#studio-canvas'));
const names: Record<Category, [string, string]> = {
  stone: ['STONE COLLECTION', '돌 재질'],
  avatar: ['AVATAR COLLECTION', '아바타'],
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
let category: Category = new URLSearchParams(location.search).get('category') === 'avatar' ? 'avatar' : 'stone';
let seat: Seat = 'black';

function optionName(key: Category, id: string) {
  if (key === 'avatar' && id === 'rose') return '루나';
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
  $('#studio-seats').hidden = category === 'avatar';
  board.clearCelebration();
  board.setState(sampleMoves, null, false, false);
  board.setSeats(seat, null);
  board.focusShowcase(category, seat);
  $('#studio-stage-label').textContent = {
    stone: '돌 회전 · 왼쪽 버튼이나 손가락으로 드래그',
    avatar: '아바타 회전 · 왼쪽 버튼이나 손가락으로 드래그',
    board: '바둑판 회전 · 왼쪽 버튼이나 손가락으로 드래그',
    victory: '승리 장면 회전 · 왼쪽 버튼이나 손가락으로 드래그',
  }[category];
  $('#studio-preview-actions').hidden = category !== 'victory';
  $('#studio-view').hidden = category !== 'board';
  $('#studio-view').classList.remove('active');
  updateAvatarPreview();
}

function updateAvatarPreview() {
  $('#studio-avatar-motions').hidden = category !== 'avatar';
  $('#studio-luna-variants').hidden = category !== 'avatar' || !['luna', 'rose'].includes(appearance.avatar);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-luna-variant]'))
    button.setAttribute('aria-pressed', String(button.dataset.lunaVariant === appearance.avatar));
  $('#studio-petal-credit').hidden = appearance.avatar !== 'petal';
  $('#studio-luna-credit').hidden = !['luna', 'rose'].includes(appearance.avatar);
  $('#studio-fashion-credit').hidden = !['apron', 'serin'].includes(appearance.avatar);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
    button.setAttribute('aria-pressed', String(button.dataset.avatarMotion === 'idle'));
}

function showVictory() {
  $('#studio-seats').hidden = false;
  board.clearCelebration();
  board.setState(winningMoves[seat], null, false, false);
  board.setSeats(seat, null);
  board.focusShowcase('victory', seat);
  $('#studio-stage-label').textContent = '승리 장면 회전 · 왼쪽 버튼이나 손가락으로 드래그';
  $('#studio-preview-actions').hidden = false;
  $('#studio-view').hidden = true;
  board.celebrate(seat);
  $('#studio-victory').textContent = '↻ 승리 연출 다시 보기';
  updateAvatarPreview();
}

function showCategory() {
  if (category === 'victory') showVictory();
  else showScene();
}

function applySeatAppearance() {
  board.setAppearance('black', appearanceForSeat('black', seat, appearance));
  board.setAppearance('white', appearanceForSeat('white', seat, appearance));
}

function renderItems() {
  const options = APPEARANCE_OPTIONS[category];
  const selectedId = category === 'avatar' && appearance.avatar === 'rose' ? 'luna' : appearance[category];
  $('#studio-category-kicker').textContent = names[category][0];
  $('#studio-category-title').textContent = names[category][1];
  $('#studio-count').textContent =
    `${String(options.findIndex((item) => item.id === selectedId) + 1).padStart(2, '0')} / ${String(options.length).padStart(2, '0')}`;
  const list = $('#studio-items');
  list.replaceChildren();
  for (const option of options) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'studio-item';
    card.dataset.category = category;
    card.dataset.itemId = option.id;
    card.setAttribute('aria-pressed', String(selectedId === option.id));
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
    if (selectedId === option.id) {
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
      ? `${optionName('stone', saved.stone)} · ${optionName('avatar', saved.avatar)} · ${optionName('board', saved.board)}`
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
  applySeatAppearance();
  $('#studio-current-label').textContent =
    `${optionName('stone', appearance.stone)} · ${optionName('avatar', appearance.avatar)} · ${optionName('board', appearance.board)} · ${optionName('victory', appearance.victory)}`;
  $('#studio-save-status').textContent = saved ? '자동 저장됨' : '이 탭에서만 적용';
  renderItems();
  updateAvatarPreview();
  if (category === 'victory') showVictory();
  else board.previewAvatarMotion('idle');
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.studio-tabs [data-category]'))
  tab.addEventListener('click', () => {
    category = tab.dataset.category as Category;
    renderItems();
    showCategory();
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-seat]'))
  button.addEventListener('click', () => {
    seat = button.dataset.seat as Seat;
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-seat]'))
      peer.setAttribute('aria-pressed', String(peer === button));
    applySeatAppearance();
    showCategory();
  });

$('#studio-victory').addEventListener('click', showVictory);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
  button.addEventListener('click', () => {
    board.previewAvatarMotion(button.dataset.avatarMotion as AvatarMotion);
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
      peer.setAttribute('aria-pressed', String(peer === button));
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-luna-variant]'))
  button.addEventListener('click', () =>
    setAppearance({ ...appearance, avatar: button.dataset.lunaVariant as 'luna' | 'rose' }),
  );
$('#studio-view').addEventListener('click', () => {
  $('#studio-view').classList.toggle('active', board.toggleTop());
});
$('#studio-zoom-in').addEventListener('click', () => board.zoom(0.78));
$('#studio-zoom-out').addEventListener('click', () => board.zoom(1.28));
$('#studio-reset-view').addEventListener('click', showCategory);
$('#studio-default').addEventListener('click', () => setAppearance({ ...DEFAULT_APPEARANCE }));
$('#studio-random').addEventListener('click', () => {
  const random = <T>(list: readonly T[]) => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
  setAppearance({
    stone: random(STONES),
    avatar: random(AVATARS.filter((avatar) => avatar !== 'rose')),
    board: random(BOARDS),
    victory: random(VICTORIES),
  });
});

showScene();
setAppearance(appearance);
renderSlots();
