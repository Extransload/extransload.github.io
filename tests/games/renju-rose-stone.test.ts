import { describe, expect, it } from 'vitest';
import { classicStoneGeometry, roseStoneGeometry } from '../../src/domains/games/renju/rose-stone';

describe('sculpted rose stone', () => {
  it('fits one intersection with layered relief and a bounded full-board geometry budget', () => {
    const geometry = roseStoneGeometry();
    const bounds = geometry.boundingBox!;
    const position = geometry.getAttribute('position');
    expect(geometry.index!.count / 3).toBeLessThanOrEqual(6_000);
    expect(geometry.index!.count / 3).toBeGreaterThan(3_000);
    expect(geometry.getAttribute('color').count).toBe(position.count);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.32);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(0.5);
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getZ(i))).toBeLessThanOrEqual(0.4);
    }
    expect([...geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
    // Closed individual petals remain separate components after merging: the gaps are real.
    const indices = geometry.index!.array;
    const roots = Array.from({ length: position.count }, (_, i) => i);
    const find = (i: number): number => (roots[i] === i ? i : (roots[i] = find(roots[i])));
    for (let i = 0; i < indices.length; i += 3) {
      roots[find(indices[i + 1])] = find(indices[i]);
      roots[find(indices[i + 2])] = find(indices[i]);
    }
    expect(new Set([...indices].map(find)).size).toBe(16);
    geometry.dispose();
  });
});

describe('classic black/white stone', () => {
  it('retains the original smooth pebble footprint and profile', () => {
    const geometry = classicStoneGeometry();
    const bounds = geometry.boundingBox!;
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.76);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.76);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(0.3496);
    expect(geometry.index!.count / 3).toBeLessThanOrEqual(3_000);
    expect([...geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
    geometry.dispose();
  });
});
