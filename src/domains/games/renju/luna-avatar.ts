import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { updateVroidGesture } from './avatar-gestures';
import type { AvatarMotion } from './petal-avatar';

let source: Promise<GLTF> | undefined;

function loadLunaSource() {
  source ??= new GLTFLoader().loadAsync('/models/omokmaru/luna.glb').catch((error) => {
    source = undefined;
    throw error;
  });
  return source;
}

export async function loadLunaAvatar() {
  return new LunaAvatar(await loadLunaSource());
}

export class LunaAvatar {
  readonly root = new THREE.Group();
  private readonly hips: THREE.Object3D;
  private readonly spine: THREE.Object3D;
  private readonly head: THREE.Object3D;
  private readonly leftArm: THREE.Object3D;
  private readonly rightArm: THREE.Object3D;
  private readonly leftLeg: THREE.Object3D;
  private readonly rightLeg: THREE.Object3D;
  private readonly restHipY: number;
  private elapsed = 0;
  motion: AvatarMotion = 'idle';

  constructor(gltf: GLTF) {
    const model = clone(gltf.scene);
    this.root.name = 'luna';
    this.root.add(model);
    // VRoid avatars face -Z; the Omokmaru stage faces +Z.
    model.rotation.y = Math.PI;
    this.hips = this.bone(model, 'J_Bip_C_Hips');
    this.spine = this.bone(model, 'J_Bip_C_Spine');
    this.head = this.bone(model, 'J_Bip_C_Head');
    this.leftArm = this.bone(model, 'J_Bip_L_UpperArm');
    this.rightArm = this.bone(model, 'J_Bip_R_UpperArm');
    this.leftLeg = this.bone(model, 'J_Bip_L_UpperLeg');
    this.rightLeg = this.bone(model, 'J_Bip_R_UpperLeg');
    this.restHipY = this.hips.position.y;

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = false;
      object.frustumCulled = false;
      const material = object.material;
      if (!material || Array.isArray(material)) return;
      object.material = material.clone();
      object.material.toneMapped = false;
      if (!material.name.includes('HAIR')) return;
      const hair = object.material;
      hair.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          '#include <map_fragment>\n float lunaHairLight = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.31, 0.44) * mix(0.75, 1.2, lunaHairLight), 0.78);',
        );
      };
      hair.customProgramCacheKey = () => 'luna-rose-hair';
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = 2.85 / bounds.getSize(new THREE.Vector3()).y;
    this.root.scale.setScalar(scale);
    this.root.position.y = 0.08 - bounds.min.y * scale;
    this.update(0);
  }

  private bone(model: THREE.Object3D, name: string) {
    const bone = model.getObjectByName(name);
    if (!bone) throw new Error(`Missing Luna bone: ${name}`);
    return bone;
  }

  play(motion: AvatarMotion) {
    if (this.motion !== motion) this.elapsed = 0;
    this.motion = motion;
  }

  update(delta: number) {
    this.elapsed += delta;
    updateVroidGesture('luna', this.motion, this.elapsed, delta, this.restHipY, {
      hips: this.hips,
      spine: this.spine,
      head: this.head,
      leftArm: this.leftArm,
      rightArm: this.rightArm,
      leftLeg: this.leftLeg,
      rightLeg: this.rightLeg,
    });
  }
}
