import * as THREE from 'three';
import { createShellStone } from './shell-stone';
import { createFlameStone, animateFlameStone } from './flame-stone';
import { createLotusStone } from './lotus-stone';
import { TAU, disposeGroup, frame, merged, mesh, noise, texture, type Palette, type TierBoard } from './board-decor';
import { createForestBoard } from './forest-board';
import { createBeachBoard } from './beach-board';

export type { TierBoard } from './board-decor';
export const TIER_STONE_IDS = ['obsidian', 'opal', 'astral', 'sovereign'] as const;
export const TIER_BOARD_IDS = ['moonstone', 'forest', 'beach'] as const;
export type TierStoneStyle = (typeof TIER_STONE_IDS)[number];
export type TierBoardStyle = (typeof TIER_BOARD_IDS)[number];
type Seat = 'black' | 'white';

// Geometry and material templates are shared by every intersection, including placement previews.
const stoneTemplates = new Map<string, THREE.Group>();

function ring(radius: number, width: number, y: number, segments = 48) {
  const geometry = new THREE.TorusGeometry(radius, width, 6, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function gem(radius: number, height: number, x: number, y: number, z: number, sides = 8) {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  if (sides !== 8) {
    geometry.dispose();
    return new THREE.CylinderGeometry(0, radius, height, sides).translate(x, y, z);
  }
  geometry.scale(1, height / (radius * 2), 1);
  geometry.translate(x, y, z);
  return geometry;
}

function medallion(points: number, outer: number, inner: number, height: number, y: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * TAU;
    const radius = i % 2 ? inner : outer;
    if (i === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function cutStone(segments: number, profile: [number, number][]) {
  return new THREE.LatheGeometry(
    profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
    segments,
  );
}

function metal(color: number) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.68, roughness: 0.28 });
}

function createStoneTemplate(style: TierStoneStyle, seat: Seat) {
  // IDs stay stable for stored looks; the designs are now sculpted botanical and natural motifs.
  if (style !== 'astral') {
    const sculpture =
      style === 'obsidian'
        ? createShellStone(seat)
        : style === 'opal'
          ? createLotusStone(seat)
          : createFlameStone(seat);
    sculpture.userData.tierStoneStyle = style;
    sculpture.userData.seat = seat;
    return sculpture;
  }
  const dark = seat === 'black';
  const group = new THREE.Group();
  group.userData.tierStoneStyle = style;
  group.userData.seat = seat;
  const silver = metal(dark ? 0xa8b9ce : 0x7d91a6);
  const body = new THREE.MeshPhysicalMaterial({
    color: dark ? 0x101c30 : 0xf1ece2,
    roughness: 0.24,
    metalness: 0.06,
    clearcoat: 0.95,
    clearcoatRoughness: 0.14,
  });
  body.color.setHex(dark ? 0x102b4d : 0xe8edf6);
  body.roughness = 0.14;
  body.iridescence = 0.5;
  const profile: [number, number][] = [
    [0, -0.14],
    [0.29, -0.14],
    [0.39, -0.03],
    [0.35, 0.095],
    [0.23, 0.15],
    [0, 0.18],
  ];
  mesh(group, cutStone(32, profile), body);
  const orbit: THREE.BufferGeometry[] = [ring(0.28, 0.007, 0.15), ring(0.34, 0.006, 0.1)];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * TAU;
    orbit.push(gem(0.018, 0.025, Math.cos(angle) * 0.28, 0.16, Math.sin(angle) * 0.28));
  }
  const paths = mesh(group, merged(orbit), silver, 'tier-orbit');
  paths.rotation.y = Math.PI / 7;
  const star = new THREE.MeshPhysicalMaterial({
    color: dark ? 0x7cbbcf : 0xb0a1ce,
    emissive: dark ? 0x1b405e : 0x3f3561,
    emissiveIntensity: 0.12,
    roughness: 0.14,
    metalness: 0.22,
    clearcoat: 1,
    flatShading: true,
  });
  mesh(group, merged([medallion(4, 0.17, 0.065, 0.025, 0.18), gem(0.079, 0.12, 0, 0.211, 0)]), star);
  return group;
}

