import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  DEFAULT_APPEARANCE,
  type AccessoryStyle,
  type AvatarStyle,
  type BoardStyle,
  type PublicAppearance,
} from './appearance';
import {
  analyzeMove,
  boardFromMoves,
  index,
  inside,
  SIZE,
  winningLineFromMoves,
  type Color,
  type Move,
  type Point,
  type Verdict,
} from './rules';

const START = -6.3,
  STEP = 0.9,
  SURFACE = 0.37;
type Seat = 'black' | 'white';
type AvatarRig = {
  group: THREE.Group;
  character: THREE.Group;
  halo: THREE.Mesh;
  head: THREE.Mesh;
  arms: THREE.Mesh[];
  shell: THREE.MeshPhysicalMaterial;
  face: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  decorations: Partial<Record<AccessoryStyle, THREE.Group>>;
};
export const coordinate = (x: number, y: number) => `${'ABCDEFGHJKLMNOP'[x]}${y + 1}`;
export class RenjuBoard {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private controls: OrbitControls;
  private board = new THREE.Group();
  private stones = new THREE.Group();
  private preview = new THREE.Group();
  private stoneGeometry = new THREE.SphereGeometry(0.42, 32, 22);
  private whiteRimGeometry = new THREE.TorusGeometry(0.4, 0.03, 6, 48);
  private whiteRimMaterial = new THREE.MeshBasicMaterial({ color: 0x4e4335 });
  private stoneMaterials = {
    black: new THREE.MeshPhysicalMaterial({ color: 0x09131d, roughness: 0.21, metalness: 0.15, clearcoat: 0.9 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xfff9ee, roughness: 0.24, metalness: 0.02, clearcoat: 0.78 }),
  };
  private appearance: Record<Seat, PublicAppearance> = {
    black: { ...DEFAULT_APPEARANCE },
    white: { ...DEFAULT_APPEARANCE },
  };
  private boardMaterials?: {
    surface: THREE.MeshStandardMaterial;
    line: THREE.MeshStandardMaterial;
    ink: THREE.MeshStandardMaterial;
  };
  private highlights = new THREE.Group();
  private lastMove = new THREE.Group();
  private lastMoveFrame = 0;
  private lastMovePulses: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private impact = new THREE.Group();
  private impactFrame = 0;
  private winningLine = new THREE.Group();
  private winningStroke?: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private winningPoints: THREE.Vector3[] = [];
  private stateReady = false;
  private turn: Seat | null = null;
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
  private selected: Point | null = null;
  private keyboardPoint: Point = { x: 7, y: 7 };
  private keyboardStatus: HTMLElement;
  private topView = false;
  private saved?: { position: THREE.Vector3; target: THREE.Vector3 };
  onSelectionChange?: (point: Point | null) => void;
  onImmediateMove?: (point: Point) => void;
  onForbidden?: (point: Point | null, verdict?: Verdict, screen?: { x: number; y: number }) => void;
  onMoveCommitted?: (move: Move) => void;

