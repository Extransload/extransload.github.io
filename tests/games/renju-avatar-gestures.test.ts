import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  sampleVictoryDance,
  updateVroidGesture,
  type DanceAvatar,
  type VroidGestureStyle,
} from '../../src/domains/games/renju/avatar-gestures';

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
  updateVroidGesture(style, motion, 'signature', elapsed, 0, 0, bones);
  return [
    bones.leftArm.rotation.z,
    bones.rightArm.rotation.z,
    bones.leftArm.rotation.x,
    bones.rightArm.rotation.x,
    bones.head.rotation.z,
    bones.spine.rotation.z,
    bones.hips.position.y,
    bones.hips.position.x,
    bones.hips.rotation.y,
    bones.leftLeg.rotation.x,
    bones.rightLeg.rotation.x,
  ].map((value) => Number(value.toFixed(3)));
}

describe('avatar choreography', () => {
  it('has distinct multi-count routines for every avatar and both dance choices', () => {
    const all: DanceAvatar[] = ['petal', ...styles];
    for (const variant of ['signature', 'encore'] as const) {
      const routines = all.map((style) =>
        Array.from({ length: 16 }, (_, count) => sampleVictoryDance(style, variant, count / 2)).map((pose) =>
          [pose.leftZ, pose.rightZ, pose.leftLeg, pose.rightLeg, pose.hipTurn].map((x) => x.toFixed(2)).join(','),
        ),
      );
      expect(new Set(routines.map((steps) => steps.join('|'))).size).toBe(all.length);
      for (const steps of routines) expect(new Set(steps).size).toBeGreaterThanOrEqual(10);
    }
    for (const style of all)
      expect(sampleVictoryDance(style, 'signature', 1)).not.toEqual(sampleVictoryDance(style, 'encore', 1));
  });

  it('keeps each losing gesture distinct from its multi-step victory dance', () => {
    expect(new Set(styles.map((style) => frame(style, 'lose', 0).join(','))).size).toBe(styles.length);
    for (const style of styles) {
      expect(frame(style, 'win', 2)).not.toEqual(frame(style, 'win', 0));
      expect(frame(style, 'lose', 0.5)).not.toEqual(frame(style, 'lose', 0));
    }
  });
});
