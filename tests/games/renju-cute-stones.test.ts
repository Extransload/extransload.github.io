import { describe, expect, it } from 'vitest';
import { flowerStoneGeometry, heartStoneGeometry, roseStoneGeometry } from '../../src/domains/games/renju/cute-stones';

describe('decorative stone geometry', () => {
  it.each([
    ['flower', flowerStoneGeometry],
    ['rose', roseStoneGeometry],
    ['heart', heartStoneGeometry],
  ])('%s produces a complete raised mesh', (_, makeGeometry) => {
    const geometry = makeGeometry();
    geometry.computeBoundingBox();
    expect(geometry.getAttribute('position').count).toBeGreaterThan(1000);
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(0.18);
    expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeLessThan(0.9);
    geometry.dispose();
  });
});
