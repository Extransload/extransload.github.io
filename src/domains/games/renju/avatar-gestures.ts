import * as THREE from 'three';
import type { AvatarMotion } from './petal-avatar';
import type { DanceStyle } from './appearance';

export type VroidGestureStyle = 'luna' | 'apron' | 'rose' | 'serin';

type Pose = {
  left: number;
  right: number;
  leftX: number;
  rightX: number;
  headX: number;
  headZ: number;
  spineX: number;
  spineZ: number;
  lift: number;
  bounce: number;
  speed: number;
};

const pose = (
  left: number,
  right: number,
  leftX: number,
  rightX: number,
  headX: number,
  headZ: number,
  spineX: number,
  spineZ: number,
  lift: number,
  bounce: number,
  speed: number,
): Pose => ({ left, right, leftX, rightX, headX, headZ, spineX, spineZ, lift, bounce, speed });

// The outcome pose is the starting silhouette. Victory adds a looping,
// full-body dance with its own rhythm and footwork for each character.
const GESTURES: Record<VroidGestureStyle, Record<'win' | 'lose', Pose>> = {
  luna: {
    win: pose(-0.68, 0.68, -0.38, -0.38, -0.06, 0.12, 0.06, -0.05, 0.02, 0.045, 6.5),
    lose: pose(0.63, -0.67, -0.34, -0.34, 0.31, -0.14, -0.23, 0.09, -0.06, 0.008, 2.3),
  },
  apron: {
    win: pose(0.52, -0.52, -0.48, -0.48, -0.12, 0.08, -0.08, 0.05, 0, 0.02, 3.7),
    lose: pose(1.12, -1.12, -0.12, -0.12, 0.38, -0.08, -0.33, -0.04, -0.09, 0.004, 1.7),
  },
  rose: {
    win: pose(1.04, -0.36, -0.28, -0.38, 0.13, 0.14, -0.19, -0.07, -0.04, 0.014, 3.2),
    lose: pose(0.47, -1.18, -0.46, 0.05, 0.22, -0.19, -0.31, 0.13, -0.12, 0.007, 2.4),
  },
  serin: {
    win: pose(-0.33, 0.8, -0.22, -0.34, -0.07, 0.08, 0.12, -0.04, 0.01, 0.035, 5.1),
    lose: pose(0.56, -0.52, -0.38, -0.38, 0.3, -0.11, -0.26, -0.06, -0.08, 0.007, 2.2),
  },
};

export type DanceAvatar = VroidGestureStyle | 'petal';

