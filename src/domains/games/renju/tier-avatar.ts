import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VroidGestureStyle } from './avatar-gestures';

export const TIER_AVATARS = ['sylvie', 'astra', 'seraphine'] as const;
export type TierAvatarStyle = (typeof TIER_AVATARS)[number];
export const TIER_AVATAR_LOOKS: Record<
  TierAvatarStyle,
  { source: string; gesture: VroidGestureStyle; hair: number; dress: number; shoes: number }
> = {
  sylvie: { source: '/models/omokmaru/apron.glb', gesture: 'apron', hair: 0x865038, dress: 0x759b82, shoes: 0x594936 },
  astra: { source: '/models/omokmaru/ribbon.glb', gesture: 'serin', hair: 0x393153, dress: 0x283556, shoes: 0x24283e },
  seraphine: { source: '/models/omokmaru/luna.glb', gesture: 'luna', hair: 0xe6dcea, dress: 0xb6b6d6, shoes: 0xddd0c1 },
};

export const isTierAvatar = (style: string): style is TierAvatarStyle =>
  (TIER_AVATARS as readonly string[]).includes(style);

// Keep the existing garment's skin weights, UVs and cloth rig. The premium
// silhouettes extend its skirt rather than hiding a complete body in a cone.
export function tailorTierGarment(style: TierAvatarStyle, object: THREE.Mesh, modelHeight: number) {
  if (style === 'sylvie') return;
  const geometry = object.geometry.clone();
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const scale = modelHeight / 1.737;
  const waist = 0.98 * scale;
  const originalHem = (style === 'astra' ? 0.663 : 0.676) * scale;
  const hem = (style === 'astra' ? 0.3 : 0.19) * scale;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    if (y >= waist || y < originalHem - 0.018 * scale) continue;
    const t = THREE.MathUtils.clamp((waist - y) / (waist - originalHem), 0, 1);
    const flare = 1 + t * (style === 'astra' ? 0.09 : 0.23);
    positions.setXYZ(i, positions.getX(i) * flare, waist - t * (waist - hem), positions.getZ(i) * flare);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  object.geometry = geometry;
}

const vector = (point: readonly number[]) => new THREE.Vector3(point[0], point[1], point[2]);
const cloth = (color: number, sheen = 0.5) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.64,
    metalness: 0,
    sheen,
    sheenColor: color,
    side: THREE.DoubleSide,
  });
const metal = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.68 });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.frustumCulled = false;
  parent.add(object);
  return object;
}

function piping(points: number[][], radius: number, material: THREE.Material, parent: THREE.Object3D, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector), closed);
  return mesh(
    new THREE.TubeGeometry(curve, Math.min(40, Math.max(16, points.length * 2)), radius, 4, closed),
    material,
    parent,
  );
}

const jewelMaterials = new Map<number, THREE.MeshPhysicalMaterial>();
function gem(parent: THREE.Object3D, color: number, size: number, position: number[]) {
  let material = jewelMaterials.get(color);
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.15,
      metalness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
    jewelMaterials.set(color, material);
  }
  const object = mesh(new THREE.OctahedronGeometry(size), material, parent);
  object.position.copy(vector(position));
  object.scale.set(0.7, 1.25, 0.45);
  return object;
}

function leaf(parent: THREE.Object3D, material: THREE.Material, length: number, width: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width, length * 0.35, width * 0.72, length * 0.7, 0, length);
  shape.bezierCurveTo(-width * 0.65, length * 0.7, -width, length * 0.3, 0, 0);
  const geometry = new THREE.ShapeGeometry(shape, 10);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin((positions.getY(i) / length) * Math.PI) * 0.012);
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

