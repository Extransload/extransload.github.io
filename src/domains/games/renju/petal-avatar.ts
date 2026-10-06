import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export type AvatarMotion = 'idle' | 'win' | 'lose';
let source: Promise<GLTF> | undefined;

// Share immutable geometry/textures, but give each seat its own skeleton and mixer.
export async function loadPetalAvatar() {
  source ??= new GLTFLoader().loadAsync('/models/omokmaru/petal.glb').catch((error) => {
    source = undefined;
    throw error;
  });
  return new PetalAvatar(await source);
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
  motion: AvatarMotion = 'idle';

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

  play(motion: AvatarMotion) {
    const next = this.actions[motion];
    if (next === this.active) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    this.active?.crossFadeTo(next, 0.25, false);
    this.active = next;
    this.motion = motion;
  }

  update(delta: number) {
    this.mixer.update(delta);
    if (this.head) {
      this.root.updateWorldMatrix(true, true);
      this.parentInverse.copy(this.root.parent?.matrixWorld ?? new THREE.Matrix4()).invert();
      this.accessoryTransform.copy(this.parentInverse).multiply(this.head.matrixWorld).multiply(this.headRestInverse);
    }
  }
}
