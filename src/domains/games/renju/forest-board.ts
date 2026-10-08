import * as THREE from 'three';
import {
  AVATAR_PAD,
  BOARD_TOP,
  PAD_AVATAR_FLOOR,
  TAU,
  avatarPad,
  creatureMaterial,
  disposeGroup,
  glowTexture,
  ground,
  merged,
  mesh,
  noise,
  rng,
  scatter,
  smoothstep,
  sphere,
  texture,
  tinted,
  type Palette,
  type TierBoard,
} from './board-decor';

// Ground props scatter in a ring outside the slab; airborne ones also avoid the camera-facing band.
// Together with the rim creatures staying on the margin, nothing is ever drawn over a playable point.
const RIM = 6.93;

function terrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const bump = (Math.sin(x * 1.7 + 0.5) * Math.cos(z * 1.3) + Math.sin(x * 0.7 - z * 0.9) * 0.5) * 0.05;
  const slope = -0.8 - 0.3 * smoothstep(8, 14, radius) + bump * smoothstep(7.4, 9, radius);
  // A level mossy knoll under each avatar tray.
  return THREE.MathUtils.lerp(slope, AVATAR_PAD, avatarPad(x, z));
}

function forestTexture() {
  return texture(512, (x, y) => {
    const grain = noise(x * 512, y * 512) * 2.5;
    const dapple = Math.sin(x * 29 + Math.sin(y * 13) * 2.2) * Math.cos(y * 23 - x * 7 + Math.sin(x * 5) * 1.5);
    const shade = smoothstep(0.35, 0.95, dapple) * 16;
    const fibre = Math.pow((Math.sin(x * 160 + Math.sin(y * 9) * 2.5) + 1) / 2, 6) * 7;
    const value = 248 - shade - fibre - grain;
    return [value - 6, value, value - 14];
  });
}

function mossGround() {
  const radii = [7.4, 8, 8.7, 9.5, 10.4, 11.4, 12.5, 13.7, 15, 16.2];
  return ground(radii, 72, (radius, angle) => {
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const patch = Math.sin(x * 0.9) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 0.35 - z * 0.6) * 0.5;
    const speckle = noise(x * 3.1 + 11, z * 2.7 + 5) - 0.5;
    const shade = new THREE.Color().setHSL(
      0.27 + patch * 0.015,
      0.5 + patch * 0.08,
      0.21 + patch * 0.04 + speckle * 0.03 - 0.05 * (1 - smoothstep(7.4, 10, radius)),
    );
    return { y: terrainHeight(x, z), color: [shade.r, shade.g, shade.b, 1 - smoothstep(13.4, 16.2, radius)] };
  });
}

type Tree = { x: number; z: number; height: number; lean: number; color: number };
const TREES: Tree[] = [
  { x: -9.6, z: -9.4, height: 5.6, lean: 0.05, color: 0x4f7e3b },
  { x: 9.8, z: -9.3, height: 5, lean: -0.04, color: 0x6a9a48 },
  { x: -3.2, z: -10.7, height: 4.6, lean: 0.02, color: 0xc48b3c },
  { x: 2.7, z: -11.3, height: 5.2, lean: -0.03, color: 0x56893f },
  { x: -10.9, z: -2.4, height: 4.2, lean: 0.06, color: 0x7fab56 },
  { x: 11, z: 1.3, height: 3.9, lean: -0.05, color: 0x5d8f44 },
  { x: 10.6, z: 8.4, height: 2.7, lean: 0.03, color: 0x8db360 },
];

