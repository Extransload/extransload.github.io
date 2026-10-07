import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createShellStone } from './shell-stone';
import { createFlameStone, animateFlameStone } from './flame-stone';
import { createLotusStone } from './lotus-stone';

export const TIER_STONE_IDS = ['obsidian', 'opal', 'astral', 'sovereign'] as const;
export const TIER_BOARD_IDS = ['marble', 'moonstone', 'celestial', 'imperial'] as const;
export type TierStoneStyle = (typeof TIER_STONE_IDS)[number];
export type TierBoardStyle = (typeof TIER_BOARD_IDS)[number];
type Seat = 'black' | 'white';
type Palette = { surface: number; body: number; line: number; detail: number };

export interface TierBoard {
  palette: Palette;
  map: THREE.Texture;
  decorations: THREE.Group;
  roughness: number;
  clearcoat: number;
  update?: (time: number) => void;
  dispose: () => void;
}

// Geometry and material templates are shared by every intersection, including placement previews.
const stoneTemplates = new Map<string, THREE.Group>();
const TAU = Math.PI * 2;
const noise = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function texture(size: number, pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = pixel(x / size, y / size);
      const offset = (y * size + x) * 4;
      for (let i = 0; i < 3; i++) data[offset + i] = Math.round(THREE.MathUtils.clamp(color[i], 0, 255));
      data[offset + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

function merged(parts: THREE.BufferGeometry[]) {
  const compatible = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(compatible, false)!;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  return geometry;
}

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) {
  const object = new THREE.Mesh(geometry, material);
  if (name) object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

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

function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 5);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
  );
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
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

function boardTexture(style: TierBoardStyle) {
  return texture(512, (x, y) => {
    const grain = noise(x * 512, y * 512) * 2;
    const warp = x * 2.8 + y * 0.9 + Math.sin(y * 10 + x * 3) * 0.19 + Math.sin(x * 21 - y * 17) * 0.022;
    const vein = Math.pow((Math.sin(warp * 20) + 1) / 2, 24);
    const hairline = Math.pow((Math.sin(warp * 39 + 0.5) + 1) / 2, 52);
    if (style === 'marble') {
      const value = 250 - vein * 33 - hairline * 16 - grain;
      return [value, value - 2, value - 5];
    }
    if (style === 'moonstone') {
      const cloud = Math.sin(x * 10 + Math.sin(y * 7)) * Math.cos(y * 13 - x * 4);
      return [237 + cloud * 9 - vein * 7 - grain, 241 + cloud * 7 - vein * 5, 251 + cloud * 3 - grain];
    }
    if (style === 'celestial') {
      const cloud = Math.sin(x * 8 + y * 6) * Math.cos(y * 9 - x * 2);
      return [235 + cloud * 9 - grain, 237 + cloud * 8 - grain, 252 - vein * 6 - grain];
    }
    const value = 252 - vein * 19 - hairline * 9 - grain;
    return [value, value - 5, value - 14];
  });
}

function frame(size: number, radius: number, y: number, tube: number) {
  const edge = size / 2;
  const points: THREE.Vector3[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const cx = corner === 0 || corner === 3 ? edge - radius : -edge + radius;
    const cz = corner < 2 ? edge - radius : -edge + radius;
    for (let step = 0; step <= 8; step++) {
      const angle = (corner * Math.PI) / 2 + ((step / 8) * Math.PI) / 2;
      points.push(new THREE.Vector3(cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius));
    }
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true, 'centripetal'), 144, tube, 5, true);
}

function cornerOrnament(x: number, z: number, radius: number, y: number) {
  const geometry = medallion(4, radius, radius * 0.25, 0.013, y);
  geometry.translate(x, 0, z);
  return geometry;
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}

