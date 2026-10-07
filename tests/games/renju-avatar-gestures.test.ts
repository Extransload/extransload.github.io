import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  MOTION_DURATIONS,
  sampleVictoryDance,
  updateVroidGesture,
  type DanceAvatar,
  type VroidGestureStyle,
} from '../../src/domains/games/renju/avatar-gestures';
import { DANCES, type DanceStyle } from '../../src/domains/games/renju/appearance';

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

  it('keeps every articulated channel finite, bounded and continuous through the loop', () => {
    for (const style of ['petal', ...styles] as const) {
      for (const variant of DANCES) {
        const duration = loopDuration(style, variant);
        const beginning = sampleVictoryDance(style, variant, 0);
        const before = sampleVictoryDance(style, variant, duration - 0.0001);
        const after = sampleVictoryDance(style, variant, duration + 0.0001);
        for (const [key, value] of Object.entries(beginning)) {
          expect(Number.isFinite(value), `${style}/${variant}/${key}`).toBe(true);
          expect(Math.abs(before[key as keyof typeof before]! - after[key as keyof typeof after]!)).toBeLessThan(0.002);
        }
        let maximum = 0;
        let minimumKnee = Infinity;
        let minimumElbow = Infinity;
        let highestHip = -Infinity;
        let ankleError = 0;
        for (let time = 0; time <= duration; time += 1 / 60) {
          const pose = sampleVictoryDance(style, variant, time);
          maximum = Math.max(maximum, ...Object.values(pose).map(Math.abs));
          minimumKnee = Math.min(minimumKnee, pose.leftKnee!, pose.rightKnee!);
          minimumElbow = Math.min(minimumElbow, pose.leftElbow!, pose.rightElbow!);
          highestHip = Math.max(highestHip, pose.hipY);
          // Thigh, negative knee flexion and ankle cancel, keeping the sole level.
          ankleError = Math.max(
            ankleError,
            Math.abs(pose.leftLeg - pose.leftKnee! + pose.leftAnkle!),
            Math.abs(pose.rightLeg - pose.rightKnee! + pose.rightAnkle!),
          );
        }
        // NaN and infinity also fail this range check.
        expect(maximum).toBeLessThan(1.6);
        expect(minimumKnee).toBeGreaterThanOrEqual(0);
        expect(minimumElbow).toBeGreaterThan(0.15);
        expect(highestHip).toBeLessThanOrEqual(0);
        expect(ankleError).toBeLessThan(1e-8);
      }
    }
  });

  it('authors distinct phrases with broader turns and longer held finales at upper tiers', () => {
    for (const style of ['petal', ...styles] as const) {
      const signatures = Object.entries(MOTION_DURATIONS).map(([variant, duration]) =>
        Array.from({ length: 48 }, (_, i) => sampleVictoryDance(style, variant as DanceStyle, (duration * i) / 48))
          .map((pose) =>
            [pose.leftZ, pose.rightZ, pose.hipTurn, pose.leftElbow, pose.torsoPitch].map((v) => v!.toFixed(3)),
          )
          .join('|'),
      );
      expect(new Set(signatures).size).toBe(5);
    }
    const turns = Object.entries(MOTION_DURATIONS).map(([variant, duration]) =>
      Math.max(
        ...Array.from({ length: 256 }, (_, i) =>
          Math.abs(sampleVictoryDance('luna', variant as DanceStyle, (duration * i) / 256).hipTurn),
        ),
      ),
    );
    for (let tier = 1; tier < turns.length; tier++) expect(turns[tier]).toBeGreaterThan(turns[tier - 1]);
    for (const [variant, held] of [
      ['constellation', [9.1, 9.8]],
      ['apotheosis', [10.1, 11.1]],
    ] as const) {
      expect(sampleVictoryDance('luna', variant, held[0])).toEqual(sampleVictoryDance('luna', variant, held[1]));
    }
  });

  it('starts authored phrases with lowered shoulders and reaches visibly different gathering and finale poses', () => {
    for (const [style, file] of [
      ['luna', 'luna'],
      ['apron', 'apron'],
      ['serin', 'ribbon'],
      ['serin', 'male-casual'],
      ['rose', 'male-tailored'],
    ] as const) {
      for (const variant of Object.keys(MOTION_DURATIONS) as (keyof typeof MOTION_DURATIONS)[]) {
        const { bones } = rigFromGlb(file);
        const rest = bones.hips.position.y;
        for (const time of [0, MOTION_DURATIONS[variant]]) {
          updateVroidGesture(style, 'win', variant, time, 0, rest, bones);
          expect(bones.leftArm.rotation.z).toBeGreaterThan(1.1);
          expect(bones.rightArm.rotation.z).toBeLessThan(-1.1);
        }
      }
      const { root, bones } = rigFromGlb(file);
      const rest = bones.hips.position.y;
      const handHeight = (time: number) => {
        updateVroidGesture(style, 'win', 'apotheosis', time, 0, rest, bones);
        root.updateMatrixWorld(true);
        return (
          (bones.leftHand.getWorldPosition(new THREE.Vector3()).y +
            bones.rightHand.getWorldPosition(new THREE.Vector3()).y) /
          2
        );
      };
      const resting = handHeight(0);
      const gathering = handHeight(6.4);
      const finale = handHeight(9.8);
      const bow = handHeight(14);
      const armLength = (bones.leftForearm.position.length() + bones.leftHand.position.length()) * root.scale.y;
      expect(finale - resting).toBeGreaterThan(armLength * 0.8);
      expect(finale - gathering).toBeGreaterThan(armLength * 0.6);
      expect(finale - bow).toBeGreaterThan(armLength * 0.7);
    }
  });

  it('bends VRoid elbows on their hinge axis and maintains a planted support foot on the real skeletons', () => {
    for (const [style, file] of [
      ['luna', 'luna'],
      ['apron', 'apron'],
      ['serin', 'ribbon'],
      ['serin', 'male-casual'],
      ['rose', 'male-tailored'],
    ] as const) {
      for (const variant of DANCES) {
        const { root, bones } = rigFromGlb(file);
        const restHipY = bones.hips.position.y;
        updateVroidGesture(style, 'idle', variant, 0, 0, restHipY, bones);
        root.updateMatrixWorld(true);
        const floor = Math.min(
          bones.leftFoot.getWorldPosition(new THREE.Vector3()).y,
          bones.rightFoot.getWorldPosition(new THREE.Vector3()).y,
        );
        let maxBend = 0;
        let maxWrist = 0;
        for (let time = 0; time < loopDuration(style, variant) * 2; time += 1 / 30) {
          updateVroidGesture(style, 'win', variant, time, 1 / 30, restHipY, bones);
          root.updateMatrixWorld(true);
          const left = bones.leftFoot.getWorldPosition(new THREE.Vector3());
          const right = bones.rightFoot.getWorldPosition(new THREE.Vector3());
          expect(Math.min(left.y, right.y), `${style}/${variant} at ${time}`).toBeCloseTo(floor, 6);
          expect(Math.max(left.y, right.y) - floor).toBeLessThan(0.2);
          expect(bones.leftForearm.rotation.x).toBeCloseTo(0, 6);
          expect(bones.rightForearm.rotation.x).toBeCloseTo(0, 6);
          expect(bones.leftForearm.rotation.y).toBeLessThan(0);
          expect(bones.rightForearm.rotation.y).toBeGreaterThan(0);
          maxBend = Math.max(maxBend, Math.abs(bones.leftForearm.rotation.y));
          maxWrist = Math.max(maxWrist, Math.abs(bones.leftHand.rotation.y));
          for (const bone of Object.values(bones)) expect(bone.quaternion.length()).toBeCloseTo(1, 6);
        }
        expect(maxBend).toBeGreaterThan(0.5);
        expect(maxWrist).toBeGreaterThan(0.035);
      }
    }
  }, 20_000);
});

