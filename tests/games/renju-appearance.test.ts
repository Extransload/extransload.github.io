import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, normalizeAppearance, publicAppearance } from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('accepts the free designs and shares only visible player choices', () => {
    const selected = normalizeAppearance({
      stone: 'rose',
      avatar: 'royal',
      accessory: 'crown',
      board: 'meadow',
      victory: 'cheer',
    });
    expect(selected).toEqual({ stone: 'rose', avatar: 'royal', accessory: 'crown', board: 'meadow', victory: 'cheer' });
    expect(publicAppearance(selected)).toEqual({
      stone: 'rose',
      avatar: 'royal',
      accessory: 'crown',
      victory: 'cheer',
    });
  });

  it('falls back to the default for invalid client values', () => {
    expect(normalizeAppearance({ stone: '__proto__', avatar: null, board: 100, victory: 'unknown' })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(normalizeAppearance({ stone: 'jade', avatar: 'mint', board: 'oak', victory: 'spin' }).accessory).toBe('none');
  });
});
