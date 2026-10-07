import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import {
  TIER_BOARD_IDS,
  TIER_STONE_IDS,
  animateTierStone,
  createTierBoard,
  createTierStone,
  disposeTierStoneResources,
} from '../../src/domains/games/renju/tier-pieces';

afterAll(disposeTierStoneResources);

describe('tier stones', () => {
  it.each(TIER_STONE_IDS)('%s stays inside its intersection with distinguishable seats', (style) => {
    for (const seat of ['black', 'white'] as const) {
      const stone = createTierStone(style, seat);
      if (style === 'sovereign') {
        expect(stone.children).toHaveLength(1);
        const flame = stone.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
        expect(flame.material.uniforms.cold.value).toBe(seat === 'white' ? 1 : 0);
        expect(flame.material.transparent).toBe(true);
        expect(flame.userData.stoneEffect).toBe(true);
      } else {
        const body = stone.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
        const lightness = body.material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
        expect(lightness)[seat === 'black' ? 'toBeLessThan' : 'toBeGreaterThan'](seat === 'black' ? 0.1 : 0.7);
      }
      for (const time of [0, 15, 99]) {
        animateTierStone(stone, time);
        stone.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(stone, true);
        expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))).toBeLessThanOrEqual(0.42);
        expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThanOrEqual(0.42);
        if (style !== 'sovereign') expect(bounds.min.y).toBeLessThan(0);
        expect(bounds.max.y).toBeLessThan(style === 'sovereign' ? 1.28 : 0.41);
      }
      expect(stone.children.length).toBeLessThanOrEqual(style === 'sovereign' ? 4 : 3);
      const triangles = stone.children.reduce((sum, object) => {
        const geometry = (object as THREE.Mesh).geometry;
        return sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      }, 0);
      expect(triangles).toBeLessThan(7_000);
      for (const object of stone.children as THREE.Mesh[]) {
        expect([...object.geometry.getAttribute('normal').array].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('shares expensive resources while keeping animation transforms independent', () => {
    const first = createTierStone('astral', 'black');
    const second = createTierStone('astral', 'black');
    expect((first.children[0] as THREE.Mesh).geometry).toBe((second.children[0] as THREE.Mesh).geometry);
    expect((first.children[0] as THREE.Mesh).material).toBe((second.children[0] as THREE.Mesh).material);
    animateTierStone(first, 7);
    expect(first.getObjectByName('tier-orbit')!.rotation.y).not.toBe(second.getObjectByName('tier-orbit')!.rotation.y);
    expect(first.position.toArray()).toEqual([0, 0, 0]);
    expect(first.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('keeps red and blue fire moving in cloned placement-preview materials without changing the placed stone', () => {
    for (const seat of ['black', 'white'] as const) {
      const placed = createTierStone('sovereign', seat);
      const preview = placed.clone(true);
      const source = placed.getObjectByName('living-flame-plume') as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.ShaderMaterial
      >;
      const ghost = preview.getObjectByName('living-flame-plume') as typeof source;
      ghost.material = ghost.material.clone();
      ghost.material.opacity = 0.86;
      animateTierStone(placed, 1);
      animateTierStone(preview, 3);
      expect(source.material.uniforms.cold.value).toBe(seat === 'white' ? 1 : 0);
      expect(source.material.uniforms.time.value).toBe(1);
      expect(ghost.material.uniforms.time.value).toBe(3);
      expect(ghost.material.uniforms.opacity.value).toBe(0.86);
      expect(source.material.uniforms.opacity.value).toBe(1);
      expect(ghost.material.depthWrite).toBe(false);
      // Rear-face depth let raised grid lines and star points punch through an opaque flame.
      expect(ghost.material.side).toBe(THREE.FrontSide);
      ghost.material.dispose();
    }
  });
});

describe('tier boards', () => {
  it.each(TIER_BOARD_IDS)(
    '%s keeps all raised decoration outside the playable grid and owns its resources',
    (style) => {
      const board = createTierBoard(style);
      expect(board.map.colorSpace).toBe(THREE.SRGBColorSpace);
      const disposals: string[] = [];
      board.map.addEventListener('dispose', () => disposals.push('texture'));
      board.decorations.updateMatrixWorld(true);
      for (const child of board.decorations.children as THREE.Mesh[]) {
        child.geometry.addEventListener('dispose', () => disposals.push('geometry'));
        const positions = child.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld);
          if (point.y > 0.36) expect(Math.max(Math.abs(point.x), Math.abs(point.z))).toBeGreaterThan(6.5);
          // The original centered front/back Extransload plaques occupy this rectangle.
          const insidePlaque =
            Math.abs(point.x) < 3 &&
            Math.abs(point.z) > 7.18 &&
            Math.abs(point.z) < 7.3 &&
            point.y > -0.71 &&
            point.y < 0.08;
          expect(insidePlaque).toBe(false);
        }
      }
      expect(board.decorations.children.length).toBeLessThanOrEqual(4);
      const geometryCount = board.decorations.children.length;
      board.dispose();
      expect(disposals.filter((kind) => kind === 'texture')).toHaveLength(1);
      expect(disposals.filter((kind) => kind === 'geometry')).toHaveLength(geometryCount);
      expect(board.decorations.children).toHaveLength(0);
    },
  );
});
