import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  AVATARS,
  appearanceForSeat,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from '../../src/domains/games/renju/appearance';

describe('Omokmaru appearance values', () => {
  it('keeps a separate dance choice for every avatar across selection and storage', () => {
    const selected = normalizeAppearance({
      stone: 'rose',
      avatar: 'luna',
      board: 'meadow',
      dances: { ...DEFAULT_APPEARANCE.dances, luna: 'encore', serin: 'signature' },
    });
    expect(appearanceForSeat('black', 'black', selected)).toEqual({ stone: 'rose', avatar: 'luna', dance: 'encore' });
    expect(appearanceForSeat('white', 'black', selected)).toEqual({
      stone: 'rose',
      avatar: 'luna',
      dance: 'encore',
    });
    const serin = normalizeAppearance({ ...selected, avatar: 'serin' });
    expect(appearanceForSeat('black', 'black', serin).dance).toBe('signature');
    expect(normalizeAppearance(JSON.parse(JSON.stringify(selected))).dances.luna).toBe('encore');
  });

  it('migrates older global victory settings and invalid dances to avatar defaults', () => {
    const old = normalizeAppearance({ avatar: 'serin', victory: 'spin', accessory: 'crown' });
    expect(old.avatar).toBe('serin');
    expect(old.dances).toEqual(DEFAULT_APPEARANCE.dances);
    expect(normalizeAppearance({ avatar: 'azure' }).avatar).toBe('petal');
    expect(normalizeAppearance({ dances: { petal: '__proto__', luna: 'encore' } }).dances).toEqual({
      ...DEFAULT_APPEARANCE.dances,
      luna: 'encore',
    });
  });

  it('offers only the rose stone and migrates retired stone designs to it', () => {
    expect(APPEARANCE_OPTIONS.stone.map(({ id }) => id)).toEqual(['rose']);
    expect(DEFAULT_APPEARANCE.stone).toBe('rose');
    expect(normalizeAppearance({ stone: 'jade' }).stone).toBe('rose');
  });

  it('keeps only the current avatar designs and no separate victory category', () => {
    expect(APPEARANCE_OPTIONS).not.toHaveProperty('victory');
    expect(APPEARANCE_OPTIONS.avatar.map(({ id }) => id)).toEqual(['petal', 'luna', 'apron', 'serin']);
    for (const avatar of AVATARS) {
      const selected = normalizeAppearance({ avatar });
      expect(selected.avatar).toBe(avatar);
      expect(appearanceForSeat('white', 'black', selected).avatar).toBe(avatar);
    }
  });
});
