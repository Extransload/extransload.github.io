import * as THREE from 'three';
import {
  AVATAR_PAD,
  BOARD_TOP,
  PAD_AVATAR_FLOOR,
  TAU,
  avatarPad,
  creatureMaterial,
  disposeGroup,
  frame,
  glowTexture,
  ground,
  merged,
  mesh,
  noise,
  rng,
  scatter,
  smoothstep,
  sphere,
  texture,
  tinted,
  type Palette,
  type TierBoard,
} from './board-decor';

// The sand dips under this level just past the dry band, so the shader's breathing shoreline shows.
const WATER_LEVEL = -0.84;
const SUN = new THREE.Vector3(0.8, 1.3, -16.2);
const KNOTS = [
  [0.3, 0.42],
  [0.72, 0.78],
] as const;

function sandHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const ripple = Math.sin(x * 2.3 + z * 1.1) * 0.012 * smoothstep(7.6, 8.4, radius);
  const slope = -0.8 - 0.28 * smoothstep(8.6, 12, radius) + ripple;
  // A dry sand spit rises out of the shallows under each avatar tray.
  return THREE.MathUtils.lerp(slope, AVATAR_PAD, avatarPad(x, z));
}

function driftwoodTexture() {
  return texture(512, (x, y) => {
    const grain = noise(x * 512, y * 512) * 2.5;
    const plank = Math.floor(y * 6);
    const seam = Math.pow(1 - Math.abs(((y * 6) % 1) - 0.5) * 2, 18) * 22;
    const offset = noise(plank, 3) * 10;
    const fibre = Math.pow((Math.sin((x + offset) * 150 + Math.sin(y * 40) * 1.2) + 1) / 2, 5) * 9;
    let knots = 0;
    for (const [kx, ky] of KNOTS) {
      const distance = Math.hypot((x - kx) * 1.6, y - ky);
      knots += Math.pow((Math.sin(distance * 90) + 1) / 2, 3) * 7 * (1 - smoothstep(0.02, 0.08, distance));
    }
    const bleach = Math.sin(x * 7 + plank) * 3;
    const value = 247 - seam - fibre - knots - grain + bleach;
    return [value, value - 3, value - 9];
  });
}

function sandGround() {
  const radii = [7.4, 8, 8.6, 9.1, 9.5, 9.9, 10.4, 11, 11.8, 12.8, 14];
  // Fine enough around the ring that the avatar sand spits read as smooth tongues rather than polygons.
  return ground(radii, 144, (radius, angle) => {
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const wet = smoothstep(8.8, 9.6, radius) * (1 - avatarPad(x, z));
    const speckle = noise(x * 2.3 + 3, z * 1.9 + 9) - 0.5;
    const ripple = Math.sin(x * 2.3 + z * 1.1) * 0.02;
    const shade = new THREE.Color().setHSL(
      0.1 - wet * 0.015,
      0.46 - wet * 0.08,
      0.66 - wet * 0.17 + speckle * 0.035 + ripple,
    );
    return { y: sandHeight(x, z), color: [shade.r, shade.g, shade.b, 1 - smoothstep(12, 14, radius)] };
  });
}

