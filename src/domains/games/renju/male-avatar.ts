import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VroidGestureStyle } from './avatar-gestures';

export const MALE_AVATARS = ['sylvie', 'apron', 'serin', 'astra'] as const;
export type MaleAvatarStyle = (typeof MALE_AVATARS)[number];
export const isMaleAvatar = (style: string): style is MaleAvatarStyle =>
  (MALE_AVATARS as readonly string[]).includes(style);
export const MALE_AVATAR_LOOKS: Record<
  MaleAvatarStyle,
  {
    source: string;
    gesture: VroidGestureStyle;
    hair: number;
    dress: number;
    pants: number;
    shoes: number;
  }
> = {
  sylvie: {
    source: '/models/omokmaru/male-casual.glb',
    gesture: 'apron',
    hair: 0x876342,
    dress: 0x728572,
    pants: 0x3b493c,
    shoes: 0x624d3d,
  },
  apron: {
    source: '/models/omokmaru/male-tailored.glb',
    gesture: 'luna',
    hair: 0xd3ac63,
    dress: 0xd4cbbb,
    pants: 0x403947,
    shoes: 0x483e38,
  },
  serin: {
    source: '/models/omokmaru/male-tailored.glb',
    gesture: 'serin',
    hair: 0x293745,
    dress: 0x324357,
    pants: 0x293543,
    shoes: 0x242d38,
  },
  astra: {
    source: '/models/omokmaru/male-tailored.glb',
    gesture: 'rose',
    hair: 0xc6d0dd,
    dress: 0x24324b,
    pants: 0x202c43,
    shoes: 0x293246,
  },
};

// The tailored base wears short shirt sleeves. Remove those sleeve triangles
// beneath the new long coat sleeves, keeping the original torso and skin rig.
export function tailorMaleBase(style: MaleAvatarStyle, object: THREE.Mesh) {
  if (style === 'sylvie') return;
  const source = object.geometry;
  if (!source.index) return;
  const positions = source.getAttribute('position');
  const indices: number[] = [];
  for (let i = 0; i < source.index.count; i += 3) {
    const triangle = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)];
    if (triangle.every((index) => Math.abs(positions.getX(index)) > 0.185)) continue;
    indices.push(...triangle);
  }
  object.geometry = source.clone();
  object.geometry.setIndex(indices);
}

const point = (value: number[]) => new THREE.Vector3(...(value as [number, number, number]));
function surface(color: number) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.52),
    roughness: 0.76,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}
function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}
function seam(parent: THREE.Object3D, points: number[][], material: THREE.Material, radius = 0.003) {
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point)), 24, radius, 4), material);
}
function ribbon(parent: THREE.Object3D, points: number[][], width: number, material: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points.map(point));
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const p = curve.getPoint(i / 24),
      tangent = curve.getTangent(i / 24);
    const across = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize().multiplyScalar(width / 2);
    positions.push(...p.clone().add(across).toArray(), ...p.clone().sub(across).toArray());
    if (i < 24) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return add(parent, geometry, material);
}
function coat(parent: THREE.Object3D, sections: number[][], material: THREE.Material, opening = 0.45) {
  const positions: number[] = [],
    indices: number[] = [];
  const columns = 40;
  for (let row = 0; row < sections.length; row++) {
    const [y, width, depth] = sections[row];
    for (let column = 0; column <= columns; column++) {
      const angle = -Math.PI + opening + (column / columns) * (Math.PI * 2 - opening * 2);
      positions.push(Math.sin(angle) * width, y, Math.cos(angle) * depth);
      if (row < sections.length - 1 && column < columns) {
        const i = row * (columns + 1) + column;
        indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return add(parent, geometry, material);
}
function panel(parent: THREE.Object3D, points: number[][], material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const indices = [];
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return add(parent, geometry, material);
}
function star(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2,
      r = radius * (i % 2 ? 0.4 : 1);
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return add(
    parent,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 1,
      steps: 1,
    }).translate(x, y, z),
    material,
  );
}
function mergeStatic(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const batch = batches.get(object.material) ?? [];
    batch.push(object);
    batches.set(object.material, batch);
  });
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes))
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      return geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    meshes.forEach((mesh) => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    });
    add(root, merged, material);
  }
}

