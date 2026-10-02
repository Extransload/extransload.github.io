import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, normalizeAppearance, publicAppearance } from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('accepts the free designs and shares only visible player choices', () => {
    const selected = normalizeAppearance({ stone: 'jade', avatar: 'coral', board: 'walnut', victory: 'spin' });
    expect(selected).toEqual({ stone: 'jade', avatar: 'coral', board: 'walnut', victory: 'spin' });
    expect(publicAppearance(selected)).toEqual({ stone: 'jade', avatar: 'coral', victory: 'spin' });
  });

  it('falls back to the default for invalid client values', () => {
    expect(normalizeAppearance({ stone: '__proto__', avatar: null, board: 100, victory: 'unknown' })).toEqual(
      DEFAULT_APPEARANCE,
    );
  });
});
