import * as THREE from 'three';
import type { AvatarMotion } from './petal-avatar';
import type { DanceStyle } from './appearance';
import { MOTION_DURATIONS, sampleTierVictoryDance, type TierDanceStyle } from './tier-choreography';

export { MOTION_DURATIONS } from './tier-choreography';

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

export type Dance = {
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
  torsoPitch?: number;
  headPitch?: number;
  chestPitch?: number;
  leftElbow?: number;
  rightElbow?: number;
  leftWrist?: number;
  rightWrist?: number;
  leftWristZ?: number;
  rightWristZ?: number;
  leftKnee?: number;
  rightKnee?: number;
  leftAnkle?: number;
  rightAnkle?: number;
  leftLegZ?: number;
  rightLegZ?: number;
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
const KEYS = [
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
] as const;
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

function samplePhrase(style: DanceAvatar, variant: DanceStyle, time: number): Dance {
  if (variant in MOTION_DURATIONS) return sampleTierVictoryDance(style, variant as TierDanceStyle, time);
  const pace = style === 'rose' ? 1.7 : style === 'apron' ? 2.2 : 2;
  const count = (((time * pace) % 16) + 16) % 16;
  const index = Math.floor(count);
  const phase = count - index;
  const blend = phase * phase * (3 - 2 * phase);
  const from = atCount(style, variant, index);
  const to = atCount(style, variant, (index + 1) % 16);
  const sampled = Object.fromEntries(KEYS.map((key) => [key, from[key] + (to[key] - from[key]) * blend])) as Dance;
  sampled.hipY += Math.sin(phase * Math.PI) * (variant === 'encore' ? 0.055 : 0.035);
  return sampled;
}

/** Anatomical channels: elbows and knees are positive flexion magnitudes.
 * VRoid elbow hinges are local Y (its arm bones extend along X); knees are -X.
 * A rig with different bind axes, such as Petal, retargets these magnitudes.
 */
export function sampleVictoryDance(style: DanceAvatar, variant: DanceStyle, time: number): Dance {
  const move = samplePhrase(style, variant, time);
  const elbowLead = samplePhrase(style, variant, time - 0.11);
  const wristLead = samplePhrase(style, variant, time - 0.22);
  const clamp = THREE.MathUtils.clamp;
  const leftIntent = move.leftLeg;
  const rightIntent = move.rightLeg;
  const lift = move.hipY;
  move.hipX *= 0.32;
  // Keep the pelvis below its straight-leg height. A supporting knee absorbs
  // weight while the other foot lifts; raising the whole rig caused hovering.
  move.hipY = -0.006 - Math.max(0, lift) * 0.045;
  move.hipTurn *= 0.72;
  const leg = (intent: number, other: number) => {
    const upper = 0.386;
    const lower = 0.442;
    const swing = Math.max(0, intent - other);
    const soleLift = Math.min(0.045, swing * 0.09);
    const forward = intent * 0.2;
    const height = upper + lower + move.hipY - soleLift;
    const distance = Math.min(upper + lower - 0.001, Math.hypot(height, forward));
    const knee = Math.acos(clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
    const thigh =
      Math.atan2(forward, height) +
      Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1));
    return { thigh, knee, ankle: knee - thigh };
  };
  const left = leg(leftIntent, rightIntent);
  const right = leg(rightIntent, leftIntent);
  move.leftLeg = left.thigh;
  move.rightLeg = right.thigh;
  move.leftKnee = left.knee;
  move.rightKnee = right.knee;
  move.leftAnkle = left.ankle;
  move.rightAnkle = right.ankle;
  move.leftLegZ = move.rightLegZ = Math.atan2(-move.hipX, 0.82);
  // Distal joints follow the phrase a fraction later. They have independent
  // bend/flex channels instead of being rigid copies of shoulder rotation.
  move.leftElbow = clamp(0.32 - elbowLead.leftX * 0.68 + elbowLead.leftZ * 0.14, 0.2, 1.05);
  move.rightElbow = clamp(0.32 - elbowLead.rightX * 0.68 - elbowLead.rightZ * 0.14, 0.2, 1.05);
  move.leftWrist = clamp(-wristLead.leftX * 0.12 + wristLead.torso * 0.12, -0.14, 0.17);
  move.rightWrist = clamp(-wristLead.rightX * 0.12 - wristLead.torso * 0.12, -0.14, 0.17);
  move.leftWristZ = clamp(wristLead.leftZ * 0.12, -0.15, 0.15);
  move.rightWristZ = clamp(wristLead.rightZ * 0.12, -0.15, 0.15);
  move.torso *= 0.52;
  move.head *= 0.65;
  move.torsoPitch ??= -0.02 + (leftIntent + rightIntent) * 0.06;
  move.chestPitch = move.torsoPitch * 0.34 - elbowLead.hipY * 0.16;
  move.headPitch ??= -move.torsoPitch * 0.45;
  return move;
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
    chest?: THREE.Object3D;
    head: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftForearm?: THREE.Object3D;
    rightForearm?: THREE.Object3D;
    leftHand?: THREE.Object3D;
    rightHand?: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftShin?: THREE.Object3D;
    rightShin?: THREE.Object3D;
    leftFoot?: THREE.Object3D;
    rightFoot?: THREE.Object3D;
  },
) {
  const ground = bones.leftFoot && bones.rightFoot ? supportGround(bones.hips, bones.leftFoot, bones.rightFoot) : null;
  const idle = motion === 'idle';
  const authoredPhrase = motion === 'win' && variant in MOTION_DURATIONS;
  // Tier phrases start and finish with lowered arms. Adding them to a raised
  // victory preset erased their gathers, openings and bows into one V pose.
  const target = idle || authoredPhrase ? pose(1.19, -1.19, 0, 0, 0, 0, 0, 0, 0, 0.006, 1.8) : GESTURES[style][motion];
  const wave = Math.sin(elapsed * target.speed);
  const move = motion === 'win' ? sampleVictoryDance(style, variant, elapsed) : null;
  const activity = idle || authoredPhrase ? 0.015 : 0.025;
  const leftReach = move?.leftZ ?? 0;
  const rightReach = move?.rightZ ?? 0;
  // Negative-left / positive-right counts open the arms. The opposite counts
  // gather them in front of the torso with bent elbows, not behind the hips.
  const leftShoulder = authoredPhrase ? (leftReach < 0 ? leftReach * 3 : -leftReach * 1.5) : leftReach * 0.72;
  const rightShoulder = authoredPhrase ? (rightReach > 0 ? rightReach * 3 : -rightReach * 1.5) : rightReach * 0.72;
  const follow = delta === 0 ? 1 : 1 - Math.exp(-9 * delta);
  const clamp = THREE.MathUtils.clamp;
  const rotation = (bone: THREE.Object3D | undefined, x: number, y: number, z: number, rate = 9) => {
    if (!bone) return;
    gestureEuler.set(x, y, z);
    gestureQuaternion.setFromEuler(gestureEuler);
    bone.quaternion.slerp(gestureQuaternion, delta === 0 ? 1 : 1 - Math.exp(-rate * delta));
  };
  // All VRoid bind rotations here are identity. Arm bones point along ±X:
  // Z lifts the shoulder, Y brings the arm forward, X is only gentle roll.
  rotation(
    bones.leftArm,
    (move?.torso ?? 0) * 0.2,
    clamp(target.leftX * 0.45 + (move?.leftX ?? 0) * 0.64, -0.88, 0.24),
    clamp(target.left + activity * wave + leftShoulder, -1.08, 1.36),
  );
  rotation(
    bones.rightArm,
    -(move?.torso ?? 0) * 0.2,
    clamp(-target.rightX * 0.45 - (move?.rightX ?? 0) * 0.64, -0.24, 0.88),
    clamp(target.right - activity * wave + rightShoulder, -1.36, 1.08),
  );
  rotation(bones.leftForearm, 0, -(move?.leftElbow ?? (idle ? 0.12 : 0.32)), 0, 11);
  rotation(bones.rightForearm, 0, move?.rightElbow ?? (idle ? 0.12 : 0.32), 0, 11);
  rotation(bones.leftHand, 0, -(move?.leftWrist ?? 0), move?.leftWristZ ?? 0, 13);
  rotation(bones.rightHand, 0, move?.rightWrist ?? 0, move?.rightWristZ ?? 0, 13);
  rotation(bones.leftLeg, move?.leftLeg ?? 0, 0, move?.leftLegZ ?? 0, 12);
  rotation(bones.rightLeg, move?.rightLeg ?? 0, 0, move?.rightLegZ ?? 0, 12);
  rotation(bones.leftShin, -(move?.leftKnee ?? 0), 0, 0, 12);
  rotation(bones.rightShin, -(move?.rightKnee ?? 0), 0, 0, 12);
  rotation(bones.leftFoot, move?.leftAnkle ?? 0, 0, -(move?.leftLegZ ?? 0), 12);
  rotation(bones.rightFoot, move?.rightAnkle ?? 0, 0, -(move?.rightLegZ ?? 0), 12);
  rotation(
    bones.head,
    target.headX + 0.012 * wave + (move?.headPitch ?? 0),
    -(move?.hipTurn ?? 0) * 0.13,
    target.headZ + 0.016 * wave + (move?.head ?? 0),
    7,
  );
  rotation(
    bones.spine,
    target.spineX * 0.55 + (move?.torsoPitch ?? 0),
    0,
    target.spineZ + 0.01 * wave + (move?.torso ?? 0),
  );
  rotation(bones.chest, move?.chestPitch ?? 0, -(move?.hipTurn ?? 0) * 0.12, -(move?.torso ?? 0) * 0.22, 8);
  rotation(bones.hips, 0, move?.hipTurn ?? 0, 0);
  bones.hips.position.x += ((move?.hipX ?? 0) - bones.hips.position.x) * follow;
  const hipY = restHipY + (move ? move.hipY : target.lift + target.bounce * wave);
  bones.hips.position.y += (hipY - bones.hips.position.y) * follow;
  if (ground && bones.leftFoot && bones.rightFoot) {
    // Preserve the support foot's floor height after articulation. Measuring in
    // the hip parent's space makes this independent of stage scale/placement.
    const lowest = footFloor(bones.hips, bones.leftFoot, bones.rightFoot, ground);
    bones.hips.position.y += ground.floor - lowest;
    bones.hips.updateWorldMatrix(false, true);
  }
}

