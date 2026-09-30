import { chooseAiMove, type Difficulty } from './ai';
import type { Color, Point } from './rules';

self.onmessage = (event: MessageEvent<{ board: Uint8Array; color: Color; difficulty: Difficulty; id: number }>) => {
  const { board, color, difficulty, id } = event.data;
  const point: Point | null = chooseAiMove(new Uint8Array(board), color, difficulty);
  self.postMessage({ point, id });
};
