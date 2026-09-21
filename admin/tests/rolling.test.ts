import { expect, it } from 'vitest';
import { rollingPeriod, dailyRows } from '../src/rolling';

it('rolls across year boundaries using the local calendar', () => {
  expect(rollingPeriod(7, new Date(2027, 0, 2, 0, 5))).toEqual({ start: '2026-12-27', end: '2027-01-02' });
});
it('preserves missing days as unknown and orders compact GA dates', () => {
  const rows = dailyRows(
    [
      { date: '20260903', screenPageViews: 4 },
      { date: '20260901', screenPageViews: 2 },
    ],
    '2026-09-01',
    '2026-09-03',
  );
  expect(rows.map((row) => row.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  expect(rows[1].screenPageViews).toBeUndefined();
  expect(rows[2].screenPageViews).toBe(4);
});