const waterVertex = /* glsl */ `
  uniform float time;
  varying vec3 vPosition;
  void main() {
    vec3 p = position;
    float radius = length(p.xz);
    float swell = sin(radius * 2.2 - time * 1.5) * 0.5 + sin(p.x * 1.1 + time * 0.7) * 0.5;
    p.y += swell * 0.04 * smoothstep(9.2, 11.0, radius);
    vPosition = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const waterFragment = /* glsl */ `
  uniform float time;
  uniform vec3 shallow;
  uniform vec3 deep;
  uniform vec3 sunset;
  uniform vec2 sun;
  varying vec3 vPosition;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float radius = length(vPosition.xz);
    float angle = atan(vPosition.z, vPosition.x);
    // The waterline breathes in and out over the wet sand.
    float shore = 9.35 + 0.3 * sin(time * 1.1) + 0.12 * sin(time * 2.3 + angle * 3.0);
    float depth = smoothstep(9.2, 13.5, radius);
    vec3 color = mix(shallow, deep, depth);
    float toSun = smoothstep(8.0, 14.5, -vPosition.z);
    float streak = exp(-pow(vPosition.x - sun.x, 2.0) / (2.0 * 2.4 * 2.4)) * toSun;
    float shimmer = vnoise(vec2(vPosition.x * 1.2, vPosition.z * 0.6 - time * 0.5));
    color = mix(color, sunset, clamp(streak * (0.45 + 0.55 * shimmer) + toSun * 0.18, 0.0, 1.0));
    float crest = sin(radius * 2.2 - time * 1.5);
    float grainy = 0.55 + 0.45 * vnoise(vec2(vPosition.x * 2.0 + time * 0.2, vPosition.z * 2.0));
    float foam = smoothstep(0.6, 0.98, crest) * smoothstep(12.5, 10.0, radius) * grainy;
    float fringe = (1.0 - smoothstep(shore + 0.05, shore + 0.6, radius)) * smoothstep(shore - 0.3, shore + 0.05, radius);
    foam += fringe * (0.7 + 0.3 * vnoise(vec2(angle * 14.0, time * 0.9)));
    color = mix(color, vec3(1.0), clamp(foam, 0.0, 0.9));
    // Only the brightest noise cells glint, so the sea twinkles in a few places instead of being peppered white.
    float sparkle = smoothstep(0.975, 1.0, vnoise(vec2(vPosition.x * 2.6 + time * 0.5, vPosition.z * 2.6 - time * 0.3))) * (0.6 + streak * 2.0);
    color += sparkle;
    float alpha = smoothstep(shore - 0.25, shore + 0.45, radius) * (1.0 - smoothstep(14.6, 16.5, radius)) * (0.84 + foam * 0.16);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function waterSurface() {
  const radii = [8.6, 9, 9.4, 9.8, 10.3, 10.9, 11.6, 12.4, 13.3, 14.3, 15.4, 16.5];
  const geometry = ground(radii, 96, () => ({ y: WATER_LEVEL, color: [1, 1, 1, 1] }), true);
  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    uniforms: {
      time: { value: 0 },
      shallow: { value: new THREE.Color(0x58c4c9) },
      deep: { value: new THREE.Color(0x1d6f86) },
      sunset: { value: new THREE.Color(0xff9a5c) },
      sun: { value: new THREE.Vector2(SUN.x, SUN.z) },
    },
    transparent: true,
    depthWrite: false,
  });
  const water = new THREE.Mesh(geometry, material);
  water.name = 'beach-water';
  // Drawn after the fish shadows so they always read as being under the surface.
  water.renderOrder = 1;
  water.receiveShadow = false;
  water.castShadow = false;
  return { water, material };
}