export function createTierStone(style: TierStoneStyle, seat: Seat) {
  const key = `${style}:${seat}`;
  let template = stoneTemplates.get(key);
  if (!template) {
    template = createStoneTemplate(style, seat);
    stoneTemplates.set(key, template);
  }
  return template.clone(true);
}

/** Time is seconds; animation does not change the footprint or the playing-surface contact. */
export function animateTierStone(group: THREE.Group, time: number) {
  const orbit = group.getObjectByName('tier-orbit');
  if (orbit) orbit.rotation.y = time * 0.09;
  if (group.userData.tierStoneStyle === 'sovereign') animateFlameStone(group, time);
}

/** Call only when the last renderer using tier stones is torn down, never for a single placed stone. */
export function disposeTierStoneResources() {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const template of stoneTemplates.values()) {
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if (material instanceof THREE.MeshPhysicalMaterial) material.map?.dispose();
    material.dispose();
  }
  stoneTemplates.clear();
}

function moonstoneTexture() {
  return texture(512, (x, y) => {
    const grain = noise(x * 512, y * 512) * 2;
    const warp = x * 2.8 + y * 0.9 + Math.sin(y * 10 + x * 3) * 0.19 + Math.sin(x * 21 - y * 17) * 0.022;
    const vein = Math.pow((Math.sin(warp * 20) + 1) / 2, 24);
    const cloud = Math.sin(x * 10 + Math.sin(y * 7)) * Math.cos(y * 13 - x * 4);
    return [237 + cloud * 9 - vein * 7 - grain, 241 + cloud * 7 - vein * 5, 251 + cloud * 3 - grain];
  });
}

function createMoonstoneBoard(): TierBoard {
  const decorations = new THREE.Group();
  decorations.name = 'tier-board-moonstone';
  const map = moonstoneTexture();
  const palette: Palette = { surface: 0xe1e6f4, body: 0x737b9d, line: 0x7c86a6, detail: 0xdce5f2 };
  const trim = metal(0xc6d4e8);
  const trimParts: THREE.BufferGeometry[] = [];
  const corners = [-6.88, 6.88];
  trimParts.push(frame(14.44, 0.55, -0.76, 0.027), frame(14.44, 0.55, -0.83, 0.013), frame(14.2, 0.53, 0.275, 0.02));
  const moons: THREE.BufferGeometry[] = [];
  for (const x of corners) {
    for (const z of corners) {
      const crescent = new THREE.TorusGeometry(0.24, 0.023, 6, 28, Math.PI * 1.55);
      crescent.rotateX(-Math.PI / 2);
      crescent.rotateY(Math.atan2(-x, -z));
      crescent.translate(x, 0.385, z);
      trimParts.push(crescent);
      moons.push(gem(0.1, 0.22, x, 0.46, z));
    }
  }
  for (const side of [-1, 1]) {
    for (const offset of [-5.9, -4.8, -3.7, 3.7, 4.8, 5.9]) {
      const crescent = new THREE.TorusGeometry(0.14, 0.013, 6, 24, Math.PI * 1.55);
      crescent.rotateZ(Math.PI * 0.23);
      crescent.translate(offset, -0.3, side * 7.237);
      trimParts.push(crescent);
    }
  }
  const moonMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf0eafb,
    iridescence: 1,
    roughness: 0.14,
    metalness: 0.15,
    clearcoat: 1,
  });
  mesh(decorations, merged(moons), moonMaterial);
  mesh(decorations, merged(trimParts), trim);
  return {
    palette,
    map,
    decorations,
    roughness: 0.24,
    clearcoat: 0.8,
    dispose: () => {
      map.dispose();
      disposeGroup(decorations);
    },
  };
}

export function createTierBoard(style: TierBoardStyle): TierBoard {
  switch (style) {
    case 'moonstone':
      return createMoonstoneBoard();
    case 'forest':
      return createForestBoard();
    case 'beach':
      return createBeachBoard();
    default: {
      const unhandled: never = style;
      throw new Error(`No board scene for ${String(unhandled)}`);
    }
  }
}
