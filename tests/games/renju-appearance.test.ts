import { describe, expect, it } from 'vitest';
import { appearanceForSeat, DEFAULT_APPEARANCE, normalizeAppearance } from '../../src/domains/games/renju/appearance';

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
    expect(normalizeAppearance({ stone: 'jade', avatar: 'mint', board: 'oak', victory: 'spin' }).accessory).toBe(
      'none',
    );
  });

  it('applies a design only to the local player in either seat', () => {
    const selected = normalizeAppearance({ stone: 'jade', avatar: 'mint', victory: 'spin' });
    expect(appearanceForSeat('black', 'black', selected)).toEqual(selected);
    expect(appearanceForSeat('white', 'black', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('black', 'white', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('white', 'white', selected)).toEqual(selected);
    expect(appearanceForSeat('black', 'spectator', selected)).toEqual(DEFAULT_APPEARANCE);
    expect(appearanceForSeat('white', null, selected)).toEqual(DEFAULT_APPEARANCE);
  });
});
