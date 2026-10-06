import * as THREE from 'three';
import type { AvatarMotion } from './petal-avatar';

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

function dance(style: VroidGestureStyle, time: number): Dance {
  const beat = (speed: number, offset = 0) => Math.sin(time * speed + offset);
  const hop = (speed: number) => Math.max(0, beat(speed));
  switch (style) {
    case 'luna': {
      // Paw steps: alternating knees and playful double paw punches.
      const step = beat(6.5);
      return {
        leftZ: -0.3 * step,
        rightZ: 0.3 * step,
        leftX: 0.48 * hop(6.5),
        rightX: 0.48 * hop(6.5 + 0.8),
        leftLeg: 0.35 * step,
        rightLeg: -0.35 * step,
        hipX: 0.08 * step,
        hipY: 0.085 * hop(13),
        hipTurn: 0.15 * beat(3.25),
        torso: 0.13 * step,
        head: -0.1 * step,
      };
    }
    case 'apron': {
      // Heel taps and a clap on every other beat.
      const step = beat(5.2);
      const clap = hop(5.2);
      return {
        leftZ: -0.38 * clap,
        rightZ: 0.38 * clap,
        leftX: -0.36 * clap,
        rightX: -0.36 * clap,
        leftLeg: 0.28 * hop(5.2),
        rightLeg: 0.28 * hop(5.2 + Math.PI),
        hipX: 0.12 * step,
        hipY: 0.045 * clap,
        hipTurn: -0.14 * step,
        torso: 0.14 * step,
        head: 0.09 * step,
      };
    }
    case 'rose': {
      // Slower waltz, sweeping arms, and a three-count turn.
      const step = beat(3.6);
      return {
        leftZ: -0.24 * beat(3.6, 1),
        rightZ: 0.42 * step,
        leftX: 0.25 * step,
        rightX: -0.25 * step,
        leftLeg: 0.29 * step,
        rightLeg: -0.29 * step,
        hipX: 0.15 * step,
        hipY: 0.055 * hop(7.2),
        hipTurn: 0.35 * beat(1.8),
        torso: 0.22 * step,
        head: -0.15 * step,
      };
    }
    case 'serin': {
      // A two-step groove with alternating heel lifts and crossing arm sweeps.
      const step = beat(5.1);
      return {
        leftZ: -0.53 * step,
        rightZ: 0.48 * beat(5.1, Math.PI / 2),
        leftX: -0.3 * beat(5.1, 0.8),
        rightX: 0.3 * beat(5.1, 0.8),
        leftLeg: 0.38 * Math.max(0, step),
        rightLeg: 0.38 * Math.max(0, -step),
        hipX: 0.17 * step,
        hipY: 0.07 * hop(10.2),
        hipTurn: -0.26 * beat(2.55),
        torso: 0.2 * beat(5.1, 0.7),
        head: -0.13 * step,
      };
    }
  }
}

export function updateVroidGesture(
  style: VroidGestureStyle,
  motion: AvatarMotion,
  elapsed: number,
  delta: number,
  restHipY: number,
  bones: {
    hips: THREE.Object3D;
    spine: THREE.Object3D;
    head: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
  },
) {
  const idle = motion === 'idle';
  const target = idle ? pose(1.19, -1.19, 0, 0, 0, 0, 0, 0, 0, 0.006, 1.8) : GESTURES[style][motion];
  const wave = Math.sin(elapsed * target.speed);
  const follow = delta === 0 ? 1 : 1 - Math.exp(-7 * delta);
  const settle = (current: number, next: number) => current + (next - current) * follow;
  const move = motion === 'win' ? dance(style, elapsed) : null;
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
  bones.head.rotation.x = settle(bones.head.rotation.x, target.headX + 0.012 * wave);
  bones.head.rotation.z = settle(bones.head.rotation.z, target.headZ + 0.016 * wave + (move?.head ?? 0) * 1.2);
  bones.spine.rotation.x = settle(bones.spine.rotation.x, target.spineX);
  bones.spine.rotation.z = settle(bones.spine.rotation.z, target.spineZ + 0.01 * wave + (move?.torso ?? 0) * 1.2);
  bones.hips.rotation.y = settle(bones.hips.rotation.y, (move?.hipTurn ?? 0) * 1.5);
  bones.hips.position.x = settle(bones.hips.position.x, (move?.hipX ?? 0) * 1.5);
  bones.hips.position.y = restHipY + target.lift + (move?.hipY ?? target.bounce * wave) * 1.2;
}
