import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { STONES } from '../../src/domains/games/renju/appearance';
import { CHARACTER_STONE_BODIES, createStoneDetails } from '../../src/domains/games/renju/stone-designs';

describe('collectible stone models', () => {
  it('provides ten distinct three-dimensional designs', () => {
    const designs = STONES.filter((style) => !['classic', 'jade', 'rose'].includes(style));
    expect(designs).toHaveLength(10);
    for (const style of designs) {
      const body = CHARACTER_STONE_BODIES[style as keyof typeof CHARACTER_STONE_BODIES];
      body.computeBoundingBox();
      expect(body.boundingBox!.max.y - body.boundingBox!.min.y).toBeGreaterThan(0.2);
      const details = createStoneDetails(style, 'black', new THREE.MeshStandardMaterial());
      expect(details?.children.length).toBeGreaterThanOrEqual(3);
      expect(details?.rotation.x).toBeCloseTo(style === 'star' || style === 'dragon' ? 0 : -Math.PI / 2);
    }
  });
});
