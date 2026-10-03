import { describe, expect, it } from 'vitest';
import { roseStoneGeometry } from '../../src/domains/games/renju/rose-stone';

describe('sculpted rose stone', () => {
  it('has raised petal layers and color shading in one 3D mesh', () => {
    const geometry = roseStoneGeometry();
    geometry.computeBoundingBox();
    expect(geometry.getAttribute('position').count).toBeGreaterThan(10_000);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(0.4);
    expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeLessThan(0.9);
    geometry.dispose();
  });
});
