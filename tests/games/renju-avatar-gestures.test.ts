import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateVroidGesture, type VroidGestureStyle } from '../../src/domains/games/renju/avatar-gestures';

const styles: VroidGestureStyle[] = ['luna', 'apron', 'rose', 'serin'];

function frame(style: VroidGestureStyle, motion: 'win' | 'lose', elapsed: number) {
  const bones = {
    hips: new THREE.Object3D(),
    spine: new THREE.Object3D(),
    head: new THREE.Object3D(),
    leftArm: new THREE.Object3D(),
    rightArm: new THREE.Object3D(),
    leftLeg: new THREE.Object3D(),
    rightLeg: new THREE.Object3D(),
  };
  updateVroidGesture(style, motion, elapsed, 0, 0, bones);
  return [
    bones.leftArm.rotation.z,
    bones.rightArm.rotation.z,
    bones.leftArm.rotation.x,
    bones.rightArm.rotation.x,
    bones.head.rotation.x,
    bones.head.rotation.z,
    bones.spine.rotation.x,
    bones.spine.rotation.z,
    bones.hips.position.y,
    bones.hips.position.x,
    bones.hips.rotation.y,
    bones.leftLeg.rotation.x,
    bones.rightLeg.rotation.x,
  ].map((value) => Number(value.toFixed(3)));
}

describe('VRoid avatar outcome gestures', () => {
  for (const motion of ['win', 'lose'] as const) {
    it(`gives every avatar a distinct, continuing ${motion} gesture`, () => {
      const poses = styles.map((style) => frame(style, motion, 0).join(','));
      expect(new Set(poses).size).toBe(styles.length);
      for (const style of styles) expect(frame(style, motion, 0.5)).not.toEqual(frame(style, motion, 0));
    });
  }
});
