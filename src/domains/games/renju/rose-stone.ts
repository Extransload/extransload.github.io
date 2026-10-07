import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The plain, closed pebble remains the C-tier black/white stone. */
export function classicStoneGeometry() {
  const geometry = new THREE.SphereGeometry(0.38, 48, 32);
  geometry.scale(1, 0.46, 1);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const tones: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    uv.setXY(i, 0.5 + x / 0.76, 0.5 + z / 0.76);
    const glaze = 0.72 + (0.28 * Math.max(0, y)) / (0.38 * 0.46);
    tones.push(glaze, glaze, glaze);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
  geometry.computeBoundingBox();
  return geometry;
}

type PetalLayer = {
  count: number;
  radius: number;
  root: number;
  bottom: number;
  lip: number;
  width: number;
  offset: number;
  curl: number;
};

function sculptPetal(layer: PetalLayer, angle: number) {
  const across = 10;
  const along = 7;
  const positions: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const faceCount = (across + 1) * (along + 1);
  for (let face = 0; face < 2; face++) {
    for (let row = 0; row <= along; row++) {
      const v = row / along;
      for (let column = 0; column <= across; column++) {
        const u = (column / across) * 2 - 1;
        const spread = 0.22 + 0.78 * Math.sin((v * Math.PI) / 2);
        const theta = angle + u * layer.width * spread + 0.18 * (v - 0.5);
        // The petal widens from its narrow root, then folds back at the soft outer lip.
        const radius =
          (layer.root + (layer.radius - layer.root) * Math.sin((v * Math.PI) / 2)) * (1 - 0.22 * u * u * v) -
          layer.curl * Math.pow(v, 8) * (1 - u * u);
        const y =
          layer.bottom +
          (layer.lip - layer.bottom) * v -
          0.047 * Math.sin(v * Math.PI) +
          layer.curl * 1.9 * Math.pow(v, 5) * (1 - u * u) +
          0.025 * u * u * v +
          0.028 * u * Math.sin((v * Math.PI) / 2) +
          (face === 0 ? 0.005 : -0.005);
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        positions.push(x, y, z);
        uv.push(0.5 + x / 0.8, 0.5 + z / 0.8);
        const tone = (0.53 + 0.36 * v + 0.08 * u * u * v) * (face === 0 ? 1 : 0.78);
        colors.push(tone, tone, tone);
      }
    }
  }
  for (let row = 0; row < along; row++) {
    for (let column = 0; column < across; column++) {
      const a = row * (across + 1) + column;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
      indices.push(a + faceCount, c + faceCount, b + faceCount, b + faceCount, c + faceCount, d + faceCount);
    }
  }
  // Join the two faces, so every petal has a real edge rather than a double-sided paper plane.
  const perimeter: number[] = [];
  for (let column = 0; column <= across; column++) perimeter.push(column);
  for (let row = 1; row <= along; row++) perimeter.push(row * (across + 1) + across);
  for (let column = across - 1; column >= 0; column--) perimeter.push(along * (across + 1) + column);
  for (let row = along - 1; row > 0; row--) perimeter.push(row * (across + 1));
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, a + faceCount, b, b, a + faceCount, b + faceCount);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Fifteen overlapping, cupped petals form a real blossom; its gaps are geometry, not a stamp. */
export function roseStoneGeometry() {
  const layers: PetalLayer[] = [
    { count: 5, radius: 0.397, root: 0.074, bottom: -0.11, lip: 0.022, width: 0.82, offset: 0, curl: 0.024 },
    { count: 5, radius: 0.283, root: 0.047, bottom: -0.075, lip: 0.11, width: 0.88, offset: Math.PI / 5, curl: 0.024 },
    { count: 3, radius: 0.171, root: 0.023, bottom: -0.025, lip: 0.19, width: 1.16, offset: 0.25, curl: 0.021 },
    { count: 2, radius: 0.085, root: 0.012, bottom: 0.045, lip: 0.235, width: 1.55, offset: 0.9, curl: 0.012 },
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      parts.push(sculptPetal(layer, layer.offset + (i / layer.count) * Math.PI * 2));
    }
  }
  // A small concealed calyx gives the flower one stable contact point on the board.
  const base = new THREE.SphereGeometry(0.175, 20, 10);
  base.scale(1, 0.23, 1);
  base.translate(0, -0.114, 0);
  base.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(base.getAttribute('position').count * 3).fill(0.5), 3),
  );
  parts.push(base);
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Kept for material callers; the blossom carries no printed or engraved symbol. */
export function roseStoneStamp() {
  const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  const bumpMap = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  bumpMap.needsUpdate = true;
  return { map, bumpMap, bumpScale: 0 };
}
