import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Seat = 'black' | 'white';
const TAU = Math.PI * 2;

function addParts(group: THREE.Group, parts: THREE.BufferGeometry[], material: THREE.Material, name: string) {
  const compatible = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(compatible, false)!;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function material(color: number) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.46, metalness: 0, clearcoat: 0.22 });
}

/** A continuous widening shell whorl, ending in a real open mouth with a rolled lip. */
export function createShellStone(seat: Seat) {
  const dark = seat === 'black';
  const group = new THREE.Group();
  group.userData.motif = 'spiral-shell';
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const along = 140;
  const around = 16;
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const angle = -TAU * 1.72 * (1 - t);
    const coil = 0.014 + 0.235 * Math.pow(t, 1.12);
    const tube = 0.014 + 0.135 * Math.pow(t, 1.12);
    const rib = 1 + Math.pow(t, 0.4) * 0.055 * Math.cos(t * TAU * 28);
    const height = 0.24 * (1 - t) + 0.025;
    for (let j = 0; j <= around; j++) {
      const theta = (j / around) * TAU;
      const radial = coil + Math.cos(theta) * tube * rib;
      positions.push(Math.cos(angle) * radial, height + Math.sin(theta) * tube * 0.64, Math.sin(angle) * radial);
      uv.push(t, j / around);
      if (i < along && j < around) {
        const a = i * (around + 1) + j;
        const b = a + around + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const core = new THREE.SphereGeometry(0.025, 12, 8).scale(1, 0.7, 1).translate(0, 0.259, 0);
  addParts(group, [shell, core], material(dark ? 0x242a36 : 0xf6e8d8), 'shell-whorl');
  const lip = new THREE.TorusGeometry(0.147, 0.008, 6, 32).scale(1, 0.64, 1).translate(0.249, 0.025, 0.003);
  addParts(group, [lip], material(dark ? 0x76747d : 0xcebaa0), 'shell-lip');
  const mouth = new THREE.SphereGeometry(1, 16, 10).scale(0.138, 0.086, 0.045).translate(0.249, 0.025, -0.036);
  addParts(group, [mouth], material(dark ? 0x171923 : 0x8f6a61), 'shell-mouth');
  return group;
}
