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

type Category = keyof typeof APPEARANCE_OPTIONS;
const CATEGORY_NAMES: Record<Category, string> = { stone: '돌', avatar: '아바타', motion: '모션', board: '바둑판' };
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
const requestedCategory = new URLSearchParams(location.search).get('category');
let category: Category =
  requestedCategory && Object.prototype.hasOwnProperty.call(APPEARANCE_OPTIONS, requestedCategory)
    ? (requestedCategory as Category)
    : 'stone';

function showScene() {
  board.clearCelebration();
  board.setState(sampleMoves, null, false, false);
  // My look sits at the black seat of a real table; the opponent's seat stays empty.
  board.setSeats('black', null, { black: true, white: false });
  board.focusShowcase(category === 'motion' ? 'avatar' : category, 'black');
  updateAvatarPreview();
  if (category === 'motion') board.previewAvatarMotion('win');
}

function updateAvatarPreview() {
  $('#studio-avatar-controls').hidden = category !== 'motion';
  $('#studio-motion-note').hidden = category !== 'motion';
  const currentAvatar = APPEARANCE_OPTIONS.avatar.find((option) => option.id === appearance.avatar);
  $('#studio-motion-note').textContent = `${currentAvatar?.name ?? '아바타'}의 승리 모션 · 아바타마다 따로 저장됩니다`;
  $('#studio-petal-credit').hidden = appearance.avatar !== 'petal';
  $('#studio-luna-credit').hidden = appearance.avatar !== 'luna';
  $('#studio-fashion-credit').hidden = ['petal', 'luna'].includes(appearance.avatar);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-motion]'))
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.avatarMotion === (category === 'motion' ? 'win' : 'idle')),
    );
}

function applySeatAppearance() {
  board.setAppearance('black', playerLook(appearance));
  board.setAppearance('white', playerLook(appearance));
}

function renderItems() {
  const options = APPEARANCE_OPTIONS[category];
  const selectedId = category === 'motion' ? appearance.dances[appearance.avatar] : appearance[category];
  $('#studio-list-summary').textContent = `${CATEGORY_NAMES[category]} ${options.length}개`;
  const list = $('#studio-items');
  list.classList.toggle('studio-items-avatars', category === 'avatar');
  list.replaceChildren();
  for (const option of options) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'studio-item';
    card.dataset.category = category;
    card.dataset.itemId = option.id;
    card.dataset.collection = option.collection;
    card.setAttribute('aria-pressed', String(selectedId === option.id));
    const art = document.createElement('span');
    art.className = 'studio-item-art';
    art.setAttribute('aria-hidden', 'true');
    const thumbnail = document.createElement('img');
    thumbnail.src = `/images/omokmaru/${category}s/${option.id}.webp`;
    thumbnail.alt = '';
    thumbnail.width = 336;
    thumbnail.height = 232;
    thumbnail.decoding = 'async';
    art.append(thumbnail);
    const title = document.createElement('strong');
    title.textContent = category === 'motion' ? DANCE_NAMES[appearance.avatar][option.id as DanceStyle] : option.name;
    card.append(art, title);
    card.addEventListener('click', () => {
      if (category === 'motion') {
        setAppearance({
          ...appearance,
          dances: { ...appearance.dances, [appearance.avatar]: option.id as DanceStyle },
        });
      } else {
        setAppearance({ ...appearance, [category]: option.id });
      }
    });
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
  board.previewAvatarMotion(category === 'motion' ? 'win' : 'idle');
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
$('#studio-default').addEventListener('click', () => {
  setAppearance({ ...DEFAULT_APPEARANCE });
});
showScene();
setAppearance(appearance);