/** Crisp stripes need one color per face, so the geometry is unshared before colouring by face angle. */
function striped(source: THREE.BufferGeometry, first: number, second: number, stripes: number) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  const a = new THREE.Color(first);
  const b = new THREE.Color(second);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let face = 0; face < positions.count; face += 3) {
    const x = (positions.getX(face) + positions.getX(face + 1) + positions.getX(face + 2)) / 3;
    const z = (positions.getZ(face) + positions.getZ(face + 1) + positions.getZ(face + 2)) / 3;
    const angle = Math.atan2(z, x) + Math.PI;
    const shade = Math.floor((angle / TAU) * stripes) % 2 ? b : a;
    for (let corner = 0; corner < 3; corner++) colors.set([shade.r, shade.g, shade.b], (face + corner) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function starfish(radius: number, height: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * TAU;
    const arm = i % 2 ? radius * 0.42 : radius;
    if (i === 0) shape.moveTo(Math.cos(angle) * arm, Math.sin(angle) * arm);
    else shape.lineTo(Math.cos(angle) * arm, Math.sin(angle) * arm);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildProps(random: () => number, parts: THREE.BufferGeometry[]) {
  const place = (geometry: THREE.BufferGeometry, x: number, z: number, lift = 0, spin = random() * TAU) => {
    geometry.rotateY(spin);
    geometry.translate(x, sandHeight(x, z) + lift, z);
    return geometry;
  };
  // Leaning palm trunk: stacked rings curving toward the table.
  const palm = { x: -9.9, z: -8.6, height: 5.2, lean: 1.3 };
  const palmBase = sandHeight(palm.x, palm.z) - 0.05;
  const rings = 9;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const segment = new THREE.CylinderGeometry(
      0.1 + (1 - t) * 0.05,
      0.14 + (1 - t) * 0.05,
      palm.height / rings + 0.04,
      7,
    );
    segment.rotateZ(-t * 0.26);
    segment.translate(palm.x + palm.lean * t * t, palmBase + (t + 0.5 / rings) * palm.height, palm.z);
    parts.push(tinted(segment, i % 2 ? 0x8a6b4f : 0x7a5d44, 0.12, i + 10));
  }
  const crown = new THREE.Vector3(palm.x + palm.lean, palmBase + palm.height, palm.z);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * TAU;
    parts.push(
      tinted(
        sphere(0.11, crown.x + Math.cos(angle) * 0.14, crown.y - 0.16, crown.z + Math.sin(angle) * 0.14),
        0x6a4b2e,
        0.1,
        i + 30,
      ),
    );
  }
  // Striped umbrella and a beach ball on the near-right sand.
  const umbrella = { x: 9.8, z: 5.6 };
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6).translate(0, 1.1, 0).rotateZ(0.12);
  parts.push(tinted(place(pole, umbrella.x, umbrella.z, 0, 0), 0xf3eee4, 0.05, 40));
  const canopy = striped(new THREE.ConeGeometry(1.15, 0.5, 10, 1, true), 0xf05a4f, 0xfaf6ee, 10);
  canopy.translate(0, 2.2, 0).rotateZ(0.12);
  canopy.translate(umbrella.x, sandHeight(umbrella.x, umbrella.z), umbrella.z);
  parts.push(canopy);
  const ball = striped(new THREE.SphereGeometry(0.24, 12, 10), 0x3f8fd8, 0xf7d64a, 6);
  ball.rotateZ(0.6);
  parts.push(place(ball, 8.9, 7.4, 0.2, 0));
  // Shells and starfish stay on the dry sand, which ends where the slope dips under the water.
  const shellTints = [0xf6e9d8, 0xf2c7c0, 0xead9bf, 0xf7f1e6];
  for (let i = 0; i < 11; i++) {
    const { x, z } = scatter(random, 7.8, 9.4);
    const shell = new THREE.SphereGeometry(0.075 + random() * 0.04, 8, 6, 0, TAU, 0, Math.PI / 2);
    shell.scale(1, 0.5, 1.2);
    parts.push(tinted(place(shell, x, z), shellTints[i % shellTints.length], 0.1, i + 50));
  }
  for (let i = 0; i < 4; i++) {
    const { x, z } = scatter(random, 8, 9.3);
    parts.push(tinted(place(starfish(0.17 + random() * 0.06, 0.035), x, z), i % 2 ? 0xe98a4a : 0xf2a7a0, 0.12, i + 70));
  }
  // Rope border and corner starfish on the slab itself, outside the lines.
  parts.push(tinted(frame(14.44, 0.55, -0.79, 0.045), 0xd8c39a, 0.1, 80));
  for (const x of [-6.88, 6.88]) {
    for (const z of [-6.88, 6.88]) {
      const star = starfish(0.2, 0.03);
      star.rotateY(Math.atan2(x, z));
      star.translate(x, BOARD_TOP + 0.004, z);
      parts.push(tinted(star, x * z > 0 ? 0xe98a4a : 0xf2a7a0, 0.1, Math.round(x + z + 90)));
    }
  }
  return crown;
}

function palmFronds(crown: THREE.Vector3) {
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const frond = new THREE.PlaneGeometry(2.6, 0.46, 8, 1);
    const positions = frond.getAttribute('position');
    for (let v = 0; v < positions.count; v++) {
      const along = positions.getX(v) + 1.3;
      const t = along / 2.6;
      positions.setXYZ(v, along, 0.12 - t * t * 1.35, positions.getY(v) * (1 - t * 0.7));
    }
    frond.computeVertexNormals();
    frond.rotateY((i / 8) * TAU + 0.2);
    fronds.push(tinted(frond, i % 2 ? 0x2f7a3c : 0x3b8c47, 0.16, i + 100));
  }
  const group = new THREE.Group();
  group.position.copy(crown);
  mesh(
    group,
    merged(fronds),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    'beach-palm-fronds',
  );
  return group;
}