type Dance = {
  leftZ: number;
  rightZ: number;
  leftX: number;
  rightX: number;
  leftLeg: number;
  rightLeg: number;
  hipX: number;
  hipY: number;
  hipTurn: number;
  torso: number;
  head: number;
};
// Eight clear counts followed by a mirrored return phrase. Every character
// has a different arm, footwork and turn sequence; Encore changes the count
// order, lead side and accents rather than replaying the same loop faster.
type Step = readonly [number, number, number, number, number, number, number, number, number, number, number];
const CHOREOGRAPHY: Record<DanceAvatar, readonly Step[]> = {
  petal: [
    [-0.35, 0.35, -0.2, -0.2, 0.15, -0.1, -0.08, 0.01, -0.18, 0.1, -0.08],
    [-0.85, 0.15, 0.1, -0.5, 0.55, -0.2, -0.16, 0.1, -0.35, -0.16, 0.12],
    [-0.35, 0.95, -0.65, 0.15, -0.15, 0.45, 0.12, 0.02, 0.16, 0.2, -0.12],
    [0.45, 0.45, -0.75, -0.75, 0.2, 0.2, 0, 0.12, 0.48, -0.18, 0.1],
    [0.7, -0.7, -0.25, -0.25, -0.35, 0.55, 0.16, 0.02, 0.72, 0.24, -0.16],
    [-1.05, 0.85, 0.25, -0.4, 0.5, -0.3, -0.12, 0.1, 0.35, -0.2, 0.14],
    [-0.15, 0.15, -0.8, -0.8, -0.2, 0.5, 0.12, 0.04, -0.28, 0.18, -0.1],
    [-0.8, 0.8, -0.15, -0.15, 0.2, 0.2, 0, 0.12, 0, -0.08, 0],
  ],
  luna: [
    [-0.25, 0.55, -0.55, 0.1, 0.35, -0.2, -0.12, 0.02, -0.2, 0.16, -0.1],
    [-1.05, 0.2, -0.1, -0.65, 0.65, -0.3, -0.2, 0.09, -0.42, -0.16, 0.15],
    [-0.25, 1.1, -0.8, 0.2, -0.2, 0.5, 0.16, 0.03, 0.25, 0.22, -0.12],
    [0.65, 0.65, -0.9, -0.9, 0.25, 0.25, 0, 0.12, 0.55, -0.2, 0.1],
    [0.9, -0.6, 0.15, -0.5, -0.4, 0.65, 0.2, 0.02, 0.8, 0.26, -0.18],
    [-0.8, 1.1, -0.5, 0.2, 0.55, -0.4, -0.16, 0.11, 0.4, -0.22, 0.16],
    [-0.5, 0.4, -0.95, -0.25, -0.15, 0.55, 0.14, 0.03, -0.32, 0.18, -0.08],
    [-1.15, 1.15, -0.25, -0.25, 0.25, 0.25, 0, 0.13, 0, -0.1, 0],
  ],
  rose: [
    [-0.4, 0.8, 0.15, -0.65, 0.4, -0.2, -0.15, 0.02, -0.28, 0.25, -0.14],
    [0.45, 1.05, -0.7, -0.25, 0.65, -0.3, -0.23, 0.06, -0.58, -0.2, 0.18],
    [-1.05, 0.15, -0.25, -0.8, -0.2, 0.6, 0.18, 0.04, 0.18, 0.32, -0.2],
    [-0.95, 0.95, -0.8, -0.8, 0.15, 0.2, 0.05, 0.09, 0.8, -0.24, 0.14],
    [0.65, -0.95, -0.6, 0.1, -0.35, 0.65, 0.23, 0.02, 1.1, 0.3, -0.18],
    [-0.3, 0.9, 0.2, -0.85, 0.6, -0.3, -0.2, 0.08, 0.68, -0.3, 0.19],
    [-1.1, 0.45, -0.7, -0.15, -0.25, 0.5, 0.16, 0.03, 0.16, 0.22, -0.12],
    [-0.8, 0.8, -0.35, -0.35, 0.2, 0.2, 0, 0.09, -0.2, -0.1, 0],
  ],
  apron: [
    [-0.7, 0.25, -0.45, 0.1, 0.4, -0.15, -0.1, 0.04, -0.25, 0.14, -0.1],
    [-0.25, 1.0, 0.15, -0.6, 0.7, -0.2, -0.17, 0.12, -0.42, -0.18, 0.16],
    [-1.0, 0.55, -0.6, -0.15, -0.2, 0.55, 0.13, 0.03, 0.2, 0.22, -0.1],
    [-0.65, 0.65, -0.95, -0.95, 0.15, 0.15, 0, 0.13, 0.45, -0.2, 0.12],
    [0.3, -0.75, 0.1, -0.65, -0.3, 0.65, 0.16, 0.04, 0.65, 0.2, -0.12],
    [-1.1, 0.4, -0.15, -0.6, 0.6, -0.3, -0.14, 0.12, 0.25, -0.18, 0.14],
    [-0.45, 1.05, -0.75, -0.15, -0.2, 0.55, 0.12, 0.04, -0.24, 0.2, -0.1],
    [-1.05, 1.05, -0.3, -0.3, 0.25, 0.25, 0, 0.14, 0, -0.08, 0],
  ],
  serin: [
    [-0.2, 0.8, -0.65, 0.1, 0.45, -0.2, -0.12, 0.02, -0.24, 0.18, -0.12],
    [-1.05, 0.35, 0.2, -0.8, 0.65, -0.3, -0.2, 0.1, -0.5, -0.22, 0.16],
    [-0.6, 1.05, -0.95, -0.1, -0.2, 0.6, 0.16, 0.03, 0.26, 0.28, -0.14],
    [0.8, 0.8, -0.7, -0.7, 0.2, 0.2, 0, 0.13, 0.7, -0.24, 0.12],
    [1.1, -0.5, 0.1, -0.75, -0.4, 0.7, 0.2, 0.02, 0.95, 0.3, -0.2],
    [-0.9, 1.15, -0.6, 0.15, 0.65, -0.35, -0.17, 0.11, 0.44, -0.25, 0.18],
    [-0.45, 0.65, -1.05, -0.35, -0.25, 0.65, 0.15, 0.04, -0.32, 0.23, -0.1],
    [-1.1, 1.1, -0.35, -0.35, 0.3, 0.3, 0, 0.14, 0, -0.1, 0],
  ],
};
const KEYS: (keyof Dance)[] = [
  'leftZ',
  'rightZ',
  'leftX',
  'rightX',
  'leftLeg',
  'rightLeg',
  'hipX',
  'hipY',
  'hipTurn',
  'torso',
  'head',
];
const ENCORE_ORDER = [0, 2, 5, 3, 6, 1, 4, 7];