export function createTierBoard(style: TierBoardStyle): TierBoard {
  const decorations = new THREE.Group();
  decorations.name = `tier-board-${style}`;
  const map = boardTexture(style);
  const palettes: Record<TierBoardStyle, Palette> = {
    marble: { surface: 0xf3ede1, body: 0xaaa49e, line: 0x7b756c, detail: 0xb2a591 },
    moonstone: { surface: 0xe1e6f4, body: 0x737b9d, line: 0x7c86a6, detail: 0xdce5f2 },
    celestial: { surface: 0x536784, body: 0x182c48, line: 0xb3c5df, detail: 0xcedfed },
    imperial: { surface: 0xf4e7d3, body: 0x26374b, line: 0x92816a, detail: 0xddbf80 },
  };
  const palette = palettes[style];
  const trim = metal(style === 'imperial' ? 0xccaa67 : style === 'marble' ? 0xbab5a9 : 0xc6d4e8);
  const trimParts: THREE.BufferGeometry[] = [];
  const corners = [-6.88, 6.88];
  let update: ((time: number) => void) | undefined;
  if (style === 'marble') {
    // Beveled stone slabs and a restrained brushed-metal lower reveal.
    trimParts.push(frame(14.43, 0.53, -0.79, 0.032), frame(14.2, 0.52, 0.265, 0.018));
    for (const x of corners) for (const z of corners) trimParts.push(cornerOrnament(x, z, 0.1, 0.371));
  } else if (style === 'moonstone') {
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
  } else {
    const royal = style === 'imperial';
    trimParts.push(frame(14.49, 0.55, -0.78, 0.035), frame(14.47, 0.55, -0.91, 0.019), frame(14.23, 0.55, 0.27, 0.025));
    const gems: THREE.BufferGeometry[] = [];
    const architecture: THREE.BufferGeometry[] = [];
    const constellation: THREE.BufferGeometry[] = [];
    for (const x of corners) {
      for (const z of corners) {
        trimParts.push(cornerOrnament(x, z, royal ? 0.3 : 0.28, 0.376));
        const base = new THREE.CylinderGeometry(0.25, 0.28, royal ? 0.16 : 0.11, royal ? 8 : 6);
        base.translate(x, royal ? 0.445 : 0.43, z);
        architecture.push(base);
        gems.push(gem(royal ? 0.21 : 0.22, royal ? 0.4 : 0.44, x, royal ? 0.83 : 0.7, z));
        if (royal) {
          // Four miniature open pavilions frame suspended gems outside the grid.
          for (const dx of [-0.23, 0.23]) {
            for (const dz of [-0.23, 0.23]) {
              const column = new THREE.CylinderGeometry(0.031, 0.041, 0.64, 8);
              column.translate(x + dx, 0.83, z + dz);
              trimParts.push(column);
            }
          }
          const crown = new THREE.CylinderGeometry(0.285, 0.3, 0.085, 8);
          crown.translate(x, 1.18, z);
          trimParts.push(crown);
          trimParts.push(cornerOrnament(x, z, 0.23, 1.23));
        }
      }
    }
    // Ornament stays on the outer margin; no star or line crosses a playable intersection.
    for (const side of [-1, 1]) {
      for (let i = -4; i <= 4; i++) {
        const x = i * 1.28;
        const z = side * (6.79 + (i % 2 ? 0.08 : -0.08));
        constellation.push(gem(i % 3 === 0 ? 0.045 : 0.026, 0.01, x, 0.38, z));
        if (i < 4) {
          const nextZ = side * (6.79 + ((i + 1) % 2 ? 0.08 : -0.08));
          constellation.push(rod(new THREE.Vector3(x, 0.38, z), new THREE.Vector3(x + 1.28, 0.38, nextZ), 0.006));
        }
      }
    }
    if (royal) {
      // A stepped plinth and spaced side pilasters leave the central Extransload badges clear.
      trimParts.push(frame(14.65, 0.55, -0.9, 0.042));
      for (const side of [-1, 1]) {
        for (const offset of [-5.9, -4.65, 4.65, 5.9]) {
          const front = new THREE.BoxGeometry(0.105, 0.8, 0.055).translate(offset, -0.34, side * 7.23);
          const flank = new THREE.BoxGeometry(0.055, 0.8, 0.105).translate(side * 7.23, -0.34, offset);
          trimParts.push(front, flank);
        }
      }
    }
    mesh(
      decorations,
      merged(architecture),
      new THREE.MeshPhysicalMaterial({ color: royal ? 0xf3e7cf : 0x2a4264, roughness: 0.3, clearcoat: 0.6 }),
    );
    mesh(
      decorations,
      merged(constellation),
      new THREE.MeshBasicMaterial({ color: royal ? 0xc6a05e : 0xccdff3, toneMapped: false }),
    );
    const crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: royal ? 0x9eb6cc : 0xa9c3df,
      iridescence: 1,
      metalness: 0.2,
      roughness: 0.13,
      clearcoat: 1,
      flatShading: true,
    });
    const crystals = mesh(decorations, merged(gems), crystalMaterial, 'tier-board-crystals');
    update = (time) => {
      crystals.position.y = Math.sin(time * 0.9) * (royal ? 0.018 : 0.012);
    };
  }
  mesh(decorations, merged(trimParts), trim);
  return {
    palette,
    map,
    decorations,
    roughness: style === 'marble' ? 0.31 : style === 'moonstone' ? 0.24 : 0.3,
    clearcoat: style === 'marble' ? 0.6 : 0.8,
    update,
    dispose: () => {
      map.dispose();
      disposeGroup(decorations);
    },
  };
}
