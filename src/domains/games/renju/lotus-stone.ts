import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Seat = 'black' | 'white';
type Whorl = {
  count: number;
  root: number;
  radius: number;
  width: number;
  bottom: number;
  tip: number;
  offset: number;
};

function petal(whorl: Whorl, angle: number) {
  const across = 8;
  const along = 6;
  const faceSize = (across + 1) * (along + 1);
  const positions: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let face = 0; face < 2; face++) {
    for (let row = 0; row <= along; row++) {
      const v = row / along;
      // A very narrow closed tip avoids coincident vertices and zero-area end faces.
      const width = whorl.width * (0.018 + 0.982 * Math.pow(Math.sin(v * Math.PI), 0.75));
      for (let column = 0; column <= across; column++) {
        const u = (column / across) * 2 - 1;
        const radial = whorl.root + (whorl.radius - whorl.root) * v;
        const tangent = width * u;
        const x = Math.cos(angle) * radial - Math.sin(angle) * tangent;
        const z = Math.sin(angle) * radial + Math.cos(angle) * tangent;
        // The pointed petals open outwards, with lifted edges and a shallow central bowl.
        const y =
          whorl.bottom +
          (whorl.tip - whorl.bottom) * Math.pow(v, 1.35) -
          0.042 * Math.sin(v * Math.PI) +
          0.058 * u * u * Math.sin(v * Math.PI) +
          (face === 0 ? 0.006 : -0.006);
        positions.push(x, y, z);
        uv.push(column / across, v);
        const tone = (0.65 + v * 0.3 + u * u * 0.04) * (face === 0 ? 1 : 0.8);
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
      indices.push(a + faceSize, c + faceSize, b + faceSize, b + faceSize, c + faceSize, d + faceSize);
    }
  }
  const perimeter: number[] = [];
  for (let column = 0; column <= across; column++) perimeter.push(column);
  for (let row = 1; row <= along; row++) perimeter.push(row * (across + 1) + across);
  for (let column = across - 1; column >= 0; column--) perimeter.push(along * (across + 1) + column);
  for (let row = along - 1; row > 0; row--) perimeter.push(row * (across + 1));
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, a + faceSize, b, b, a + faceSize, b + faceSize);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]) {
  const compatible = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(compatible, false)!;
  for (const part of new Set([...parts, ...compatible])) part.dispose();
  return geometry;
}

function add(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A low lotus blossom, with pointed radial petals and a small perforated seedpod. */
export function createLotusStone(seat: Seat): THREE.Group {
  const dark = seat === 'black';
  const group = new THREE.Group();
  group.name = 'lotus-stone';
  const whorls: Whorl[] = [
    { count: 8, root: 0.035, radius: 0.395, width: 0.11, bottom: -0.1, tip: 0.075, offset: 0 },
    { count: 7, root: 0.032, radius: 0.287, width: 0.1, bottom: -0.06, tip: 0.17, offset: Math.PI / 8 },
    { count: 5, root: 0.035, radius: 0.183, width: 0.075, bottom: -0.015, tip: 0.245, offset: 0.12 },
  ];
  const petals = whorls.flatMap((whorl) =>
    Array.from({ length: whorl.count }, (_, i) => petal(whorl, whorl.offset + (i / whorl.count) * Math.PI * 2)),
  );
  add(
    group,
    merge(petals),
    new THREE.MeshPhysicalMaterial({
      color: dark ? 0x173632 : 0xeaf6f6,
      vertexColors: true,
      roughness: 0.6,
      clearcoat: 0.1,
      clearcoatRoughness: 0.6,
    }),
  );

  const seedPositions = [new THREE.Vector2(0, 0)];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    seedPositions.push(new THREE.Vector2(Math.cos(angle) * 0.043, Math.sin(angle) * 0.043));
  }
  const cap = new THREE.Shape();
  cap.absarc(0, 0, 0.076, 0, Math.PI * 2, false);
  for (const point of seedPositions) {
    const hole = new THREE.Path();
    hole.absarc(point.x, point.y, 0.009, 0, Math.PI * 2, true);
    cap.holes.push(hole);
  }
  const top = new THREE.ExtrudeGeometry(cap, { depth: 0.018, steps: 1, curveSegments: 6, bevelEnabled: false });
  top.rotateX(-Math.PI / 2);
  top.translate(0, 0.159, 0);
  const cone = new THREE.CylinderGeometry(0.075, 0.037, 0.12, 24);
  cone.translate(0, 0.1, 0);
  add(group, merge([top, cone]), new THREE.MeshStandardMaterial({ color: dark ? 0x496958 : 0xdce8d2, roughness: 0.8 }));

  const seeds = seedPositions.map((point) => {
    const seed = new THREE.SphereGeometry(0.0085, 8, 4);
    seed.scale(1, 0.6, 1);
    seed.translate(point.x, 0.165, -point.y);
    return seed;
  });
  add(group, merge(seeds), new THREE.MeshStandardMaterial({ color: dark ? 0x132e28 : 0x738d79, roughness: 0.9 }));
  return group;
}