function buildTrees(trunks: THREE.BufferGeometry[], canopies: THREE.BufferGeometry[]) {
  TREES.forEach((tree, index) => {
    const base = terrainHeight(tree.x, tree.z) - 0.05;
    const trunkHeight = tree.height * 0.42;
    const trunk = new THREE.CylinderGeometry(
      0.1 * (tree.height / 5) + 0.03,
      0.2 * (tree.height / 5) + 0.08,
      trunkHeight,
      7,
    );
    trunk.translate(0, trunkHeight / 2, 0);
    trunk.rotateZ(tree.lean);
    trunk.translate(tree.x, base, tree.z);
    trunks.push(tinted(trunk, 0x6b4a33, 0.2, index + 1));
    const crownBase = base + trunkHeight - 0.25 * (tree.height / 5);
    const blobs: [number, number, number, number][] = [
      [0.27, 0.14, 0, 0],
      [0.22, 0.31, 0.11, -0.07],
      [0.16, 0.46, -0.06, 0.08],
    ];
    for (const [radius, lift, dx, dz] of blobs) {
      const blob = new THREE.IcosahedronGeometry(radius * tree.height, 1);
      blob.scale(1, 0.78, 1);
      blob.translate(
        tree.x + dx * tree.height * 0.3 + Math.sin(tree.lean) * trunkHeight,
        crownBase + lift * tree.height + radius * tree.height * 0.5,
        tree.z + dz * tree.height * 0.3,
      );
      canopies.push(tinted(blob, tree.color, 0.22, index * 3 + lift));
    }
  });
}

function buildProps(random: () => number, parts: THREE.BufferGeometry[]) {
  const place = (geometry: THREE.BufferGeometry, x: number, z: number, sink = 0, spin = random() * TAU) => {
    geometry.rotateY(spin);
    geometry.translate(x, terrainHeight(x, z) - sink, z);
    return geometry;
  };
  for (let i = 0; i < 6; i++) {
    const { x, z } = scatter(random, 8.6, 12.6);
    const rock = new THREE.DodecahedronGeometry(0.22 + random() * 0.26, 0);
    rock.scale(1 + random() * 0.5, 0.6 + random() * 0.3, 1);
    parts.push(tinted(place(rock, x, z, 0.08), 0x8d8f86, 0.2, i + 20));
  }
  for (let i = 0; i < 7; i++) {
    const { x, z } = scatter(random, 8.2, 11.8);
    const scale = 0.7 + random() * 0.7;
    const stem = new THREE.CylinderGeometry(0.045 * scale, 0.065 * scale, 0.24 * scale, 7);
    stem.translate(0, 0.12 * scale, 0);
    parts.push(tinted(place(stem, x, z), 0xeadfc9, 0.08, i + 40));
    const cap = new THREE.SphereGeometry(0.17 * scale, 10, 6, 0, TAU, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(0, 0.22 * scale, 0);
    parts.push(tinted(place(cap, x, z), i % 3 === 0 ? 0xc9a066 : 0xd2553b, 0.14, i + 60));
  }
  for (let i = 0; i < 5; i++) {
    const { x, z } = scatter(random, 8.6, 12.4);
    for (let frond = 0; frond < 6; frond++) {
      const leaf = new THREE.BoxGeometry(0.07, 0.012, 0.52);
      leaf.translate(0, 0, 0.26);
      leaf.rotateX(-0.55 - random() * 0.3);
      leaf.rotateY((frond / 6) * TAU + random() * 0.4);
      leaf.translate(0, 0.05, 0);
      parts.push(tinted(place(leaf, x, z, 0, 0), 0x5e8f45, 0.18, i * 6 + frond + 80));
    }
  }
  const petals = [0xf2a7c1, 0xf7f0d8, 0xf0d45a, 0xd9a4e8];
  for (let i = 0; i < 14; i++) {
    const { x, z } = scatter(random, 8.2, 13);
    const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.3, 5);
    stem.translate(0, 0.15, 0);
    parts.push(tinted(place(stem, x, z), 0x6e9a4c, 0.1, i + 120));
    const head = new THREE.SphereGeometry(0.055, 8, 6);
    head.scale(1, 0.7, 1);
    head.translate(0, 0.31, 0);
    parts.push(tinted(place(head, x, z), petals[i % petals.length], 0.1, i + 140));
  }
  for (let i = 0; i < 16; i++) {
    const { x, z } = scatter(random, 8, 13.4);
    for (let blade = 0; blade < 5; blade++) {
      const grass = new THREE.BoxGeometry(0.03, 0.26 + random() * 0.12, 0.012);
      grass.translate(0, 0.13, 0);
      grass.rotateX((random() - 0.5) * 0.8);
      grass.rotateY((blade / 5) * TAU);
      parts.push(tinted(place(grass, x, z, 0.03, 0), 0x79a44f, 0.2, i * 5 + blade + 200));
    }
  }
  // Moss pads on the four corners of the slab itself, flush with the margin and clear of the lines.
  for (const x of [-6.88, 6.88]) {
    for (const z of [-6.88, 6.88]) {
      const pad = new THREE.SphereGeometry(0.21, 12, 6);
      pad.scale(1, 0.14, 1);
      pad.translate(x, BOARD_TOP + 0.01, z);
      parts.push(tinted(pad, 0x6f9a4a, 0.2, Math.round(x + z + 300)));
    }
  }
}

