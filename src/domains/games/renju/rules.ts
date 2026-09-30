export const SIZE = 15;
export type Color = 1 | 2;
export type Point = { x: number; y: number };
export type Move = Point & { color: Color };
export type Board = Uint8Array;
export type ForbiddenKind = 'overline' | 'double-four' | 'double-three';
export type Verdict = { legal: boolean; win: boolean; forbidden?: ForbiddenKind; causes: Point[] };

const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
export const inside = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const index = (x: number, y: number) => y * SIZE + x;
export const emptyBoard = (): Board => new Uint8Array(SIZE * SIZE);
export const boardFromMoves = (moves: Move[]): Board => {
  const board = emptyBoard();
  for (const move of moves) board[index(move.x, move.y)] = move.color;
  return board;
};

function run(board: Board, x: number, y: number, dx: number, dy: number, color: Color): Point[] {
  const points: Point[] = [{ x, y }];
  for (const sign of [-1, 1]) {
    let px = x + dx * sign,
      py = y + dy * sign;
    while (inside(px, py) && board[index(px, py)] === color) {
      points.push({ x: px, y: py });
      px += dx * sign;
      py += dy * sign;
    }
  }
  return points;
}

function unique(points: Point[]): Point[] {
  const seen = new Set<number>();
  return points.filter((point) => {
    const key = index(point.x, point.y);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fours(board: Board, x: number, y: number): Point[][] {
  const found = new Map<string, Point[]>();
  for (const [dx, dy] of directions) {
    for (let offset = -4; offset <= 0; offset++) {
      const cells = Array.from({ length: 5 }, (_, i) => ({ x: x + (offset + i) * dx, y: y + (offset + i) * dy }));
      if (!cells.every((p) => inside(p.x, p.y))) continue;
      const stones = cells.filter((p) => board[index(p.x, p.y)] === 1);
      const blanks = cells.filter((p) => board[index(p.x, p.y)] === 0);
      if (stones.length !== 4 || blanks.length !== 1) continue;
      const blank = blanks[0];
      board[index(blank.x, blank.y)] = 1;
      const exact = run(board, blank.x, blank.y, dx, dy, 1).length === 5;
      board[index(blank.x, blank.y)] = 0;
      if (!exact) continue;
      const key = stones
        .map((p) => index(p.x, p.y))
        .sort((a, b) => a - b)
        .join(',');
      found.set(key, stones);
    }
  }
  return [...found.values()];
}

function threes(board: Board, x: number, y: number, memo: Map<string, Verdict>): Point[][] {
  const found = new Map<string, Point[]>();
  for (const [dx, dy] of directions) {
    for (let offset = -4; offset <= 4; offset++) {
      const qx = x + offset * dx,
        qy = y + offset * dy;
      if (!inside(qx, qy) || board[index(qx, qy)] !== 0) continue;
      board[index(qx, qy)] = 1;
      const four = run(board, qx, qy, dx, dy, 1);
      const sameLine = four.length === 4 && four.some((p) => p.x === x && p.y === y);
      let straight = false;
      if (sameLine) {
        const ordered = [...four].sort((a, b) => (a.x - b.x) * dx + (a.y - b.y) * dy);
        const first = ordered[0],
          last = ordered[3];
        const before = { x: first.x - dx, y: first.y - dy };
        const after = { x: last.x + dx, y: last.y + dy };
        straight = [before, after].every((p) => inside(p.x, p.y) && board[index(p.x, p.y)] === 0);
      }
      board[index(qx, qy)] = 0;
      if (!straight || !analyzeMove(board, qx, qy, 1, memo).legal) continue;
      const stones = four.filter((p) => p.x !== qx || p.y !== qy);
      const key = stones
        .map((p) => index(p.x, p.y))
        .sort((a, b) => a - b)
        .join(',');
      found.set(key, stones);
    }
  }
  return [...found.values()];
}

export function analyzeMove(
  board: Board,
  x: number,
  y: number,
  color: Color,
  memo = new Map<string, Verdict>(),
): Verdict {
  if (!inside(x, y) || board[index(x, y)] !== 0) return { legal: false, win: false, causes: [] };
  // Recursive double-three inspection adds stones, so each branch terminates.
  const key = `${color}:${x},${y}:${Array.from(board).join('')}`;
  const cached = memo.get(key);
  if (cached) return cached;
  board[index(x, y)] = color;
  try {
    const lines = directions.map(([dx, dy]) => run(board, x, y, dx, dy, color));
    if (color === 2) {
      const winning = lines.find((line) => line.length >= 5);
      return { legal: true, win: !!winning, causes: winning ?? [] };
    }
    const five = lines.find((line) => line.length === 5);
    if (five) return { legal: true, win: true, causes: five };
    const overline = lines.find((line) => line.length > 5);
    if (overline) return { legal: false, win: false, forbidden: 'overline', causes: overline };
    const fourGroups = fours(board, x, y);
    if (fourGroups.length >= 2)
      return { legal: false, win: false, forbidden: 'double-four', causes: unique(fourGroups.flat()) };
    const threeGroups = threes(board, x, y, memo);
    if (threeGroups.length >= 2)
      return { legal: false, win: false, forbidden: 'double-three', causes: unique(threeGroups.flat()) };
    const verdict = { legal: true, win: false, causes: [] };
    memo.set(key, verdict);
    return verdict;
  } finally {
    board[index(x, y)] = 0;
  }
}