  constructor(private host: HTMLElement) {
    this.camera.position.set(0, host.clientWidth < 600 ? 25 : 23, host.clientWidth < 600 ? 25 : 26);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '오목 바둑판');
    canvas.setAttribute('aria-describedby', 'board-keyboard-status');
    this.keyboardStatus = document.createElement('span');
    this.keyboardStatus.id = 'board-keyboard-status';
    this.keyboardStatus.className = 'board-keyboard-status';
    this.keyboardStatus.setAttribute('role', 'status');
    this.keyboardStatus.textContent = '방향키로 좌표 이동, Enter 또는 스페이스로 착수합니다.';
    host.append(canvas, this.keyboardStatus);
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
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => this.clearSelection());
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
    this.board.add(this.stones, this.preview, this.highlights, this.lastMove, this.impact, this.winningLine);
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
          this.clearSelection();
        }
      }
      if (e.button === 0 && !this.multiTouch) this.down = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') {
        this.clearHighlight();
        if (e.buttons && this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8)
          this.clearSelection();
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
    canvas.addEventListener('focus', () => this.showKeyboardPoint());
    canvas.addEventListener('blur', () => this.clearHighlight());
    canvas.addEventListener('keydown', (event) => {
      const movement: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const step = movement[event.key];
      if (step) {
        event.preventDefault();
        this.keyboardPoint = {
          x: THREE.MathUtils.clamp(this.keyboardPoint.x + step.x, 0, SIZE - 1),
          y: THREE.MathUtils.clamp(this.keyboardPoint.y + step.y, 0, SIZE - 1),
        };
        this.showKeyboardPoint();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const point = this.keyboardPoint;
        if (!this.interactive || !this.color) {
          this.keyboardStatus.textContent = '지금은 착수할 수 없습니다.';
          return;
        }
        const current = boardFromMoves(this.moves);
        if (current[index(point.x, point.y)] || (this.moves.length === 0 && (point.x !== 7 || point.y !== 7))) {
          this.showKeyboardPoint();
          return;
        }
        const verdict = analyzeMove(current, point.x, point.y, this.color);
        if (!verdict.legal) {
          this.showKeyboardPoint();
          return;
        }
        this.onImmediateMove?.(point);
      }
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
    const surface = new THREE.MeshStandardMaterial({ color: 0xb98250, roughness: 0.86 });
    this.box(13.96, 0.16, 13.96, surface, 0.28, 0.06);
    const line = new THREE.MeshStandardMaterial({ color: 0x64472e, roughness: 0.95 });
    for (let i = 0; i < 15; i++) {
      const p = START + i * STEP;
      const h = new THREE.Mesh(new THREE.BoxGeometry(12.61, 0.006, 0.022), line);
      h.position.set(0, 0.368, p);
      this.board.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 12.61), line);
      v.position.set(p, 0.368, 0);
      this.board.add(v);
    }
    const ink = new THREE.MeshStandardMaterial({ color: 0x4e3828, roughness: 0.8 });
    this.boardMaterials = { surface, line, ink };
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
    const decorations: Partial<Record<AccessoryStyle, THREE.Group>> = {};
    const decorate = (
      style: AccessoryStyle,
      pieces: { geometry: THREE.BufferGeometry; x: number; y: number; z: number }[],
    ) => {
      const set = new THREE.Group();
      for (const piece of pieces) {
        const mesh = new THREE.Mesh(piece.geometry, accent);
        mesh.position.set(piece.x, piece.y, piece.z);
        mesh.castShadow = true;
        set.add(mesh);
      }
      set.visible = false;
      group.add(set);
      decorations[style] = set;
    };
    decorate('flower', [
      { geometry: new THREE.SphereGeometry(0.2, 16, 12), x: -0.49, y: 2.39, z: 0.42 },
      { geometry: new THREE.SphereGeometry(0.12, 16, 12), x: -0.7, y: 2.24, z: 0.4 },
    ]);
    decorate('leaf', [
      { geometry: new THREE.ConeGeometry(0.16, 0.43, 12), x: 0.31, y: 2.55, z: 0.14 },
      { geometry: new THREE.ConeGeometry(0.12, 0.32, 12), x: 0.03, y: 2.57, z: 0.17 },
    ]);
    decorate(
      'crown',
      [-0.42, 0, 0.42].map((x) => ({
        geometry: new THREE.ConeGeometry(0.17, x === 0 ? 0.55 : 0.42, 8),
        x,
        y: 2.59,
        z: 0.12,
      })),
    );
    decorate(
      'sun',
      Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return {
          geometry: new THREE.SphereGeometry(0.17, 12, 10),
          x: -0.48 + Math.cos(angle) * 0.2,
          y: 2.36 + Math.sin(angle) * 0.2,
          z: 0.48,
        };
      }),
    );
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
    const character = new THREE.Group();
    group.add(character);
    for (const child of [...group.children]) if (child !== plinth && child !== character) character.add(child);
    return { group, character, halo, head, arms, shell, face, accent, decorations };
  }
  setBoardStyle(style: BoardStyle) {
    if (!this.boardMaterials) return;
    const palette = {
      oak: [0xb98250, 0x64472e, 0x4e3828],
      walnut: [0x997653, 0x473627, 0x35291e],
      linen: [0x8e8b7d, 0x464438, 0x36342d],
      ink: [0x7b8c96, 0x3b4f5b, 0x2d404b],
      meadow: [0x87916d, 0x4b5e38, 0x39492d],
    }[style];
    this.boardMaterials.surface.color.setHex(palette[0]);
    this.boardMaterials.line.color.setHex(palette[1]);
    this.boardMaterials.ink.color.setHex(palette[2]);
    this.render();
  }
  setAppearance(seat: Seat, appearance: PublicAppearance) {
    this.appearance[seat] = appearance;
    const stone = {
      classic: seat === 'black' ? [0x09131d, 0.21, 0.15] : [0xfff9ee, 0.24, 0.02],
      jade: seat === 'black' ? [0x123b38, 0.16, 0.08] : [0xe8f4dc, 0.18, 0.04],
      slate: seat === 'black' ? [0x23272e, 0.68, 0.02] : [0xe5e3de, 0.62, 0.01],
      amber: seat === 'black' ? [0x493018, 0.24, 0.12] : [0xfff1d2, 0.24, 0.05],
      rose: seat === 'black' ? [0x442433, 0.27, 0.1] : [0xffe8ee, 0.24, 0.03],
    }[appearance.stone];
    const material = this.stoneMaterials[seat];
    material.color.setHex(stone[0]);
    material.roughness = stone[1];
    material.metalness = stone[2];
    const rig = this.avatars[seat];
    const avatar = {
      classic: seat === 'black' ? [0x182d3a, 0x304859, 0xe4bd77] : [0xf5ecd8, 0xfff9e9, 0x677f88],
      coral: seat === 'black' ? [0x583240, 0x815160, 0xf2bd89] : [0xffe2d4, 0xfff2e8, 0xc36566],
      mint: seat === 'black' ? [0x1e4946, 0x3b6961, 0xe6ce9e] : [0xe0f0e4, 0xf6fcf3, 0x58a592],
      royal: seat === 'black' ? [0x242e56, 0x394874, 0xe4c176] : [0xe0e5fa, 0xf9faff, 0x8b77b9],
      sunflower: seat === 'black' ? [0x634222, 0x8d6537, 0xefc45b] : [0xffedb5, 0xfff9dc, 0xcc9b3b],
    }[appearance.avatar as AvatarStyle];
    rig.shell.color.setHex(avatar[0]);
    rig.face.color.setHex(avatar[1]);
    rig.accent.color.setHex(avatar[2]);
    for (const [style, decoration] of Object.entries(rig.decorations))
      decoration!.visible = style === appearance.accessory;
    if (this.selected && this.color === (seat === 'black' ? 1 : 2)) {
      const preview = this.preview.children[0] as THREE.Mesh | undefined;
      if (preview) (preview.material as THREE.MeshPhysicalMaterial).color.setHex(stone[0]);
    }
    this.render();
  }
  setSeats(
    role: 'black' | 'white' | 'spectator' | null,
    turn: 'black' | 'white' | null,
    occupied: Record<Seat, boolean> = { black: true, white: true },
  ) {
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
    if (turn !== this.turn && turn) {
      const rig = this.avatars[turn];
      rig.halo.scale.setScalar(1.32);
      const started = performance.now();
      const pulse = (now: number) => {
        if (this.turn !== turn || this.celebrating) return;
        const progress = Math.min(1, (now - started) / 420);
        rig.halo.scale.setScalar(1.32 - 0.32 * (1 - (1 - progress) ** 3));
        this.render();
        if (progress < 1) requestAnimationFrame(pulse);
      };
      requestAnimationFrame(pulse);
    }
    this.turn = turn;
    for (const color of ['black', 'white'] as const) {
      this.avatars[color].character.visible = occupied[color];
      this.avatars[color].halo.visible = turn === color || this.celebrating === color;
    }
    this.render();
  }
  celebrate(winner: Seat, five = false) {
    if (this.celebrating === winner) return;
    this.clearCelebration();
    this.celebrating = winner;
    if (five) this.drawWinningLine();
    const loser = this.avatars[winner === 'black' ? 'white' : 'black'];
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
    let lastFrame = 0;
    const frame = (now: number) => {
      if (this.celebrating !== winner) return;
      this.celebrationFrame = requestAnimationFrame(frame);
      if (now - lastFrame < 30) return;
      lastFrame = now;
      const elapsed = Math.max(0, now - this.celebrationStarted - (this.winningPoints.length ? 680 : 0));
      const fall = 1 - (1 - Math.min(1, elapsed / 800)) ** 3;
      loser.character.rotation.z = (Math.PI / 2) * fall;
      const progress = Math.min(1, Math.max(0, (elapsed - 600) / 1150));
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1 || elapsed < 1800) {
        this.camera.position.copy(cameraStart).lerp(cameraEnd, eased);
        this.controls.target.copy(targetStart).lerp(center, eased);
        this.controls.update();
      }
      const turn = 1 - (1 - Math.min(1, elapsed / 650)) ** 3;
      const beat = Math.max(0, (elapsed - 650) / 1000);
      const style = this.appearance[winner].victory;
      rig.group.rotation.y =
        baseRotation + Math.PI * turn + (elapsed > 650 ? (style === 'spin' ? beat * 3 : Math.sin(beat * 4) * 0.3) : 0);
      if (elapsed > 650) {
        rig.group.position.y =
          baseY + Math.abs(Math.sin(beat * (style === 'spin' ? 4 : 7))) * (style === 'bow' ? 0.04 : 0.28);
        rig.head.rotation.z = style === 'bow' ? 0.22 + Math.sin(beat * 3) * 0.06 : Math.sin(beat * 5) * 0.15;
        rig.group.rotation.x = style === 'bow' ? -0.16 - Math.sin(beat * 3) * 0.04 : 0;
        rig.arms[0].rotation.z = style === 'cheer' ? -1.65 : -0.55 - Math.sin(beat * 7) * 0.45;
        rig.arms[1].rotation.z = style === 'cheer' ? 1.65 : 0.55 + Math.sin(beat * 7 + Math.PI) * 0.45;
        rig.halo.scale.setScalar(1 + Math.sin(beat * 6) * 0.08);
      }
      this.render();
    };
    this.celebrationFrame = requestAnimationFrame(frame);
  }
  clearCelebration() {
    if (this.celebrating === null && !this.winningStroke) return false;
    cancelAnimationFrame(this.celebrationFrame);
    this.celebrating = null;
    this.clearWinningLine();
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.character.rotation.z = 0;
      rig.group.position.y = -0.08;
      rig.group.rotation.x = 0;
      rig.group.rotation.y = Math.atan2(-rig.group.position.x, -rig.group.position.z);
      rig.head.rotation.z = 0;
      for (const arm of rig.arms) arm.rotation.z = 0;
      rig.halo.scale.setScalar(1);
      rig.halo.visible = false;
    }
    this.render();
    return true;
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
    if (click) this.clearSelection();
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
    } else if (click && e.pointerType === 'mouse') this.onImmediateMove?.(point);
    else if (click) this.select(point);
    else this.mark(point, this.color === 1 ? 0x182936 : 0xd2bb8d, 0.32);
    this.render();
  }
  private showKeyboardPoint() {
    this.clearHighlight();
    const point = this.keyboardPoint;
    const position = coordinate(point.x, point.y);
    if (!this.interactive || !this.color) {
      this.keyboardStatus.textContent = `${position}. 지금은 착수할 수 없습니다.`;
      return;
    }
    const current = boardFromMoves(this.moves);
    if (current[index(point.x, point.y)]) {
      this.keyboardStatus.textContent = `${position}. 이미 돌이 놓인 자리입니다.`;
      this.mark(point, 0xc65c56, 0.37);
    } else if (this.moves.length === 0 && (point.x !== 7 || point.y !== 7)) {
      this.keyboardStatus.textContent = `${position}. 첫 수는 중앙 H8에 놓으세요.`;
      this.mark(point, 0xc65c56, 0.37);
    } else {
      const verdict = analyzeMove(current, point.x, point.y, this.color);
      const forbidden = verdict.forbidden
        ? { overline: '장목', 'double-four': '4·4', 'double-three': '3·3' }[verdict.forbidden]
        : '착수할 수 없는 자리';
      this.keyboardStatus.textContent = verdict.legal
        ? `${position}. 빈 자리. Enter 또는 스페이스로 착수합니다.`
        : `${position}. ${forbidden}입니다.`;
      this.mark(point, verdict.legal ? 0x3b7f6d : 0xc65c56, 0.37);
    }
    this.render();
  }
  get selectedPoint(): Point | null {
    return this.selected ? { ...this.selected } : null;
  }
  private select(point: Point) {
    if (!this.color) return;
    this.selected = { ...point };
    const material = new THREE.MeshPhysicalMaterial({
      color: this.stoneMaterials[this.color === 1 ? 'black' : 'white'].color,
      roughness: 0.25,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const stone = new THREE.Mesh(this.stoneGeometry, material);
    stone.scale.y = 0.56;
    stone.position.set(START + point.x * STEP, 0.55, START + point.y * STEP);
    this.preview.add(stone);
    this.onSelectionChange?.(this.selectedPoint);
  }
  clearSelection() {
    if (!this.selected && !this.preview.children.length) return;
    this.selected = null;
    for (const child of [...this.preview.children]) {
      this.preview.remove(child);
      ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.onSelectionChange?.(null);
    this.render();
  }
  takeSelection(): Point | null {
    const point = this.selectedPoint;
    this.clearSelection();
    return point;
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
  private markLastMove(move: Move) {
    const x = START + move.x * STEP;
    const z = START + move.y * STEP;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.48, 48),
      new THREE.MeshBasicMaterial({ color: 0xffbd55, side: THREE.DoubleSide, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.405, z);
    this.lastMove.add(ring);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffaa42,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.402, z);
    this.lastMove.add(glow);

    this.lastMovePulses = Array.from({ length: 2 }, () => {
      const pulse = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.44, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffd677,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.set(x, 0.41, z);
      this.lastMove.add(pulse);
      return pulse;
    });
    const started = performance.now();
    let lastFrame = 0;
    const animate = (now: number) => {
      this.lastMoveFrame = requestAnimationFrame(animate);
      if (now - lastFrame < 30) return;
      lastFrame = now;
      for (const [i, pulse] of this.lastMovePulses.entries()) {
        const progress = ((now - started) / 1600 + i * 0.5) % 1;
        pulse.scale.setScalar(1 + progress * 0.4);
        pulse.material.opacity = 0.9 * (1 - progress) ** 1.5;
      }
      this.render();
    };
    this.lastMoveFrame = requestAnimationFrame(animate);
  }
  private clearImpact() {
    cancelAnimationFrame(this.impactFrame);
    for (const child of [...this.impact.children]) {
      this.impact.remove(child);
      (child as THREE.Mesh).geometry.dispose();
      ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
  }
  private animateImpact(stone: THREE.Mesh, move: Move) {
    this.clearImpact();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffd17a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(START + move.x * STEP, 0.415, START + move.y * STEP);
    this.impact.add(ring);
    const started = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / 360);
      const settle = Math.min(1, t / 0.62);
      stone.position.y = 0.55 + (1 - settle) ** 2 * 0.9 - Math.sin(settle * Math.PI) * 0.045;
      stone.scale.setScalar(0.8 + 0.2 * settle);
      stone.scale.y *= 0.56;
      ring.scale.setScalar(1 + t * 1.45);
      ring.material.opacity = 0.75 * (1 - t) ** 2;
      this.render();
      if (t < 1) this.impactFrame = requestAnimationFrame(frame);
      else this.clearImpact();
    };
    this.impactFrame = requestAnimationFrame(frame);
  }
  private clearWinningLine() {
    for (const child of [...this.winningLine.children]) {
      this.winningLine.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    this.winningStroke = undefined;
    this.winningPoints = [];
  }
  private drawWinningLine() {
    const points = winningLineFromMoves(this.moves);
    if (!points.length) return;
    this.winningPoints = points.map((point) => new THREE.Vector3(START + point.x * STEP, 0.92, START + point.y * STEP));
    const geometry = new THREE.BufferGeometry().setFromPoints([this.winningPoints[0], this.winningPoints[0]]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffb949,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
    });
    this.winningStroke = new THREE.Line(geometry, material);
    this.winningLine.add(this.winningStroke);
    const started = performance.now();
    const frame = (now: number) => {
      if (!this.winningStroke || this.celebrating === null) return;
      const progress = Math.min(1, (now - started) / 620);
      const end = this.winningPoints[0].clone().lerp(this.winningPoints.at(-1)!, progress);
      this.winningStroke.geometry.setFromPoints([this.winningPoints[0], end]);
      this.render();
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
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
  setState(moves: Move[], color: Color | null, interactive: boolean, live = true) {
    if (
      this.stateReady &&
      moves.length === this.moves.length &&
      moves.every(
        (move, i) => move.x === this.moves[i].x && move.y === this.moves[i].y && move.color === this.moves[i].color,
      )
    ) {
      this.color = color;
      this.interactive = interactive;
      return;
    }
    const committed =
      this.stateReady &&
      live &&
      moves.length === this.moves.length + 1 &&
      this.moves.every((move, i) => move.x === moves[i].x && move.y === moves[i].y && move.color === moves[i].color)
        ? moves.at(-1)
        : undefined;
    this.stateReady = true;
    this.clearImpact();
    cancelAnimationFrame(this.lastMoveFrame);
    this.lastMovePulses = [];
    this.clearSelection();
    this.moves = moves.map((move) => ({ ...move }));
    this.color = color;
    this.interactive = interactive;
    this.stones.clear();
    this.clearWinningLine();
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
      stone.scale.y = 0.56;
      stone.position.set(START + move.x * STEP, 0.55, START + move.y * STEP);
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.stones.add(stone);
      if (move.color === 2) {
        const rim = new THREE.Mesh(this.whiteRimGeometry, this.whiteRimMaterial);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(stone.position.x, 0.46, stone.position.z);
        this.stones.add(rim);
      }
      if (move === committed) this.animateImpact(stone, move);
    }
    this.host.dataset.renderedMoves = String(moves.length);
    if (moves.length) this.markLastMove(moves[moves.length - 1]);
    if (committed) this.onMoveCommitted?.(committed);
    if (document.activeElement === this.renderer.domElement) this.showKeyboardPoint();
    this.render();
  }
  reset() {
    this.clearSelection();
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
