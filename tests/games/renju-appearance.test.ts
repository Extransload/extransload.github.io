import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  appearanceForSeat,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('accepts the free designs as local player choices', () => {
    const selected = normalizeAppearance({
      stone: 'rose',
      avatar: 'royal',
      accessory: 'crown',
      board: 'meadow',
      victory: 'cheer',
    });
    expect(selected).toEqual({ stone: 'rose', avatar: 'royal', accessory: 'crown', board: 'meadow', victory: 'cheer' });
  });

  it('falls back to the default for invalid client values', () => {
    expect(normalizeAppearance({ stone: '__proto__', avatar: null, board: 100, victory: 'unknown' })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(normalizeAppearance({ stone: 'jade', avatar: 'coral', board: 'oak', victory: 'spin' }).accessory).toBe(
      'none',
    );
  });

  it('applies a design only to the local player in either seat', () => {
    const selected = normalizeAppearance({ stone: 'jade', avatar: 'coral', victory: 'spin' });
    expect(appearanceForSeat('black', 'black', selected)).toEqual(selected);
    expect(appearanceForSeat('white', 'black', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('black', 'white', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('white', 'white', selected)).toEqual(selected);
    expect(appearanceForSeat('black', 'spectator', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('white', null, selected)).toEqual(DEFAULT_APPEARANCE);
  });

  it('accepts the new original character while retaining saved legacy choices', () => {
    expect(normalizeAppearance({ avatar: 'shadow' }).avatar).toBe('shadow');
    expect(normalizeAppearance({ avatar: 'coral' }).avatar).toBe('coral');
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
