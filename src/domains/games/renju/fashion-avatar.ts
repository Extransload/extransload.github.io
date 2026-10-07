import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { updateVroidGesture } from './avatar-gestures';
import type { AvatarMotion } from './petal-avatar';
import type { DanceStyle } from './appearance';
import { TIER_AVATAR_LOOKS, TierAvatarAccessories, tailorTierGarment } from './tier-avatar';
import { MALE_AVATARS, MALE_AVATAR_LOOKS, MaleAvatarWardrobe, isMaleAvatar, tailorMaleBase } from './male-avatar';
import { AURELIA_LOOK, AureliaWardrobe, tailorAureliaBodice } from './aurelia-avatar';
import { repairLunaSkinTexture } from './luna-skin';

export const FASHION_AVATARS = [...MALE_AVATARS, 'seraphine', 'aurelia'] as const;
export type FashionStyle = (typeof FASHION_AVATARS)[number];
const LOOKS = { ...MALE_AVATAR_LOOKS, seraphine: TIER_AVATAR_LOOKS.seraphine, aurelia: AURELIA_LOOK };
const source = new Map<string, Promise<GLTF>>();

export function loadVroidSource(url: string) {
  let loaded = source.get(url);
  if (!loaded) {
    loaded = new GLTFLoader().loadAsync(url).catch((error) => {
      source.delete(url);
      throw error;
    });
    source.set(url, loaded);
  }
  return loaded;
}

export async function loadFashionAvatar(style: FashionStyle) {
  return new FashionAvatar(style, await loadVroidSource(LOOKS[style].source));
}

export class FashionAvatar {
  readonly root = new THREE.Group();
  private readonly hips: THREE.Object3D;
  private readonly spine: THREE.Object3D;
  readonly head: THREE.Object3D;
  private readonly accessories: TierAvatarAccessories | MaleAvatarWardrobe | AureliaWardrobe;
  private readonly leftArm: THREE.Object3D;
  private readonly rightArm: THREE.Object3D;
  private readonly leftForearm: THREE.Object3D;
  private readonly rightForearm: THREE.Object3D;
  private readonly leftLeg: THREE.Object3D;
  private readonly rightLeg: THREE.Object3D;
  private readonly leftShin: THREE.Object3D;
  private readonly rightShin: THREE.Object3D;
  private readonly articulation: {
    chest?: THREE.Object3D;
    leftHand?: THREE.Object3D;
    rightHand?: THREE.Object3D;
    leftFoot?: THREE.Object3D;
    rightFoot?: THREE.Object3D;
  };
  private readonly restHipY: number;
  private elapsed = 0;
  motion: AvatarMotion = 'idle';
  dance: DanceStyle = 'signature';