/** Forward is +x; the squirrel stands on the board rim with its feet at the group origin. */
function squirrel(material: THREE.Material) {
  const group = new THREE.Group();
  const fur = 0x8c5a3a;
  const body = merged([
    tinted(sphere(0.15, 0, 0.15, 0, 1.25, 0.95, 0.85), fur, 0.12, 1),
    tinted(sphere(0.1, 0.2, 0.25, 0), fur, 0.1, 2),
    tinted(sphere(0.035, 0.2, 0.34, 0.055), fur, 0.1, 3),
    tinted(sphere(0.035, 0.2, 0.34, -0.055), fur, 0.1, 4),
    tinted(sphere(0.09, 0.03, 0.1, 0, 1, 0.7, 0.7), 0xe8d6bf, 0.06, 5),
    tinted(sphere(0.018, 0.28, 0.27, 0.05, 1, 1, 1, 6), 0x2a1a12, 0, 6),
    tinted(sphere(0.018, 0.28, 0.27, -0.05, 1, 1, 1, 6), 0x2a1a12, 0, 7),
    tinted(sphere(0.03, 0.14, 0.03, 0.06, 1, 1, 1, 6), fur, 0.1, 8),
    tinted(sphere(0.03, 0.14, 0.03, -0.06, 1, 1, 1, 6), fur, 0.1, 9),
  ]);
  mesh(group, body, material, 'squirrel-body');
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.13, 0.08, 0),
    new THREE.Vector3(-0.13, 0.3, 0),
    new THREE.Vector3(-0.01, 0.4, 0),
  ]);
  const tail = merged([
    tinted(new THREE.TubeGeometry(curve, 10, 0.07, 7, false), 0xa06a45, 0.14, 10),
    tinted(sphere(0.085, -0.01, 0.4, 0), 0xa06a45, 0.14, 11),
  ]);
  const tailMesh = mesh(group, tail, material, 'squirrel-tail');
  tailMesh.position.set(-0.17, 0.12, 0);
  return { group, tail: tailMesh };
}

const step = { progress: 0, hop: 0, sitting: 0, forward: 1 };
/** One patrol: run out, sit up and look around, run back, rest. Time offsets stagger the two squirrels. */
function patrol(time: number, offset: number) {
  const period = 11;
  const t = (time + offset) % period;
  const hop = (local: number, length: number) =>
    Math.abs(Math.sin(local * Math.PI * 2.6)) *
    0.2 *
    smoothstep(0, 0.3, local) *
    (1 - smoothstep(length - 0.3, length, local));
  if (t < 4) {
    step.progress = t / 4;
    step.hop = hop(t, 4);
    step.sitting = 0;
    step.forward = 1;
  } else if (t < 5.6) {
    step.progress = 1;
    step.hop = 0;
    step.sitting = smoothstep(4, 4.5, t) * (1 - smoothstep(5.1, 5.6, t));
    step.forward = 1;
  } else if (t < 9.6) {
    step.progress = 1 - (t - 5.6) / 4;
    step.hop = hop(t - 5.6, 4);
    step.sitting = 0;
    step.forward = -1;
  } else {
    step.progress = 0;
    step.hop = 0;
    step.sitting = smoothstep(9.6, 10.1, t) * (1 - smoothstep(10.5, 11, t));
    step.forward = -1;
  }
  return step;
}