const gestureEuler = new THREE.Euler();
const gestureQuaternion = new THREE.Quaternion();

type SupportGround = { floor: number; inverse: THREE.Matrix4; left: THREE.Vector3; right: THREE.Vector3 };
const supportGrounds = new WeakMap<THREE.Object3D, SupportGround>();

function footFloor(hips: THREE.Object3D, left: THREE.Object3D, right: THREE.Object3D, ground: SupportGround) {
  hips.updateWorldMatrix(true, true);
  ground.inverse.copy(hips.parent?.matrixWorld ?? identityMatrix).invert();
  left.getWorldPosition(ground.left).applyMatrix4(ground.inverse);
  right.getWorldPosition(ground.right).applyMatrix4(ground.inverse);
  return Math.min(ground.left.y, ground.right.y);
}

function supportGround(hips: THREE.Object3D, left: THREE.Object3D, right: THREE.Object3D) {
  let ground = supportGrounds.get(hips);
  if (!ground) {
    ground = { floor: 0, inverse: new THREE.Matrix4(), left: new THREE.Vector3(), right: new THREE.Vector3() };
    ground.floor = footFloor(hips, left, right, ground);
    supportGrounds.set(hips, ground);
  }
  return ground;
}

const identityMatrix = new THREE.Matrix4();
