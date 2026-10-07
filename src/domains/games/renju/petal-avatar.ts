import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { sampleVictoryDance } from './avatar-gestures';
import type { DanceStyle } from './appearance';

export type AvatarMotion = 'idle' | 'win' | 'lose';
let source: Promise<GLTF> | undefined;

// Share immutable geometry/textures, but give each seat its own skeleton and mixer.
export function loadAvatarSource() {
  source ??= new GLTFLoader().loadAsync('/models/omokmaru/petal.glb').catch((error) => {
    source = undefined;
    throw error;
  });
  return source;
}

export async function loadPetalAvatar() {
  return new PetalAvatar(await loadAvatarSource());
}

export class PetalAvatar {
  readonly root = new THREE.Group();
  readonly accessoryTransform = new THREE.Matrix4();
  private mixer: THREE.AnimationMixer;
  private actions: Record<AvatarMotion, THREE.AnimationAction>;
  private active?: THREE.AnimationAction;
  private head?: THREE.Object3D;
  private headRestInverse = new THREE.Matrix4();
  private parentInverse = new THREE.Matrix4();
  private danceBones: Record<string, THREE.Object3D | undefined> = {};
  private danceRest = new Map<THREE.Object3D, { rotation: THREE.Euler; position: THREE.Vector3 }>();
  private elapsed = 0;
  private readonly jointOffset = new THREE.Quaternion();
  private readonly jointAngles = new THREE.Euler();
  motion: AvatarMotion = 'idle';
  dance: DanceStyle = 'signature';

  constructor(gltf: GLTF) {
    const model = clone(gltf.scene);
    this.root.name = 'petal';
    this.root.add(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = 2.85 / bounds.getSize(new THREE.Vector3()).y;
    this.root.scale.setScalar(scale);
    this.root.position.y = 0.08 - bounds.min.y * scale;
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = false;
        object.frustumCulled = false;
      }
    });
    this.head = model.getObjectByName('Head');
    for (const name of [
      'Hips',
      'Spine',
      'Chest',
      'Head',
      'UpperArm.L',
      'UpperArm.R',
      'Forearm.L',
      'Forearm.R',
      'Hand.L',
      'Hand.R',
      'Thigh.L',
      'Thigh.R',
      'Shin.L',
      'Shin.R',
      'Foot.L',
      'Foot.R',
    ]) {
      const bone = model.getObjectByName(name);
      this.danceBones[name] = bone;
      if (bone) this.danceRest.set(bone, { rotation: bone.rotation.clone(), position: bone.position.clone() });
    }
    this.root.updateMatrixWorld(true);
    if (this.head) this.headRestInverse.copy(this.head.matrixWorld).invert();
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = Object.fromEntries(
      (['idle', 'win', 'lose'] as const).map((name) => {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (!clip) throw new Error(`Missing Petal animation: ${name}`);
        return [name, this.mixer.clipAction(clip)];
      }),
    ) as Record<AvatarMotion, THREE.AnimationAction>;
    this.play('idle');
  }

  play(motion: AvatarMotion, dance: DanceStyle = this.dance) {
    if (this.motion !== motion || this.dance !== dance) this.elapsed = 0;
    this.motion = motion;
    this.dance = dance;
    const next = this.actions[motion];
    if (next === this.active) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    this.active?.crossFadeTo(next, 0.25, false);
    this.active = next;
  }

  update(delta: number) {
    this.elapsed += delta;
    for (const [bone, rest] of this.danceRest) {
      bone.rotation.copy(rest.rotation);
      bone.position.copy(rest.position);
    }
    this.mixer.update(delta);
    if (this.motion === 'win') {
      const move = sampleVictoryDance('petal', this.dance, this.elapsed);
      // The baked clip supplies the relaxed posture. Apply modest local joint offsets
      // with quaternions so the rig's rotated bind axes never hit Euler singularities.
      const joint = (name: string, x = 0, y = 0, z = 0) => {
        const bone = this.danceBones[name];
        if (!bone) return;
        this.jointOffset.setFromEuler(this.jointAngles.set(x, y, z));
        bone.quaternion.multiply(this.jointOffset);
      };
      joint('UpperArm.L', move.leftX * 0.5, 0, move.leftZ * 0.65);
      joint('UpperArm.R', move.rightX * 0.5, 0, move.rightZ * 0.65);
      joint('Forearm.L', -(move.leftElbow ?? 0.25) * 0.65);
      joint('Forearm.R', -(move.rightElbow ?? 0.25) * 0.65);
      joint('Hand.L', move.leftWrist ?? 0, 0, move.leftWristZ ?? 0);
      joint('Hand.R', move.rightWrist ?? 0, 0, move.rightWristZ ?? 0);
      joint('Thigh.L', move.leftLeg * 0.6, 0, move.leftLegZ ?? 0);
      joint('Thigh.R', move.rightLeg * 0.6, 0, move.rightLegZ ?? 0);
      joint('Shin.L', (move.leftKnee ?? 0) * 0.6);
      joint('Shin.R', (move.rightKnee ?? 0) * 0.6);
      joint('Foot.L', -(move.leftAnkle ?? 0) * 0.6);
      joint('Foot.R', -(move.rightAnkle ?? 0) * 0.6);
      joint('Spine', (move.torsoPitch ?? 0) * 0.7, 0, move.torso * 0.65);
      joint('Chest', (move.chestPitch ?? 0) * 0.8);
      joint('Head', move.headPitch ?? 0, 0, move.head * 0.7);
      joint('Hips', 0, move.hipTurn * 0.65);
      const hips = this.danceBones.Hips;
      if (hips) {
        hips.position.x += move.hipX;
        hips.position.y += move.hipY;
      }
    }
    if (this.head) {
      this.root.updateWorldMatrix(true, true);
      this.parentInverse.copy(this.root.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
      this.accessoryTransform.copy(this.parentInverse).multiply(this.head.matrixWorld).multiply(this.headRestInverse);
    }
  }
}
