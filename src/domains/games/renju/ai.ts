import { analyzeMove, index, inside, SIZE, type Board, type Color, type Point } from './rules';

export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const LEVELS: Record<Difficulty, { picks: number; depth: number; beam: number; time: number }> = {
  1: { picks: 8, depth: 0, beam: 0, time: 0 },
  2: { picks: 5, depth: 0, beam: 0, time: 0 },
  3: { picks: 3, depth: 0, beam: 0, time: 0 },
  4: { picks: 1, depth: 0, beam: 0, time: 0 },
  5: { picks: 1, depth: 2, beam: 4, time: 250 },
  6: { picks: 1, depth: 3, beam: 5, time: 500 },
  7: { picks: 1, depth: 5, beam: 6, time: 850 },
  8: { picks: 1, depth: 7, beam: 7, time: 1250 },
  9: { picks: 1, depth: 9, beam: 8, time: 1800 },
};

export function normalizeDifficulty(value: unknown): Difficulty {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 9 ? (number as Difficulty) : 5;
}
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
const other = (color: Color): Color => (color === 1 ? 2 : 1);

function wouldCompleteFive(board: Board, point: Point, color: Color): boolean {
  for (const [dx, dy] of directions) {
    let length = 1;
    for (const sign of [-1, 1]) {
      let x = point.x + dx * sign;
      let y = point.y + dy * sign;
      while (inside(x, y) && board[index(x, y)] === color) {
        length++;
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (color === 2 ? length >= 5 : length === 5) return true;
  }
  return false;
}

function immediateWins(board: Board, color: Color, limit = 2): Point[] {
  const wins: Point[] = [];
  for (const point of candidates(board)) {
    if (!wouldCompleteFive(board, point, color)) continue;
    if (analyzeMove(board, point.x, point.y, color).win) wins.push(point);
    if (wins.length >= limit) break;
  }
  return wins;
}

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
      if (!blocked && blank && mine >= 3) score += mine === 4 ? 5000 : 500;
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
  const legality = new Map<string, ReturnType<typeof analyzeMove>>();
  const scored = candidates(board)
    .map((point) => {
      const offense = lineScore(board, point, color);
      const defense = lineScore(board, point, other(color));
      const center = (7 - Math.abs(7 - point.x) + 7 - Math.abs(7 - point.y)) * 2;
      return { point, offense, defense, center, score: offense + defense * 0.82 + center };
    })
    .sort((a, b) => b.score - a.score);
  // Immediate wins and blocks rank first. Search only needs a few extra legal
  // moves beyond its beam; scanning all legal points dominates its runtime.
  const needed = search ? search.beam + 3 : Infinity;
  for (const { point, offense, defense, center } of scored) {
    const verdict = analyzeMove(board, point.x, point.y, color, legality);
    if (!verdict.legal) continue;
    const legalDefense = analyzeMove(board, point.x, point.y, other(color), legality).legal ? defense : 0;
    result.push({
      point,
      score: offense + legalDefense * 0.82 + center,
      offense,
      win: verdict.win,
    });
    if (result.length >= needed) break;
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
  const level = LEVELS[normalizeDifficulty(difficulty)];
  const choices = ranked(board, color);
  if (!choices.length) return null;
  if (choices.length === 1) return choices[0].point;
  const winning = choices.find((choice) => choice.win);
  if (winning) return winning.point;
  if (level.picks > 1) return choices[Math.floor(Math.random() * Math.min(level.picks, choices.length))].point;
  if (color === 2 && board[index(7, 7)] === 1 && board.reduce((count, cell) => count + Number(cell !== 0), 0) === 1)
    return choices[0].point;
  const enemyChoices = ranked(board, other(color));
  const threats = enemyChoices.filter((choice) => choice.win);
  const threatCells = new Set(threats.map((move) => index(move.point.x, move.point.y)));
  const roots = threats.length ? choices.filter((move) => threatCells.has(index(move.point.x, move.point.y))) : choices;
  if (!roots.length) return choices[0].point;
  if (roots.length === 1) return roots[0].point;
  if (!level.depth) return roots[0].point;
  if (difficulty >= 7 && !threats.length) {
    for (const move of roots.slice(0, 12)) {
      const cell = index(move.point.x, move.point.y);
      board[cell] = color;
      try {
        if (immediateWins(board, other(color), 1).length) continue;
        if (immediateWins(board, color).length > 1) return move.point;
      } finally {
        board[cell] = 0;
      }
    }
    const enemyForks: Point[] = [];
    for (const move of enemyChoices.slice(0, 12)) {
      const cell = index(move.point.x, move.point.y);
      board[cell] = other(color);
      try {
        if (immediateWins(board, color, 1).length) continue;
        if (immediateWins(board, other(color)).length > 1) enemyForks.push(move.point);
      } finally {
        board[cell] = 0;
      }
      if (enemyForks.length > 1) break;
    }
    if (enemyForks.length === 1) {
      const block = roots.find((move) => move.point.x === enemyForks[0].x && move.point.y === enemyForks[0].y);
      if (block) return block.point;
    }
  }
  const search: Search = {
    deadline: Date.now() + level.time,
    beam: level.beam,
    positions: new Map(),
    transpositions: new Map(),
  };
  let best = roots[0];
  const maximumDepth = level.depth;
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