  constructor(
    readonly style: FashionStyle,
    gltf: GLTF,
  ) {
    const model = clone(gltf.scene);
    this.root.name = style;
    this.root.add(model);
    model.rotation.y = Math.PI;
    const bone = (name: string) => {
      const found = model.getObjectByName(name);
      if (!found) throw new Error(`Missing ${style} bone: ${name}`);
      return found;
    };
    this.hips = bone('J_Bip_C_Hips');
    this.spine = bone('J_Bip_C_Spine');
    this.head = bone('J_Bip_C_Head');
    this.leftArm = bone('J_Bip_L_UpperArm');
    this.rightArm = bone('J_Bip_R_UpperArm');
    this.leftForearm = bone('J_Bip_L_LowerArm');
    this.rightForearm = bone('J_Bip_R_LowerArm');
    this.leftLeg = bone('J_Bip_L_UpperLeg');
    this.rightLeg = bone('J_Bip_R_UpperLeg');
    this.leftShin = bone('J_Bip_L_LowerLeg');
    this.rightShin = bone('J_Bip_R_LowerLeg');
    this.articulation = {
      chest: model.getObjectByName('J_Bip_C_Chest'),
      leftHand: model.getObjectByName('J_Bip_L_Hand'),
      rightHand: model.getObjectByName('J_Bip_R_Hand'),
      leftFoot: model.getObjectByName('J_Bip_L_Foot'),
      rightFoot: model.getObjectByName('J_Bip_R_Foot'),
    };
    this.restHipY = this.hips.position.y;
    const originalBounds = new THREE.Box3().setFromObject(model);
    const modelHeight = originalBounds.getSize(new THREE.Vector3()).y;
    const male = isMaleAvatar(style);

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = false;
      object.frustumCulled = false;
      const material = object.material;
      if (!material || Array.isArray(material)) return;
      if (male && material.name.includes('Tops')) tailorMaleBase(style, object);
      if (style === 'seraphine' && material.name.includes('Tops')) tailorTierGarment(style, object, modelHeight);
      if (style === 'aurelia' && material.name.includes('Tops')) tailorAureliaBodice(object);
      const copy = material.clone();
      copy.toneMapped = false;
      const name = material.name;
      const color = name.includes('HAIR')
        ? LOOKS[style].hair
        : name.includes('Shoes')
          ? LOOKS[style].shoes
          : male && name.includes('AccessoryNeck')
            ? style === 'apron'
              ? 0xb38a4e
              : style === 'astra'
                ? 0x889dbe
                : 0x627e89
            : male && name.includes('Bottoms')
              ? MALE_AVATAR_LOOKS[style].pants
              : name.includes('Tops')
                ? LOOKS[style].dress
                : null;
      if (color !== null) {
        const target = new THREE.Color(color);
        const strength = name.includes('HAIR') ? 0.9 : style === 'apron' ? 0.83 : 0.94;
        copy.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
          const trimBodiceHem = style === 'aurelia' && name.includes('Tops');
          if (trimBodiceHem) {
            shader.vertexShader = `varying float aureliaBodiceY;\n${shader.vertexShader}`;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n aureliaBodiceY = position.y;',
            );
            shader.fragmentShader = `varying float aureliaBodiceY;\n${shader.fragmentShader}`;
          }
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             ${trimBodiceHem ? `if (aureliaBodiceY < 1.064) discard;` : ''}
             float fashionLight = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${target.r.toFixed(4)}, ${target.g.toFixed(4)}, ${target.b.toFixed(4)}) * mix(0.65, 1.28, fashionLight), ${strength.toFixed(2)});`,
          );
        };
        copy.customProgramCacheKey = () => `${style}-${name}-tint${style === 'aurelia' ? '-trimmed-hem' : ''}`;
      }
      if ((style === 'aurelia' || style === 'seraphine') && name.endsWith('_SKIN')) {
        if (name.includes('_Body_') && 'map' in copy && copy.map instanceof THREE.Texture) {
          copy.map = repairLunaSkinTexture(copy.map);
        } else if (style === 'aurelia') {
          copy.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.94, 0.91), 0.11);',
            );
          };
          copy.customProgramCacheKey = () => 'aurelia-porcelain-face';
        }
      }
      object.material = copy;
    });

    // Base body stays the same height when regalia extends its silhouette.
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = 2.85 / bounds.getSize(new THREE.Vector3()).y;
    this.root.scale.setScalar(scale);
    this.root.position.y = 0.08 - bounds.min.y * scale;
    this.accessories = male
      ? new MaleAvatarWardrobe(style, model, modelHeight)
      : style === 'aurelia'
        ? new AureliaWardrobe(model)
        : new TierAvatarAccessories(style, model, modelHeight);
    this.update(0);
  }

  play(motion: AvatarMotion, dance: DanceStyle = this.dance) {
    if (this.motion !== motion || this.dance !== dance) this.elapsed = 0;
    this.motion = motion;
    this.dance = dance;
  }

  update(delta: number) {
    this.elapsed += delta;
    const gesture = LOOKS[this.style].gesture;
    updateVroidGesture(gesture, this.motion, this.dance, this.elapsed, delta, this.restHipY, {
      ...this.articulation,
      hips: this.hips,
      spine: this.spine,
      head: this.head,
      leftArm: this.leftArm,
      rightArm: this.rightArm,
      leftForearm: this.leftForearm,
      rightForearm: this.rightForearm,
      leftLeg: this.leftLeg,
      rightLeg: this.rightLeg,
      leftShin: this.leftShin,
      rightShin: this.rightShin,
    });
    this.accessories?.update(this.elapsed);
  }
}
