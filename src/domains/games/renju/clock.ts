import type { ClockState, GameSettings } from './protocol';

export function freshClock(settings: GameSettings): ClockState {
  return {
    mainMs: settings.mainMinutes * 60_000,
    periodsLeft: settings.byoPeriods,
    byoMs: settings.byoSeconds * 1000,
  };
}

export function advanceClock(
  clock: ClockState,
  elapsedMs: number,
  settings: GameSettings,
): { clock: ClockState; expired: boolean } {
  const next = { ...clock };
  let elapsed = Math.max(0, Math.floor(elapsedMs));
  if (next.mainMs > 0) {
    const mainUsed = Math.min(elapsed, next.mainMs);
    next.mainMs -= mainUsed;
    elapsed -= mainUsed;
  }
  if (next.mainMs > 0 || (elapsed === 0 && next.periodsLeft > 0)) return { clock: next, expired: false };
  if (!settings.byoSeconds || next.periodsLeft <= 0) return { clock: next, expired: true };
  const periodMs = settings.byoSeconds * 1000;
  while (elapsed >= next.byoMs) {
    elapsed -= next.byoMs;
    next.periodsLeft--;
    if (next.periodsLeft <= 0) return { clock: { ...next, byoMs: 0 }, expired: true };
    next.byoMs = periodMs;
  }
  next.byoMs -= elapsed;
  return { clock: next, expired: false };
}

export function finishMoveClock(clock: ClockState, settings: GameSettings): ClockState {
  return clock.mainMs === 0 && clock.periodsLeft > 0 ? { ...clock, byoMs: settings.byoSeconds * 1000 } : clock;
}

export function timeoutAfter(clock: ClockState, settings: GameSettings): number {
  if (clock.mainMs > 0) {
    return clock.mainMs + (settings.byoSeconds ? settings.byoSeconds * 1000 * clock.periodsLeft : 0);
  }
  if (clock.periodsLeft <= 0) return 0;
  return clock.byoMs + (clock.periodsLeft - 1) * settings.byoSeconds * 1000;
}