function atCount(style: DanceAvatar, variant: DanceStyle, count: number): Dance {
  const secondPhrase = count >= 8;
  const index = count % 8;
  const sourceIndex =
    variant === 'encore' ? ENCORE_ORDER[secondPhrase ? 7 - index : index] : secondPhrase ? 7 - index : index;
  const step = CHOREOGRAPHY[style][sourceIndex];
  const mirrored = (variant === 'encore') !== secondPhrase;
  const values = mirrored
    ? [-step[1], -step[0], step[3], step[2], step[5], step[4], -step[6], step[7], -step[8], -step[9], -step[10]]
    : step;
  return Object.fromEntries(KEYS.map((key, i) => [key, values[i]])) as Dance;
}

export function sampleVictoryDance(style: DanceAvatar, variant: DanceStyle, time: number): Dance {
  const pace = style === 'rose' ? 1.7 : style === 'apron' ? 2.2 : 2;
  const count = (time * pace) % 16;
  const index = Math.floor(count);
  const phase = count - index;
  const blend = phase * phase * (3 - 2 * phase);
  const from = atCount(style, variant, index);
  const to = atCount(style, variant, (index + 1) % 16);
  const sampled = Object.fromEntries(KEYS.map((key) => [key, from[key] + (to[key] - from[key]) * blend])) as Dance;
  sampled.hipY += Math.sin(phase * Math.PI) * (variant === 'encore' ? 0.055 : 0.035);
  return sampled;
}

export function updateVroidGesture(
  style: VroidGestureStyle,
  motion: AvatarMotion,
  variant: DanceStyle,
  elapsed: number,
  delta: number,
  restHipY: number,
  bones: {
    hips: THREE.Object3D;
    spine: THREE.Object3D;
    head: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftForearm?: THREE.Object3D;
    rightForearm?: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftShin?: THREE.Object3D;
    rightShin?: THREE.Object3D;
  },
) {
  const idle = motion === 'idle';
  const target = idle ? pose(1.19, -1.19, 0, 0, 0, 0, 0, 0, 0, 0.006, 1.8) : GESTURES[style][motion];
  const wave = Math.sin(elapsed * target.speed);
  const follow = delta === 0 ? 1 : 1 - Math.exp(-7 * delta);
  const settle = (current: number, next: number) => current + (next - current) * follow;
  const move = motion === 'win' ? sampleVictoryDance(style, variant, elapsed) : null;
  const activity = idle ? 0.015 : 0.025;
  bones.leftArm.rotation.z = settle(bones.leftArm.rotation.z, target.left + activity * wave + (move?.leftZ ?? 0) * 1.5);
  bones.rightArm.rotation.z = settle(
    bones.rightArm.rotation.z,
    target.right - activity * wave + (move?.rightZ ?? 0) * 1.5,
  );
  bones.leftArm.rotation.x = settle(bones.leftArm.rotation.x, target.leftX + (move?.leftX ?? 0) * 1.35);
  bones.rightArm.rotation.x = settle(bones.rightArm.rotation.x, target.rightX + (move?.rightX ?? 0) * 1.35);
  bones.leftLeg.rotation.x = settle(
    bones.leftLeg.rotation.x,
    move ? move.leftLeg * 1.4 : motion === 'lose' ? 0.08 * wave : 0,
  );
  bones.rightLeg.rotation.x = settle(
    bones.rightLeg.rotation.x,
    move ? move.rightLeg * 1.4 : motion === 'lose' ? -0.08 * wave : 0,
  );
  if (bones.leftForearm)
    bones.leftForearm.rotation.x = settle(bones.leftForearm.rotation.x, move ? -0.25 + move.leftX * 0.55 : 0);
  if (bones.rightForearm)
    bones.rightForearm.rotation.x = settle(bones.rightForearm.rotation.x, move ? -0.25 + move.rightX * 0.55 : 0);
  if (bones.leftShin)
    bones.leftShin.rotation.x = settle(bones.leftShin.rotation.x, move ? Math.max(0, -move.leftLeg) * 0.8 : 0);
  if (bones.rightShin)
    bones.rightShin.rotation.x = settle(bones.rightShin.rotation.x, move ? Math.max(0, -move.rightLeg) * 0.8 : 0);
  bones.head.rotation.x = settle(bones.head.rotation.x, target.headX + 0.012 * wave);
  bones.head.rotation.z = settle(bones.head.rotation.z, target.headZ + 0.016 * wave + (move?.head ?? 0) * 1.2);
  bones.spine.rotation.x = settle(bones.spine.rotation.x, target.spineX);
  bones.spine.rotation.z = settle(bones.spine.rotation.z, target.spineZ + 0.01 * wave + (move?.torso ?? 0) * 1.2);
  bones.hips.rotation.y = settle(bones.hips.rotation.y, (move?.hipTurn ?? 0) * 1.5);
  bones.hips.position.x = settle(bones.hips.position.x, (move?.hipX ?? 0) * 1.5);
  bones.hips.position.y = restHipY + target.lift + (move?.hipY ?? target.bounce * wave) * 1.2;
}