/** Forward is +x; hermit crabs scuttle sideways along their local z axis. */
function crab(material: THREE.Material) {
  const group = new THREE.Group();
  const shellColor = 0xc97a4a;
  const body = merged([
    tinted(sphere(0.13, -0.03, 0.14, 0, 1, 0.85, 1.1), shellColor, 0.16, 1),
    tinted(
      new THREE.ConeGeometry(0.07, 0.16, 8).rotateZ(Math.PI / 2 + 0.6).translate(-0.17, 0.2, 0),
      shellColor,
      0.1,
      2,
    ),
    tinted(sphere(0.07, 0.1, 0.07, 0, 1, 0.8, 1), 0xe0956a, 0.08, 3),
    tinted(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 5).translate(0.15, 0.13, 0.03), 0x2a1a12, 0, 4),
    tinted(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 5).translate(0.15, 0.13, -0.03), 0x2a1a12, 0, 5),
    tinted(sphere(0.016, 0.15, 0.18, 0.03, 1, 1, 1, 6), 0x2a1a12, 0, 6),
    tinted(sphere(0.016, 0.15, 0.18, -0.03, 1, 1, 1, 6), 0x2a1a12, 0, 7),
    ...[-1, 1].flatMap((side) =>
      [0, 1, 2].map((leg) =>
        tinted(
          new THREE.BoxGeometry(0.02, 0.02, 0.14).rotateX(side * 0.5).translate(0.02 + leg * 0.04, 0.04, side * 0.11),
          0xd98556,
          0.08,
          8 + leg + side,
        ),
      ),
    ),
  ]);
  mesh(group, body, material, 'crab-body');
  const claws = [-1, 1].map((side) => {
    const claw = merged([
      tinted(sphere(0.035, 0.05, 0, 0, 1.4, 0.8, 1), 0xd98556, 0.08, 20 + side),
      tinted(
        new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5).rotateZ(Math.PI / 2).translate(0.015, 0, 0),
        0xd98556,
        0.05,
        22 + side,
      ),
    ]);
    const clawMesh = mesh(group, claw, material, 'crab-claw');
    clawMesh.position.set(0.14, 0.06, side * 0.08);
    return clawMesh;
  });
  return { group, claws };
}

const stride = { progress: 0, moving: 0, pause: 0 };
function scuttle(time: number, offset: number) {
  const period = 9;
  const t = (time + offset) % period;
  if (t < 3.2) {
    stride.progress = t / 3.2;
    stride.moving = 1;
    stride.pause = 0;
  } else if (t < 4.6) {
    stride.progress = 1;
    stride.moving = 0;
    stride.pause = Math.sin(((t - 3.2) / 1.4) * Math.PI);
  } else if (t < 7.8) {
    stride.progress = 1 - (t - 4.6) / 3.2;
    stride.moving = 1;
    stride.pause = 0;
  } else {
    stride.progress = 0;
    stride.moving = 0;
    stride.pause = Math.sin(((t - 7.8) / 1.2) * Math.PI);
  }
  return stride;
}

const dig = { progress: 0, wobble: 0, sink: 0, wiggle: 0, turn: 0, left: 0, right: 0, moving: 0 };
/**
 * The second crab is a digger: short stop-start dashes, one claw raised at a time, a burrow into the
 * sand to hide, a look around, then a slow return with long idle stretches.
 */
function burrow(time: number) {
  const t = time % 12;
  dig.wobble = 0;
  dig.sink = 0;
  dig.wiggle = 0;
  dig.turn = 0;
  dig.left = 0;
  dig.right = 0;
  dig.moving = 0;
  if (t < 1.4) {
    dig.progress = THREE.MathUtils.lerp(0, 0.35, t / 1.4);
    dig.moving = 1;
  } else if (t < 2.2) {
    const wave = (t - 1.4) / 0.8;
    dig.progress = 0.35;
    dig.left = Math.sin(THREE.MathUtils.clamp(wave * 2, 0, 1) * Math.PI) * 0.9;
    dig.right = Math.sin(THREE.MathUtils.clamp(wave * 2 - 1, 0, 1) * Math.PI) * 0.9;
  } else if (t < 3.4) {
    const u = (t - 2.2) / 1.2;
    dig.progress = THREE.MathUtils.lerp(0.35, 0.85, u);
    dig.wobble = Math.sin(u * Math.PI) * 0.35;
    dig.moving = 1;
  } else if (t < 5.6) {
    const u = t - 3.4;
    dig.progress = 0.85;
    dig.sink = smoothstep(0, 0.8, u) * (1 - smoothstep(1.8, 2.2, u)) * 0.12;
    dig.wiggle = Math.sin(time * 18) * 0.08 * (u < 0.8 || u > 1.8 ? 1 : 0.2);
  } else if (t < 6.6) {
    dig.progress = 0.85;
    dig.turn = Math.sin((t - 5.6) * Math.PI * 2) * 0.4;
  } else if (t < 7.3) {
    dig.progress = THREE.MathUtils.lerp(0.85, 0.5, (t - 6.6) / 0.7);
    dig.moving = 1;
  } else if (t < 7.7) {
    dig.progress = 0.5;
  } else if (t < 8.4) {
    dig.progress = THREE.MathUtils.lerp(0.5, 0, (t - 7.7) / 0.7);
    dig.moving = 1;
  } else {
    dig.progress = 0;
    if (t > 9 && t < 9.8) dig.right = Math.sin(((t - 9) / 0.8) * Math.PI) * 0.8;
    if (t > 10.5 && t < 11.3) dig.left = Math.sin(((t - 10.5) / 0.8) * Math.PI) * 0.8;
  }
  return dig;
}