type LegKind = 'hop' | 'leap' | 'climb' | 'cling' | 'sit' | 'sniff';
type Leg = { kind: LegKind; seconds: number; from: THREE.Vector3; to: THREE.Vector3; start: number };
const groundAt = (x: number, z: number) => new THREE.Vector3(x, terrainHeight(x, z) - 0.02, z);
const rimAt = (z: number) => new THREE.Vector3(RIM, BOARD_TOP, z);
const PERCH_TREE = TREES[5];
const trunkFoot = new THREE.Vector3(
  PERCH_TREE.x - 0.3,
  terrainHeight(PERCH_TREE.x, PERCH_TREE.z) - 0.05,
  PERCH_TREE.z + 0.05,
);
const trunkPerch = trunkFoot.clone().add(new THREE.Vector3(-Math.sin(PERCH_TREE.lean) * 1.3, 1.3, 0));
/**
 * The second squirrel forages instead of patrolling: along the right rim, down onto the moss, over to the
 * nearest tree, a short climb, then back up onto the board by a different route.
 */
const FORAGE = (
  [
    ['hop', 2.4, rimAt(-1), rimAt(4.6)],
    ['sit', 1.2, rimAt(4.6), rimAt(4.6)],
    ['leap', 0.7, rimAt(4.6), groundAt(8.6, 4.9)],
    ['hop', 1.6, groundAt(8.6, 4.9), trunkFoot],
    ['sniff', 1, trunkFoot, trunkFoot],
    ['climb', 1.1, trunkFoot, trunkPerch],
    ['cling', 0.9, trunkPerch, trunkPerch],
    ['climb', 0.9, trunkPerch, trunkFoot],
    ['hop', 1.7, trunkFoot, groundAt(8.5, 3.4)],
    ['leap', 0.8, groundAt(8.5, 3.4), rimAt(2.6)],
    ['hop', 1.6, rimAt(2.6), rimAt(-1)],
    ['sit', 1.3, rimAt(-1), rimAt(-1)],
  ] as [LegKind, number, THREE.Vector3, THREE.Vector3][]
).reduce<Leg[]>((legs, [kind, seconds, from, to]) => {
  const start = legs.length ? legs[legs.length - 1].start + legs[legs.length - 1].seconds : 0;
  legs.push({ kind, seconds, from, to, start });
  return legs;
}, []);
const FORAGE_PERIOD = FORAGE[FORAGE.length - 1].start + FORAGE[FORAGE.length - 1].seconds;
const pose = { position: new THREE.Vector3(), heading: 0, pitch: 0, tailSwing: 0, tailLift: 0 };
function forage(time: number) {
  const t = time % FORAGE_PERIOD;
  const leg = FORAGE.find((candidate) => t < candidate.start + candidate.seconds) ?? FORAGE[FORAGE.length - 1];
  const u = THREE.MathUtils.clamp((t - leg.start) / leg.seconds, 0, 1);
  const dx = leg.to.x - leg.from.x;
  const dz = leg.to.z - leg.from.z;
  const run = Math.hypot(dx, dz);
  pose.position.lerpVectors(leg.from, leg.to, u);
  pose.heading =
    run > 0.01
      ? Math.atan2(-dz, dx)
      : leg.kind === 'climb' || leg.kind === 'cling' || leg.kind === 'sniff'
        ? 0
        : pose.heading;
  pose.pitch = 0;
  pose.tailSwing = Math.sin(time * 5) * 0.12;
  pose.tailLift = 0;
  switch (leg.kind) {
    case 'hop': {
      const hops = Math.round(leg.seconds * 3.4);
      const arc = Math.sin(u * Math.PI * hops);
      pose.position.y += Math.abs(arc) * 0.14;
      pose.pitch = Math.cos(u * Math.PI * hops) * 0.14;
      pose.tailLift = Math.abs(arc) * 0.5;
      break;
    }
    case 'leap': {
      const lift = Math.sin(u * Math.PI) * 0.55;
      pose.position.y += lift;
      const climbRate = leg.to.y - leg.from.y + Math.PI * 0.55 * Math.cos(u * Math.PI);
      pose.pitch = Math.atan2(climbRate, run) * 0.6;
      pose.tailLift = 0.7;
      break;
    }
    case 'climb':
      pose.heading = 0;
      pose.pitch = Math.PI / 2;
      pose.position.y += Math.abs(Math.sin(u * Math.PI * 4)) * 0.03;
      pose.tailSwing = Math.sin(time * 3) * 0.2;
      break;
    case 'cling':
      pose.heading = 0;
      pose.pitch = Math.PI / 2 - Math.sin(u * Math.PI) * 0.25;
      pose.tailSwing = Math.sin(time * 2.2) * 0.25;
      break;
    case 'sit':
      pose.pitch = smoothstep(0, 0.25, u) * (1 - smoothstep(0.75, 1, u)) * 0.6;
      pose.heading += Math.sin(u * Math.PI * 2) * 0.35;
      pose.tailSwing = Math.sin(time * 6) * 0.2;
      break;
    case 'sniff':
      pose.heading = 0;
      pose.pitch = -0.28 + Math.sin(time * 11) * 0.06;
      break;
  }
  return pose;
}

