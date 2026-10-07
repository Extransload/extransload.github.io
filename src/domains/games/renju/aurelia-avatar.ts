import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VroidGestureStyle } from './avatar-gestures';

export const AURELIA_LOOK = {
  source: '/models/omokmaru/luna.glb',
  gesture: 'luna' as VroidGestureStyle,
  hair: 0xf3ce63,
  dress: 0xfff0dc,
  shoes: 0xc38c87,
};

export function tailorAureliaBodice(mesh: THREE.Mesh) {
  const geometry = mesh.geometry.clone();
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!index) return;
  const retained: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    if (Math.max(position.getY(a), position.getY(b), position.getY(c)) < 1.045) continue;
    retained.push(a, b, c);
  }
  geometry.setIndex(retained);
  mesh.geometry = geometry;
}

const cloth = (color: number) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    sheen: 0.55,
    sheenColor: new THREE.Color(0xfff3e3),
    side: THREE.DoubleSide,
  });
const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
};
function line(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  closed = false,
) {
  return add(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, closed),
      Math.max(20, points.length * 2),
      radius,
      5,
      closed,
    ),
    material,
  );
}

// Merge only authored static decorations. Hair and skirt retain separate
// transform boundaries, and the original skinned body is never merged.
function mergeStatic(parent: THREE.Group) {
  parent.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    const items = groups.get(child.material) ?? [];
    items.push(child);
    groups.set(child.material, items);
  }
  for (const [material, children] of groups) {
    if (children.length < 2) continue;
    const geometries = children.map((child) => {
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      for (const name of Object.keys(geometry.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      // Geometry made for embroidery has no texture; a consistent uv attribute
      // lets tubes, petals and fabric surfaces merge without extra draw calls.
      if (!geometry.getAttribute('uv'))
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2),
        );
      return geometry.applyMatrix4(child.matrix);
    });
    const combined = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!combined) continue;
    children.forEach((child) => {
      child.removeFromParent();
      child.geometry.dispose();
    });
    add(parent, combined, material);
  }
}

function bow(parent: THREE.Group, position: THREE.Vector3, size: number, fabric: THREE.Material, gold: THREE.Material) {
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(side * size * 0.55, size * 0.75, side * size * 1.35, size * 0.62, side * size, -size * 0.12);
    shape.bezierCurveTo(side * size * 0.64, -size * 0.47, side * size * 0.18, -size * 0.1, 0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 12);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++)
      vertices.setZ(i, -Math.sin((Math.abs(vertices.getX(i)) / size) * Math.PI) * size * 0.35);
    geometry.computeVertexNormals();
    add(parent, geometry, fabric).position.copy(position);
  }
  const center = add(parent, new THREE.SphereGeometry(size * 0.19, 12, 8), gold);
  center.position.copy(position);
  center.scale.set(0.8, 1, 0.6);
}

export class AureliaWardrobe {
  private readonly tails: THREE.Group[] = [];
  private readonly skirt = new THREE.Group();
  private readonly sash = new THREE.Group();

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const head = model.getObjectByName('J_Bip_C_Head')!;
    const hips = model.getObjectByName('J_Bip_C_Hips')!;
    const rose = cloth(0xb96f80);
    const roseLight = cloth(0xdba0aa);
    const ivory = cloth(0xfff2dc);
    const gold = new THREE.MeshStandardMaterial({ color: 0xb69a59, roughness: 0.5, metalness: 0.4 });
    const thread = new THREE.MeshStandardMaterial({ color: 0xc5a762, roughness: 0.75, metalness: 0.08 });
    const green = new THREE.MeshStandardMaterial({ color: 0x7d957e, roughness: 0.85 });