function gull(material: THREE.Material) {
  const group = new THREE.Group();
  // Heading first, then a bank around the gull's own forward axis.
  group.rotation.order = 'YXZ';
  const white = 0xf3f1ea;
  const body = merged([
    tinted(sphere(0.1, 0, 0, 0, 1.6, 0.75, 0.8), white, 0.05, 30),
    tinted(sphere(0.065, 0.17, 0.05, 0), white, 0.04, 31),
    tinted(new THREE.ConeGeometry(0.02, 0.08, 6).rotateZ(-Math.PI / 2).translate(0.25, 0.04, 0), 0xf0a13a, 0, 32),
    tinted(new THREE.BoxGeometry(0.16, 0.01, 0.12).translate(-0.2, 0.01, 0), 0xc9c6bd, 0.05, 33),
  ]);
  mesh(group, body, material, 'gull-body');
  const wings = [-1, 1].map((side) => {
    const wing = merged([
      tinted(new THREE.BoxGeometry(0.16, 0.01, 0.4).translate(-0.01, 0, side * 0.2), 0xdcdad2, 0.05, 34 + side),
      tinted(new THREE.BoxGeometry(0.11, 0.01, 0.16).translate(-0.03, 0, side * 0.47), 0x4a4d52, 0.05, 36 + side),
    ]);
    const wingMesh = mesh(group, wing, material, 'gull-wing');
    wingMesh.position.set(0, 0.03, side * 0.06);
    return wingMesh;
  });
  return { group, wings };
}

const GULLS = [
  { centre: new THREE.Vector3(9, 6.4, -9), radius: 2.8, speed: 0.5, phase: 0 },
  { centre: new THREE.Vector3(9.4, 7.3, -9.3), radius: 2.4, speed: 0.58, phase: 2.2 },
  { centre: new THREE.Vector3(9.6, 5.6, -9.6), radius: 2.8, speed: 0.44, phase: 4.1 },
];