// A softly folded ribbon surface: narrow at the shoulder, broad through its
// middle, then tapered. The edge follows the same curve for a sewn metallic hem.
function ribbon(
  parent: THREE.Object3D,
  points: number[][],
  width: number,
  material: THREE.Material,
  trim: THREE.Material,
) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  const positions: number[] = [];
  const indices: number[] = [];
  const edgeA: number[][] = [];
  const edgeB: number[][] = [];
  const count = 28;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const cross = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize();
    const w = width * (0.2 + 0.8 * Math.sin(Math.PI * t) ** 0.65);
    for (let c = 0; c <= 4; c++) {
      const across = c / 4;
      const vertex = p.clone().addScaledVector(cross, w * (1 - 2 * across));
      vertex.z -= Math.sin(across * Math.PI) * w * 0.6;
      positions.push(vertex.x, vertex.y, vertex.z);
      if (i < count && c < 4) {
        const j = i * 5 + c;
        indices.push(j, j + 1, j + 5, j + 1, j + 6, j + 5);
      }
    }
    edgeA.push(p.clone().addScaledVector(cross, w).toArray());
    edgeB.push(p.clone().addScaledVector(cross, -w).toArray());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(geometry, material, parent);
  piping(edgeA, 0.0028, trim, parent);
  piping(edgeB, 0.0028, trim, parent);
}

function star(parent: THREE.Object3D, material: THREE.Material, radius: number, position: number[]) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? radius * 0.4 : radius;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const object = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 1,
      steps: 1,
    }),
    material,
    parent,
  );
  object.position.copy(vector(position));
  return object;
}

function skirtPanels(
  parent: THREE.Object3D,
  material: THREE.Material,
  trim: THREE.Material,
  count: number,
  length: number,
) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const panel = new THREE.Group();
    panel.rotation.y = angle;
    parent.add(panel);
    // Open front petals reveal the rigged garment underneath; a second tier
    // behind them adds a real layered hem without a flat skirt decal.
    ribbon(
      panel,
      [
        [0, 0.03, -0.15],
        [0, -0.18, -0.225],
        [0, -length * 0.65, -0.29],
        [0, -length, -0.32],
      ],
      0.08,
      material,
      trim,
    );
  }
}

// Preserve every animated attachment as its own transform boundary. Within a
// boundary, untextured ornament surfaces can share one draw call per material.
// The source skinned meshes never enter this merge pass.
function mergeDecorations(root: THREE.Object3D, animated: ReadonlySet<THREE.Object3D>) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  const boundaries: THREE.Object3D[] = [];
  const collect = (object: THREE.Object3D) => {
    if (object !== root && animated.has(object)) {
      boundaries.push(object);
      return;
    }
    if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && !Array.isArray(object.material)) {
      const group = groups.get(object.material) ?? [];
      group.push(object);
      groups.set(object.material, group);
    }
    object.children.forEach(collect);
  };
  collect(root);
  for (const [material, objects] of groups) {
    if (objects.length < 2) continue;
    const transformed = objects.map((object) => {
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      for (const name of Object.keys(geometry.attributes))
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      return geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    });
    const geometry = mergeGeometries(transformed);
    transformed.forEach((geometry) => geometry.dispose());
    if (!geometry) continue;
    for (const object of objects) {
      object.removeFromParent();
      object.geometry.dispose();
    }
    mesh(geometry, material, root);
  }
  for (const boundary of boundaries) if (!(boundary instanceof THREE.Mesh)) mergeDecorations(boundary, animated);
}

export class TierAvatarAccessories {
  private readonly ribbons: THREE.Group[] = [];
  private readonly wings: THREE.Group[] = [];
  private readonly orbit = new THREE.Group();
  private readonly satellites: THREE.Object3D[] = [];
  private halo: THREE.Group | undefined;