function bird(material: THREE.Material) {
  const group = new THREE.Group();
  // Heading first, then a bank around the bird's own forward axis.
  group.rotation.order = 'YXZ';
  const feather = 0x5f7fb8;
  const body = merged([
    tinted(sphere(0.09, 0, 0, 0, 1.5, 0.8, 0.9), feather, 0.12, 12),
    tinted(sphere(0.06, 0.13, 0.04, 0), feather, 0.1, 13),
    tinted(new THREE.ConeGeometry(0.02, 0.07, 6).rotateZ(-Math.PI / 2).translate(0.21, 0.04, 0), 0xf0b24a, 0, 14),
    tinted(new THREE.BoxGeometry(0.16, 0.012, 0.1).translate(-0.2, 0.01, 0), 0x3c5587, 0.1, 15),
    tinted(sphere(0.05, 0.02, -0.03, 0, 1.4, 0.7, 0.8), 0xeadfcf, 0.06, 16),
  ]);
  mesh(group, body, material, 'bird-body');
  const wings = [-1, 1].map((side) => {
    const wing = tinted(
      new THREE.BoxGeometry(0.18, 0.012, 0.44).translate(-0.02, 0, side * 0.24),
      feather,
      0.12,
      17 + side,
    );
    const wingMesh = mesh(group, wing, material, 'bird-wing');
    wingMesh.position.set(0, 0.03, side * 0.05);
    return wingMesh;
  });
  return { group, wings };
}

function rabbit(material: THREE.Material) {
  const group = new THREE.Group();
  const coat = 0xddd3c6;
  const body = merged([
    tinted(sphere(0.17, 0, 0.16, 0, 1.3, 0.9, 0.95), coat, 0.1, 20),
    tinted(sphere(0.11, 0.2, 0.3, 0), coat, 0.08, 21),
    tinted(sphere(0.05, -0.22, 0.2, 0), 0xfbf7f0, 0.04, 22),
    tinted(sphere(0.017, 0.28, 0.33, 0.06, 1, 1, 1, 6), 0x2a1a12, 0, 23),
    tinted(sphere(0.017, 0.28, 0.33, -0.06, 1, 1, 1, 6), 0x2a1a12, 0, 24),
    tinted(sphere(0.02, 0.31, 0.29, 0, 1, 0.7, 1, 6), 0xe8a9b4, 0, 25),
  ]);
  mesh(group, body, material, 'rabbit-body');
  const ears = merged([
    tinted(sphere(0.045, 0, 0.1, 0.05, 0.6, 2.4, 1), coat, 0.08, 26),
    tinted(sphere(0.045, 0, 0.1, -0.05, 0.6, 2.4, 1), coat, 0.08, 27),
    tinted(sphere(0.02, 0.01, 0.1, 0.05, 0.6, 2, 1, 6), 0xe8a9b4, 0, 28),
    tinted(sphere(0.02, 0.01, 0.1, -0.05, 0.6, 2, 1, 6), 0xe8a9b4, 0, 29),
  ]);
  const earMesh = mesh(group, ears, material, 'rabbit-ears');
  earMesh.position.set(0.17, 0.36, 0);
  return { group, ears: earMesh };
}

