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
import { AVATAR_SPOTS } from '../../src/domains/games/renju/board-decor';

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
  it('offers the moonstone board and the two living editions', () => {
    expect(TIER_BOARD_IDS).toEqual(['moonstone', 'forest', 'beach']);
  });

  // board-3d's avatar tray: radius 1.17 at the 1.16 near-seat scale, bottom ≈ 0.04 under the group origin.
  const TRAY_RADIUS = 1.17 * 1.16;
  const TRAY_DEPTH = 0.06;
  const WATER_SWELL = 0.04;

  it.each(['forest', 'beach'] as const)('%s levels a dry pad under both avatar trays', (style) => {
    const board = createTierBoard(style);
    const floor = board.avatarFloor;
    expect(floor).toBeDefined();
    const ground = board.decorations.getObjectByName(style === 'forest' ? 'forest-ground' : 'beach-sand') as THREE.Mesh;
    const positions = ground.geometry.getAttribute('position');
    const water = board.decorations.getObjectByName('beach-water') as THREE.Mesh | undefined;
    const waterLevel = water ? (water.geometry.getAttribute('position') as THREE.BufferAttribute).getY(0) : -Infinity;
    for (const spot of AVATAR_SPOTS) {
      let sampled = 0;
      for (let i = 0; i < positions.count; i++) {
        if (Math.hypot(positions.getX(i) - spot.x, positions.getZ(i) - spot.z) > TRAY_RADIUS + 0.09) continue;
        sampled++;
        // The tray sits lightly sunk into the pad, neither floating above it nor clipping through it.
        expect(positions.getY(i)).toBeGreaterThan(floor! - TRAY_DEPTH);
        expect(positions.getY(i)).toBeLessThan(floor!);
        // Beach spits keep the trays above the swell instead of standing in the shallows.
        expect(positions.getY(i)).toBeGreaterThan(waterLevel + WATER_SWELL);
      }
      expect(sampled).toBeGreaterThan(4);
    }
    board.dispose();
  });

  it('beach fish shadows swim around the avatar sand spits instead of under them', () => {
    const board = createTierBoard('beach');
    const fish = board.decorations.children.filter((object) => object.name === 'beach-fish');
    expect(fish.length).toBeGreaterThan(0);
    // This far down the pad's slope the sand is back under the shadows' depth; closer in it covers them.
    const SPIT_CLEARANCE = 2.2;
    for (let time = 0; time <= 90; time += 0.25) {
      board.update?.(time);
      for (const shadow of fish)
        for (const spot of AVATAR_SPOTS)
          expect(Math.hypot(shadow.position.x - spot.x, shadow.position.z - spot.z)).toBeGreaterThan(SPIT_CLEARANCE);
    }
    board.dispose();
  });

  type Renderable = THREE.Mesh | THREE.Points | THREE.Sprite;
  const isRenderable = (object: THREE.Object3D): object is Renderable =>
    object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite;
  const materialsOf = (object: Renderable) => (Array.isArray(object.material) ? object.material : [object.material]);
  const renderables = (group: THREE.Group) => {
    const found: Renderable[] = [];
    group.traverse((object) => {
      if (isRenderable(object)) found.push(object);
    });
    return found;
  };

  /** Visits every world-space vertex; points are inflated to their rendered radius, sprites use their centre. */
  const forEachWorldPoint = (object: Renderable, visit: (x: number, y: number, z: number) => void) => {
    const m = object.matrixWorld.elements;
    const world = (x: number, y: number, z: number) =>
      visit(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
    if (object instanceof THREE.Sprite) return world(0, 0, 0);
    const positions = object.geometry.getAttribute('position');
    if (object instanceof THREE.Points) {
      const radius = (object.material as THREE.PointsMaterial).size / 2;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        for (const [dx, dy] of [
          [0, 0],
          [radius, 0],
          [-radius, 0],
          [0, radius],
          [0, -radius],
        ])
          world(x + dx, y + dy, z);
      }
      return;
    }
    if (object instanceof THREE.InstancedMesh) {
      const instance = new THREE.Matrix4();
      const combined = new THREE.Matrix4();
      const point = new THREE.Vector3();
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instance);
        combined.multiplyMatrices(object.matrixWorld, instance);
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(combined);
          visit(point.x, point.y, point.z);
        }
      }
      return;
    }
    for (let i = 0; i < positions.count; i++) world(positions.getX(i), positions.getY(i), positions.getZ(i));
  };

  /** Static decorations are checked once; anything whose transform or buffers change is re-checked every frame. */
  const signature = (object: Renderable) =>
    object.matrixWorld.elements.join(',') +
    `|${(object.geometry.getAttribute('position') as THREE.BufferAttribute).version}` +
    (object instanceof THREE.InstancedMesh ? `|${object.instanceMatrix.version}` : '');

  // board-3d's default views: desktop and phone cameras, both aimed at the board centre.
  const CAMERAS = [new THREE.Vector3(0, 23, 26), new THREE.Vector3(0, 25, 25)];
  const GRID = 6.4;
  const LINES = 0.368;
  const PLAQUE = { halfWidth: 2.34, bottom: -0.705, top: 0.015, z: 7.24 };
  /** What a camera would see this point drawn over: the grid, the near plaque, or nothing. */
  const occludes = (camera: THREE.Vector3, x: number, y: number, z: number) => {
    const dx = x - camera.x;
    const dy = y - camera.y;
    const dz = z - camera.z;
    if (dy < 0) {
      const t = (LINES - camera.y) / dy;
      if (t > 1 && Math.abs(camera.x + dx * t) <= GRID && Math.abs(camera.z + dz * t) <= GRID) return 'grid';
    }
    if (dz < 0) {
      const t = (PLAQUE.z - camera.z) / dz;
      const hy = camera.y + dy * t;
      if (t > 1 && Math.abs(camera.x + dx * t) < PLAQUE.halfWidth && hy > PLAQUE.bottom && hy < PLAQUE.top)
        return 'plaque';
    }
    return null;
  };

  it.each(TIER_BOARD_IDS)(
    '%s never covers a playable point or the Extransload plaques, in world space or from either camera',
    (style) => {
      const board = createTierBoard(style);
      expect(board.map.colorSpace).toBe(THREE.SRGBColorSpace);
      const objects = renderables(board.decorations);
      // One GPU submission per frame stays cheap: a scene is a few dozen draw calls at most.
      expect(objects.length).toBeLessThanOrEqual(style === 'moonstone' ? 4 : 40);
      const checked = new Map<Renderable, string>();
      const violations = new Set<string>();
      for (let time = 0; time <= 40; time += 0.5) {
        board.update?.(time);
        board.decorations.updateMatrixWorld(true);
        for (const object of objects) {
          const current = signature(object);
          if (checked.get(object) === current) continue;
          checked.set(object, current);
          forEachWorldPoint(object, (x, y, z) => {
            if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) violations.add(`${object.name} NaN`);
            // Nothing above the lines may sit over a playable intersection, in any animation frame.
            if (y > 0.36 && Math.max(Math.abs(x), Math.abs(z)) <= 6.5) violations.add(`${object.name} over grid`);
            // The original centered front/back Extransload plaques occupy this rectangle.
            if (Math.abs(x) < 3 && Math.abs(z) > 7.18 && Math.abs(z) < 7.3 && y > -0.71 && y < 0.08)
              violations.add(`${object.name} inside plaque`);
            if (y > -0.7)
              for (const camera of CAMERAS) {
                const hit = occludes(camera, x, y, z);
                if (hit) violations.add(`${object.name} covers ${hit} from (${camera.y},${camera.z}) at t=${time}`);
              }
          });
        }
      }
      expect([...violations]).toEqual([]);
      board.dispose();
    },
  );

  const ANIMATED: Record<'forest' | 'beach', string[]> = {
    forest: ['squirrel-body', 'squirrel-tail', 'bird-body', 'bird-wing', 'rabbit-body', 'butterfly-wing'],
    beach: ['crab-body', 'crab-claw', 'gull-body', 'gull-wing', 'beach-fish', 'beach-palm-fronds'],
  };

  it.each(['forest', 'beach'] as const)('%s keeps every creature and effect moving between frames', (style) => {
    const board = createTierBoard(style);
    const objects = renderables(board.decorations);
    const named = (name: string) => objects.filter((object) => object.name === name);
    const snapshot = () => {
      board.decorations.updateMatrixWorld(true);
      return new Map(objects.map((object) => [object, object.matrixWorld.elements.join(',')]));
    };
    const buffers = () =>
      objects.map((object) =>
        object instanceof THREE.InstancedMesh
          ? [...object.instanceMatrix.array]
          : object instanceof THREE.Points
            ? [...object.geometry.getAttribute('position').array]
            : [],
      );
    board.update!(1);
    const before = snapshot();
    const buffersBefore = buffers();
    board.update!(1.4);
    const after = snapshot();
    const buffersAfter = buffers();
    for (const name of ANIMATED[style]) {
      const group = named(name);
      expect(group.length, name).toBeGreaterThan(0);
      for (const object of group) expect(after.get(object), name).not.toBe(before.get(object));
    }
    if (style === 'forest') {
      const leaves = objects.findIndex((object) => object.name === 'forest-leaves');
      const fireflies = objects.findIndex((object) => object.name === 'forest-fireflies');
      expect(buffersAfter[leaves]).not.toEqual(buffersBefore[leaves]);
      expect(buffersAfter[fireflies]).not.toEqual(buffersBefore[fireflies]);
    } else {
      const water = named('beach-water')[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      expect(water.material.uniforms.time.value).toBe(1.4);
    }
    board.dispose();
  });

  it.each(TIER_BOARD_IDS)('%s owns and releases every geometry, material, texture and instanced mesh', (style) => {
    const board = createTierBoard(style);
    const resources = new Set<THREE.EventDispatcher<{ dispose: object }>>([board.map]);
    for (const object of renderables(board.decorations)) {
      resources.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) resources.add(object);
      const owned = [...materialsOf(object)];
      if (object instanceof THREE.Mesh && object.customDepthMaterial) owned.push(object.customDepthMaterial);
      for (const material of owned) {
        resources.add(material);
        if ('map' in material && material.map instanceof THREE.Texture) resources.add(material.map);
        if (material instanceof THREE.ShaderMaterial)
          for (const uniform of Object.values(material.uniforms))
            if (uniform.value instanceof THREE.Texture) resources.add(uniform.value);
      }
    }
    expect(resources.size).toBeGreaterThan(1);
    const released = new Set<object>();
    for (const resource of resources) resource.addEventListener('dispose', () => released.add(resource));
    board.dispose();
    expect([...resources].filter((resource) => !released.has(resource))).toEqual([]);
    expect(board.decorations.children).toHaveLength(0);
  });
});
