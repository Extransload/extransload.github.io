export const calendarDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function rollingPeriod(days: number, now = new Date()) {
  const first = new Date(now);
  first.setDate(first.getDate() - days + 1);
  return { start: calendarDate(first), end: calendarDate(now) };
}

export function dailyRows(rows: Array<Record<string, string | number>>, start: string, end: string) {
  const indexed = new Map(rows.map((row) => [String(row.date).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), row]));
  const result: Array<Record<string, string | number>> = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    result.push({ ...indexed.get(date), date });
  }
  return result;
}
