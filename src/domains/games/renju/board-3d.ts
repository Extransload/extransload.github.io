import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { analyzeMove, boardFromMoves, index, inside, type Color, type Move, type Point, type Verdict } from './rules';

const START = -6.3,
  STEP = 0.9,
  SURFACE = 0.37;
type Seat = 'black' | 'white';
type AvatarRig = { group: THREE.Group; halo: THREE.Mesh; head: THREE.Mesh; arms: THREE.Mesh[] };
export const coordinate = (x: number, y: number) => `${'ABCDEFGHJKLMNOP'[x]}${y + 1}`;
export class RenjuBoard {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private controls: OrbitControls;
  private board = new THREE.Group();
  private stones = new THREE.Group();
  private stoneGeometry = new THREE.SphereGeometry(0.36, 32, 22);
  private stoneMaterials = {
    black: new THREE.MeshPhysicalMaterial({ color: 0x09131d, roughness: 0.21, metalness: 0.15, clearcoat: 0.9 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2e9d2, roughness: 0.28, metalness: 0.04, clearcoat: 0.68 }),
  };
  private highlights = new THREE.Group();
  private lastMove = new THREE.Group();
  private avatars: Record<Seat, AvatarRig>;
  private seatRole: Seat | 'spectator' | null | undefined;
  private celebrating: Seat | null = null;
  private celebrationFrame = 0;
  private celebrationStarted = 0;
  private pointer = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURFACE);
  private hit = new THREE.Vector3();
  private moves: Move[] = [];
  private color: Color | null = null;
  private interactive = false;
  private down?: { x: number; y: number; pointerId: number };
  private activeTouches = new Set<number>();
  private multiTouch = false;
  private hoverKey: string | null = null;
  private topView = false;
  private saved?: { position: THREE.Vector3; target: THREE.Vector3 };
  onPlay?: (point: Point) => void;
  onForbidden?: (point: Point | null, verdict?: Verdict, screen?: { x: number; y: number }) => void;

  constructor(private host: HTMLElement) {
    this.camera.position.set(0, host.clientWidth < 600 ? 25 : 23, host.clientWidth < 600 ? 25 : 26);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 11;
    this.controls.maxDistance = 58;
    this.controls.minPolarAngle = 0.06;
    this.controls.maxPolarAngle = Math.PI - 0.06;
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = null;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.AmbientLight(0xf4e9d6, 1.2));
    const key = new THREE.DirectionalLight(0xffe5b4, 4.3);
    key.position.set(-6, 13, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0002;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8098b0, 1.3);
    rim.position.set(8, 8, -9);
    this.scene.add(rim);
    this.scene.add(this.board);
    this.makeBoard();
    this.board.add(this.stones, this.highlights, this.lastMove);
    const black = this.makeAvatar('black');
    const white = this.makeAvatar('white');
    this.avatars = { black, white };
    this.scene.add(black.group, white.group);
    this.setSeats(null, null);
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.activeTouches.add(e.pointerId);
        if (this.activeTouches.size > 1) {
          this.multiTouch = true;
          this.down = undefined;
        }
      }
      if (e.button === 0 && !this.multiTouch) this.down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') {
        this.clearHighlight();
        return;
      }
      this.inspect(e);
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') this.activeTouches.delete(e.pointerId);
      if (this.multiTouch) {
        this.down = undefined;
        if (!this.activeTouches.size) this.multiTouch = false;
        return;
      }
      if (
        e.button !== 0 ||
        !this.down ||
        this.down.pointerId !== e.pointerId ||
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8
      ) {
        this.down = undefined;
        return;
      }
      this.down = undefined;
      this.inspect(e, true);
    });
    this.renderer.domElement.addEventListener('pointercancel', (e) => {
      this.activeTouches.delete(e.pointerId);
      this.down = undefined;
      if (!this.activeTouches.size) this.multiTouch = false;
    });
    this.renderer.domElement.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    this.renderer.domElement.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') this.clearHighlight();
    });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  private box(w: number, h: number, d: number, material: THREE.Material, y: number, radius = 0) {
    const mesh = new THREE.Mesh(
      radius ? new RoundedBoxGeometry(w, h, d, 4, radius) : new THREE.BoxGeometry(w, h, d),
      material,
    );
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.board.add(mesh);
  }
  private makeEmbroidery() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'italic bold 174px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#233e3b';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#f3dfaf';
    ctx.fillText('Extransload', 1024, 154);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const mask = ctx.getImageData(0, 0, 2048, 300).data;
    ctx.strokeStyle = '#fff9df';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (let y = 57; y < 246; y += 9)
      for (let x = 135; x < 1915; x += 9) {
        if (mask[(y * 2048 + x) * 4 + 3] < 80) continue;
        ctx.beginPath();
        ctx.moveTo(x - 2.5, y + 2);
        ctx.lineTo(x + 3, y - 2.5);
        ctx.stroke();
      }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.72), material);
    front.position.set(0, -0.24, 7.235);
    this.board.add(front);
    const back = front.clone();
    back.position.z = -7.235;
    back.rotation.y = Math.PI;
    this.board.add(back);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.16), material);
    base.position.set(0, -0.614, 0);
    base.rotation.x = Math.PI / 2;
    this.board.add(base);
  }
  private makeBoard() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c3543, roughness: 0.68, metalness: 0.06 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb99a62, roughness: 0.46, metalness: 0.38 });
    this.box(14.45, 0.74, 14.45, dark, -0.235, 0.2);
    this.box(14.23, 0.11, 14.23, brass, 0.14, 0.05);
    this.makeEmbroidery();
    const surface = new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.83 });
    this.box(13.96, 0.16, 13.96, surface, 0.28, 0.06);
    const line = new THREE.MeshStandardMaterial({ color: 0xa69778, roughness: 0.95 });
    for (let i = 0; i < 15; i++) {
      const p = START + i * STEP;
      const h = new THREE.Mesh(new THREE.BoxGeometry(12.61, 0.006, 0.022), line);
      h.position.set(0, 0.368, p);
      this.board.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 12.61), line);
      v.position.set(p, 0.368, 0);
      this.board.add(v);
    }
    const ink = new THREE.MeshStandardMaterial({ color: 0x907d5b, roughness: 0.8 });
    for (const x of [3, 7, 11])
      for (const y of [3, 7, 11]) {
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.009, 20), ink);
        dot.position.set(START + x * STEP, 0.377, START + y * STEP);
        this.board.add(dot);
      }
  }
  private makeAvatar(color: 'black' | 'white') {
    const group = new THREE.Group();
    const isBlack = color === 'black';
    const shell = new THREE.MeshPhysicalMaterial({
      color: isBlack ? 0x182d3a : 0xf5ecd8,
      roughness: 0.34,
      clearcoat: 0.72,
    });
    const face = new THREE.MeshStandardMaterial({ color: isBlack ? 0x304859 : 0xfff9e9, roughness: 0.57 });
    const accent = new THREE.MeshStandardMaterial({
      color: isBlack ? 0xe4bd77 : 0x677f88,
      metalness: 0.26,
      roughness: 0.42,
    });
    const eye = new THREE.MeshBasicMaterial({ color: isBlack ? 0xf8eacb : 0x213746 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const plinth = add(new THREE.CylinderGeometry(1.12, 1.2, 0.13, 40), accent, 0, 0.01, 0);
    plinth.receiveShadow = true;
    const body = add(new THREE.SphereGeometry(0.82, 32, 22), shell, 0, 0.88, 0);
    body.scale.set(1, 1.18, 0.78);
    const belly = add(new THREE.SphereGeometry(0.59, 28, 20), face, 0, 0.83, 0.51);
    belly.scale.set(1, 0.82, 0.38);
    const head = add(new THREE.SphereGeometry(0.73, 32, 22), shell, 0, 1.84, 0.12);
    head.scale.set(1, 0.91, 0.84);
    const arms: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const arm = add(new THREE.SphereGeometry(0.25, 20, 16), shell, side * 0.78, 1.07, 0.22);
      arm.scale.set(0.85, 1.45, 0.9);
      arms.push(arm);
      const eyeMesh = add(new THREE.SphereGeometry(0.078, 16, 12), eye, side * 0.24, 1.93, 0.69);
      eyeMesh.scale.z = 0.35;
      add(new THREE.SphereGeometry(0.16, 18, 14), accent, side * 0.41, 2.46, -0.06);
    }
    const halo = add(new THREE.TorusGeometry(1.3, 0.035, 8, 64), accent, 0, 0.04, 0);
    halo.rotation.x = Math.PI / 2;
    halo.visible = false;
    return { group, halo, head, arms };
  }
  setSeats(role: 'black' | 'white' | 'spectator' | null, turn: 'black' | 'white' | null) {
    if (role !== this.seatRole) {
      const front = role === 'white' ? 'white' : 'black';
      const compact = this.host.clientWidth < 600;
      for (const color of ['black', 'white'] as const) {
        const near = color === front;
        const avatar = this.avatars[color].group;
        avatar.position.set(near ? -4.8 : 4.8, -0.08, near ? 9.1 : -9.1);
        avatar.rotation.y = Math.atan2(-avatar.position.x, -avatar.position.z);
        avatar.scale.setScalar(compact ? (near ? 1 : 0.93) : near ? 1.16 : 1.07);
      }
      this.seatRole = role;
    }
    for (const color of ['black', 'white'] as const)
      this.avatars[color].halo.visible = turn === color || this.celebrating === color;
    this.render();
  }
  celebrate(winner: Seat) {
    if (this.celebrating === winner) return;
    this.clearCelebration();
    this.celebrating = winner;
    this.avatars[winner === 'black' ? 'white' : 'black'].group.visible = false;
    this.celebrationStarted = performance.now();
    const rig = this.avatars[winner];
    const center = rig.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const outwardRotation = rig.group.rotation.y + Math.PI;
    const distance = this.host.clientWidth < 600 ? 8.2 : 7.5;
    const cameraEnd = center
      .clone()
      .add(new THREE.Vector3(Math.sin(outwardRotation) * distance, 2.9, Math.cos(outwardRotation) * distance));
    const cameraStart = this.camera.position.clone();
    const targetStart = this.controls.target.clone();
    const baseY = rig.group.position.y;
    const baseRotation = rig.group.rotation.y;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.camera.position.copy(cameraEnd);
      this.controls.target.copy(center);
      rig.group.rotation.y = outwardRotation;
      rig.halo.visible = true;
      this.controls.update();
      return;
    }
    let lastFrame = 0;
    const frame = (now: number) => {
      if (this.celebrating !== winner) return;
      this.celebrationFrame = requestAnimationFrame(frame);
      if (now - lastFrame < 30) return;
      lastFrame = now;
      const elapsed = now - this.celebrationStarted;
      const progress = Math.min(1, Math.max(0, (elapsed - 600) / 1150));
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1 || elapsed < 1800) {
        this.camera.position.copy(cameraStart).lerp(cameraEnd, eased);
        this.controls.target.copy(targetStart).lerp(center, eased);
        this.controls.update();
      }
      const turn = 1 - (1 - Math.min(1, elapsed / 650)) ** 3;
      const beat = Math.max(0, (elapsed - 650) / 1000);
      rig.group.rotation.y = baseRotation + Math.PI * turn + (elapsed > 650 ? Math.sin(beat * 4) * 0.3 : 0);
      if (elapsed > 650) {
        rig.group.position.y = baseY + Math.abs(Math.sin(beat * 7)) * 0.28;
        rig.head.rotation.z = Math.sin(beat * 5) * 0.15;
        rig.arms[0].rotation.z = -0.55 - Math.sin(beat * 7) * 0.45;
        rig.arms[1].rotation.z = 0.55 + Math.sin(beat * 7 + Math.PI) * 0.45;
        rig.halo.scale.setScalar(1 + Math.sin(beat * 6) * 0.08);
      }
      this.render();
    };
    this.celebrationFrame = requestAnimationFrame(frame);
  }
  clearCelebration() {
    cancelAnimationFrame(this.celebrationFrame);
    this.celebrating = null;
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.group.visible = true;
      rig.group.position.y = -0.08;
      rig.group.rotation.y = Math.atan2(-rig.group.position.x, -rig.group.position.z);
      rig.head.rotation.z = 0;
      for (const arm of rig.arms) arm.rotation.z = 0;
      rig.halo.scale.setScalar(1);
      rig.halo.visible = false;
    }
    this.render();
  }
  private render() {
    this.renderer.render(this.scene, this.camera);
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }
  private point(e: PointerEvent): Point | null {
    if (this.camera.position.y <= SURFACE + 0.1) return null;
    const rect = this.host.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    const x = Math.round((this.hit.x - START) / STEP),
      y = Math.round((this.hit.z - START) / STEP);
    if (
      !inside(x, y) ||
      Math.abs(this.hit.x - (START + x * STEP)) > 0.43 ||
      Math.abs(this.hit.z - (START + y * STEP)) > 0.43
    )
      return null;
    return { x, y };
  }
  private inspect(e: PointerEvent, click = false) {
    const point = this.point(e);
    const key = point ? `${point.x},${point.y}` : null;
    if (!click && key === this.hoverKey) return;
    this.clearHighlight();
    if (!point || !this.interactive || !this.color) return;
    this.hoverKey = key;
    const current = boardFromMoves(this.moves);
    if (current[index(point.x, point.y)]) return;
    if (this.moves.length === 0 && (point.x !== 7 || point.y !== 7)) return;
    const verdict = analyzeMove(current, point.x, point.y, this.color);
    if (!verdict.legal) {
      this.mark(point, 0xc65c56, 0.37);
      for (const cause of verdict.causes) this.mark(cause, 0xc65c56, 0.5);
      const rect = this.host.getBoundingClientRect();
      this.onForbidden?.(point, verdict, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (click) this.onPlay?.(point);
    else this.mark(point, this.color === 1 ? 0x182936 : 0xd2bb8d, 0.32);
    this.render();
  }
  private mark(point: Point, color: number, radius: number, group = this.highlights) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.065, 40),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(START + point.x * STEP, 0.405, START + point.y * STEP);
    group.add(mesh);
  }
  private clearHighlight() {
    this.hoverKey = null;
    for (const child of [...this.highlights.children]) {
      this.highlights.remove(child);
      (child as THREE.Mesh).geometry.dispose();
      ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.onForbidden?.(null);
    this.render();
  }
  setState(moves: Move[], color: Color | null, interactive: boolean) {
    this.moves = moves;
    this.color = color;
    this.interactive = interactive;
    this.stones.clear();
    this.clearHighlight();
    for (const child of [...this.lastMove.children]) {
      this.lastMove.remove(child);
      (child as THREE.Mesh).geometry.dispose();
      ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
    for (const move of moves) {
      const stone = new THREE.Mesh(
        this.stoneGeometry,
        move.color === 1 ? this.stoneMaterials.black : this.stoneMaterials.white,
      );
      stone.scale.y = 0.5;
      stone.position.set(START + move.x * STEP, 0.51, START + move.y * STEP);
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.stones.add(stone);
    }
    if (moves.length) this.mark(moves[moves.length - 1], 0xd9b77a, 0.43, this.lastMove);
    this.render();
  }
  reset() {
    this.topView = false;
    this.camera.position.set(0, this.host.clientWidth < 600 ? 25 : 23, this.host.clientWidth < 600 ? 25 : 26);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  toggleTop() {
    if (this.topView && this.saved) {
      this.camera.position.copy(this.saved.position);
      this.controls.target.copy(this.saved.target);
    } else {
      this.saved = { position: this.camera.position.clone(), target: this.controls.target.clone() };
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, 32, 0.01));
    }
    this.topView = !this.topView;
    this.controls.update();
    return this.topView;
  }
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.camera.position
      .copy(this.controls.target)
      .add(
        offset.setLength(
          THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance),
        ),
      );
    this.controls.update();
  }
}