    // Victoria Rubin has one left ponytail: Hair001baked_42..59. Extract its
    // textured strands into head-local space, then mirror the actual hair mesh
    // for a matched pair. Fringe/scalp, face, eyes and all shared source data
    // stay intact. The original ribbon parts are replaced with sewn rose bows.
    const sourceStrands: THREE.BufferGeometry[] = [];
    let hairMaterial: THREE.Material | undefined;
    const toHead = head.matrixWorld.clone().invert();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const match = /^Hair001baked_(\d+)$/.exec(object.name);
      if (!match || Number(match[1]) < 42) return;
      object.visible = false;
      const material = object.material;
      if (Array.isArray(material) || !material.name.endsWith('HAIR_01')) return;
      hairMaterial ??= material;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      for (const name of Object.keys(geometry.attributes))
        if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      geometry.morphAttributes = {};
      geometry.applyMatrix4(toHead.clone().multiply(object.matrixWorld));
      // Restyle the side pony into a longer, clearly tied shoulder-length tail.
      geometry.translate(0.09, -0.19, -0.006);
      geometry.scale(1.07, 1.5, 1);
      sourceStrands.push(geometry);
    });
    if (sourceStrands.length && hairMaterial) {
      const geometry = mergeGeometries(sourceStrands)!;
      sourceStrands.forEach((part) => part.dispose());
      for (const side of [-1, 1]) {
        const tail = new THREE.Group();
        tail.name = `aurelia-twin-tail-${side < 0 ? 'left' : 'right'}`;
        tail.position.set(side * 0.137, 0.176, 0.012);
        tail.scale.x = side < 0 ? 1 : -1;
        head.add(tail);
        add(tail, geometry, hairMaterial);
        this.tails.push(tail);
        const tie = new THREE.Group();
        tie.position.set(side * 0.137, 0.176, -0.025);
        head.add(tie);
        bow(tie, new THREE.Vector3(0, 0, 0), 0.045, rose, gold);
        mergeStatic(tie);
      }
    }

    this.skirt.name = 'aurelia-embroidered-dress';
    hips.add(this.skirt);
    const hipY = hips.position.y;
    // All dress layers share this continuous bell profile. Front is model -Z.
    // The wide hem covers the moving legs while keeping both shoes visible.
    const surface = (t: number, angle: number, offset = 0, apron = false) => {
      const radius = 0.148 + 0.29 * Math.pow(t, 0.77);
      const folds = Math.sin(angle * 18 + 0.22) * 0.013 * Math.sin(t * Math.PI * 0.6);
      const r = radius + folds + offset;
      const scallop = apron ? Math.cos(angle * 8) * 0.009 * t ** 8 : Math.cos(angle * 18) * 0.008 * t ** 9;
      return new THREE.Vector3(
        Math.sin(angle) * r,
        1.064 - t * (apron ? 0.886 : 0.95) - hipY + scallop,
        -Math.cos(angle) * r * 0.82,
      );
    };
    const panel = (from: number, to: number, material: THREE.Material, offset = 0, apron = false, maxT = 1) => {
      const positions: number[] = [],
        indices: number[] = [],
        uv: number[] = [];
      const rows = 30,
        columns = apron ? 40 : 96;
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= columns; c++) {
          const t = (r / rows) * maxT;
          const angle = from + ((to - from) * c) / columns;
          positions.push(...surface(t, angle, offset, apron).toArray());
          uv.push(c / columns, r / rows);
          if (r < rows && c < columns) {
            const i = r * (columns + 1) + c;
            indices.push(i, i + columns + 1, i + 1, i + 1, i + columns + 1, i + columns + 2);
          }
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      add(this.skirt, geometry, material);
    };
    panel(-Math.PI, Math.PI, rose);
    panel(-0.69, 0.69, ivory, 0.014, true);
    // A second gathered rose layer finishes below the waist, leaving the
    // embroidered ivory apron visible from top to bottom.
    panel(0.76, Math.PI * 2 - 0.76, roseLight, 0.022, false, 0.32);
    const ring = (t: number, offset: number, material: THREE.Material, width: number) =>
      line(
        this.skirt,
        Array.from({ length: 97 }, (_, i) => surface(t, (i / 96) * Math.PI * 2, offset)),
        width,
        material,
        true,
      );
    ring(0.967, 0.005, ivory, 0.008);
    ring(0.935, 0.009, gold, 0.003);
    ring(0.022, 0.015, gold, 0.005);
    for (const side of [-1, 1])
      line(
        this.skirt,
        Array.from({ length: 31 }, (_, i) => surface(i / 30, side * 0.69, 0.018, true)),
        0.0034,
        gold,
      );
    line(
      this.skirt,
      Array.from({ length: 41 }, (_, i) => surface(1, -0.69 + (i / 40) * 1.38, 0.018, true)),
      0.004,
      gold,
    );

    // Embroidery follows the draped apron rather than floating in front of it.
    const flower = (t: number, angle: number, size: number) => {
      const center = surface(t, angle, 0.024, true);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const petal = add(this.skirt, new THREE.SphereGeometry(size, 9, 6), roseLight);
        petal.scale.set(0.63, 1, 0.18);
        petal.rotation.z = -a;
        petal.position.copy(center).add(new THREE.Vector3(Math.sin(a) * size * 0.8, Math.cos(a) * size * 0.8, -0.002));
      }
      const bead = add(this.skirt, new THREE.SphereGeometry(size * 0.25, 8, 6), gold);
      bead.position.copy(center).add(new THREE.Vector3(0, 0, -0.006));
    };
    for (const side of [-1, 1]) {
      const vine = Array.from({ length: 27 }, (_, i) => {
        const t = 0.32 + (i / 26) * 0.57;
        return surface(t, side * (0.34 + Math.sin(t * 10) * 0.085), 0.027, true);
      });
      line(this.skirt, vine, 0.0025, thread);
      for (let i = 0; i < 5; i++) {
        const t = 0.39 + i * 0.105,
          angle = side * (0.34 + Math.sin(t * 10) * 0.085);
        const p = surface(t, angle, 0.028, true);
        const leaf = add(this.skirt, new THREE.SphereGeometry(0.016, 9, 6), green);
        leaf.scale.set(0.36, 1, 0.13);
        leaf.rotation.z = side * (i % 2 ? -0.75 : 0.75);
        leaf.position.copy(p);
        if (i % 2 === 0) flower(t - 0.025, angle + side * 0.07, 0.018);
      }
    }
    // Small repeating gold stitches articulate the lower hem at board scale.
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      line(
        this.skirt,
        [surface(0.87, angle - 0.025, 0.013), surface(0.898, angle, 0.015), surface(0.87, angle + 0.025, 0.013)],
        0.002,
        thread,
      );
    }
    bow(this.skirt, new THREE.Vector3(0, 0.047, -0.14), 0.066, roseLight, gold);
    mergeStatic(this.skirt);

    // Back sash follows the hips but has its own restrained cloth movement.
    hips.add(this.sash);
    this.sash.position.set(0, 0.04, 0.15);
    bow(this.sash, new THREE.Vector3(), 0.105, roseLight, gold);
    for (const side of [-1, 1]) {
      const points = [
        new THREE.Vector3(side * 0.018, 0, 0),
        new THREE.Vector3(side * 0.1, -0.16, 0.08),
        new THREE.Vector3(side * 0.12, -0.33, 0.15),
      ];
      line(this.sash, points, 0.016, ivory);
    }
    mergeStatic(this.sash);
    const comb = new THREE.Group();
    head.add(comb);
    for (let i = 0; i < 5; i++) {
      const a = -0.55 + i * 0.275;
      const p = new THREE.Vector3(Math.sin(a) * 0.097, 0.19 + Math.cos(a) * 0.028, -0.082);
      const pearl = add(comb, new THREE.SphereGeometry(i === 2 ? 0.012 : 0.008, 10, 7), ivory);
      pearl.position.copy(p);
    }
    line(
      comb,
      [
        new THREE.Vector3(-0.055, 0.213, -0.085),
        new THREE.Vector3(0, 0.217, -0.085),
        new THREE.Vector3(0.055, 0.213, -0.085),
      ],
      0.0025,
      gold,
    );
    mergeStatic(comb);
  }

  update(time: number) {
    for (let i = 0; i < this.tails.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.tails[i].rotation.z = side * (0.035 + Math.sin(time * 1.8 + i * 0.65) * 0.034);
      this.tails[i].rotation.x = Math.sin(time * 1.45 + i * 0.8) * 0.035;
    }
    this.skirt.rotation.z = Math.sin(time * 1.2) * 0.008;
    this.sash.rotation.x = Math.sin(time * 1.7 + 0.5) * 0.07;
  }
}
