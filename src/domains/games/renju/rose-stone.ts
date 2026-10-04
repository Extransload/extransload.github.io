import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rosePetal(
  inner: number,
  outer: number,
  height: number,
  rise: number,
  halfAngle: number,
  direction: number,
  curl: number,
) {
  const radialSteps = 12;
  const acrossSteps = 12;
  const points: number[] = [];
  const tones: number[] = [];
  const triangles: number[] = [];
  for (let row = 0; row <= radialSteps; row++) {
    const radial = row / radialSteps;
    const spread = halfAngle * Math.sqrt(Math.sin(Math.PI * (0.1 + 0.8 * radial)));
    for (let column = 0; column <= acrossSteps; column++) {
      const across = (column / acrossSteps) * 2 - 1;
      const angle = direction + spread * across + curl * (1 - radial);
      const radius =
        (inner + (outer - inner) * radial ** 2.15) * (1 - 0.1 * across * across) +
        0.012 * Math.sin(3 * across + direction * 4) * radial ** 2;
      const lift = rise * Math.sin(radial * Math.PI * 0.7);
      const edge = 0.06 * across * across * Math.sin(radial * Math.PI);
      const lip = 0.09 * radial ** 6 * (0.85 + 0.15 * Math.cos(across * Math.PI));
      points.push(Math.cos(angle) * radius, height + lift + edge + lip, Math.sin(angle) * radius);
      const tone = 0.35 + radial * 0.45 + Math.abs(across) * 0.15;
      tones.push(tone, tone, tone);
    }
  }
  for (let row = 0; row < radialSteps; row++) {
    for (let column = 0; column < acrossSteps; column++) {
      const a = row * (acrossSteps + 1) + column;
      const b = a + acrossSteps + 1;
      const c = a + 1;
      const d = b + 1;
      triangles.push(a, c, b, b, c, d);
    }
  }
  const petal = new THREE.BufferGeometry();
  petal.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  petal.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
  petal.setIndex(triangles);
  petal.computeVertexNormals();
  return petal.toNonIndexed();
}

export function roseStoneGeometry() {
  const layers: THREE.BufferGeometry[] = [];
  for (const [count, inner, outer, height, rise, spread, turn] of [
    [8, 0.16, 0.4, 0.025, 0.17, 0.72, 0.15],
    [7, 0.11, 0.31, 0.1, 0.17, 0.78, -0.18],
    [6, 0.06, 0.23, 0.18, 0.15, 0.86, 0.27],
    [5, 0.02, 0.15, 0.26, 0.13, 0.93, -0.11],
    [4, 0.006, 0.09, 0.29, 0.09, 1.03, 0.12],
  ]) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + turn;
      layers.push(rosePetal(inner, outer + 0.008 * Math.sin(i * 2.4), height, rise, spread, angle, 0.23));
    }
  }
  const spiralPoints = Array.from({ length: 65 }, (_, index) => {
    const t = index / 64;
    const angle = t * Math.PI * 4.2;
    const radius = 0.015 + t * 0.115;
    return new THREE.Vector3(Math.cos(angle) * radius, 0.39 - t * 0.05, Math.sin(angle) * radius);
  });
  const center = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPoints), 96, 0.014, 7, false).toNonIndexed();
  center.deleteAttribute('uv');
  center.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(center.getAttribute('position').count * 3).fill(0.36), 3),
  );
  layers.push(center);
  return mergeGeometries(layers)!;
}