const RABBIT_PATH = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * TAU;
  return new THREE.Vector3(10.2 + Math.cos(angle) * 1, 0, 6.3 + Math.sin(angle) * 1);
});

function butterfly(material: THREE.Material, color: number, seed: number) {
  const group = new THREE.Group();
  const wings = [-1, 1].map((side) => {
    const wing = merged([
      tinted(
        new THREE.CircleGeometry(0.085, 10)
          .scale(1, 0.75, 1)
          .rotateX(-Math.PI / 2)
          .translate(side * 0.085, 0, 0.03),
        color,
        0.1,
        seed + side,
      ),
      tinted(
        new THREE.CircleGeometry(0.06, 8).rotateX(-Math.PI / 2).translate(side * 0.06, 0, -0.07),
        color,
        0.18,
        seed + side + 2,
      ),
    ]);
    return mesh(group, wing, material, 'butterfly-wing');
  });
  mesh(group, tinted(sphere(0.018, 0, 0, 0, 1, 1, 4, 6), 0x2f2420, 0, seed + 5), material, 'butterfly-body');
  return { group, wings };
}

const BUTTERFLIES = [
  {
    centre: new THREE.Vector3(-9.6, 1.1, 3.4),
    amplitude: new THREE.Vector3(0.9, 0.35, 0.7),
    phase: 0,
    color: 0xf2a541,
  },
  { centre: new THREE.Vector3(9.4, 1, -3.6), amplitude: new THREE.Vector3(0.8, 0.3, 0.9), phase: 2.1, color: 0xc9a7e8 },
];
const FIREFLY_COUNT = 46;
const LEAF_COUNT = 22;
const LEAF_TOP = 4.6;

