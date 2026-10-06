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
      'Head',
      'UpperArm.L',
      'UpperArm.R',
      'Forearm.L',
      'Forearm.R',
      'Thigh.L',
      'Thigh.R',
      'Shin.L',
      'Shin.R',
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
      const bone = (name: string) => this.danceBones[name];
      const leftArm = bone('UpperArm.L');
      const rightArm = bone('UpperArm.R');
      const hips = bone('Hips');
      if (leftArm) {
        leftArm.rotation.z += move.leftZ * 1.6;
        leftArm.rotation.x += move.leftX * 1.4;
      }
      if (rightArm) {
        rightArm.rotation.z += move.rightZ * 1.6;
        rightArm.rotation.x += move.rightX * 1.4;
      }
      if (bone('Forearm.L')) bone('Forearm.L')!.rotation.x += -0.25 + move.leftX * 0.5;
      if (bone('Forearm.R')) bone('Forearm.R')!.rotation.x += -0.25 + move.rightX * 0.5;
      if (bone('Thigh.L')) bone('Thigh.L')!.rotation.x += move.leftLeg;
      if (bone('Thigh.R')) bone('Thigh.R')!.rotation.x += move.rightLeg;
      if (bone('Shin.L')) bone('Shin.L')!.rotation.x += Math.max(0, -move.leftLeg) * 0.7;
      if (bone('Shin.R')) bone('Shin.R')!.rotation.x += Math.max(0, -move.rightLeg) * 0.7;
      if (hips) {
        hips.position.x += move.hipX;
        hips.position.y += move.hipY;
        hips.rotation.y += move.hipTurn;
      }
      if (bone('Spine')) bone('Spine')!.rotation.z += move.torso;
      if (this.head) this.head.rotation.z += move.head;
    }
    if (this.head) {
      this.root.updateWorldMatrix(true, true);
      this.parentInverse.copy(this.root.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
      this.accessoryTransform.copy(this.parentInverse).multiply(this.head.matrixWorld).multiply(this.headRestInverse);
    }
  }
}
