import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { observeViewerAccess } from './avatar-access';
import { loadPetalAvatar, type PetalAvatar, type AvatarMotion } from './petal-avatar';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roseStoneGeometry } from './rose-stone';
import { CHARACTER_STONE_BODIES, createStoneDetails } from './stone-designs';
import {
  DEFAULT_APPEARANCE,
  type AccessoryStyle,
  type AvatarStyle,
  type BoardStyle,
  type PlayerAppearance,
  type StoneStyle,
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
type ShowcaseFocus = 'stone' | 'avatar' | 'accessory' | 'board' | 'victory';
type AvatarRig = {
  petal?: PetalAvatar;
  loadingPetal?: Promise<void>;
  accessoryMount: THREE.Group;
  group: THREE.Group;
  character: THREE.Group;
  halo: THREE.Mesh;
  body: THREE.Mesh;
  belly: THREE.Mesh;
  head: THREE.Mesh;
  arms: THREE.Mesh[];
  ears: THREE.Mesh[];
  basePieces: THREE.Mesh[];
  variantHeads: Partial<Record<AvatarStyle, THREE.Mesh>>;
  variantArms: Partial<Record<AvatarStyle, THREE.Mesh[]>>;
  activeHead: THREE.Mesh;
  activeArms: THREE.Mesh[];
  shell: THREE.MeshPhysicalMaterial;
  face: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  decorations: Partial<Record<AccessoryStyle, THREE.Group>>;
  variants: Partial<Record<AvatarStyle, THREE.Group>>;
};
export const coordinate = (x: number, y: number) => `${'ABCDEFGHJKLMNOP'[x]}${y + 1}`;
export class RenjuBoard {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private renderRequested = true;
  private controls!: OrbitControls | TrackballControls;
  private freeAvatarRotation = false;
  private previewMotion: AvatarMotion = 'idle';
  private modelStatus: HTMLElement;
  private board = new THREE.Group();
  private stones = new THREE.Group();
  private showcaseStone = new THREE.Group();
  private showcaseStoneMesh: THREE.Mesh;
  private showcaseStoneRim: THREE.Mesh;
  private showcaseFocus: ShowcaseFocus | null = null;
  private showcaseSeat: Seat = 'black';
  private preview = new THREE.Group();
  private stoneGeometries: Record<StoneStyle, THREE.BufferGeometry> = {
    classic: new THREE.LatheGeometry(
      [
        [0, -0.22],
        [0.33, -0.22],
        [0.4, -0.18],
        [0.42, -0.1],
        [0.42, 0],
        [0.4, 0.1],
        [0.34, 0.21],
        [0.2, 0.29],
        [0, 0.32],
      ].map(([radius, height]) => new THREE.Vector2(radius, height)),
      48,
    ),
    jade: new THREE.IcosahedronGeometry(0.43, 1),
    rose: roseStoneGeometry(),
    ...CHARACTER_STONE_BODIES,
  };
  private avatarBodies = {
    round: new THREE.SphereGeometry(0.82, 32, 22),
  };
  private avatarHeads = {
    round: new THREE.SphereGeometry(0.73, 32, 22),
  };
  private whiteRimGeometry = new THREE.TorusGeometry(0.4, 0.03, 6, 48);
  private whiteRimMaterial = new THREE.MeshBasicMaterial({ color: 0x4e4335 });
  private stoneMaterials = {
    black: new THREE.MeshPhysicalMaterial({
      color: 0x09131d,
      roughness: 0.31,
      metalness: 0.04,
      clearcoat: 0.68,
      clearcoatRoughness: 0.22,
    }),
    white: new THREE.MeshPhysicalMaterial({
      color: 0xfff9ee,
      roughness: 0.3,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
  };
  private stoneDetailsTemplates: Record<Seat, Partial<Record<StoneStyle, THREE.Group>>> = { black: {}, white: {} };
  private appearance: Record<Seat, PlayerAppearance> = {
    black: { ...DEFAULT_APPEARANCE },
    white: { ...DEFAULT_APPEARANCE },
  };
  private boardMaterials?: {
    surface: THREE.MeshStandardMaterial;
    line: THREE.MeshStandardMaterial;
    ink: THREE.MeshStandardMaterial;
  };
  private boardVariants: Partial<Record<BoardStyle, THREE.Group>> = {};
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
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    canvas.addEventListener('auxclick', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    this.keyboardStatus = document.createElement('span');
    this.keyboardStatus.id = 'board-keyboard-status';
    this.keyboardStatus.className = 'board-keyboard-status';
    this.keyboardStatus.setAttribute('role', 'status');
    this.keyboardStatus.textContent = '방향키로 좌표 이동, Enter 또는 스페이스로 착수합니다.';
    host.append(canvas, this.keyboardStatus);
    this.configureControls();
    this.modelStatus = document.createElement('span');
    this.modelStatus.className = 'avatar-model-status';
    this.modelStatus.setAttribute('role', 'status');
    this.modelStatus.hidden = true;
    host.append(this.modelStatus);
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
    const displayBase = new THREE.Mesh(
      new RoundedBoxGeometry(3.85, 0.24, 3.85, 4, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x314b50, roughness: 0.68, metalness: 0.12 }),
    );
    displayBase.position.y = -0.11;
    displayBase.castShadow = true;
    displayBase.receiveShadow = true;
    const displaySurface = new THREE.Mesh(
      new RoundedBoxGeometry(3.62, 0.09, 3.62, 3, 0.045),
      new THREE.MeshStandardMaterial({ color: 0xc49260, roughness: 0.88 }),
    );
    displaySurface.position.y = 0.06;
    displaySurface.receiveShadow = true;
    this.showcaseStone.add(displayBase, displaySurface);
    const displayLine = new THREE.MeshStandardMaterial({ color: 0x67452d, roughness: 0.95 });
    for (const offset of [-0.88, 0, 0.88]) {
      const horizontal = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.006, 0.018), displayLine);
      horizontal.position.set(0, 0.111, offset);
      const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 3.25), displayLine);
      vertical.position.set(offset, 0.111, 0);
      this.showcaseStone.add(horizontal, vertical);
    }
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d')!;
    const shadowGradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
    shadowGradient.addColorStop(0, '#171e1c8c');
    shadowGradient.addColorStop(0.55, '#171e1c52');
    shadowGradient.addColorStop(1, '#171e1c00');
    shadowContext.fillStyle = shadowGradient;
    shadowContext.fillRect(0, 0, 128, 128);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.45, 2.45),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.118;
    this.showcaseStone.add(contactShadow);
    this.showcaseStoneMesh = new THREE.Mesh(this.stoneGeometries.classic, this.stoneMaterials.black);
    this.showcaseStoneMesh.scale.set(2.5, 1.35, 2.5);
    this.placeShowcaseStone();
    this.showcaseStoneMesh.castShadow = true;
    this.showcaseStoneRim = new THREE.Mesh(this.whiteRimGeometry, this.whiteRimMaterial);
    this.showcaseStoneRim.rotation.x = Math.PI / 2;
    this.showcaseStoneRim.scale.setScalar(2.5);
    this.showcaseStoneRim.position.y = this.showcaseStoneMesh.position.y - 0.2;
    this.showcaseStone.add(this.showcaseStoneMesh, this.showcaseStoneRim);
    this.showcaseStone.visible = false;
    this.scene.add(this.showcaseStone);
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
    const stopAccess = observeViewerAccess((allowed) => {
      if (this.freeAvatarRotation === allowed) return;
      this.freeAvatarRotation = allowed;
      if (this.showcaseFocus) this.frameShowcaseCamera(this.showcaseFocus);
    });
    let lastFrame = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const delta = Math.min(Math.max(0, (now - lastFrame) / 1000), 0.05);
      lastFrame = now;
      if (this.controls instanceof TrackballControls) this.controls.update();
      let animated = false;
      for (const seat of ['black', 'white'] as const) {
        const rig = this.avatars[seat];
        if (this.appearance[seat].avatar !== 'petal' || !rig.petal || !rig.group.visible || !rig.character.visible)
          continue;
        rig.petal.update(delta);
        rig.accessoryMount.matrix.copy(rig.petal.accessoryTransform);
        animated = true;
      }
      if (animated) this.render();
      // Input, board effects and character animation share one GPU submission per frame.
      if (this.renderRequested) {
        this.renderRequested = false;
        this.renderer.render(this.scene, this.camera);
      }
    });
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) {
        stopAccess();
        this.renderer.setAnimationLoop(null);
        this.controls.dispose();
      }
    });
  }

  private configureControls() {
    const target = this.controls?.target.clone() ?? new THREE.Vector3();
    this.controls?.dispose();
    this.camera.up.set(0, 1, 0);
    const avatarView = ['avatar', 'accessory', 'victory'].includes(this.showcaseFocus ?? '');
    if (avatarView && this.freeAvatarRotation) {
      const controls = new TrackballControls(this.camera, this.renderer.domElement);
      controls.rotateSpeed = 3;
      controls.zoomSpeed = 1.1;
      controls.panSpeed = 0.3;
      controls.staticMoving = true;
      controls.multiTouchRoll = true;
      controls.minDistance = 2.6;
      controls.maxDistance = 22;
      this.controls = controls;
    } else {
      const controls = new OrbitControls(this.camera, this.renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = !avatarView;
      controls.rotateSpeed = 0.75;
      controls.zoomSpeed = 0.9;
      controls.panSpeed = 0.7;
      controls.minDistance = this.showcaseFocus && this.showcaseFocus !== 'board' ? 2.6 : 11;
      controls.maxDistance = this.showcaseFocus && this.showcaseFocus !== 'board' ? 22 : 58;
      controls.minPolarAngle = avatarView ? Math.PI / 3 : 0.06;
      controls.maxPolarAngle = avatarView ? Math.PI / 2 : Math.PI / 2 - 0.04;
      controls.minAzimuthAngle = avatarView ? -Math.PI / 3 : -Infinity;
      controls.maxAzimuthAngle = avatarView ? Math.PI / 3 : Infinity;
      controls.mouseButtons.LEFT = this.showcaseFocus ? THREE.MOUSE.ROTATE : null;
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      controls.touches.ONE = this.showcaseFocus ? THREE.TOUCH.ROTATE : null;
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
      controls.zoomToCursor = !avatarView;
      controls.screenSpacePanning = false;
      this.controls = controls;
    }
    this.controls.target.copy(target);
    this.controls.addEventListener('start', () => this.clearSelection());
    this.controls.addEventListener('change', () => this.render());
    this.host.dataset.freeAvatarRotation = String(avatarView && this.freeAvatarRotation);
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
    const detail = (style: BoardStyle, color: number) => {
      const group = new THREE.Group();
      group.visible = false;
      this.board.add(group);
      this.boardVariants[style] = group;
      return { group, material: new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.12 }) };
    };
    const walnut = detail('walnut', 0xc6a779);
    for (const side of [-1, 1]) {
      const railX = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.11, 13.55, 2, 0.05), walnut.material);
      railX.position.set(side * 6.78, 0.41, 0);
      walnut.group.add(railX);
      const railZ = new THREE.Mesh(new RoundedBoxGeometry(13.55, 0.11, 0.15, 2, 0.05), walnut.material);
      railZ.position.set(0, 0.41, side * 6.78);
      walnut.group.add(railZ);
    }
    const linen = detail('linen', 0xf1e4c8);
    for (const side of [-1, 1])
      for (let i = 0; i < 28; i++) {
        const p = -6.37 + i * 0.47;
        const stitchX = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.035), linen.material);
        stitchX.position.set(p, 0.377, side * 6.69);
        linen.group.add(stitchX);
        const stitchZ = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.16), linen.material);
        stitchZ.position.set(side * 6.69, 0.377, p);
        linen.group.add(stitchZ);
      }
    const inkFrame = detail('ink', 0xb2c8d3);
    for (const x of [-6.67, 6.67])
      for (const z of [-6.67, 6.67]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.42), inkFrame.material);
        plate.position.set(x, 0.396, z);
        plate.rotation.y = Math.PI / 4;
        inkFrame.group.add(plate);
      }
    const meadow = detail('meadow', 0xd5c892);
    for (const x of [-6.6, 6.6])
      for (const z of [-6.6, 6.6]) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 5), meadow.material);
        leaf.position.set(x, 0.395, z);
        leaf.rotation.x = Math.PI / 2;
        leaf.rotation.z = x * z > 0 ? 0.65 : -0.65;
        meadow.group.add(leaf);
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
    const body = add(this.avatarBodies.round, shell, 0, 0.88, 0);
    body.scale.set(1, 1.18, 0.78);
    const belly = add(new THREE.SphereGeometry(0.59, 28, 20), face, 0, 0.83, 0.51);
    belly.scale.set(1, 0.82, 0.38);
    const head = add(this.avatarHeads.round, shell, 0, 1.84, 0.12);
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
    const crownBand = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.055, 8, 32), accent);
    crownBand.name = 'petal-crown-band';
    crownBand.position.set(0, 2.37, 0.12);
    crownBand.rotation.x = Math.PI / 2;
    crownBand.castShadow = true;
    crownBand.visible = false;
    decorations.crown!.add(crownBand);
    const arms: THREE.Mesh[] = [];
    const ears: THREE.Mesh[] = [];
    const basePieces: THREE.Mesh[] = [body, belly, head];
    for (const side of [-1, 1]) {
      const arm = add(new THREE.SphereGeometry(0.25, 20, 16), shell, side * 0.78, 1.07, 0.22);
      arm.scale.set(0.85, 1.45, 0.9);
      arms.push(arm);
      basePieces.push(arm);
      const eyeMesh = add(new THREE.SphereGeometry(0.078, 16, 12), eye, side * 0.24, 1.93, 0.69);
      eyeMesh.scale.z = 0.35;
      basePieces.push(eyeMesh);
      const ear = add(new THREE.SphereGeometry(0.16, 18, 14), accent, side * 0.41, 2.46, -0.06);
      ears.push(ear);
      basePieces.push(ear);
    }
    const variants: Partial<Record<AvatarStyle, THREE.Group>> = {};
    const variant = (style: AvatarStyle) => {
      const set = new THREE.Group();
      set.visible = false;
      group.add(set);
      variants[style] = set;
      return set;
    };
    const piece = (
      parent: THREE.Group,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      scale: [number, number, number] = [1, 1, 1],
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const variantHeads: Partial<Record<AvatarStyle, THREE.Mesh>> = {};
    const variantArms: Partial<Record<AvatarStyle, THREE.Mesh[]>> = {};
    const detail = new THREE.MeshStandardMaterial({ color: isBlack ? 0x291e27 : 0x42363a, roughness: 0.8 });
    const blush = new THREE.MeshStandardMaterial({ color: 0xee8d91, roughness: 0.85 });
    const warm = new THREE.MeshStandardMaterial({ color: 0xffb969, roughness: 0.55 });
    const creature = (
      style: AvatarStyle,
      bodyGeometry: THREE.BufferGeometry,
      bodyScale: [number, number, number],
      headGeometry: THREE.BufferGeometry,
      headScale: [number, number, number],
      headY = 1.85,
    ) => {
      const set = variant(style);
      piece(set, bodyGeometry, shell, 0, 0.91, 0, bodyScale);
      const h = piece(set, headGeometry, face, 0, headY, 0.08, headScale);
      const hands: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        hands.push(
          piece(
            set,
            new THREE.SphereGeometry(0.23, 20, 14),
            shell,
            side * (style === 'coral' ? 0.57 : 0.7),
            1.07,
            0.28,
            [0.8, 1.15, 0.7],
          ),
        );
        piece(set, new THREE.SphereGeometry(0.073, 14, 10), detail, side * 0.25, headY + 0.06, 0.76, [1, 1, 0.4]);
      }
      variantHeads[style] = h;
      piece(
        set,
        new THREE.TorusGeometry(0.12, 0.014, 5, 18, Math.PI),
        detail,
        0,
        headY - 0.17,
        0.78,
        [1, 0.78, 1],
        [0, 0, Math.PI],
      );
      variantArms[style] = hands;
      return set;
    };
    const rose = creature(
      'coral',
      new THREE.ConeGeometry(0.91, 1.67, 9),
      [1, 1, 0.81],
      new THREE.SphereGeometry(0.65, 32, 20),
      [1, 0.88, 0.78],
    );
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      piece(
        rose,
        new THREE.SphereGeometry(0.32, 16, 12),
        shell,
        Math.sin(angle) * 0.71,
        0.34,
        Math.cos(angle) * 0.52,
        [1, 0.52, 0.72],
      );
    }
    for (const side of [-1, 1]) {
      piece(
        rose,
        new THREE.SphereGeometry(0.32, 16, 12),
        shell,
        side * 0.48,
        2.31,
        0.12,
        [0.9, 1.45, 0.73],
        [0, 0, side * 0.5],
      );
      piece(rose, new THREE.SphereGeometry(0.12, 12, 10), blush, side * 0.41, 1.79, 0.69, [1.35, 0.56, 0.42]);
    }
    piece(rose, new THREE.SphereGeometry(0.17, 16, 12), accent, 0, 2.48, 0.18);

    const cat = creature(
      'royal',
      new THREE.SphereGeometry(0.76, 28, 20),
      [1, 1.07, 0.77],
      new THREE.SphereGeometry(0.72, 28, 18),
      [1.1, 0.85, 0.8],
    );
    for (const side of [-1, 1]) {
      piece(
        cat,
        new THREE.ConeGeometry(0.29, 0.7, 4),
        shell,
        side * 0.54,
        2.43,
        0.04,
        [1, 1, 0.8],
        [0, 0, -side * 0.19],
      );
      piece(cat, new THREE.SphereGeometry(0.27, 16, 12), face, side * 0.37, 1.67, 0.64, [1, 0.55, 0.48]);
    }
    piece(cat, new THREE.SphereGeometry(0.1, 12, 8), blush, 0, 1.77, 0.79, [1, 0.65, 0.45]);
    piece(
      cat,
      new THREE.TorusGeometry(0.42, 0.13, 8, 28, Math.PI * 1.35),
      face,
      0.85,
      1.08,
      -0.32,
      [1, 1, 1],
      [0, Math.PI / 2, 0.6],
    );

    const chick = creature(
      'sunflower',
      new THREE.SphereGeometry(0.83, 28, 20),
      [1.08, 1.13, 0.86],
      new THREE.SphereGeometry(0.7, 28, 18),
      [1, 0.9, 0.85],
      1.88,
    );
    piece(chick, new THREE.ConeGeometry(0.21, 0.48, 4), warm, 0, 1.77, 0.83, [1, 1, 1], [Math.PI / 2, Math.PI / 4, 0]);
    for (const side of [-1, 1]) {
      piece(
        chick,
        new THREE.SphereGeometry(0.41, 18, 12),
        shell,
        side * 0.72,
        0.95,
        0,
        [0.59, 0.72, 0.34],
        [0, 0, side * 0.25],
      );
      piece(chick, new THREE.SphereGeometry(0.17, 12, 8), warm, side * 0.41, 0.13, 0.44, [1.25, 0.44, 0.6]);
    }
    piece(chick, new THREE.ConeGeometry(0.16, 0.39, 5), accent, 0, 2.63, 0.03, [1, 1, 1], [0, 0, -0.24]);

    const rabbit = creature(
      'shadow',
      new THREE.SphereGeometry(0.74, 28, 18),
      [0.87, 1.19, 0.77],
      new THREE.SphereGeometry(0.68, 28, 18),
      [1, 0.9, 0.8],
    );
    for (const side of [-1, 1]) {
      piece(
        rabbit,
        new THREE.SphereGeometry(0.27, 18, 14),
        shell,
        side * 0.39,
        2.8,
        -0.03,
        [0.72, 2.0, 0.53],
        [0, 0, -side * 0.13],
      );
      piece(
        rabbit,
        new THREE.SphereGeometry(0.14, 14, 10),
        blush,
        side * 0.39,
        2.84,
        0.09,
        [0.65, 2.3, 0.27],
        [0, 0, -side * 0.13],
      );
    }
    piece(rabbit, new THREE.SphereGeometry(0.35, 16, 12), face, 0, 0.96, 0.55, [0.8, 0.93, 0.25]);
    piece(rabbit, new THREE.SphereGeometry(0.11, 12, 8), blush, 0, 1.73, 0.72, [1, 0.7, 0.45]);
    const halo = add(new THREE.TorusGeometry(1.3, 0.035, 8, 64), accent, 0, 0.04, 0);
    halo.rotation.x = Math.PI / 2;
    halo.visible = false;
    const character = new THREE.Group();
    group.add(character);
    for (const child of [...group.children]) if (child !== plinth && child !== character) character.add(child);
    const accessoryMount = new THREE.Group();
    accessoryMount.matrixAutoUpdate = false;
    character.add(accessoryMount);
    for (const decoration of Object.values(decorations)) accessoryMount.add(decoration);
    return {
      accessoryMount,
      group,
      character,
      halo,
      body,
      belly,
      head,
      arms,
      ears,
      basePieces,
      variantHeads,
      variantArms,
      activeHead: head,
      activeArms: arms,
      shell,
      face,
      accent,
      decorations,
      variants,
    };
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
    for (const [name, detail] of Object.entries(this.boardVariants)) detail.visible = name === style;
    this.render();
  }
  private placeShowcaseStone(style?: StoneStyle) {
    if (style) {
      this.showcaseStoneMesh.geometry = this.stoneGeometries[style];
      this.showcaseStoneMesh.scale.y = {
        classic: 1.35,
        jade: 0.9,
        rose: 1.55,
        chick: 1.35,
        puppy: 1.35,
        kitten: 1.35,
        bunny: 1.35,
        fox: 1.35,
        panda: 1.35,
        frog: 1.35,
        owl: 1.35,
        star: 1.55,
        dragon: 1.45,
      }[style];
      this.applyStoneDetails(this.showcaseStoneMesh, this.showcaseSeat, style);
    }
    const geometry = this.showcaseStoneMesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    this.showcaseStoneMesh.position.y = 0.1 - (geometry.boundingBox?.min.y ?? -0.42) * this.showcaseStoneMesh.scale.y;
  }
  private stoneRestY(style: StoneStyle) {
    const geometry = this.stoneGeometries[style];
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return SURFACE - (geometry.boundingBox?.min.y ?? -0.42) * this.stoneScaleY(style) + 0.005;
  }
  private stoneScaleY(style: StoneStyle) {
    return style === 'classic' || style === 'jade' ? 0.56 : style === 'star' ? 0.85 : 0.65;
  }
  private stoneScaleXZ(style: StoneStyle) {
    return ['chick', 'puppy', 'kitten', 'bunny', 'fox', 'panda', 'frog', 'owl'].includes(style) ? 0.86 : 1;
  }
  private applyStoneDetails(stone: THREE.Mesh, seat: Seat, style: StoneStyle) {
    const current = stone.getObjectByName('stone-details');
    if (current) stone.remove(current);
    if (style === 'classic' || style === 'jade' || style === 'rose') return;
    let template = this.stoneDetailsTemplates[seat][style];
    if (!template) {
      template = createStoneDetails(style, seat, this.stoneMaterials[seat])!;
      this.stoneDetailsTemplates[seat][style] = template;
    }
    stone.add(template.clone(true));
  }
  setAppearance(seat: Seat, appearance: PlayerAppearance) {
    this.appearance[seat] = appearance;
    const stone = {
      classic: seat === 'black' ? [0x09131d, 0.31, 0.04] : [0xfff9ee, 0.3, 0.02],
      jade: seat === 'black' ? [0x123b38, 0.16, 0.08] : [0xe8f4dc, 0.18, 0.04],
      rose: seat === 'black' ? [0x9c1028, 0.29, 0.03] : [0xedb72f, 0.28, 0.03],
      chick: seat === 'black' ? [0xd18b2d, 0.43, 0.01] : [0xffe9a3, 0.43, 0.01],
      puppy: seat === 'black' ? [0x83553f, 0.53, 0.01] : [0xe9c9a5, 0.5, 0.01],
      kitten: seat === 'black' ? [0x545578, 0.41, 0.02] : [0xe6ddef, 0.42, 0.01],
      bunny: seat === 'black' ? [0x9474a4, 0.52, 0.01] : [0xf7e5f0, 0.49, 0.01],
      fox: seat === 'black' ? [0xbd5a34, 0.49, 0.01] : [0xf4c999, 0.48, 0.01],
      panda: seat === 'black' ? [0x35434b, 0.48, 0.01] : [0xf8f4e9, 0.46, 0.01],
      frog: seat === 'black' ? [0x277b5c, 0.45, 0.01] : [0xb7e6a3, 0.45, 0.01],
      owl: seat === 'black' ? [0x655074, 0.51, 0.01] : [0xddcfe2, 0.5, 0.01],
      star: seat === 'black' ? [0x3859a7, 0.24, 0.24] : [0xbad6f8, 0.27, 0.17],
      dragon: seat === 'black' ? [0x2b6d69, 0.26, 0.18] : [0xbbe3d3, 0.28, 0.13],
    }[appearance.stone];
    const material = this.stoneMaterials[seat];
    material.color.setHex(stone[0]);
    material.roughness = appearance.stone === 'rose' ? 0.68 : stone[1];
    material.metalness = stone[2];
    material.clearcoat = appearance.stone === 'rose' ? 0.14 : 0.68;
    material.vertexColors = appearance.stone === 'rose';
    material.side = appearance.stone === 'rose' ? THREE.DoubleSide : THREE.FrontSide;
    material.needsUpdate = true;
    for (const child of this.stones.children) {
      if (child.userData.seat !== seat) continue;
      if (child.userData.stone) {
        (child as THREE.Mesh).geometry = this.stoneGeometries[appearance.stone];
        child.scale.x = child.scale.z = this.stoneScaleXZ(appearance.stone);
        child.scale.y = this.stoneScaleY(appearance.stone);
        child.position.y = this.stoneRestY(appearance.stone);
        this.applyStoneDetails(child as THREE.Mesh, seat, appearance.stone);
      }
      if (child.userData.rim) child.visible = appearance.stone === 'classic';
    }
    if (seat === this.showcaseSeat) {
      this.placeShowcaseStone(appearance.stone);
      this.showcaseStoneRim.position.y = this.showcaseStoneMesh.position.y - 0.2;
      this.showcaseStoneRim.visible = seat === 'white' && appearance.stone === 'classic';
    }
    const rig = this.avatars[seat];
    const avatar = {
      classic: seat === 'black' ? [0x182d3a, 0x304859, 0xe4bd77] : [0xf5ecd8, 0xfff9e9, 0x677f88],
      coral: seat === 'black' ? [0xa6536c, 0xeaa5a3, 0xffd28f] : [0xef9db0, 0xffe1df, 0xc36566],
      royal: seat === 'black' ? [0x242e56, 0x394874, 0xe4c176] : [0xe0e5fa, 0xf9faff, 0x8b77b9],
      sunflower: seat === 'black' ? [0xe9ad48, 0xffdf80, 0xefc45b] : [0xffd86e, 0xfff5b8, 0xcc9b3b],
      shadow: seat === 'black' ? [0x66627f, 0xaaa4c8, 0xb1bfce] : [0xc4cad2, 0xe8edf0, 0x53637a],
      petal: [0xc78782, 0xfff0d8, 0xb89b75],
    }[appearance.avatar as AvatarStyle];
    rig.shell.color.setHex(avatar[0]);
    rig.face.color.setHex(avatar[1]);
    rig.accent.color.setHex(avatar[2]);
    const isClassic = appearance.avatar === 'classic';
    for (const mesh of rig.basePieces) mesh.visible = isClassic;
    rig.activeHead.rotation.z = 0;
    for (const arm of rig.activeArms) arm.rotation.z = 0;
    rig.activeHead = rig.variantHeads[appearance.avatar] ?? rig.head;
    rig.activeArms = rig.variantArms[appearance.avatar] ?? rig.arms;
    for (const [style, decoration] of Object.entries(rig.decorations)) {
      decoration.visible = style === appearance.accessory;
      const petal = appearance.avatar === 'petal';
      decoration.scale.setScalar(petal ? 0.48 : 1);
      const anchor = { flower: 2.65, leaf: 2.9, crown: 2.87, sun: 2.7 }[style as Exclude<AccessoryStyle, 'none'>];
      decoration.position.y = petal ? anchor - 2.4 * 0.48 : 0;
      if (style === 'crown') decoration.getObjectByName('petal-crown-band')!.visible = petal;
    }
    for (const [style, variant] of Object.entries(rig.variants)) variant!.visible = style === appearance.avatar;
    rig.accessoryMount.matrix.identity();
    if (rig.petal) rig.petal.root.visible = appearance.avatar === 'petal';
    this.host.dataset[`avatar${seat === 'black' ? 'Black' : 'White'}`] = appearance.avatar;
    if (appearance.avatar === 'petal') void this.ensurePetal(seat);
    this.syncAvatarMotion();
    this.updateModelStatus();
    if (this.selected && this.color === (seat === 'black' ? 1 : 2)) {
      const preview = this.preview.children[0] as THREE.Mesh | undefined;
      if (preview) {
        preview.geometry = this.stoneGeometries[appearance.stone];
        preview.scale.x = preview.scale.z = this.stoneScaleXZ(appearance.stone);
        preview.scale.y = this.stoneScaleY(appearance.stone);
        preview.position.y = this.stoneRestY(appearance.stone);
        this.applyStoneDetails(preview, seat, appearance.stone);
        const previewMaterial = preview.material as THREE.MeshPhysicalMaterial;
        previewMaterial.color.setHex(stone[0]);
        previewMaterial.vertexColors = appearance.stone === 'rose';
        previewMaterial.side = appearance.stone === 'rose' ? THREE.DoubleSide : THREE.FrontSide;
        previewMaterial.needsUpdate = true;
      }
    }
    this.render();
  }
  private async ensurePetal(seat: Seat) {
    const rig = this.avatars[seat];
    if (rig.petal || rig.loadingPetal) return;
    const key = seat === 'black' ? 'petalBlack' : 'petalWhite';
    this.host.dataset[key] = 'loading';
    this.updateModelStatus();
    rig.loadingPetal = loadPetalAvatar()
      .then((petal) => {
        rig.petal = petal;
        rig.character.add(petal.root);
        petal.root.visible = this.appearance[seat].avatar === 'petal';
        this.host.dataset[key] = 'ready';
        this.syncAvatarMotion();
        this.render();
      })
      .catch(() => {
        this.host.dataset[key] = 'error';
      })
      .finally(() => {
        rig.loadingPetal = undefined;
        this.updateModelStatus();
      });
    await rig.loadingPetal;
  }

  private updateModelStatus() {
    const states = (['black', 'white'] as const)
      .filter(
        (seat) =>
          this.appearance[seat].avatar === 'petal' &&
          this.avatars[seat].group.visible &&
          this.avatars[seat].character.visible,
      )
      .map((seat) => this.host.dataset[seat === 'black' ? 'petalBlack' : 'petalWhite']);
    this.modelStatus.hidden = !states.some((state) => state === 'loading' || state === 'error');
    this.modelStatus.textContent = states.includes('error')
      ? '페탈을 불러오지 못했습니다. 다시 선택해 주세요.'
      : '페탈을 불러오는 중…';
  }

  private syncAvatarMotion() {
    for (const seat of ['black', 'white'] as const) {
      const motion = this.celebrating
        ? this.celebrating === seat
          ? 'win'
          : 'lose'
        : this.showcaseFocus
          ? this.previewMotion
          : 'idle';
      this.avatars[seat].petal?.play(motion);
      this.host.dataset[seat === 'black' ? 'avatarBlackMotion' : 'avatarWhiteMotion'] = motion;
    }
  }

  previewAvatarMotion(motion: AvatarMotion) {
    this.clearCelebration();
    this.previewMotion = motion;
    this.syncAvatarMotion();
  }

  focusShowcase(focus: ShowcaseFocus, seat: Seat) {
    this.clearCelebration();
    this.showcaseFocus = focus;
    this.showcaseSeat = seat;
    this.host.dataset.focus = focus;
    this.topView = false;
    this.board.visible = focus === 'board';
    this.stones.visible = false;
    this.lastMove.visible = false;
    this.highlights.visible = false;
    this.preview.visible = false;
    this.impact.visible = false;
    this.winningLine.visible = false;
    this.showcaseStone.visible = focus === 'stone';
    this.showcaseStoneMesh.material = this.stoneMaterials[seat];
    this.placeShowcaseStone(this.appearance[seat].stone);
    this.showcaseStoneRim.position.y = this.showcaseStoneMesh.position.y - 0.2;
    this.showcaseStoneRim.visible = seat === 'white' && this.appearance[seat].stone === 'classic';
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.group.visible = (focus === 'avatar' || focus === 'accessory' || focus === 'victory') && color === seat;
      if (color === seat) {
        rig.group.position.set(0, -0.08, 0);
        rig.group.rotation.y = 0;
      }
    }
    this.frameShowcaseCamera(focus);
    this.updateModelStatus();
  }

  private frameShowcaseCamera(focus: ShowcaseFocus) {
    this.configureControls();
    this.controls.minDistance = focus === 'board' ? 11 : 2.6;
    this.controls.maxDistance = focus === 'board' ? 58 : 22;
    const view = {
      stone: { position: [3.6, 5.3, 5.7], target: [0, 0.25, 0] },
      avatar: { position: [0, 3, 7.8], target: [0, 1.45, 0] },
      accessory: { position: [0, 2.9, 5.5], target: [0, 2.25, 0] },
      board: { position: [0, 23, 17], target: [0, 0, 0] },
      victory: { position: [0, 3, 7.8], target: [0, 1.45, 0] },
    }[focus];
    this.camera.position.set(...(view.position as [number, number, number]));
    this.controls.target.set(...(view.target as [number, number, number]));
    this.controls.update();
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
    this.syncAvatarMotion();
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
      loser.character.rotation.z =
        this.appearance[winner === 'black' ? 'white' : 'black'].avatar === 'petal' ? 0 : (Math.PI / 2) * fall;
      const progress = Math.min(1, Math.max(0, (elapsed - 600) / 1150));
      const eased = 1 - (1 - progress) ** 3;
      if (!this.showcaseFocus && (progress < 1 || elapsed < 1800)) {
        this.camera.position.copy(cameraStart).lerp(cameraEnd, eased);
        this.controls.target.copy(targetStart).lerp(center, eased);
        this.controls.update();
      }
      const turn = this.showcaseFocus ? 0 : 1 - (1 - Math.min(1, elapsed / 650)) ** 3;
      const beat = Math.max(0, (elapsed - 650) / 1000);
      const style = this.appearance[winner].victory;
      rig.group.rotation.y =
        baseRotation +
        Math.PI * turn +
        (elapsed > 650 && this.appearance[winner].avatar !== 'petal'
          ? style === 'spin'
            ? beat * 3
            : Math.sin(beat * 4) * 0.3
          : 0);
      if (elapsed > 650 && this.appearance[winner].avatar !== 'petal') {
        rig.group.position.y =
          baseY + Math.abs(Math.sin(beat * (style === 'spin' ? 4 : 7))) * (style === 'bow' ? 0.04 : 0.28);
        rig.activeHead.rotation.z = style === 'bow' ? 0.22 + Math.sin(beat * 3) * 0.06 : Math.sin(beat * 5) * 0.15;
        rig.group.rotation.x = style === 'bow' ? -0.16 - Math.sin(beat * 3) * 0.04 : 0;
        rig.activeArms[0].rotation.z = style === 'cheer' ? -1.65 : -0.55 - Math.sin(beat * 7) * 0.45;
        rig.activeArms[1].rotation.z = style === 'cheer' ? 1.65 : 0.55 + Math.sin(beat * 7 + Math.PI) * 0.45;
        rig.halo.scale.setScalar(1 + Math.sin(beat * 6) * 0.08);
      }
      this.render();
    };
    this.celebrationFrame = requestAnimationFrame(frame);
  }
  clearCelebration() {
    this.previewMotion = 'idle';
    if (this.celebrating === null && !this.winningStroke) {
      this.syncAvatarMotion();
      return false;
    }
    cancelAnimationFrame(this.celebrationFrame);
    this.celebrating = null;
    this.syncAvatarMotion();
    this.clearWinningLine();
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.character.rotation.z = 0;
      rig.group.position.y = -0.08;
      rig.group.rotation.x = 0;
      rig.group.rotation.y = this.showcaseFocus ? 0 : Math.atan2(-rig.group.position.x, -rig.group.position.z);
      rig.activeHead.rotation.z = 0;
      for (const arm of rig.activeArms) arm.rotation.z = 0;
      rig.halo.scale.setScalar(1);
      rig.halo.visible = false;
    }
    this.render();
    return true;
  }
  private render() {
    this.renderRequested = true;
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.controls instanceof TrackballControls) this.controls.handleResize();
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
      vertexColors: this.appearance[this.color === 1 ? 'black' : 'white'].stone === 'rose',
      side: this.appearance[this.color === 1 ? 'black' : 'white'].stone === 'rose' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const stone = new THREE.Mesh(
      this.stoneGeometries[this.appearance[this.color === 1 ? 'black' : 'white'].stone],
      material,
    );
    this.applyStoneDetails(
      stone,
      this.color === 1 ? 'black' : 'white',
      this.appearance[this.color === 1 ? 'black' : 'white'].stone,
    );
    const style = this.appearance[this.color === 1 ? 'black' : 'white'].stone;
    stone.scale.set(this.stoneScaleXZ(style), this.stoneScaleY(style), this.stoneScaleXZ(style));
    stone.position.set(
      START + point.x * STEP,
      this.stoneRestY(this.appearance[this.color === 1 ? 'black' : 'white'].stone),
      START + point.y * STEP,
    );
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
    const restY = stone.position.y;
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / 360);
      const settle = Math.min(1, t / 0.62);
      stone.position.y = restY + (1 - settle) ** 2 * 0.9 - Math.sin(settle * Math.PI) * 0.045;
      stone.scale.setScalar(0.8 + 0.2 * settle);
      const style = this.appearance[move.color === 1 ? 'black' : 'white'].stone;
      stone.scale.x *= this.stoneScaleXZ(style);
      stone.scale.z *= this.stoneScaleXZ(style);
      stone.scale.y *= this.stoneScaleY(style);
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
      const seat = move.color === 1 ? 'black' : 'white';
      const stone = new THREE.Mesh(this.stoneGeometries[this.appearance[seat].stone], this.stoneMaterials[seat]);
      this.applyStoneDetails(stone, seat, this.appearance[seat].stone);
      stone.userData.seat = seat;
      stone.userData.stone = true;
      const style = this.appearance[seat].stone;
      stone.scale.set(this.stoneScaleXZ(style), this.stoneScaleY(style), this.stoneScaleXZ(style));
      stone.position.set(START + move.x * STEP, this.stoneRestY(this.appearance[seat].stone), START + move.y * STEP);
      stone.castShadow = true;
      stone.receiveShadow = true;
      this.stones.add(stone);
      if (move.color === 2) {
        const rim = new THREE.Mesh(this.whiteRimGeometry, this.whiteRimMaterial);
        rim.userData.seat = 'white';
        rim.userData.rim = true;
        rim.visible = this.appearance.white.stone === 'classic';
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
    if (this.showcaseFocus) {
      this.focusShowcase(this.showcaseFocus, this.showcaseSeat);
      return;
    }
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
