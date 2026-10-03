import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function blossomShape(petals: number, radius: number, wave: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 120; i++) {
    const angle = (i / 120) * Math.PI * 2;
    const distance = radius + wave * Math.cos(petals * angle);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function extrudedStone(shape: THREE.Shape, depth: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, depth / 2, 0);
  return geometry;
}

export function flowerStoneGeometry() {
  const petals = extrudedStone(blossomShape(6, 0.32, 0.075), 0.22);
  const center = new THREE.SphereGeometry(0.13, 18, 12).toNonIndexed();
  center.scale(1, 0.42, 1);
  center.translate(0, 0.18, 0);
  return mergeGeometries([petals, center])!;
}

export function roseStoneGeometry() {
  const petals = extrudedStone(blossomShape(5, 0.34, 0.055), 0.25);
  const spiralPoints = Array.from({ length: 43 }, (_, index) => {
    const progress = index / 42;
    const angle = progress * Math.PI * 4.5;
    const radius = 0.025 + progress * 0.19;
    return new THREE.Vector3(Math.cos(angle) * radius, 0.18 - progress * 0.025, Math.sin(angle) * radius);
  });
  const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPoints), 96, 0.018, 6, false).toNonIndexed();
  return mergeGeometries([petals, spiral])!;
}

export function heartStoneGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 100; i++) {
    const angle = (i / 100) * Math.PI * 2;
    const x = 0.024 * 16 * Math.sin(angle) ** 3;
    const y = 0.024 * (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle));
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return extrudedStone(shape, 0.23);
}