/** Real male base meshes keep their own trousers, hands, face and skinning. */
export class MaleAvatarWardrobe {
  private readonly cape: THREE.Group | undefined;
  constructor(
    readonly style: MaleAvatarStyle,
    model: THREE.Object3D,
    modelHeight: number,
  ) {
    const unit = modelHeight / 1.92;
    const attached: THREE.Group[] = [];
    const attach = (name: string) => {
      const root = new THREE.Group();
      root.name = `${style}-${name}-outfit`;
      root.scale.setScalar(unit);
      model.getObjectByName(name)?.add(root);
      attached.push(root);
      return root;
    };
    const head = attach('J_Bip_C_Head'),
      chest = attach('J_Bip_C_UpperChest'),
      spine = attach('J_Bip_C_Spine'),
      hips = attach('J_Bip_C_Hips');
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a873, roughness: 0.4, metalness: 0.52 });
    const leather = surface(0x64503e);
    if (style === 'sylvie') {
      const forest = surface(0x476659),
        lining = surface(0xc3bc9c);
      coat(
        chest,
        [
          [0.075, 0.105, 0.13],
          [0.015, 0.25, 0.185],
          [-0.23, 0.325, 0.245],
        ],
        forest,
        0.75,
      );
      for (const side of [-1, 1])
        seam(
          chest,
          [
            [side * 0.06, 0.07, -0.075],
            [side * 0.155, -0.05, -0.102],
            [side * 0.19, -0.18, -0.128],
          ],
          lining,
          0.007,
        );
      ribbon(
        spine,
        [
          [-0.16, 0.2, -0.14],
          [-0.04, 0.06, -0.18],
          [0.08, -0.08, -0.165],
          [0.2, -0.25, -0.12],
        ],
        0.034,
        leather,
      );
      const bag = add(hips, new THREE.BoxGeometry(0.135, 0.17, 0.073), leather);
      bag.position.set(0.21, -0.11, -0.115);
      bag.rotation.z = -0.12;
      const flap = add(hips, new THREE.BoxGeometry(0.143, 0.069, 0.014), forest);
      flap.position.set(0.213, -0.065, -0.161);
      flap.rotation.z = -0.12;
      const clasp = add(hips, new THREE.BoxGeometry(0.02, 0.026, 0.008), gold);
      clasp.position.set(0.216, -0.083, -0.17);
      for (let i = 0; i < 3; i++) {
        const leaf = add(chest, new THREE.SphereGeometry(1, 8, 6).scale(0.012, 0.036, 0.004), gold);
        leaf.position.set(-0.073 + i * 0.014, 0.018 + i * 0.015, -0.105);
        leaf.rotation.z = 0.5 - i * 0.45;
      }
      attached.forEach(mergeStatic);
      return;
    }
    const regal = style === 'astra',
      scholar = style === 'serin';
    const cloth = surface(regal ? 0x2f405f : scholar ? 0x33485e : 0xc6bba5);
    const contrast = surface(regal ? 0x657699 : scholar ? 0x7b929d : 0xeee0c6);
    // An open, fitted men's coat over the source waistcoat; trousers stay fully visible.
    coat(
      spine,
      [
        [0.24, 0.225, 0.114],
        [0.16, 0.198, 0.128],
        [0.02, 0.158, 0.122],
        [-0.16, 0.169, 0.123],
      ],
      cloth,
      0.48,
    );
    coat(
      hips,
      [
        [0.08, 0.174, 0.127],
        [-0.12, 0.18, 0.14],
        [regal ? -0.59 : scholar ? -0.25 : -0.38, regal ? 0.235 : 0.2, regal ? 0.195 : 0.15],
      ],
      cloth,
      regal ? 0.8 : 0.68,
    );
    for (const side of [-1, 1]) {
      panel(
        spine,
        [
          [side * 0.052, 0.25, -0.102],
          [side * 0.13, 0.155, -0.135],
          [side * 0.075, 0.02, -0.139],
          [side * 0.048, 0.11, -0.127],
        ],
        contrast,
      );
      seam(
        spine,
        [
          [side * 0.054, 0.247, -0.106],
          [side * 0.131, 0.155, -0.14],
          [side * 0.075, 0.02, -0.144],
        ],
        gold,
        0.003,
      );
      for (let i = 0; i < 3; i++)
        add(
          spine,
          new THREE.SphereGeometry(0.009, 8, 6).scale(1, 1, 0.35).translate(side * 0.09, -0.025 - i * 0.045, -0.139),
          gold,
        );
      // Upper sleeves and forearm sleeves follow separate bones, keeping elbows articulated.
      for (const [name, length, upper] of [
        [`J_Bip_${side < 0 ? 'L' : 'R'}_UpperArm`, 0.23, true],
        [`J_Bip_${side < 0 ? 'L' : 'R'}_LowerArm`, 0.247, false],
      ] as const) {
        const sleeve = attach(name);
        const geometry = new THREE.CylinderGeometry(upper ? 0.059 : 0.039, upper ? 0.087 : 0.062, length, 12, 3, false);
        geometry.rotateZ(side < 0 ? Math.PI / 2 : -Math.PI / 2);
        geometry.translate((side * length) / 2, 0, 0);
        add(sleeve, geometry, cloth);
        if (!upper) {
          const cuff = new THREE.CylinderGeometry(0.035, 0.036, 0.043, 12)
            .rotateZ(side < 0 ? Math.PI / 2 : -Math.PI / 2)
            .translate(side * (length - 0.02), 0, 0);
          add(sleeve, cuff, contrast);
        }
      }
    }
    if (scholar) {
      // Distinct compact hair, round glasses and a draped scarf for Noah.
      const steel = new THREE.MeshStandardMaterial({ color: 0x647b8b, roughness: 0.3, metalness: 0.6 });
      for (const side of [-1, 1])
        add(
          head,
          new THREE.TorusGeometry(0.032, 0.003, 5, 24).scale(1.15, 0.8, 1).translate(side * 0.044, 0.066, -0.109),
          steel,
        );
      seam(
        head,
        [
          [-0.011, 0.066, -0.11],
          [0, 0.074, -0.113],
          [0.011, 0.066, -0.11],
        ],
        steel,
        0.0025,
      );
      const scarf = add(chest, new THREE.TorusGeometry(0.085, 0.026, 7, 24), contrast);
      scarf.rotation.x = Math.PI / 2;
      scarf.position.set(0, 0.085, -0.02);
      ribbon(
        chest,
        [
          [0.05, 0.075, -0.13],
          [0.07, -0.035, -0.165],
          [0.049, -0.18, -0.168],
        ],
        0.065,
        contrast,
      );
    } else if (!regal) {
      seam(
        spine,
        [
          [-0.105, 0.12, -0.14],
          [-0.04, 0.075, -0.148],
          [0.045, 0.095, -0.146],
        ],
        gold,
        0.004,
      );
      add(spine, new THREE.SphereGeometry(0.021, 12, 8).scale(1, 1.2, 0.4).translate(-0.112, 0.126, -0.146), gold);
    } else {
      const silver = surface(0xb9c4d3);
      for (const side of [-1, 1]) {
        const pauldron = attach(`J_Bip_${side < 0 ? 'L' : 'R'}_UpperArm`);
        const shell = add(
          pauldron,
          new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.098, 0.055, 0.09),
          gold,
        );
        shell.position.set(side * 0.055, 0.025, 0);
        for (let i = 0; i < 5; i++)
          add(
            pauldron,
            new THREE.CylinderGeometry(0.003, 0.002, 0.045, 4).translate(side * (0.02 + i * 0.016), -0.01, -0.075),
            gold,
          );
      }
      const band = add(head, new THREE.TorusGeometry(0.102, 0.006, 5, 48), gold);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.192;
      star(head, 0, 0.217, -0.096, 0.025, gold);
      for (const side of [-1, 1])
        seam(
          head,
          [
            [side * 0.032, 0.191, -0.096],
            [side * 0.045, 0.217, -0.091],
            [side * 0.068, 0.191, -0.08],
          ],
          gold,
        );
      star(chest, 0, -0.015, -0.132, 0.04, gold);
      // One long split cape, independently swaying around its shoulder attachment.
      const cape = attach('J_Bip_C_UpperChest');
      this.cape = cape;
      coat(
        cape,
        [
          [0.04, 0.19, 0.14],
          [-0.18, 0.24, 0.175],
          [-0.5, 0.3, 0.21],
          [-0.88, 0.32, 0.25],
        ],
        cloth,
        1.32,
      );
      for (const side of [-1, 1])
        seam(
          cape,
          [
            [side * 0.182, 0.04, -0.035],
            [side * 0.235, -0.18, -0.044],
            [side * 0.296, -0.5, -0.052],
            [side * 0.314, -0.88, -0.062],
          ],
          gold,
          0.007,
        );
      for (let i = 0; i < 3; i++) star(cape, -0.08 + i * 0.08, -0.59 - Math.abs(i - 1) * 0.055, 0.238, 0.019, silver);
    }
    attached.forEach(mergeStatic);
  }
  update(elapsed: number) {
    if (this.cape) {
      this.cape.rotation.x = Math.sin(elapsed * 1.2) * 0.018;
      this.cape.rotation.z = Math.sin(elapsed * 0.9) * 0.022;
    }
  }
}
