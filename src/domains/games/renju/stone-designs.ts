import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { StoneStyle } from './appearance';

type Seat = 'black' | 'white';
type CharacterStone = Exclude<StoneStyle, 'classic' | 'jade' | 'rose'>;

function sphere(radius = 0.4, width = 28, height = 20) {
  return new THREE.SphereGeometry(radius, width, height);
}

function starBody() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const radius = i % 2 ? 0.23 : 0.42;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.035,
    bevelSegments: 3,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.1, 0);
  return geometry;
}

function dragonEgg() {
  return new THREE.LatheGeometry(
    [
      [0, -0.27],
      [0.21, -0.24],
      [0.35, -0.12],
      [0.39, 0.04],
      [0.32, 0.21],
      [0.19, 0.34],
      [0, 0.39],
    ].map(([radius, height]) => new THREE.Vector2(radius, height)),
    32,
  );
}

export const CHARACTER_STONE_BODIES: Record<CharacterStone, THREE.BufferGeometry> = {
  chick: sphere().scale(0.98, 0.83, 0.9),
  puppy: new RoundedBoxGeometry(0.72, 0.58, 0.66, 4, 0.18),
  kitten: sphere().scale(0.94, 0.83, 0.9),
  bunny: sphere().scale(0.87, 1.02, 0.86),
  fox: new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.85, 0.88),
  panda: sphere().scale(0.98, 0.89, 0.92),
  frog: sphere().scale(1.04, 0.63, 0.92),
  owl: new THREE.DodecahedronGeometry(0.4, 2).scale(0.92, 0.99, 0.85),
  star: starBody(),
  dragon: dragonEgg(),
};

