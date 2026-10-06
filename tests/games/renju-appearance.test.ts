import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  appearanceForSeat,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('accepts the remaining designs and drops removed accessories', () => {
    const selected = normalizeAppearance({
      stone: 'rose',
      avatar: 'luna',
      accessory: 'crown',
      board: 'meadow',
      victory: 'cheer',
    });
    expect(selected).toEqual({ stone: 'rose', avatar: 'luna', board: 'meadow', victory: 'cheer' });
  });

  it('falls back to the default for invalid client values', () => {
    expect(normalizeAppearance({ stone: '__proto__', avatar: null, board: 100, victory: 'unknown' })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(normalizeAppearance({ stone: 'jade', avatar: 'coral', board: 'oak', victory: 'spin' }).avatar).toBe('petal');
  });

  it('shares the chosen avatar across seats while keeping local stone and victory choices', () => {
    const selected = normalizeAppearance({ stone: 'jade', avatar: 'luna', victory: 'spin' });
    expect(appearanceForSeat('black', 'black', selected)).toEqual(selected);
    expect(appearanceForSeat('white', 'black', selected)).toEqual({ ...DEFAULT_APPEARANCE, avatar: 'luna' });
    expect(appearanceForSeat('black', 'white', selected)).toEqual({ ...DEFAULT_APPEARANCE, avatar: 'luna' });
    expect(appearanceForSeat('white', 'white', selected)).toEqual(selected);
    expect(appearanceForSeat('black', 'spectator', selected)).toEqual({ ...DEFAULT_APPEARANCE, avatar: 'luna' });
    expect(appearanceForSeat('white', null, selected)).toEqual({ ...DEFAULT_APPEARANCE, avatar: 'luna' });
  });

  it('keeps the chosen avatars and Luna variant available for either seat', () => {
    for (const avatar of ['petal', 'luna', 'apron', 'rose', 'serin'] as const) {
      const selected = normalizeAppearance({ avatar });
      expect(selected.avatar).toBe(avatar);
      expect(appearanceForSeat('white', 'black', selected).avatar).toBe(avatar);
      expect(appearanceForSeat('black', 'white', selected).avatar).toBe(avatar);
    }
    for (const avatar of ['classic', 'ribbon', 'cherry', 'crimson', 'sylvie']) {
      expect(normalizeAppearance({ avatar }).avatar).toBe(DEFAULT_APPEARANCE.avatar);
    }
  });

  it('retains Petal and resets removed characters to Petal', () => {
    expect(normalizeAppearance({ avatar: 'petal' }).avatar).toBe('petal');
    expect(normalizeAppearance({ avatar: 'azure' }).avatar).toBe('petal');
    expect(normalizeAppearance({ avatar: 'shadow' }).avatar).toBe('petal');
    expect(normalizeAppearance({ avatar: 'coral' }).avatar).toBe('petal');
    expect(normalizeAppearance({ avatar: 'mint', stone: 'heart' })).toEqual(DEFAULT_APPEARANCE);
  });

  it('uses a deeper color for the black seat in every stone pair', () => {
    const brightness = (hex: string) => {
      const color = Number.parseInt(hex.slice(1), 16);
      return ((color >> 16) & 255) * 0.2126 + ((color >> 8) & 255) * 0.7152 + (color & 255) * 0.0722;
    };
    for (const option of APPEARANCE_OPTIONS.stone)
      expect(brightness(option.colors[0])).toBeLessThan(brightness(option.colors[1]));
  });
});
