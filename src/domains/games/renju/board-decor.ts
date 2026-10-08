import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
/** Top of the playing slab (0.25 + 0.085 extrusion + 0.025 bevel); the grid lines float just above it. */
export const BOARD_TOP = 0.36;
export type Palette = { surface: number; body: number; line: number; detail: number };

/** A themed board: palette and surface map for the shared slab plus decorations that live in the board group. */
export interface TierBoard {
  palette: Palette;
  map: THREE.Texture;
  decorations: THREE.Group;
  roughness: number;
  clearcoat: number;
  /** Time is seconds and monotonic; the scene is re-rendered every frame while this exists. */
  update?: (time: number) => void;
  /** Where the avatar groups stand instead of AVATAR_FLOOR, for editions whose ground rises around the slab. */
  avatarFloor?: number;
  dispose: () => void;
}

/** Both seats' avatars stand here (one near, one far); ground props keep clear of these spots. */
export const AVATAR_SPOTS = [
  { x: -4.8, z: 9.1 },
  { x: 4.8, z: -9.1 },
] as const;
/**
 * Plain boards rest on an unseen table at the slab's underside, and the avatar trays rest on it too:
 * board-3d's body slab bottoms out at -0.965 and the tray's underside is ≈0.04 below its group origin
 * at the near seat's 1.16 scale, so changing either means revisiting this.
 */
export const AVATAR_FLOOR = -0.92;
/** The living editions level their ground to this height under each tray, which sinks a touch into it. */
export const AVATAR_PAD = -0.76;
export const PAD_AVATAR_FLOOR = AVATAR_PAD + 0.02;
const AVATAR_CLEARANCE = 2;
// Nothing scattered on the ground sits under the slab's corners.
const SLAB_CLEARANCE = 7.6;

export const noise = (x: number, y: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Deterministic generator so a theme scatters its props the same way on every load and in tests. */
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clearOfAvatars(x: number, z: number, margin = AVATAR_CLEARANCE) {
  return AVATAR_SPOTS.every((spot) => Math.hypot(x - spot.x, z - spot.z) > margin);
}

/** 1 under an avatar tray, easing to 0 just past it, so terrain can blend into a level pad there. */
export function avatarPad(x: number, z: number) {
  let weight = 0;
  for (const spot of AVATAR_SPOTS)
    weight = Math.max(weight, 1 - smoothstep(1.5, 2.6, Math.hypot(x - spot.x, z - spot.z)));
  return weight;
}

/**
 * A point in the ring between two radii around the board, never under the slab or an avatar tray.
 * Airborne props also stay out of the band between the camera and the near edge, where anything
 * floating above the ground would be drawn over the front rows and the near plaque.
 */
export function scatter(random: () => number, radiusMin: number, radiusMax: number, airborne = false) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const radius = Math.sqrt(THREE.MathUtils.lerp(radiusMin * radiusMin, radiusMax * radiusMax, random()));
    const angle = random() * TAU;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.max(Math.abs(x), Math.abs(z)) < SLAB_CLEARANCE || !clearOfAvatars(x, z)) continue;
    if (airborne && z > 7 && Math.abs(x) < 10) continue;
    return { x, z };
  }
  throw new Error(`No room to scatter between radii ${radiusMin} and ${radiusMax}`);
}

export function texture(size: number, pixel: (x: number, y: number) => [number, number, number]) {
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

/** A small RGBA sprite map: soft radial glow used for suns, halos, fireflies and clouds. */
export function glowTexture(
  size: number,
  shade: (distance: number, angle: number) => [number, number, number, number],
) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const color = shade(Math.min(1, Math.hypot(dx, dy) * 2), Math.atan2(dy, dx));
      const offset = (y * size + x) * 4;
      for (let i = 0; i < 4; i++) data[offset + i] = Math.round(THREE.MathUtils.clamp(color[i], 0, 255));
    }
  }
  const map = new THREE.DataTexture(data, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

export function merged(parts: THREE.BufferGeometry[]) {
  const compatible = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(compatible, false)!;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  return geometry;
}

/** Gives every vertex one color so differently tinted parts can merge into a single vertex-colored mesh. */
export function tinted(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, variation = 0, seed = 1) {
  const base = new THREE.Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const hsl = base.getHSL({ h: 0, s: 0, l: 0 });
  for (let i = 0; i < count; i++) {
    const shade = new THREE.Color().setHSL(
      hsl.h,
      hsl.s,
      THREE.MathUtils.clamp(hsl.l + (noise(i * 0.37 + seed, seed) - 0.5) * variation, 0, 1),
    );
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function sphere(radius: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, detail = 10) {
  const geometry = new THREE.SphereGeometry(radius, detail, Math.max(6, detail - 2));
  geometry.scale(sx, sy, sz);
  geometry.translate(x, y, z);
  return geometry;
}

export function mesh(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) {
  const object = new THREE.Mesh(geometry, material);
  if (name) object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

/** One vertex-colored material serves every creature of a theme, including flat wings seen from both sides. */
export function creatureMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
}

/** A rounded tube running just inside the slab's edge; themes use it for metal trims and rope borders. */
export function frame(size: number, radius: number, y: number, tube: number) {
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

/**
 * A soft-edged ground disc or ring around the board. Vertex alpha fades the rim into the page so the
 * scene reads as a clearing or a shore rather than a hard-edged tile. An open ring starts at the first
 * radius instead of filling the centre, for surfaces the slab would hide anyway.
 */
export function ground(
  radii: number[],
  segments: number,
  vertex: (radius: number, angle: number) => { y: number; color: [number, number, number, number] },
  open = false,
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  if (!open) {
    const center = vertex(0, 0);
    positions.push(0, center.y, 0);
    colors.push(...center.color);
  }
  const first = open ? 0 : 1;
  for (let ring = 0; ring < radii.length; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * TAU;
      const point = vertex(radii[ring], angle);
      positions.push(Math.cos(angle) * radii[ring], point.y, Math.sin(angle) * radii[ring]);
      colors.push(...point.color);
    }
  }
  const index = (ring: number, segment: number) => first + ring * segments + (segment % segments);
  if (!open)
    for (let segment = 0; segment < segments; segment++) indices.push(0, index(0, segment + 1), index(0, segment));
  for (let ring = 0; ring < radii.length - 1; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = index(ring, segment);
      const b = index(ring, segment + 1);
      const c = index(ring + 1, segment);
      const d = index(ring + 1, segment + 1);
      indices.push(a, d, c, a, b, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Smoothstep in plain TypeScript; animation code mirrors the shader helpers. */
export const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if (object instanceof THREE.Light) object.dispose();
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (!(
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ))
      return;
    geometries.add(object.geometry);
    const owned = Array.isArray(object.material) ? [...object.material] : [object.material];
    if (object instanceof THREE.Mesh && object.customDepthMaterial) owned.push(object.customDepthMaterial);
    for (const material of owned) {
      materials.add(material);
      for (const key of ['map', 'alphaMap', 'emissiveMap'] as const) {
        const map = (material as unknown as Record<string, unknown>)[key];
        if (map instanceof THREE.Texture) textures.add(map);
      }
      if (material instanceof THREE.ShaderMaterial)
        for (const uniform of Object.values(material.uniforms))
          if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const map of textures) map.dispose();
  group.clear();
}
