import { describe, expect, it } from 'vitest';
import { chooseAiMove } from '../../src/domains/games/renju/ai';
import { analyzeMove, boardFromMoves, emptyBoard, index, type Move } from '../../src/domains/games/renju/rules';

describe('Renju AI', () => {
  it('opens at the required center point', () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'master'] as const)
      expect(chooseAiMove(boardFromMoves([]), 1, difficulty)).toEqual({ x: 7, y: 7 });
  });
  it('takes an immediate legal win', () => {
    const moves: Move[] = [
      { x: 7, y: 7, color: 1 },
      { x: 2, y: 2, color: 2 },
      { x: 8, y: 7, color: 1 },
      { x: 3, y: 2, color: 2 },
      { x: 9, y: 7, color: 1 },
      { x: 4, y: 2, color: 2 },
      { x: 10, y: 7, color: 1 },
      { x: 5, y: 2, color: 2 },
    ];
    for (const difficulty of ['easy', 'normal', 'hard', 'master'] as const) {
      const point = chooseAiMove(boardFromMoves(moves), 1, difficulty);
      expect(point?.y).toBe(7);
      expect([6, 11]).toContain(point?.x);
    }
  });
  it('blocks a forced five instead of following its own positional score', () => {
    const board = emptyBoard();
    for (const x of [7, 8, 9, 10]) board[index(x, 7)] = 2;
    board[index(6, 7)] = 1;
    for (const difficulty of ['normal', 'hard', 'master'] as const)
      expect(chooseAiMove(board.slice(), 1, difficulty)).toEqual({ x: 11, y: 7 });
  });
  it('never selects a black double-three forbidden point', () => {
    const board = emptyBoard();
    for (const [x, y] of [
      [6, 7],
      [8, 7],
      [7, 6],
      [7, 8],
    ])
      board[index(x, y)] = 1;
    expect(analyzeMove(board, 7, 7, 1).forbidden).toBe('double-three');
    const before = board.slice();
    for (const difficulty of ['easy', 'normal', 'hard', 'master'] as const) {
      expect(chooseAiMove(board, 1, difficulty)).not.toEqual({ x: 7, y: 7 });
      expect(board).toEqual(before);
    }
  });
});
