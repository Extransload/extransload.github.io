export const STONES = ['classic', 'jade', 'slate'] as const;
export const AVATARS = ['classic', 'coral', 'mint'] as const;
export const BOARDS = ['oak', 'walnut', 'linen'] as const;
export const VICTORIES = ['dance', 'spin'] as const;

export type StoneStyle = (typeof STONES)[number];
export type AvatarStyle = (typeof AVATARS)[number];
export type BoardStyle = (typeof BOARDS)[number];
export type VictoryStyle = (typeof VICTORIES)[number];
export type PublicAppearance = { stone: StoneStyle; avatar: AvatarStyle; victory: VictoryStyle };
export type Appearance = PublicAppearance & { board: BoardStyle };

export const DEFAULT_APPEARANCE: Appearance = { stone: 'classic', avatar: 'classic', board: 'oak', victory: 'dance' };
const storageKey = 'omokmaru-appearance-v1';

export function normalizeAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? (value as Partial<Appearance>) : {};
  return {
    stone: STONES.includes(input.stone as StoneStyle) ? input.stone! : DEFAULT_APPEARANCE.stone,
    avatar: AVATARS.includes(input.avatar as AvatarStyle) ? input.avatar! : DEFAULT_APPEARANCE.avatar,
    board: BOARDS.includes(input.board as BoardStyle) ? input.board! : DEFAULT_APPEARANCE.board,
    victory: VICTORIES.includes(input.victory as VictoryStyle) ? input.victory! : DEFAULT_APPEARANCE.victory,
  };
}

export function publicAppearance(value: unknown): PublicAppearance {
  const { stone, avatar, victory } = normalizeAppearance(value);
  return { stone, avatar, victory };
}

export function loadAppearance(): Appearance {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(storageKey) || 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(value: Appearance) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // The selection remains available until this tab closes.
  }
}