export function createStoneDetails(style: StoneStyle, seat: Seat, body: THREE.Material) {
  if (style === 'classic' || style === 'jade' || style === 'rose') return null;
  const group = new THREE.Group();
  group.name = 'stone-details';
  const ink = new THREE.MeshStandardMaterial({ color: 0x27333c, roughness: 0.58 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff0d5, roughness: 0.66 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xf0a2a5, roughness: 0.73 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf9bd55, roughness: 0.42, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: seat === 'black' ? 0x543042 : 0x634254, roughness: 0.64 });
  const gem = new THREE.MeshStandardMaterial({
    color: seat === 'black' ? 0x72e5d4 : 0x79abd8,
    metalness: 0.32,
    roughness: 0.2,
    emissive: seat === 'black' ? 0x0a4439 : 0x183a58,
    emissiveIntensity: 0.32,
  });
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const eyes = (width: number, y: number, z: number, radius = 0.052) => {
    for (const side of [-1, 1]) add(sphere(radius, 14, 10), ink, side * width, y, z, [1, 1, 0.56]);
  };
  const smile = (y: number, z: number, radius = 0.11) =>
    add(new THREE.TorusGeometry(radius, 0.014, 5, 18, Math.PI), ink, 0, y, z, [1, 0.72, 1], [0, 0, Math.PI]);

  switch (style) {
    case 'chick':
      eyes(0.16, 0.07, 0.355, 0.057);
      add(new THREE.ConeGeometry(0.105, 0.2, 4), gold, 0, -0.045, 0.395, [1, 1, 1], [Math.PI / 2, Math.PI / 4, 0]);
      for (const side of [-1, 1]) {
        add(sphere(0.14), body, side * 0.39, -0.09, 0.02, [0.57, 0.78, 0.63]);
        add(sphere(0.075), blush, side * 0.265, -0.06, 0.31, [1.2, 0.65, 0.45]);
      }
      add(new THREE.ConeGeometry(0.08, 0.22, 6), body, 0, 0.39, 0, [1, 1, 1], [0, 0, -0.18]);
      break;
    case 'puppy':
      for (const side of [-1, 1])
        add(sphere(0.19), dark, side * 0.37, 0.05, -0.02, [0.7, 1.44, 0.62], [0, 0, side * 0.26]);
      add(sphere(0.19), cream, 0, -0.13, 0.34, [1.2, 0.75, 0.73]);
      eyes(0.16, 0.07, 0.34);
      add(sphere(0.072), ink, 0, -0.09, 0.49, [1.2, 0.75, 0.6]);
      smile(-0.19, 0.47, 0.075);
      break;
    case 'kitten':
      for (const side of [-1, 1]) {
        add(new THREE.ConeGeometry(0.17, 0.31, 4), body, side * 0.28, 0.32, -0.02, [1, 1, 0.72], [0, 0, -side * 0.18]);
        add(sphere(0.16), cream, side * 0.16, -0.13, 0.33, [1, 0.54, 0.55]);
        add(
          new THREE.CylinderGeometry(0.007, 0.007, 0.26, 5),
          cream,
          side * 0.29,
          -0.105,
          0.38,
          [1, 1, 1],
          [0, 0, side * 1.25],
        );
      }
      eyes(0.16, 0.07, 0.35, 0.06);
      add(sphere(0.055), blush, 0, -0.09, 0.43, [1.2, 0.7, 0.52]);
      break;
    case 'bunny':
      for (const side of [-1, 1]) {
        add(sphere(0.12), body, side * 0.2, 0.43, -0.05, [0.79, 2.35, 0.54], [0, 0, -side * 0.12]);
        add(sphere(0.075), blush, side * 0.2, 0.45, 0.025, [0.66, 2.25, 0.24], [0, 0, -side * 0.12]);
        add(sphere(0.065), blush, side * 0.265, -0.06, 0.3, [1.08, 0.62, 0.45]);
      }
      eyes(0.14, 0.07, 0.33);
      add(sphere(0.052), blush, 0, -0.09, 0.36, [1.1, 0.72, 0.6]);
      smile(-0.16, 0.35, 0.07);
      break;
    case 'fox':
      for (const side of [-1, 1]) {
        add(
          new THREE.ConeGeometry(0.18, 0.38, 3),
          body,
          side * 0.32,
          0.32,
          -0.03,
          [1, 1, 0.8],
          [0, Math.PI / 2, -side * 0.17],
        );
        add(sphere(0.24), cream, side * 0.18, -0.16, 0.32, [1, 0.55, 0.55]);
      }
      eyes(0.16, 0.07, 0.34, 0.057);
      add(sphere(0.057), ink, 0, -0.11, 0.46, [1.12, 0.74, 0.68]);
      break;
    case 'panda': {
      const patch = seat === 'black' ? cream : ink;
      const pupil = seat === 'black' ? ink : cream;
      for (const side of [-1, 1]) {
        add(sphere(0.16), ink, side * 0.29, 0.3, -0.08);
        add(sphere(0.14), patch, side * 0.16, 0.07, 0.33, [0.85, 1.16, 0.46], [0, 0, -side * 0.16]);
        add(sphere(0.046), pupil, side * 0.16, 0.075, 0.39, [1, 1, 0.52]);
      }
      add(sphere(0.16), cream, 0, -0.17, 0.33, [1.25, 0.68, 0.52]);
      add(sphere(0.056), ink, 0, -0.11, 0.43, [1, 0.66, 0.6]);
      break;
    }
    case 'frog':
      for (const side of [-1, 1]) {
        add(sphere(0.16), body, side * 0.235, 0.26, 0.045, [1, 1.12, 0.82]);
        add(sphere(0.067), ink, side * 0.235, 0.29, 0.19, [1, 1, 0.55]);
        add(sphere(0.064), blush, side * 0.28, -0.07, 0.32, [1, 0.57, 0.38]);
      }
      smile(-0.07, 0.36, 0.19);
      break;
    case 'owl':
      for (const side of [-1, 1]) {
        add(new THREE.ConeGeometry(0.13, 0.27, 5), body, side * 0.28, 0.38, -0.02, [1, 1, 0.75], [0, 0, -side * 0.2]);
        add(sphere(0.165), cream, side * 0.17, 0.08, 0.3, [1, 1.05, 0.55]);
        add(sphere(0.072), ink, side * 0.17, 0.08, 0.39, [1, 1, 0.48]);
        add(sphere(0.17), body, side * 0.35, -0.12, -0.03, [0.55, 0.9, 0.5]);
      }
      add(new THREE.ConeGeometry(0.09, 0.2, 4), gold, 0, -0.1, 0.38, [1, 1, 1], [Math.PI / 2, Math.PI / 4, 0]);
      break;
    case 'star':
      add(new THREE.OctahedronGeometry(0.16, 0), gem, 0, 0.27, 0, [1, 0.53, 1]);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        add(sphere(0.045, 12, 8), gold, Math.sin(angle) * 0.31, 0.17, Math.cos(angle) * 0.31, [1, 0.6, 1]);
      }
      break;
    case 'dragon':
      add(new THREE.OctahedronGeometry(0.145, 0), gem, 0, 0.045, 0.35, [0.94, 1.28, 0.43]);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        add(
          new THREE.ConeGeometry(0.095, 0.22, 5),
          gold,
          Math.sin(angle) * 0.26,
          0.25,
          Math.cos(angle) * 0.26,
          [1, 1, 0.75],
          [0, 0, -Math.sin(angle) * 0.3],
        );
      }
      for (const side of [-1, 1]) add(sphere(0.05), ink, side * 0.18, 0.09, 0.3, [1, 1, 0.42]);
      break;
  }
  return group;
}
