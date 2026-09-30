import { describe, expect, it } from 'vitest';
import { advanceClock, finishMoveClock, freshClock, timeoutAfter } from '../../src/domains/games/renju/clock';

describe('server clock rules', () => {
  it('runs main time before byo-yomi and resets the period after a move', () => {
    const settings = { mainMinutes: 1, byoSeconds: 10, byoPeriods: 3 };
    const first = advanceClock(freshClock(settings), 65_000, settings);
    expect(first).toEqual({ clock: { mainMs: 0, periodsLeft: 3, byoMs: 5_000 }, expired: false });
    expect(finishMoveClock(first.clock, settings).byoMs).toBe(10_000);
  });
  it('consumes periods and loses on the last expiration', () => {
    const settings = { mainMinutes: 0, byoSeconds: 10, byoPeriods: 3 };
    expect(advanceClock(freshClock(settings), 21_000, settings)).toEqual({
      clock: { mainMs: 0, periodsLeft: 1, byoMs: 9_000 },
      expired: false,
    });
    expect(advanceClock(freshClock(settings), 30_000, settings).expired).toBe(true);
    expect(timeoutAfter(freshClock(settings), settings)).toBe(30_000);
  });
  it('ends immediately when a main-time-only clock runs out', () => {
    const settings = { mainMinutes: 3, byoSeconds: 0, byoPeriods: 0 };
    expect(advanceClock(freshClock(settings), 180_000, settings).expired).toBe(true);
  });
});
