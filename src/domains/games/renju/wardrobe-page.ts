import { RenjuBoard } from './board-3d';
import {
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  playerLook,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
  DANCE_NAMES,
  type Appearance,
  type DanceStyle,
} from './appearance';
import type { Move } from './rules';
import type { AvatarMotion } from './petal-avatar';

type Category = 'stone' | 'avatar' | 'board';
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const board = new RenjuBoard($('#studio-canvas'));
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

let appearance = loadAppearance();
let category: Category = new URLSearchParams(location.search).get('category') === 'avatar' ? 'avatar' : 'stone';

function showScene() {
  board.clearCelebration();
  board.setState(sampleMoves, null, false, false);
  // My look sits at the black seat of a real table; the opponent's seat stays empty.
  board.setSeats('black', null, { black: true, white: false });
  board.focusShowcase(category, 'black');
  updateAvatarPreview();
}

function updateAvatarPreview() {
  $('#studio-avatar-controls').hidden = category !== 'avatar';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-dance]')) {
    button.textContent = DANCE_NAMES[appearance.avatar][button.dataset.avatarDance as DanceStyle];
    button.setAttribute('aria-pressed', String(button.dataset.avatarDance === appearance.dances[appearance.avatar]));
  }
  $('#studio-luna-variants').hidden = category !== 'avatar' || !['luna', 'rose'].includes(appearance.avatar);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-luna-variant]'))
    button.setAttribute('aria-pressed', String(button.dataset.lunaVariant === appearance.avatar));
  $('#studio-petal-credit').hidden = appearance.avatar !== 'petal';
  $('#studio-luna-credit').hidden = !['luna', 'rose'].includes(appearance.avatar);
  $('#studio-fashion-credit').hidden = !['apron', 'serin'].includes(appearance.avatar);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
    button.setAttribute('aria-pressed', String(button.dataset.avatarMotion === 'idle'));
}

function applySeatAppearance() {
  board.setAppearance('black', playerLook(appearance));
  board.setAppearance('white', playerLook(appearance));
}

function renderItems() {
  const options = APPEARANCE_OPTIONS[category];
  const selectedId = category === 'avatar' && appearance.avatar === 'rose' ? 'luna' : appearance[category];
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
    const copy = document.createElement('span');
    copy.className = 'studio-item-copy';
    copy.append(title, detail);
    card.append(art, copy);
    card.addEventListener('click', () => setAppearance({ ...appearance, [category]: option.id }));
    list.append(card);
  }
  for (const tab of document.querySelectorAll<HTMLButtonElement>('.studio-tabs [data-category]'))
    tab.setAttribute('aria-pressed', String(tab.dataset.category === category));
}

function setAppearance(next: Appearance) {
  appearance = normalizeAppearance(next);
  saveAppearance(appearance);
  board.setBoardStyle(appearance.board);
  applySeatAppearance();
  renderItems();
  updateAvatarPreview();
  board.previewAvatarMotion('idle');
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.studio-tabs [data-category]'))
  tab.addEventListener('click', () => {
    category = tab.dataset.category as Category;
    renderItems();
    showScene();
  });

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
  button.addEventListener('click', () => {
    board.previewAvatarMotion(button.dataset.avatarMotion as AvatarMotion);
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
      peer.setAttribute('aria-pressed', String(peer === button));
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-dance]'))
  button.addEventListener('click', () => {
    setAppearance({
      ...appearance,
      dances: { ...appearance.dances, [appearance.avatar]: button.dataset.avatarDance as DanceStyle },
    });
    board.previewAvatarMotion('win');
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
      peer.setAttribute('aria-pressed', String(peer.dataset.avatarMotion === 'win'));
  });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-luna-variant]'))
  button.addEventListener('click', () =>
    setAppearance({ ...appearance, avatar: button.dataset.lunaVariant as 'luna' | 'rose' }),
  );
$('#studio-default').addEventListener('click', () => setAppearance({ ...DEFAULT_APPEARANCE }));
showScene();
setAppearance(appearance);
