/** Server-rendered positions for the illustrated chapter links. */
export const TRAIL_WIDTH = 1200;
const ROW_HEIGHT = 300;
const COLUMNS = 3;

export function createSplashTrail<T extends { id: string }>(chapters: readonly T[]) {
  const rows = Math.ceil(chapters.length / COLUMNS);
  const height = Math.max(1, rows) * ROW_HEIGHT + 80;
  const stops = chapters.map((chapter, index) => {
    const row = Math.floor(index / COLUMNS);
    const column = index % COLUMNS;
    const count = Math.min(COLUMNS, chapters.length - row * COLUMNS);
    const span = Math.min(800, (count - 1) * 440);
    const seed = [...chapter.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return {
      chapter,
      row,
      x: TRAIL_WIDTH / 2 - span / 2 + (count > 1 ? (column * span) / (count - 1) : 0),
      y: 20 + row * ROW_HEIGHT + (seed % 45),
      turn: ((seed % 7) - 3) / 2,
    };
  });
  return { stops, height };
}