export function createBeachBoard(): TierBoard {
  const decorations = new THREE.Group();
  decorations.name = 'tier-board-beach';
  const map = driftwoodTexture();
  const palette: Palette = { surface: 0xe8dcc0, body: 0x3d9aa6, line: 0x2b6670, detail: 0xffffff };
  const random = rng(11);

  const sand = mesh(
    decorations,
    sandGround(),
    new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 1, metalness: 0 }),
    'beach-sand',
  );
  sand.castShadow = false;
  const { water, material: waterMaterial } = waterSurface();
  decorations.add(water);

  const props: THREE.BufferGeometry[] = [];
  const crown = buildProps(random, props);
  mesh(
    decorations,
    merged(props),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    'beach-props',
  );
  const fronds = palmFronds(crown);
  decorations.add(fronds);

  // Sunset: a low sun, its halo and two lit clouds. The warmth comes from the sprites and the sky
  // gradient rather than an extra light, so the scene's shader variants stay fixed.
  const disc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(64, (distance) => [
        255,
        150 - distance * 40,
        70 - distance * 10,
        255 * (1 - smoothstep(0.6, 0.72, distance)),
      ]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  disc.name = 'beach-sun';
  disc.position.copy(SUN);
  disc.scale.setScalar(3.4);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(64, (distance) => [255, 170, 110, 150 * (1 - distance) ** 3]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.name = 'beach-sun-halo';
  halo.position.copy(SUN);
  halo.scale.setScalar(8.5);
  const cloudMaterial = new THREE.SpriteMaterial({
    map: glowTexture(64, (distance, angle) => [
      255,
      196,
      190,
      200 * (1 - smoothstep(0.35 + Math.sin(angle * 3) * 0.1, 1, distance)),
    ]),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const clouds = [new THREE.Sprite(cloudMaterial), new THREE.Sprite(cloudMaterial)];
  clouds[0].position.set(-6, 3.6, -15);
  clouds[0].scale.set(3.6, 1.1, 1);
  clouds[1].position.set(6.5, 4.5, -15.5);
  clouds[1].scale.set(2.8, 0.9, 1);
  decorations.add(disc, halo, ...clouds);

  const shellMaterial = creatureMaterial();
  const walker = crab(shellMaterial);
  const digger = crab(shellMaterial);
  for (const { group } of [walker, digger]) {
    group.scale.setScalar(1.5);
    decorations.add(group);
  }
  const gulls = GULLS.map(() => gull(shellMaterial));
  for (const { group } of gulls) {
    group.scale.setScalar(1.4);
    decorations.add(group);
  }
  const fishMaterial = new THREE.MeshBasicMaterial({
    color: 0x15505f,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const fishGeometry = new THREE.CircleGeometry(0.17, 12).scale(2.1, 1, 1).rotateX(-Math.PI / 2);
  const fish = [0, 1, 2].map((index) => {
    const shadow = new THREE.Mesh(fishGeometry, fishMaterial);
    shadow.name = 'beach-fish';
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    decorations.add(shadow);
    return { shadow, phase: index * 2.3, radius: 11.4 + index * 0.9, speed: 0.22 + index * 0.05 };
  });

  const update = (time: number) => {
    waterMaterial.uniforms.time.value = time;
    fronds.rotation.set(Math.sin(time * 0.9) * 0.035, Math.sin(time * 0.3) * 0.04, Math.cos(time * 0.7) * 0.03);
    clouds[0].position.x = -6 + Math.sin(time * 0.05) * 0.6;
    clouds[1].position.x = 6.5 + Math.sin(time * 0.04 + 1) * 0.5;

    const walk = scuttle(time, 0);
    const walkZ = THREE.MathUtils.lerp(-1.6, 2.4, walk.progress);
    walker.group.position.set(
      8.8,
      sandHeight(8.8, walkZ) + 0.02 + Math.abs(Math.sin(time * 14)) * 0.012 * walk.moving,
      walkZ,
    );
    walker.group.rotation.y = Math.PI;
    walker.claws.forEach((claw, side) => {
      claw.rotation.z = walk.pause * 0.9 + Math.sin(time * 12 + side) * 0.08 * walk.moving;
    });

    const digging = burrow(time);
    const digX = THREE.MathUtils.lerp(-1.8, 1.6, digging.progress);
    const digZ = 8.7 + digging.wobble;
    digger.group.position.set(
      digX,
      sandHeight(digX, digZ) + 0.02 - digging.sink + Math.abs(Math.sin(time * 16)) * 0.012 * digging.moving,
      digZ,
    );
    digger.group.rotation.set(0, Math.PI / 2 + digging.turn, digging.wiggle);
    digger.claws[0].rotation.z = digging.left + Math.sin(time * 13) * 0.06 * digging.moving;
    digger.claws[1].rotation.z = digging.right + Math.cos(time * 13) * 0.06 * digging.moving;

    gulls.forEach(({ group, wings }, index) => {
      const flight = GULLS[index];
      const angle = time * flight.speed + flight.phase;
      group.position.set(
        flight.centre.x + Math.cos(angle) * flight.radius,
        flight.centre.y + Math.sin(time * 1.1 + flight.phase) * 0.3,
        flight.centre.z + Math.sin(angle) * flight.radius,
      );
      group.rotation.set(-0.3, Math.atan2(-Math.cos(angle), -Math.sin(angle)), 0);
      const glide = smoothstep(0.3, 0.8, 0.5 + 0.5 * Math.sin(time * 0.6 + flight.phase));
      const flap = Math.sin(time * 7 + flight.phase) * 0.55 * glide + (1 - glide) * 0.1;
      wings[0].rotation.x = flap;
      wings[1].rotation.x = -flap;
    });

    fish.forEach(({ shadow, phase, radius, speed }) => {
      const angle = time * speed + phase;
      const wobble = radius + Math.sin(time * 0.4 + phase) * 0.8;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      // Swerve outward around the avatar sand spits instead of vanishing under them.
      const swerve = wobble + avatarPad(x * wobble, z * wobble) * 2.4;
      shadow.position.set(x * swerve, WATER_LEVEL - 0.03, z * swerve);
      shadow.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle)) + Math.sin(time * 6 + phase) * 0.15;
    });
  };
  update(0);

  return {
    palette,
    map,
    decorations,
    roughness: 0.5,
    clearcoat: 0.22,
    avatarFloor: PAD_AVATAR_FLOOR,
    update,
    dispose: () => {
      map.dispose();
      disposeGroup(decorations);
    },
  };
}
