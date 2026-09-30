import { analyzeMove, index, inside, SIZE, type Board, type Color, type Point } from './rules';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'master';
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
const other = (color: Color): Color => (color === 1 ? 2 : 1);

function candidates(board: Board): Point[] {
  const nearby = new Set<number>();
  let occupied = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (!board[index(x, y)]) continue;
      occupied++;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (inside(x + dx, y + dy) && !board[index(x + dx, y + dy)]) nearby.add(index(x + dx, y + dy));
        }
    }
  if (!occupied) return [{ x: 7, y: 7 }];
  return [...nearby].map((cell) => ({ x: cell % SIZE, y: Math.floor(cell / SIZE) }));
}

function lineScore(board: Board, point: Point, color: Color): number {
  board[index(point.x, point.y)] = color;
  let score = 0;
  for (const [dx, dy] of directions) {
    let count = 1,
      open = 0;
    for (const sign of [-1, 1]) {
      let x = point.x + dx * sign,
        y = point.y + dy * sign;
      while (inside(x, y) && board[index(x, y)] === color) {
        count++;
        x += dx * sign;
        y += dy * sign;
      }
      if (inside(x, y) && !board[index(x, y)]) open++;
    }
    score +=
      count >= 5
        ? 100000
        : count === 4
          ? open === 2
            ? 12000
            : 3000
          : count === 3
            ? open === 2
              ? 900
              : 150
            : count === 2
              ? open === 2
                ? 55
                : 12
              : 2;
    // A split three or four is useful even when the stone does not touch the other stones.
    for (let start = -4; start <= 0; start++) {
      let mine = 0,
        blank = 0,
        blocked = false;
      for (let step = 0; step < 5; step++) {
        const x = point.x + (start + step) * dx,
          y = point.y + (start + step) * dy;
        if (!inside(x, y) || board[index(x, y)] === other(color)) {
          blocked = true;
          break;
        }
        if (board[index(x, y)] === color) mine++;
        else blank++;
      }
      if (!blocked && blank && mine >= 3) score += mine === 4 ? 1400 : 90;
    }
  }
  board[index(point.x, point.y)] = 0;
  return score;
}

type Candidate = { point: Point; score: number; offense: number; win: boolean };
type Search = {
  deadline: number;
  beam: number;
  positions: Map<string, Candidate[]>;
  transpositions: Map<string, { depth: number; score: number }>;
};
const MATE = 1_000_000;
const TIMEOUT = Symbol('search timeout');

function ranked(board: Board, color: Color, search?: Search): Candidate[] {
  const key = search ? `${color}:${board.join('')}` : '';
  const cached = search?.positions.get(key);
  if (cached) return cached;
  const result: Candidate[] = [];
  for (const point of candidates(board)) {
    const verdict = analyzeMove(board, point.x, point.y, color);
    if (!verdict.legal) continue;
    const offense = lineScore(board, point, color);
    const defense = analyzeMove(board, point.x, point.y, other(color)).legal
      ? lineScore(board, point, other(color))
      : 0;
    result.push({
      point,
      score: offense + defense * 0.82 + (7 - Math.abs(7 - point.x) + 7 - Math.abs(7 - point.y)) * 2,
      offense,
      win: verdict.win,
    });
  }
  result.sort((a, b) => Number(b.win) - Number(a.win) || b.score - a.score);
  search?.positions.set(key, result);
  return result;
}

function evaluate(ours: Candidate[], theirs: Candidate[]): number {
  const potential = (moves: Candidate[]) => {
    const best = moves.map((move) => move.offense).sort((a, b) => b - a);
    return (best[0] ?? 0) + (best[1] ?? 0) * 0.3;
  };
  return potential(ours) - potential(theirs) * 1.08;
}

function searchPosition(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  quiet: number,
  search: Search,
): number {
  if (Date.now() >= search.deadline) throw TIMEOUT;
  const key = `${color}:${quiet}:${ply}:${board.join('')}`;
  const transposition = search.transpositions.get(key);
  if (transposition && transposition.depth >= depth) return transposition.score;
  const ours = ranked(board, color, search);
  if (!ours.length) return 0;
  if (ours[0].win) return MATE - ply;
  const theirs = ranked(board, other(color), search);
  const enemyWins = new Set(theirs.filter((move) => move.win).map((move) => index(move.point.x, move.point.y)));
  const forced = enemyWins.size > 0;
  if (forced && enemyWins.size > 1) return -MATE + ply + 1;
  if (depth <= 0 && (!forced || quiet <= 0)) return evaluate(ours, theirs);
  const options = forced
    ? ours.filter((move) => enemyWins.has(index(move.point.x, move.point.y)))
    : ours.slice(0, search.beam);
  if (!options.length) return -MATE + ply + 1;
  let best = -Infinity;
  let cutoff = false;
  for (const move of options) {
    const cell = index(move.point.x, move.point.y);
    board[cell] = color;
    let value: number;
    try {
      value = -searchPosition(
        board,
        other(color),
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        forced ? quiet - 1 : quiet,
        search,
      );
    } finally {
      board[cell] = 0;
    }
    best = Math.max(best, value);
    alpha = Math.max(alpha, best);
    if (alpha >= beta) {
      cutoff = true;
      break;
    }
  }
  if (!cutoff) search.transpositions.set(key, { depth, score: best });
  return best;
}

export function chooseAiMove(board: Board, color: Color, difficulty: Difficulty): Point | null {
  const choices = ranked(board, color);
  if (!choices.length) return null;
  if (choices.length === 1) return choices[0].point;
  const winning = choices.find((choice) => choice.win);
  if (winning) return winning.point;
  if (difficulty === 'easy') return choices[Math.floor(Math.random() * Math.min(6, choices.length))].point;
  const threats = ranked(board, other(color)).filter((choice) => choice.win);
  const threatCells = new Set(threats.map((move) => index(move.point.x, move.point.y)));
  const roots = threats.length ? choices.filter((move) => threatCells.has(index(move.point.x, move.point.y))) : choices;
  if (!roots.length) return choices[0].point;
  if (roots.length === 1) return roots[0].point;
  if (difficulty === 'normal') return roots[0].point;
  const search: Search = {
    deadline: Date.now() + (difficulty === 'master' ? 2800 : 850),
    beam: difficulty === 'master' ? 7 : 5,
    positions: new Map(),
    transpositions: new Map(),
  };
  let best = roots[0];
  const maximumDepth = difficulty === 'master' ? 5 : 3;
  for (let depth = 1; depth <= maximumDepth; depth++) {
    let iteration = best,
      bestScore = -Infinity,
      alpha = -MATE;
    try {
      const ordered = [...roots.slice(0, search.beam)];
      ordered.sort((a, b) => Number(b === best) - Number(a === best));
      for (const move of ordered) {
        if (Date.now() >= search.deadline) throw TIMEOUT;
        const cell = index(move.point.x, move.point.y);
        board[cell] = color;
        let value: number;
        try {
          value = -searchPosition(board, other(color), depth - 1, -MATE, -alpha, 1, 2, search);
        } finally {
          board[cell] = 0;
        }
        if (value > bestScore) {
          bestScore = value;
          iteration = move;
        }
        alpha = Math.max(alpha, value);
      }
      best = iteration;
      if (bestScore >= MATE - 10) break;
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      break;
    }
  }
  return best.point;
}
