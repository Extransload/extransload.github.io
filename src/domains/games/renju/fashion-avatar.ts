import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { updateVroidGesture } from './avatar-gestures';
import type { AvatarMotion } from './petal-avatar';

export const FASHION_AVATARS = ['apron', 'rose', 'serin'] as const;
export type FashionStyle = (typeof FASHION_AVATARS)[number];

const SOURCES: Record<FashionStyle, string> = {
  apron: '/models/omokmaru/apron.glb',
  rose: '/models/omokmaru/luna.glb',
  serin: '/models/omokmaru/ribbon.glb',
};
const COLORS: Record<FashionStyle, { hair: number; dress: number; shoes: number }> = {
  apron: { hair: 0xeebd69, dress: 0xd7ba91, shoes: 0x916741 },
  rose: { hair: 0xe987a8, dress: 0x4c334d, shoes: 0x342a42 },
  serin: { hair: 0x49342f, dress: 0x35495f, shoes: 0x242a38 },
};
const source = new Map<FashionStyle, Promise<GLTF>>();

export async function loadFashionAvatar(style: FashionStyle) {
  let loaded = source.get(style);
  if (!loaded) {
    loaded = new GLTFLoader().loadAsync(SOURCES[style]).catch((error) => {
      source.delete(style);
      throw error;
    });
    source.set(style, loaded);
  }
  return new FashionAvatar(style, await loaded);
}

export class FashionAvatar {
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
    this.leftLeg = bone('J_Bip_L_UpperLeg');
    this.rightLeg = bone('J_Bip_R_UpperLeg');
    this.restHipY = this.hips.position.y;
    if (style === 'serin') this.head.scale.set(0.84, 0.89, 0.9);

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = false;
      object.frustumCulled = false;
      const material = object.material;
      if (!material || Array.isArray(material)) return;
      if (style === 'serin' && material.name.includes('Tops')) {
        // Shorten the existing skinned skirt to mid-thigh. The hem remains one
        // mesh with the outfit, so it follows the original dress rig in dances.
        const geometry = object.geometry.clone();
        const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i);
          if (y < 0.94 && y > 0.6) positions.setY(i, 0.78 + ((y - 0.63) * (0.94 - 0.78)) / (0.94 - 0.63));
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        object.geometry = geometry;
      }
      const copy = material.clone();
      copy.toneMapped = false;
      const name = material.name;
      if (style === 'serin' && name.includes('Body_00_SKIN')) {
        const skin = new THREE.Color(0xffd9ca);
        const shorts = new THREE.Color(0x26384d);
        copy.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
          shader.vertexShader = shader.vertexShader
            .replace('void main() {', 'varying float serinY;\nvarying vec3 serinNormal;\nvoid main() {')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n serinNormal = normalize(transformedNormal);')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n serinY = position.y;');
          shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'varying float serinY;\nvarying vec3 serinNormal;\nvoid main() {')
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
               float serinSkinLight = 0.82 + 0.16 * normalize(serinNormal).x + 0.12 * abs(normalize(serinNormal).z);
               vec3 serinSkin = vec3(${skin.r.toFixed(4)}, ${skin.g.toFixed(4)}, ${skin.b.toFixed(4)}) * serinSkinLight;
               diffuseColor.rgb = mix(diffuseColor.rgb, serinSkin, 1.0 - smoothstep(1.02, 1.06, serinY));
               float serinShorts = smoothstep(0.81, 0.84, serinY) * (1.0 - smoothstep(1.01, 1.05, serinY));
               diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${shorts.r.toFixed(4)}, ${shorts.g.toFixed(4)}, ${shorts.b.toFixed(4)}), serinShorts);`,
            );
        };
        copy.customProgramCacheKey = () => 'serin-shaded-legs-lined-shorts';
        object.material = copy;
        return;
      }
      const color = name.includes('HAIR')
        ? COLORS[style].hair
        : name.includes('Shoes')
          ? COLORS[style].shoes
          : name.includes('Tops')
            ? COLORS[style].dress
            : null;
      if (color !== null) {
        const target = new THREE.Color(color);
        const strength = name.includes('HAIR') ? 0.9 : style === 'apron' ? 0.83 : 0.94;
        copy.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>\n float fashionLight = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${target.r.toFixed(4)}, ${target.g.toFixed(4)}, ${target.b.toFixed(4)}) * mix(0.65, 1.28, fashionLight), ${strength.toFixed(2)});`,
          );
        };
        copy.customProgramCacheKey = () => `${style}-${name}-tint`;
      }
      object.material = copy;
    });

    const bounds = new THREE.Box3().setFromObject(model);
    const scale = 2.85 / bounds.getSize(new THREE.Vector3()).y;
    this.root.scale.setScalar(scale);
    this.root.position.y = 0.08 - bounds.min.y * scale;
    this.update(0);
  }

  play(motion: AvatarMotion) {
    if (this.motion !== motion) this.elapsed = 0;
    this.motion = motion;
  }

  update(delta: number) {
    this.elapsed += delta;
    updateVroidGesture(this.style, this.motion, this.elapsed, delta, this.restHipY, {
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