  constructor(
    readonly style: TierAvatarStyle,
    model: THREE.Object3D,
    modelHeight: number,
  ) {
    const unit = modelHeight / 1.737;
    const attach = (boneName: string) => {
      const group = new THREE.Group();
      group.name = `${style}-${boneName}-accessories`;
      group.scale.setScalar(unit);
      model.getObjectByName(boneName)?.add(group);
      return group;
    };
    const head = attach('J_Bip_C_Head');
    const chest = attach('J_Bip_C_UpperChest');
    const hips = attach('J_Bip_C_Hips');
    const merge = () => {
      const animated = new Set<THREE.Object3D>([...this.ribbons, ...this.wings, this.orbit, ...this.satellites]);
      if (this.halo) animated.add(this.halo);
      for (const attachment of [head, chest, hips]) mergeDecorations(attachment, animated);
    };
    if (style === 'sylvie') {
      const green = cloth(0x598578, 0.1);
      const cream = cloth(0xe5d9b8, 0.15);
      const brass = metal(0xcbb77e);
      // Shoulder capelet has an open front, rounded hem and raised collar.
      const positions: number[] = [],
        indices: number[] = [];
      const rows = 8,
        columns = 36;
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= columns; c++) {
          const t = r / rows,
            a = -Math.PI * 0.85 + (c / columns) * Math.PI * 1.7;
          const radius = 0.083 + t * 0.18;
          positions.push(Math.sin(a) * radius, 0.105 - t * 0.2 + Math.cos(a) * 0.017, Math.cos(a) * radius * 0.63);
          if (r < rows && c < columns) {
            const i = r * (columns + 1) + c;
            indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
          }
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      mesh(geometry, green, chest);
      const hem = Array.from({ length: 37 }, (_, c) => {
        const a = -Math.PI * 0.85 + (c / 36) * Math.PI * 1.7;
        return [Math.sin(a) * 0.263, -0.095 + Math.cos(a) * 0.017, Math.cos(a) * 0.263 * 0.63];
      });
      piping(hem, 0.006, cream, chest);
      gem(chest, 0xd7b06f, 0.026, [0, 0.06, -0.1]);
      for (let i = 0; i < 5; i++) {
        const sprig = leaf(head, i % 2 ? brass : green, 0.07, 0.019);
        sprig.position.set(-0.125 + i * 0.015, 0.16 + i * 0.009, -0.126);
        sprig.rotation.z = -0.9 + i * 0.23;
      }
      for (const side of [-1, 1]) {
        const sash = new THREE.Group();
        hips.add(sash);
        sash.position.x = side * 0.12;
        ribbon(
          sash,
          [
            [0, 0.04, -0.13],
            [side * 0.04, -0.08, -0.19],
            [side * 0.05, -0.27, -0.23],
          ],
          0.024,
          cream,
          brass,
        );
        this.ribbons.push(sash);
      }
      merge();
      return;
    }

    const sovereign = style === 'seraphine';
    const gold = metal(sovereign ? 0xe7cfa0 : 0xcda968);
    const satin = cloth(sovereign ? 0xc8cadd : 0x303e60, 0.85);
    const lining = cloth(sovereign ? 0x8da5bc : 0x202e4e, 0.75);
    // The fitted collar and jeweled chain leave the source face untouched.
    piping(
      [
        [-0.13, 0.045, -0.06],
        [-0.075, -0.035, -0.125],
        [0, -0.075, -0.15],
        [0.075, -0.035, -0.125],
        [0.13, 0.045, -0.06],
      ],
      0.005,
      gold,
      chest,
    );
    gem(chest, sovereign ? 0x438c99 : 0x879dce, 0.043, [0, -0.083, -0.155]);
    piping(
      Array.from({ length: 25 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return [Math.sin(a) * 0.155, 0.023, Math.cos(a) * 0.145];
      }),
      0.009,
      gold,
      hips,
      true,
    );
    skirtPanels(hips, satin, gold, sovereign ? 8 : 4, sovereign ? 0.61 : 0.38);
    if (sovereign) skirtPanels(hips, lining, gold, 6, 0.43);

    if (!sovereign) {
      const halo = new THREE.Group();
      this.halo = halo;
      head.add(halo);
      halo.position.set(0, 0.13, 0.14);
      mesh(new THREE.TorusGeometry(0.245, 0.006, 6, 72), gold, halo);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.1 + (i / 6) * Math.PI * 0.8;
        star(halo, gold, i === 3 ? 0.035 : 0.024, [Math.cos(a) * 0.245, Math.sin(a) * 0.245, -0.003]);
      }
      for (const side of [-1, 1]) {
        const sash = new THREE.Group();
        chest.add(sash);
        sash.position.set(side * 0.15, 0.015, 0.12);
        ribbon(
          sash,
          [
            [0, 0, 0],
            [side * 0.13, -0.05, 0.12],
            [side * 0.23, -0.28, 0.1],
            [side * 0.13, -0.48, 0.13],
            [side * 0.23, -0.71, 0.2],
          ],
          0.032,
          lining,
          gold,
        );
        this.ribbons.push(sash);
        const brooch = star(chest, gold, 0.04, [side * 0.16, 0.012, -0.01]);
        brooch.rotation.z = side * 0.15;
        gem(head, 0xc8c9f1, 0.022, [side * 0.119, 0.02, -0.04]);
      }
      merge();
      return;
    }

