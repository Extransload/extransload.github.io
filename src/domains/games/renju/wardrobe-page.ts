import { RenjuBoard } from './board-3d';
import {
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  playerLook,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
  DANCE_NAMES,
  TIERS,
  type Appearance,
  type DanceStyle,
  type Tier,
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
let tier: Tier | 'all' = 'all';

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
  $('#studio-avatar-controls').hidden = category !== 'avatar' && category !== 'motion';
  $('#studio-avatar-dances').hidden = category !== 'avatar';
  $('#studio-motion-note').hidden = category !== 'motion';
  const currentAvatar = APPEARANCE_OPTIONS.avatar.find((option) => option.id === appearance.avatar);
  $('#studio-motion-note').textContent = `${currentAvatar?.name ?? '아바타'}의 승리 모션 · 아바타마다 따로 저장됩니다`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-avatar-dance]')) {
    button.textContent = DANCE_NAMES[appearance.avatar][button.dataset.avatarDance as DanceStyle];
    button.setAttribute('aria-pressed', String(button.dataset.avatarDance === appearance.dances[appearance.avatar]));
  }
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
  const visibleOptions = options.filter((option) => tier === 'all' || option.tier === tier);
  $('#studio-list-summary').textContent =
    `${tier === 'all' ? '전체 등급' : `${tier} 등급`} · ${CATEGORY_NAMES[category]} ${visibleOptions.length}개`;
  const list = $('#studio-items');
  list.replaceChildren();
  for (const option of visibleOptions) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'studio-item';
    card.dataset.category = category;
    card.dataset.itemId = option.id;
    card.dataset.tier = option.tier;
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
    const badge = document.createElement('span');
    badge.className = 'studio-tier-badge';
    const displayedTier = option.tier;
    badge.dataset.tier = displayedTier;
    badge.textContent = displayedTier;
    badge.setAttribute('aria-label', `${displayedTier} 등급`);
    const heading = document.createElement('span');
    heading.className = 'studio-item-heading';
    heading.append(title, badge);
    const detail = document.createElement('small');
    detail.textContent = option.detail;
    const copy = document.createElement('span');
    copy.className = 'studio-item-copy';
    copy.append(heading, detail);
    card.append(art, copy);
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

for (const filter of document.querySelectorAll<HTMLButtonElement>('[data-tier-filter]'))
  filter.addEventListener('click', () => {
    const selectedTier = filter.dataset.tierFilter;
    tier = TIERS.includes(selectedTier as Tier) ? (selectedTier as Tier) : 'all';
    for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-tier-filter]'))
      peer.setAttribute('aria-pressed', String(peer === filter));
    renderItems();
  });

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
$('#studio-default').addEventListener('click', () => {
  tier = 'all';
  for (const filter of document.querySelectorAll<HTMLButtonElement>('[data-tier-filter]'))
    filter.setAttribute('aria-pressed', String(filter.dataset.tierFilter === 'all'));
  setAppearance({ ...DEFAULT_APPEARANCE });
});
showScene();
setAppearance(appearance);
