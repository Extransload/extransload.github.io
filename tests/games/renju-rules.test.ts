import { describe, expect, it } from 'vitest';
import { analyzeMove, emptyBoard, index, type Board } from '../../src/domains/games/renju/rules';

function placed(black: [number, number][], white: [number, number][] = []): Board {
  const board = emptyBoard();
  for (const [x, y] of black) board[index(x, y)] = 1;
  for (const [x, y] of white) board[index(x, y)] = 2;
  return board;
}
describe('Renju move rules', () => {
  it('accepts exactly five for black and five or more for white', () => {
    expect(
      analyzeMove(
        placed([
          [3, 7],
          [4, 7],
          [5, 7],
          [6, 7],
        ]),
        7,
        7,
        1,
      ),
    ).toMatchObject({ legal: true, win: true });
    expect(
      analyzeMove(
        placed(
          [],
          [
            [2, 7],
            [3, 7],
            [4, 7],
            [6, 7],
            [7, 7],
          ],
        ),
        5,
        7,
        2,
      ),
    ).toMatchObject({ legal: true, win: true });
  });
  it('rejects black overline while allowing white overline', () => {
    const stones: [number, number][] = [
      [2, 7],
      [3, 7],
      [4, 7],
      [6, 7],
      [7, 7],
    ];
    expect(analyzeMove(placed(stones), 5, 7, 1)).toMatchObject({ legal: false, forbidden: 'overline' });
    expect(analyzeMove(placed([], stones), 5, 7, 2)).toMatchObject({ legal: true, win: true });
  });
  it('rejects a double four and identifies contributing stones', () => {
    const result = analyzeMove(
      placed([
        [2, 4],
        [3, 4],
        [5, 4],
        [4, 2],
        [4, 3],
        [4, 5],
      ]),
      4,
      4,
      1,
    );
    expect(result).toMatchObject({ legal: false, forbidden: 'double-four' });
    expect(result.causes).toEqual(
      expect.arrayContaining([
        { x: 3, y: 4 },
        { x: 4, y: 3 },
      ]),
    );
  });
  it('rejects double three with a broken three', () => {
    const result = analyzeMove(
      placed([
        [2, 4],
        [3, 4],
        [5, 3],
        [5, 5],
      ]),
      5,
      4,
      1,
    );
    expect(result).toMatchObject({ legal: false, forbidden: 'double-three' });
  });
  it('allows an apparent double three when a branch cannot become open four', () => {
    const result = analyzeMove(
      placed(
        [
          [3, 4],
          [5, 4],
          [4, 3],
          [4, 5],
        ],
        [
          [1, 4],
          [7, 4],
        ],
      ),
      4,
      4,
      1,
    );
    expect(result).toMatchObject({ legal: true, win: false });
  });
  it('rejects occupied intersections and board edges', () => {
    expect(analyzeMove(placed([[7, 7]]), 7, 7, 2).legal).toBe(false);
    expect(analyzeMove(emptyBoard(), -1, 7, 1).legal).toBe(false);
  });
});