    // S+ crown: a continuous fitted band, six filigree arches and suspended
    // opal drops. It sits in the hairline rather than hovering above the head.
    const crown = new THREE.Group();
    head.add(crown);
    crown.position.set(0, 0.224, 0.008);
    const band = mesh(new THREE.TorusGeometry(0.108, 0.008, 6, 60), gold, crown);
    band.rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.82 + (i / 6) * Math.PI * 1.64;
      const x = Math.sin(a) * 0.105,
        z = -Math.cos(a) * 0.105;
      const peak = 0.065 + Math.cos(a) * 0.026;
      piping(
        [
          [x - 0.022, 0, z],
          [x - 0.017, peak * 0.55, z],
          [x, peak, z - 0.005],
          [x + 0.017, peak * 0.55, z],
          [x + 0.022, 0, z],
        ],
        0.0038,
        gold,
        crown,
      );
      gem(crown, 0xc0e6e5, 0.014, [x, peak * 0.56, z - 0.005]);
    }
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      chest.add(wing);
      wing.position.set(side * 0.09, -0.005, 0.16);
      // Five individually curved feather vanes read as an intentional swept
      // silhouette, with their shafts and spacing visible from front and rear.
      for (let i = 0; i < 5; i++) {
        const reach = 0.46 - i * 0.041,
          rise = 0.35 - i * 0.16;
        ribbon(
          wing,
          [
            [0, 0, 0],
            [side * 0.16, rise * 0.28, 0.08],
            [side * reach * 0.85, rise * 0.82, 0.09],
            [side * reach, rise, 0.03],
          ],
          0.043,
          i % 2 ? lining : satin,
          gold,
        );
      }
      this.wings.push(wing);
      const train = new THREE.Group();
      hips.add(train);
      train.position.set(side * 0.13, 0, 0.09);
      ribbon(
        train,
        [
          [0, 0, 0],
          [side * 0.18, -0.16, 0.13],
          [side * 0.25, -0.49, 0.23],
          [side * 0.32, -0.74, 0.19],
        ],
        0.055,
        satin,
        gold,
      );
      this.ribbons.push(train);
      gem(head, 0xa6d5d8, 0.026, [side * 0.12, 0.006, -0.05]);
    }
    chest.add(this.orbit);
    this.orbit.position.set(0, 0.1, 0.06);
    for (let i = 0; i < 5; i++) {
      const satellite = star(this.orbit, gold, i % 2 ? 0.018 : 0.025, [0, 0, 0]);
      this.satellites.push(satellite);
    }
    merge();
    this.update(0);
  }

  update(elapsed: number) {
    this.ribbons.forEach((ribbon, i) => {
      ribbon.rotation.z = Math.sin(elapsed * 1.4 + i * 1.3) * 0.065;
      ribbon.rotation.x = Math.sin(elapsed * 1.1 + i * 0.8) * 0.035;
    });
    this.wings.forEach((wing, i) => {
      wing.rotation.y = Math.sin(elapsed * 0.85) * (i === 0 ? 0.055 : -0.055);
    });
    if (this.halo) this.halo.rotation.z = Math.sin(elapsed * 0.6) * 0.035;
    this.satellites.forEach((satellite, i) => {
      const angle = elapsed * 0.25 + (i / this.satellites.length) * Math.PI * 2;
      satellite.position.set(Math.cos(angle) * 0.45, Math.sin(angle) * 0.35, Math.sin(angle * 2) * 0.17);
      satellite.rotation.y = -angle * 0.45;
    });
  }
}