export function createForestBoard(): TierBoard {
  const decorations = new THREE.Group();
  decorations.name = 'tier-board-forest';
  const map = forestTexture();
  const palette: Palette = { surface: 0xa3b77c, body: 0x5c4532, line: 0x3a4a2a, detail: 0xa3b77c };
  const random = rng(7);

  const soil = mesh(
    decorations,
    mossGround(),
    new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, metalness: 0 }),
    'forest-ground',
  );
  soil.castShadow = false;

  const trunks: THREE.BufferGeometry[] = [];
  const canopies: THREE.BufferGeometry[] = [];
  buildTrees(trunks, canopies);
  const props: THREE.BufferGeometry[] = [...trunks];
  buildProps(random, props);
  mesh(
    decorations,
    merged(props),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }),
    'forest-props',
  );

  // One draw call for every crown: the wind lives in the vertex shader instead of per-tree transforms,
  // and the shadow pass gets the same displacement so shadows sway with the leaves.
  const wind = { value: 0 };
  const sway = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float lift = smoothstep(0.5, 4.0, position.y);
        transformed.x += sin(windTime * 1.15 + position.z * 0.45 + position.x * 0.2) * 0.11 * lift;
        transformed.z += cos(windTime * 0.85 + position.x * 0.35) * 0.07 * lift;`,
      );
  };
  const canopyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  canopyMaterial.onBeforeCompile = sway;
  canopyMaterial.customProgramCacheKey = () => 'forest-canopy-wind';
  const canopyDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  canopyDepth.onBeforeCompile = sway;
  canopyDepth.customProgramCacheKey = () => 'forest-canopy-wind-depth';
  const crowns = mesh(decorations, merged(canopies), canopyMaterial, 'forest-canopies');
  crowns.customDepthMaterial = canopyDepth;

  const fur = creatureMaterial();
  const sentry = squirrel(fur);
  const forager = squirrel(fur);
  for (const { group } of [sentry, forager]) {
    group.scale.setScalar(1.3);
    decorations.add(group);
  }
  const robin = bird(fur);
  robin.group.scale.setScalar(1.3);
  decorations.add(robin.group);
  const bunny = rabbit(fur);
  decorations.add(bunny.group);
  const butterflies = BUTTERFLIES.map((flight, index) => butterfly(fur, flight.color, 30 + index * 10));
  for (const { group } of butterflies) decorations.add(group);

  const fireflyBase = Array.from({ length: FIREFLY_COUNT }, () => {
    const { x, z } = scatter(random, 8.6, 13, true);
    return {
      x,
      z,
      y: 0.5 + random() * 2.1,
      drift: 0.3 + random() * 0.4,
      phase: random() * TAU,
      blink: 0.6 + random() * 0.9,
    };
  });
  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(FIREFLY_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage),
  );
  // Four-component colors carry each firefly's blink as vertex alpha; additive glow would vanish on a pale page.
  fireflyGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(FIREFLY_COUNT * 4), 4).setUsage(THREE.DynamicDrawUsage),
  );
  const fireflies = new THREE.Points(
    fireflyGeometry,
    new THREE.PointsMaterial({
      size: 0.6,
      sizeAttenuation: true,
      map: glowTexture(32, (distance) => [
        255,
        244 - distance * 90,
        120 - distance * 110,
        255 * (1 - smoothstep(0.16, 0.3, distance)) + 150 * (1 - smoothstep(0.2, 0.9, distance)),
      ]),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      toneMapped: false,
    }),
  );
  fireflies.name = 'forest-fireflies';
  fireflies.frustumCulled = false;
  decorations.add(fireflies);

  const leafBase = Array.from({ length: LEAF_COUNT }, () => {
    const { x, z } = scatter(random, 8.8, 12.8, true);
    return {
      x,
      z,
      floor: terrainHeight(x, z),
      speed: 0.32 + random() * 0.3,
      offset: random() * 6,
      phase: random() * TAU,
      spin: 0.6 + random() * 1.2,
    };
  });
  const leaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.16, 0.24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }),
    LEAF_COUNT,
  );
  leaves.name = 'forest-leaves';
  leaves.frustumCulled = false;
  leaves.receiveShadow = true;
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tints = [0xd8a25a, 0xc2653c, 0xe0c060, 0x8fa84a];
  leafBase.forEach((_, index) => leaves.setColorAt(index, new THREE.Color(tints[index % tints.length])));
  decorations.add(leaves);

  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const translation = new THREE.Vector3();
  const update = (time: number) => {
    wind.value = time;

    const patrolStep = patrol(time, 0);
    sentry.group.position.set(THREE.MathUtils.lerp(-5.2, 5.2, patrolStep.progress), BOARD_TOP + patrolStep.hop, -RIM);
    sentry.group.rotation.set(0, patrolStep.forward > 0 ? 0 : Math.PI, patrolStep.sitting * 0.6);
    sentry.tail.rotation.set(Math.sin(time * 3.1) * 0.1, 0, Math.sin(time * 5) * 0.18 + patrolStep.hop * 0.8);

    const foragePose = forage(time);
    forager.group.position.copy(foragePose.position);
    forager.group.rotation.set(0, foragePose.heading, foragePose.pitch);
    forager.tail.rotation.set(foragePose.tailSwing * 0.5, 0, foragePose.tailSwing + foragePose.tailLift);

    const angle = time * 0.5;
    robin.group.position.set(
      -9.2 + Math.cos(angle) * 2.6,
      5.4 + Math.sin(time * 1.3) * 0.35,
      -8.6 + Math.sin(angle) * 2.6,
    );
    robin.group.rotation.set(-0.35, Math.atan2(-Math.cos(angle), -Math.sin(angle)), 0);
    const glide = smoothstep(0.25, 0.8, 0.5 + 0.5 * Math.sin(time * 0.7));
    const flap = Math.sin(time * 9) * 0.65 * glide + (1 - glide) * 0.12;
    robin.wings[0].rotation.x = flap;
    robin.wings[1].rotation.x = -flap;

    const hopPeriod = 2.6;
    const hopIndex = Math.floor(time / hopPeriod);
    const hopPhase = THREE.MathUtils.clamp((time - hopIndex * hopPeriod) / 0.5, 0, 1);
    const from = RABBIT_PATH[hopIndex % RABBIT_PATH.length];
    const to = RABBIT_PATH[(hopIndex + 1) % RABBIT_PATH.length];
    const eased = smoothstep(0, 1, hopPhase);
    const hopX = THREE.MathUtils.lerp(from.x, to.x, eased);
    const hopZ = THREE.MathUtils.lerp(from.z, to.z, eased);
    bunny.group.position.set(hopX, terrainHeight(hopX, hopZ) - 0.02 + Math.sin(hopPhase * Math.PI) * 0.32, hopZ);
    bunny.group.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    // Breathing keeps the rabbit alive between hops.
    bunny.group.scale.set(1.25, 1.25 * (1 + Math.sin(time * 4) * 0.02), 1.25);
    bunny.ears.rotation.x = Math.sin(time * 7) * 0.03;
    bunny.ears.rotation.z = -Math.sin(hopPhase * Math.PI) * 0.5;

    butterflies.forEach(({ group, wings }, index) => {
      const { centre, amplitude, phase } = BUTTERFLIES[index];
      group.position.set(
        centre.x + Math.sin(time * 0.8 + phase) * amplitude.x,
        centre.y + Math.sin(time * 1.9 + phase) * amplitude.y,
        centre.z + Math.sin(time * 0.5 + phase) * amplitude.z,
      );
      const dx = Math.cos(time * 0.8 + phase) * 0.8 * amplitude.x;
      const dz = Math.cos(time * 0.5 + phase) * 0.5 * amplitude.z;
      group.rotation.y = Math.atan2(dx, dz);
      // Wings lift from nearly flat to almost upright and back.
      const beat = 0.15 + 0.95 * Math.abs(Math.sin(time * 10 + phase));
      wings[0].rotation.z = -beat;
      wings[1].rotation.z = beat;
    });

    const positions = fireflyGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = fireflyGeometry.getAttribute('color') as THREE.BufferAttribute;
    fireflyBase.forEach((fly, index) => {
      positions.setXYZ(
        index,
        fly.x + Math.sin(time * fly.drift + fly.phase) * 0.45,
        fly.y + Math.sin(time * fly.drift * 0.7 + fly.phase * 2) * 0.25,
        fly.z + Math.cos(time * fly.drift * 1.3 + fly.phase) * 0.45,
      );
      const pulse = Math.max(0, Math.sin(time * fly.blink + fly.phase)) ** 3;
      colors.setXYZW(index, 1, 0.96, 0.6, 0.08 + 0.92 * pulse);
    });
    positions.needsUpdate = true;
    colors.needsUpdate = true;

    leafBase.forEach((leaf, index) => {
      const fall = (time * leaf.speed + leaf.offset) % (LEAF_TOP - leaf.floor);
      translation.set(
        leaf.x + Math.sin(time * 1.3 + leaf.phase) * 0.35,
        LEAF_TOP - fall,
        leaf.z + Math.cos(time * 0.9 + leaf.phase) * 0.3,
      );
      euler.set(time * 1.7 * leaf.spin + leaf.phase, time * 1.1 * leaf.spin, time * 0.8 * leaf.spin + leaf.phase);
      quaternion.setFromEuler(euler);
      // A leaf grows in as it leaves the canopy and shrinks away as it reaches the moss, so none pop.
      scale.setScalar(
        Math.min(
          THREE.MathUtils.clamp((translation.y - leaf.floor) / 0.4, 0.2, 1),
          THREE.MathUtils.clamp((LEAF_TOP - translation.y) / 0.5, 0.2, 1),
        ),
      );
      leaves.setMatrixAt(index, matrix.compose(translation, quaternion, scale));
    });
    leaves.instanceMatrix.needsUpdate = true;
  };
  update(0);

  return {
    palette,
    map,
    decorations,
    roughness: 0.7,
    clearcoat: 0.06,
    avatarFloor: PAD_AVATAR_FLOOR,
    update,
    dispose: () => {
      map.dispose();
      disposeGroup(decorations);
    },
  };
}
