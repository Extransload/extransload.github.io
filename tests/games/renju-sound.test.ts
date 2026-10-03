import { describe, expect, it } from 'vitest';
import { normalizeSoundVolume } from '../../src/domains/games/renju/sound';

describe('Omokmaru sound volume', () => {
  it('starts louder and clamps stored values', () => {
    expect(normalizeSoundVolume(null)).toBe(75);
    expect(normalizeSoundVolume('35')).toBe(35);
    expect(normalizeSoundVolume('999')).toBe(100);
    expect(normalizeSoundVolume('-20')).toBe(0);
    expect(normalizeSoundVolume('broken')).toBe(75);
  });
});