function loopDuration(style: DanceAvatar, variant: DanceStyle) {
  return variant in MOTION_DURATIONS
    ? MOTION_DURATIONS[variant as keyof typeof MOTION_DURATIONS]
    : 16 / (style === 'rose' ? 1.7 : style === 'apron' ? 2.2 : 2);
}

// Read just the actual GLB skeleton; material/image loading is unnecessary for
// articulation and grounding checks. Bind offsets and hierarchy stay intact.
function rigFromGlb(file: string) {
  const bytes = readFileSync(new URL(`../../public/models/omokmaru/${file}.glb`, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    nodes: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
    scenes: { nodes: number[] }[];
    scene?: number;
  };
  const nodes = gltf.nodes.map((node) => {
    const object = new THREE.Object3D();
    object.name = node.name ?? '';
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node, index) => node.children?.forEach((child) => nodes[index].add(nodes[child])));
  const root = new THREE.Group();
  gltf.scenes[gltf.scene ?? 0].nodes.forEach((index) => root.add(nodes[index]));
  // A translated/scaled/turned stage must not change ground compensation.
  root.position.set(1.2, 0.15, -0.4);
  root.scale.setScalar(1.65);
  root.rotation.y = 0.6;
  const bone = (name: string) => root.getObjectByName(`J_Bip_${name}`)!;
  return {
    root,
    bones: {
      hips: bone('C_Hips'),
      spine: bone('C_Spine'),
      chest: bone('C_Chest'),
      head: bone('C_Head'),
      leftArm: bone('L_UpperArm'),
      rightArm: bone('R_UpperArm'),
      leftForearm: bone('L_LowerArm'),
      rightForearm: bone('R_LowerArm'),
      leftHand: bone('L_Hand'),
      rightHand: bone('R_Hand'),
      leftLeg: bone('L_UpperLeg'),
      rightLeg: bone('R_UpperLeg'),
      leftShin: bone('L_LowerLeg'),
      rightShin: bone('R_LowerLeg'),
      leftFoot: bone('L_Foot'),
      rightFoot: bone('R_Foot'),
    },
  };
}
