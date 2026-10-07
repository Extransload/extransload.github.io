import * as THREE from 'three';

type Seat = 'black' | 'white';

const flameVertex = /* glsl */ `
  varying vec3 localPoint;
  varying vec3 rayOrigin;
  varying float pieceSeed;
  void main() {
    localPoint = position;
    pieceSeed = fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    // Stone transforms have orthogonal axes (rotation and scale, no shear).
    // Express the camera in local space, including the flattened stone's Y scale.
    vec3 offset = cameraPosition - modelMatrix[3].xyz;
    rayOrigin = vec3(
      dot(offset, modelMatrix[0].xyz) / dot(modelMatrix[0].xyz, modelMatrix[0].xyz),
      dot(offset, modelMatrix[1].xyz) / dot(modelMatrix[1].xyz, modelMatrix[1].xyz),
      dot(offset, modelMatrix[2].xyz) / dot(modelMatrix[2].xyz, modelMatrix[2].xyz)
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flameFragment = /* glsl */ `
  uniform float time;
  uniform float opacity;
  uniform float cold;
  varying vec3 localPoint;
  varying vec3 rayOrigin;
  varying float pieceSeed;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float turbulence(vec3 p) {
    return 0.67 * noise(p) + 0.33 * noise(p * 2.07 + 13.7);
  }
  void main() {
    vec3 direction = normalize(localPoint - rayOrigin);
    vec3 inverseRay = 1.0 / (direction + vec3(0.00001));
    vec3 first = (vec3(-0.4, 0.11, -0.4) - rayOrigin) * inverseRay;
    vec3 last = (vec3(0.4, 1.27, 0.4) - rayOrigin) * inverseRay;
    vec3 low = min(first, last), high = max(first, last);
    float enter = max(max(low.x, low.y), max(low.z, 0.0));
    float leave = min(min(high.x, high.y), high.z);
    if (leave <= enter) discard;
    float t = time + pieceSeed * 17.0;
    float stepSize = (leave - enter) / 24.0;
    vec4 accumulated = vec4(0.0);
    vec3 edge = mix(vec3(0.88, 0.004, 0.001), vec3(0.002, 0.04, 0.9), cold);
    vec3 middle = mix(vec3(1.0, 0.075, 0.002), vec3(0.005, 0.36, 1.0), cold);
    vec3 center = mix(vec3(1.0, 0.80, 0.20), vec3(0.55, 0.97, 1.0), cold);
    vec3 hottest = mix(vec3(1.0, 0.98, 0.76), vec3(0.88, 1.0, 1.0), cold);
    for (int i = 0; i < 24; i++) {
      vec3 samplePoint = rayOrigin + direction * (enter + (float(i) + 0.5) * stepSize);
      vec3 p = (samplePoint - vec3(0.0, 0.11, 0.0)) / vec3(0.4, 1.16, 0.4);
      float flow = turbulence(vec3(p.x * 4.2 + pieceSeed * 8.0, p.y * 5.6 - t * 2.5, p.z * 4.2));
      vec2 bend = vec2(sin(p.y * 8.0 - t * 2.3), cos(p.y * 6.0 - t * 1.9)) * p.y * 0.11;
      float radial = length(p.xz + bend);
      float pulse = 0.5 + 0.5 * sin(t * 2.1);
      float envelope = 0.73 * pow(max(0.0, 1.0 - p.y / (0.76 + pulse * 0.07)), 0.85);
      float field = envelope - radial;
      float tongueHeat = 0.0;
      // Three taller tongues peel away from the heart and curl back inward.
      // They form a changing crown from above as well as from the side.
      for (int tongue = 0; tongue < 3; tongue++) {
        float id = float(tongue);
        float height = 0.78 + 0.12 * sin(t * 1.6 + id * 2.1);
        float rise = p.y / height;
        float angle = id * 2.0944 + t * 0.43 + rise * 1.7;
        vec2 axis = vec2(cos(angle), sin(angle)) * (0.40 - rise * 0.16);
        float width = 0.32 * pow(max(0.0, 1.0 - rise), 0.72);
        float tongueField = width - length(p.xz + bend - axis);
        tongueField -= max(0.0, rise - 1.0) * 2.0;
        field = max(field, tongueField);
        tongueHeat = max(tongueHeat, smoothstep(0.025, 0.14, tongueField) * smoothstep(0.2, 0.55, rise));
      }
      field += (flow - 0.5) * (0.23 + p.y * 0.26);
      float density = smoothstep(-0.025, 0.06, field);
      density *= smoothstep(0.0, 0.09, p.y) * (1.0 - smoothstep(0.83, 1.0, p.y));
      float heat = clamp((1.0 - radial) * 0.90 + (1.0 - p.y) * 0.18 + (flow - 0.5) * 0.40, 0.0, 1.0);
      vec3 color = mix(edge, middle, smoothstep(0.2, 0.67, heat));
      color = mix(color, center, smoothstep(0.66, 1.0, heat));
      color = mix(color, center, tongueHeat * 0.8);
      // Narrow bright veins surge up through the darker outer tongues.
      float vein = smoothstep(0.60, 0.78, flow) * smoothstep(0.1, 0.24, field);
      color = mix(color, hottest, vein * 0.72);
      // Rising embers have a short, fading trail and remain three-dimensional.
      float sparks = 0.0;
      for (int ember = 0; ember < 8; ember++) {
        float id = float(ember);
        float life = fract(t * (0.37 + id * 0.027) + id * 0.173);
        float angle = id * 2.39996 + pieceSeed * 6.0 + life * 1.3;
        float spread = 0.35 + life * 0.38;
        vec3 spark = vec3(cos(angle) * spread, 0.22 + life * 0.74, sin(angle) * spread);
        vec3 offset = p - spark;
        // Stretch downward only, keeping a small white-hot head on each ember.
        offset.y /= offset.y < 0.0 ? 2.7 : 1.2;
        float radius = mix(0.047, 0.023, life);
        float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.72, 1.0, life));
        sparks += (1.0 - smoothstep(radius * 0.2, radius, length(offset))) * fade;
      }
      color = mix(color, hottest, min(1.0, sparks * 2.0));
      float alpha = 1.0 - exp(-(density * (2.6 + heat * 3.0) + sparks * 24.0) * stepSize);
      accumulated.rgb += (1.0 - accumulated.a) * color * alpha * (0.65 + heat * 0.75);
      accumulated.a += (1.0 - accumulated.a) * alpha;
    }
    // The dense flame fully covers the board grid. Only the thin outer fringe
    // fades; placement previews can still lower the whole effect's opacity.
    float coverage = smoothstep(0.035, 0.32, accumulated.a);
    if (coverage < 0.012) discard;
    gl_FragColor = vec4(accumulated.rgb / max(accumulated.a, 0.001), coverage * opacity);
    #include <colorspace_fragment>
  }
`;

/** Standalone volumetric fire occupies the intersection without an opaque stone or pedestal. */
export function createFlameStone(seat: Seat): THREE.Group {
  const dark = seat === 'black';
  const group = new THREE.Group();
  group.name = `living-flame-${seat}`;
  group.userData.motif = 'living-flame';
  const fire = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.16, 0.8).translate(0, 0.69, 0),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 1 }, cold: { value: dark ? 0 : 1 } },
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Depth-test the volume's entrance. Testing its rear floor face let the
      // slightly raised grid and star points incorrectly punch through the fire.
      side: THREE.FrontSide,
      toneMapped: false,
    }),
  );
  fire.name = 'living-flame-plume';
  fire.userData.stoneEffect = true;
  fire.castShadow = false;
  fire.receiveShadow = false;
  fire.frustumCulled = false;
  group.add(fire);
  return group;
}

/** Traverse the current meshes so placement-preview material clones update too. */
export function animateFlameStone(group: THREE.Group, time: number) {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.stoneEffect) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.ShaderMaterial) || !material.uniforms.time) continue;
      material.uniforms.time.value = time;
      material.uniforms.opacity.value = material.opacity;
    }
  });
}
