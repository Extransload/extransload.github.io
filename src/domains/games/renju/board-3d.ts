import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { observeViewerAccess } from './avatar-access';
import { loadLunaAvatar, type LunaAvatar } from './luna-avatar';
import { FASHION_AVATARS, loadFashionAvatar, type FashionAvatar, type FashionStyle } from './fashion-avatar';
import { loadPetalAvatar, type PetalAvatar, type AvatarMotion } from './petal-avatar';
import { classicStoneGeometry, roseStoneGeometry, roseStoneStamp } from './rose-stone';
import {
  TIER_STONE_IDS,
  TIER_BOARD_IDS,
  createTierStone,
  animateTierStone,
  createTierBoard,
  type TierStoneStyle,
  type TierBoardStyle,
} from './tier-pieces';
import { DEFAULT_APPEARANCE, appearanceForSeat, type BoardStyle, type PlayerAppearance } from './appearance';
import { AVATAR_FLOOR, AVATAR_SPOTS } from './board-decor';
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
  SURFACE = 0.37,
  STONE_SCALE_Y = 0.65;
type Seat = 'black' | 'white';
type ShowcaseFocus = 'stone' | 'avatar' | 'board';
const isFashionAvatar = (style: PlayerAppearance['avatar']): style is FashionStyle =>
  (FASHION_AVATARS as readonly string[]).includes(style);
const isRiggedAvatar = (style: PlayerAppearance['avatar']) =>
  style === 'petal' || style === 'luna' || isFashionAvatar(style);
type AvatarRig = {
  petal?: PetalAvatar;
  loadingPetal?: Promise<void>;
  luna?: LunaAvatar;
  loadingLuna?: Promise<void>;
  fashion: Partial<Record<FashionStyle, FashionAvatar>>;
  loadingFashion: Partial<Record<FashionStyle, Promise<void>>>;
  group: THREE.Group;
  character: THREE.Group;
  plinth: THREE.Mesh;
  halo: THREE.Mesh;
  body: THREE.Mesh;
  belly: THREE.Mesh;
  head: THREE.Mesh;
  arms: THREE.Mesh[];
  ears: THREE.Mesh[];
  basePieces: THREE.Mesh[];
  activeHead: THREE.Mesh;
  activeArms: THREE.Mesh[];
  shell: THREE.MeshPhysicalMaterial;
  face: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
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
  private showcaseFocus: ShowcaseFocus | null = null;
  private showcaseSeat: Seat = 'black';
  private preview = new THREE.Group();
  private stoneGeometry = roseStoneGeometry();
  private classicStoneGeometry = classicStoneGeometry();
  private avatarBodies = {
    round: new THREE.SphereGeometry(0.82, 32, 22),
  };
  private avatarHeads = {
    round: new THREE.SphereGeometry(0.73, 32, 22),
  };
  private stoneStamp = roseStoneStamp();
  private woodTexture?: THREE.CanvasTexture;
  private tierBoard?: ReturnType<typeof createTierBoard>;
  private stoneMaterials = {
    black: new THREE.MeshPhysicalMaterial({
      color: 0x18191c,
      roughness: 0.34,
      metalness: 0.04,
      clearcoat: 0.6,
      bumpScale: this.stoneStamp.bumpScale,
      clearcoatRoughness: 0.18,
      vertexColors: true,
    }),
    white: new THREE.MeshPhysicalMaterial({
      color: 0xf5f3ed,
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.6,
      bumpScale: this.stoneStamp.bumpScale,
      clearcoatRoughness: 0.18,
      vertexColors: true,
    }),
  };
  private chosenAppearance = new Set<Seat>();
  private appearance: Record<Seat, PlayerAppearance> = {
    black: appearanceForSeat('black', 'black', DEFAULT_APPEARANCE),
    white: appearanceForSeat('white', 'white', DEFAULT_APPEARANCE),
  };
  private boardMaterials?: {
    body: THREE.MeshPhysicalMaterial;
    surface: THREE.MeshPhysicalMaterial;
    line: THREE.MeshBasicMaterial;
    ink: THREE.MeshBasicMaterial;
    detail: THREE.MeshBasicMaterial;
    edge: THREE.LineBasicMaterial;
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
  private hiddenCelebrationSeat: Seat | null = null;
  private celebrationBackdrop?: { board: boolean; plinth: boolean; halo: boolean };
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
    this.scene.add(new THREE.AmbientLight(0xf4eef8, 1.2));
    const key = new THREE.DirectionalLight(0xfff4ec, 4.3);
    key.position.set(-6, 13, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0002;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xaaa5da, 1.3);
    rim.position.set(8, 8, -9);
    this.scene.add(rim);
    this.scene.add(this.board);
    this.makeBoard();
    this.board.add(this.stones, this.preview, this.highlights, this.lastMove, this.impact, this.winningLine);
    const black = this.makeAvatar();
    const white = this.makeAvatar();
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
    let lastRender = 0;
    let renderGap = 0;
    let renderedLastFrame = false;
    this.renderer.setAnimationLoop((now) => {
      // Clips interpolate keyed poses, so keep elapsed time even when a frame takes longer.
      const delta = Math.max(0, (now - lastFrame) / 1000);
      lastFrame = now;
      if (renderedLastFrame) renderGap = now - lastRender;
      renderedLastFrame = false;
      if (this.controls instanceof TrackballControls) this.controls.update();
      let animated = false;
      if (this.board.visible) {
        if (this.tierBoard?.update) {
          this.tierBoard.update(now / 1000);
          animated = true;
        }
        for (const group of [this.stones, this.preview])
          for (const stone of group.children) {
            if (!stone.userData.tierStoneStyle) continue;
            animateTierStone(stone as THREE.Group, now / 1000);
            if (['astral', 'sovereign'].includes(stone.userData.tierStoneStyle)) animated = true;
          }
      }
      for (const seat of ['black', 'white'] as const) {
        const rig = this.avatars[seat];
        if (!rig.group.visible || !rig.character.visible) continue;
        const style = this.appearance[seat].avatar;
        const model =
          style === 'petal'
            ? rig.petal
            : style === 'luna'
              ? rig.luna
              : isFashionAvatar(style)
                ? rig.fashion[style]
                : undefined;
        if (!model || !isRiggedAvatar(this.appearance[seat].avatar)) continue;
        model.update(delta);
        animated = true;
      }
      // A software or very weak GPU can need most of a second per frame. Idle character motion then
      // leaves the main thread free between frames so input and game logic stay responsive.
      if (animated && now - lastRender >= (renderGap > 50 ? renderGap * 3 : 0)) this.render();
      // Input, board effects and character animation share one GPU submission per frame.
      if (this.renderRequested) {
        this.renderRequested = false;
        this.renderer.render(this.scene, this.camera);
        lastRender = now;
        renderedLastFrame = true;
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
    const avatarView = this.showcaseFocus === 'avatar';
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
      // Keep the avatar view in front of the seated avatar, which faces the board centre.
      const facing = avatarView ? this.avatars[this.showcaseSeat].group.rotation.y : 0;
      controls.minAzimuthAngle = avatarView ? facing - Math.PI / 3 : -Infinity;
      controls.maxAzimuthAngle = avatarView ? facing + Math.PI / 3 : Infinity;
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
    const lettering = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const navy = new THREE.MeshBasicMaterial({ color: 0x1c3543, toneMapped: false });
    const plaque = new THREE.Shape();
    plaque.moveTo(-1.98, -0.36);
    plaque.lineTo(1.98, -0.36);
    plaque.absarc(1.98, 0, 0.36, -Math.PI / 2, Math.PI / 2, false);
    plaque.lineTo(-1.98, 0.36);
    plaque.absarc(-1.98, 0, 0.36, Math.PI / 2, Math.PI * 1.5, false);
    const plaqueGeometry = new THREE.ShapeGeometry(plaque, 16);
    const labelGeometry = new THREE.PlaneGeometry(6.3, 0.92);
    for (const side of [-1, 1]) {
      const badge = new THREE.Group();
      const backing = new THREE.Mesh(plaqueGeometry, navy);
      const label = new THREE.Mesh(labelGeometry, lettering);
      label.position.z = 0.004;
      badge.add(backing, label);
      badge.position.set(0, -0.345, side * 7.24);
      badge.rotation.y = side === 1 ? 0 : Math.PI;
      this.board.add(badge);
    }
    // Keep the original underside signature; the playing surface stays clear.
    const base = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.16), lettering);
    base.position.set(0, -0.966, 0);
    base.rotation.x = Math.PI / 2;
    this.board.add(base);
  }

  private makeBoard() {
    const roundedSquare = (size: number, radius: number) => {
      const edge = size / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-edge + radius, -edge);
      shape.lineTo(edge - radius, -edge);
      shape.quadraticCurveTo(edge, -edge, edge, -edge + radius);
      shape.lineTo(edge, edge - radius);
      shape.quadraticCurveTo(edge, edge, edge - radius, edge);
      shape.lineTo(-edge + radius, edge);
      shape.quadraticCurveTo(-edge, edge, -edge, edge - radius);
      shape.lineTo(-edge, -edge + radius);
      shape.quadraticCurveTo(-edge, -edge, -edge + radius, -edge);
      return shape;
    };
    const body = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.25 });
    const surface = new THREE.MeshPhysicalMaterial({ roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    const slab = (size: number, depth: number, y: number, material: THREE.Material) => {
      const geometry = new THREE.ExtrudeGeometry(roundedSquare(size, 0.55), {
        depth,
        steps: 1,
        curveSegments: 16,
        bevelEnabled: true,
        bevelSize: 0.035,
        bevelThickness: 0.025,
        bevelSegments: 4,
      });
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        const top = Math.abs(normals.getY(i)) > 0.5;
        const along = Math.abs(normals.getX(i)) > 0.5 ? positions.getZ(i) : positions.getX(i);
        uv.setXY(i, 0.5 + along / size, top ? 0.5 + positions.getZ(i) / size : positions.getY(i) / depth);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.board.add(mesh);
    };
    // Thicken downward so the playing surface, picking and stones keep their existing height.
    slab(14.4, 1.19, -0.94, body);
    slab(14.22, 0.085, 0.25, surface);
    const line = new THREE.MeshBasicMaterial({ toneMapped: false });
    for (let i = 0; i < SIZE; i++) {
      const p = START + i * STEP;
      const h = new THREE.Mesh(new THREE.BoxGeometry(12.62, 0.006, 0.019), line);
      h.position.set(0, 0.368, p);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.006, 12.62), line);
      v.position.set(p, 0.368, 0);
      this.board.add(h, v);
    }
    const ink = new THREE.MeshBasicMaterial({ toneMapped: false });
    for (const x of [3, 7, 11])
      for (const y of [3, 7, 11]) {
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), ink);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(START + x * STEP, 0.377, START + y * STEP);
        this.board.add(dot);
      }
    const edge = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, toneMapped: false });
    const border = roundedSquare(13.54, 0.32)
      .getPoints(12)
      .map((point) => new THREE.Vector3(point.x, 0.371, point.y));
    this.board.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(border), edge));
    const detail = new THREE.MeshBasicMaterial({ toneMapped: false });
    // Small, flush flower inlays sit outside the playable grid.
    for (const x of [-6.77, 6.77])
      for (const z of [-6.77, 6.77]) {
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          const petal = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), detail);
          petal.rotation.x = -Math.PI / 2;
          petal.position.set(x + Math.cos(angle) * 0.067, 0.374, z + Math.sin(angle) * 0.067);
          this.board.add(petal);
        }
      }
    this.makeEmbroidery();
    this.boardMaterials = { body, surface, line, ink, detail, edge };
    this.setBoardStyle(DEFAULT_APPEARANCE.board);
  }
  /** Avatar trays rest on the slab's unseen table, or on the ground a living edition raises around it. */
  private avatarFloor() {
    return this.tierBoard?.avatarFloor ?? AVATAR_FLOOR;
  }
  private makeAvatar() {
    const group = new THREE.Group();
    const shell = new THREE.MeshPhysicalMaterial({
      color: 0x182d3a,
      roughness: 0.34,
      clearcoat: 0.72,
    });
    const face = new THREE.MeshStandardMaterial({ color: 0x304859, roughness: 0.57 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0xe4bd77,
      metalness: 0.26,
      roughness: 0.42,
    });
    const eye = new THREE.MeshBasicMaterial({ color: 0xf8eacb });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const trayMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe2d6e5,
      roughness: 0.4,
      clearcoat: 0.35,
    });
    const trayGeometry = new THREE.SphereGeometry(1.17, 48, 20);
    trayGeometry.scale(1, 0.04, 1);
    const plinth = add(trayGeometry, trayMaterial, 0, 0.01, 0);
    plinth.receiveShadow = true;
    const body = add(this.avatarBodies.round, shell, 0, 0.88, 0);
    body.scale.set(1, 1.18, 0.78);
    const belly = add(new THREE.SphereGeometry(0.59, 28, 20), face, 0, 0.83, 0.51);
    belly.scale.set(1, 0.82, 0.38);
    const head = add(this.avatarHeads.round, shell, 0, 1.84, 0.12);
    head.scale.set(1, 0.91, 0.84);
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
    const halo = add(new THREE.TorusGeometry(1.3, 0.035, 8, 64), accent, 0, 0.04, 0);
    halo.rotation.x = Math.PI / 2;
    halo.visible = false;
    const character = new THREE.Group();
    group.add(character);
    for (const child of [...group.children]) if (child !== plinth && child !== character) character.add(child);
    return {
      group,
      character,
      fashion: {},
      loadingFashion: {},
      plinth,
      halo,
      body,
      belly,
      head,
      arms,
      ears,
      basePieces,
      activeHead: head,
      activeArms: arms,
      shell,
      face,
      accent,
    };
  }
  setBoardStyle(style: BoardStyle) {
    if (!this.boardMaterials || this.host.dataset.boardStyle === style) return;
    if (this.tierBoard) {
      this.board.remove(this.tierBoard.decorations);
      this.tierBoard.dispose();
      this.tierBoard = undefined;
    }
    if ((TIER_BOARD_IDS as readonly string[]).includes(style)) {
      this.tierBoard = createTierBoard(style as TierBoardStyle);
      this.board.add(this.tierBoard.decorations);
    }
    // The first style is applied while the board is built, before the avatars exist.
    if (this.avatars) {
      for (const seat of ['black', 'white'] as const) this.avatars[seat].group.position.y = this.avatarFloor();
      if (this.showcaseFocus === 'avatar') this.frameShowcaseCamera(this.showcaseFocus);
    }
    const wood = style === 'wood';
    const palettes = {
      wood: { surface: 0xe5b878, body: 0xad7c4b, line: 0x614931, detail: 0x916c44 },
      walnut: { surface: 0xddbac9, body: 0xb58ca5, line: 0x9b718a, detail: 0xf2dae6 },
      linen: { surface: 0xcac5e0, body: 0x9c93b8, line: 0x8d82ab, detail: 0xeee8fb },
      meadow: { surface: 0xc4d6ca, body: 0x8faa9c, line: 0x7d978a, detail: 0xe7f1e8 },
    };
    const palette = this.tierBoard?.palette ?? palettes[style as keyof typeof palettes];
    this.boardMaterials.body.color.setHex(palette.body);
    this.boardMaterials.surface.color.setHex(palette.surface);
    this.boardMaterials.line.color.setHex(palette.line);
    this.boardMaterials.ink.color.setHex(palette.line);
    this.boardMaterials.detail.color.setHex(palette.detail);
    this.boardMaterials.detail.visible = !wood && !this.tierBoard;
    this.boardMaterials.edge.color.setHex(palette.line);
    if (wood && !this.woodTexture) this.woodTexture = this.makeWoodTexture();
    for (const material of [this.boardMaterials.body, this.boardMaterials.surface]) {
      const map = this.tierBoard?.map ?? (wood ? this.woodTexture! : null);
      if (material.map !== map) {
        material.map = map;
        material.needsUpdate = true;
      }
      material.roughness = this.tierBoard?.roughness ?? (wood ? 0.66 : 0.46);
      material.clearcoat = this.tierBoard?.clearcoat ?? (wood ? 0.12 : 0.3);
    }
    this.host.dataset.boardStyle = style;
    this.render();
  }
  private makeWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const grain = ctx.createImageData(1024, 1024);
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1024; x++) {
        const flow = y + 9 * Math.sin(x * 0.006) + 3 * Math.sin(x * 0.017 + y * 0.004);
        const rings = Math.pow((1 + Math.sin(flow * 0.18)) / 2, 10);
        const fibers = Math.sin(flow * 1.7 + Math.sin(x * 0.04)) * 2;
        const tone = 242 - rings * 23 + fibers;
        const offset = (y * 1024 + x) * 4;
        grain.data[offset] = tone;
        grain.data[offset + 1] = tone - 3;
        grain.data[offset + 2] = tone - 9;
        grain.data[offset + 3] = 255;
      }
    ctx.putImageData(grain, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }
  private makePlacedStone(move: Move, preview = false) {
    const seat = move.color === 1 ? 'black' : 'white';
    const style = this.appearance[seat].stone;
    const stone = (TIER_STONE_IDS as readonly string[]).includes(style)
      ? createTierStone(style as TierStoneStyle, seat)
      : new THREE.Mesh(style === 'classic' ? this.classicStoneGeometry : this.stoneGeometry, this.stoneMaterials[seat]);
    const bottom = new THREE.Box3().setFromObject(stone).min.y;
    stone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = !preview && !object.userData.stoneEffect;
      object.receiveShadow = true;
      if (!preview) return;
      const ghost = (material: THREE.Material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.opacity *= 0.86;
        if (copy instanceof THREE.ShaderMaterial && copy.uniforms.opacity) copy.uniforms.opacity.value = copy.opacity;
        copy.depthWrite = false;
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(ghost) : ghost(object.material);
    });
    stone.scale.set(1, STONE_SCALE_Y, 1);
    stone.position.set(START + move.x * STEP, SURFACE - bottom * STONE_SCALE_Y + 0.005, START + move.y * STEP);
    return stone;
  }
  setAppearance(seat: Seat, appearance: PlayerAppearance) {
    if (appearance.avatar === 'rose') appearance = { ...appearance, avatar: 'luna' };
    const stoneChanged = this.appearance[seat].stone !== appearance.stone;
    const stone = this.stoneMaterials[seat];
    const classic = appearance.stone === 'classic';
    stone.color.setHex(classic ? (seat === 'black' ? 0x18191c : 0xf5f3ed) : seat === 'black' ? 0x681934 : 0xf7c4d2);
    const stamp = classic ? null : this.stoneStamp.map;
    if (stone.map !== stamp) {
      stone.map = stamp;
      stone.bumpMap = classic ? null : this.stoneStamp.bumpMap;
      stone.needsUpdate = true;
    }
    stone.roughness = classic ? 0.34 : 0.52;
    stone.clearcoat = classic ? 0.6 : 0.2;
    if (stoneChanged) this.clearSelection();
    this.appearance[seat] = appearance;
    if (stoneChanged) {
      this.clearImpact();
      this.stones.clear();
      for (const move of this.moves) this.stones.add(this.makePlacedStone(move));
    }
    this.host.dataset[`stone${seat === 'black' ? 'Black' : 'White'}`] = appearance.stone;
    const rig = this.avatars[seat];
    const avatar = [0x182d3a, 0x304859, 0xe4bd77];
    rig.shell.color.setHex(avatar[0]);
    rig.face.color.setHex(avatar[1]);
    rig.accent.color.setHex(avatar[2]);
    for (const mesh of rig.basePieces) mesh.visible = false;
    rig.activeHead.rotation.z = 0;
    for (const arm of rig.activeArms) arm.rotation.z = 0;
    rig.activeHead = rig.head;
    rig.activeArms = rig.arms;
    if (rig.petal) rig.petal.root.visible = appearance.avatar === 'petal';
    if (rig.luna) rig.luna.root.visible = appearance.avatar === 'luna';
    for (const style of FASHION_AVATARS) {
      const model = rig.fashion[style];
      if (model) model.root.visible = appearance.avatar === style;
    }
    this.host.dataset[`avatar${seat === 'black' ? 'Black' : 'White'}`] = appearance.avatar;
    this.chosenAppearance.add(seat);
    this.ensureAvatarModel(seat);
    this.syncAvatarMotion();
    this.updateModelStatus();
    this.render();
  }
  // Models load only for seats a page has dressed and is showing, so an empty online seat or the
  // studio's opponent seat never downloads or parses a character.
  private ensureAvatarModel(seat: Seat) {
    if (!this.chosenAppearance.has(seat) || !this.avatars[seat].character.visible) return;
    const style = this.appearance[seat].avatar;
    if (style === 'petal') void this.ensurePetal(seat);
    if (style === 'luna') void this.ensureLuna(seat);
    if (style !== 'petal' && isFashionAvatar(style)) void this.ensureFashion(seat, style);
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

  private async ensureLuna(seat: Seat) {
    const rig = this.avatars[seat];
    if (rig.luna || rig.loadingLuna) return;
    const key = seat === 'black' ? 'lunaBlack' : 'lunaWhite';
    this.host.dataset[key] = 'loading';
    this.updateModelStatus();
    rig.loadingLuna = loadLunaAvatar()
      .then((luna) => {
        rig.luna = luna;
        rig.character.add(luna.root);
        luna.root.visible = this.appearance[seat].avatar === 'luna';
        this.host.dataset[key] = 'ready';
        this.syncAvatarMotion();
        this.render();
      })
      .catch(() => {
        this.host.dataset[key] = 'error';
      })
      .finally(() => {
        rig.loadingLuna = undefined;
        this.updateModelStatus();
      });
    await rig.loadingLuna;
  }

  private async ensureFashion(seat: Seat, style: FashionStyle) {
    const rig = this.avatars[seat];
    if (rig.fashion[style] || rig.loadingFashion[style]) return;
    const key = `${style}${seat === 'black' ? 'Black' : 'White'}`;
    this.host.dataset[key] = 'loading';
    this.updateModelStatus();
    rig.loadingFashion[style] = loadFashionAvatar(style)
      .then((avatar) => {
        rig.fashion[style] = avatar;
        rig.character.add(avatar.root);
        avatar.root.visible = this.appearance[seat].avatar === style;
        this.host.dataset[key] = 'ready';
        this.syncAvatarMotion();
        this.render();
      })
      .catch(() => {
        this.host.dataset[key] = 'error';
      })
      .finally(() => {
        delete rig.loadingFashion[style];
        this.updateModelStatus();
      });
    await rig.loadingFashion[style];
  }

  private updateModelStatus() {
    const visible = (['black', 'white'] as const).filter(
      (seat) =>
        isRiggedAvatar(this.appearance[seat].avatar) &&
        this.avatars[seat].group.visible &&
        this.avatars[seat].character.visible,
    );
    const states = visible.map(
      (seat) => this.host.dataset[`${this.appearance[seat].avatar}${seat === 'black' ? 'Black' : 'White'}`],
    );
    const name = '아바타를';
    this.modelStatus.hidden = !states.some((state) => state === 'loading' || state === 'error');
    this.modelStatus.textContent = states.includes('error')
      ? `${name} 불러오지 못했습니다. 다시 선택해 주세요.`
      : `${name} 불러오는 중…`;
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
      const dance = this.appearance[seat].dance;
      this.avatars[seat].petal?.play(motion, dance);
      this.avatars[seat].luna?.play(motion, dance);
      for (const style of FASHION_AVATARS) this.avatars[seat].fashion[style]?.play(motion, dance);
      this.host.dataset[seat === 'black' ? 'avatarBlackMotion' : 'avatarWhiteMotion'] = motion;
      this.host.dataset[seat === 'black' ? 'avatarBlackDance' : 'avatarWhiteDance'] = dance;
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
    // Keep the avatar preview clear of the board and floor trays.
    this.board.visible = focus !== 'avatar';
    this.stones.visible = true;
    this.lastMove.visible = false;
    this.highlights.visible = false;
    this.preview.visible = false;
    this.impact.visible = false;
    this.winningLine.visible = false;
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.group.visible = true;
      rig.plinth.visible = focus !== 'avatar' && rig.character.visible;
      rig.group.rotation.y = Math.atan2(-rig.group.position.x, -rig.group.position.z);
    }
    this.frameShowcaseCamera(focus);
    this.updateModelStatus();
  }

  private frameShowcaseCamera(focus: ShowcaseFocus) {
    this.configureControls();
    this.controls.minDistance = focus === 'board' ? 11 : 2.6;
    this.controls.maxDistance = focus === 'board' ? 58 : 22;
    const compact = this.host.clientWidth < 600;
    const target = new THREE.Vector3();
    const offset = new THREE.Vector3(0, compact ? 25 : 23, compact ? 25 : 26);
    if (focus === 'stone') {
      // Close over the sample stones around the centre point.
      target.set(0.45, SURFACE, 0.45);
      offset.set(3.3, 6.4, 6.6);
    } else if (focus === 'avatar') {
      const rig = this.avatars[this.showcaseSeat].group;
      const facing = rig.rotation.y;
      const distance = 7.6 * rig.scale.y;
      target.copy(rig.position).add(new THREE.Vector3(0, 1.85 * rig.scale.y, 0));
      offset.set(Math.sin(facing) * distance, 1.5 * rig.scale.y, Math.cos(facing) * distance);
    }
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(offset);
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
        const spot = AVATAR_SPOTS[near ? 0 : 1];
        avatar.position.set(spot.x, this.avatarFloor(), spot.z);
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
      this.avatars[color].halo.visible = !this.hiddenCelebrationSeat && (turn === color || this.celebrating === color);
      this.ensureAvatarModel(color);
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
    const baseRotation = rig.group.rotation.y;
    let lastFrame = 0;
    const frame = (now: number) => {
      if (this.celebrating !== winner) return;
      this.celebrationFrame = requestAnimationFrame(frame);
      if (now - lastFrame < 30) return;
      lastFrame = now;
      const elapsed = Math.max(0, now - this.celebrationStarted - (this.winningPoints.length ? 680 : 0));
      if (elapsed >= 600 && !this.hiddenCelebrationSeat && !this.showcaseFocus) {
        this.hiddenCelebrationSeat = winner === 'black' ? 'white' : 'black';
        this.celebrationBackdrop = {
          board: this.board.visible,
          plinth: rig.plinth.visible,
          halo: rig.halo.visible,
        };
        loser.group.visible = false;
        rig.plinth.visible = false;
        rig.halo.visible = false;
        this.board.visible = false;
        this.host.dataset.celebrationBackgroundHidden = 'true';
      }
      const fall = 1 - (1 - Math.min(1, elapsed / 800)) ** 3;
      loser.character.rotation.z = isRiggedAvatar(this.appearance[winner === 'black' ? 'white' : 'black'].avatar)
        ? 0
        : (Math.PI / 2) * fall;
      const progress = Math.min(1, Math.max(0, (elapsed - 600) / 1150));
      const eased = 1 - (1 - progress) ** 3;
      if (!this.showcaseFocus && (progress < 1 || elapsed < 1800)) {
        this.camera.position.copy(cameraStart).lerp(cameraEnd, eased);
        this.controls.target.copy(targetStart).lerp(center, eased);
        this.controls.update();
      }
      const turn = this.showcaseFocus ? 0 : 1 - (1 - Math.min(1, elapsed / 650)) ** 3;
      rig.group.rotation.y = baseRotation + Math.PI * turn;
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
    const winner = this.celebrating;
    this.celebrating = null;
    if (this.hiddenCelebrationSeat) {
      this.avatars[this.hiddenCelebrationSeat].group.visible = true;
      this.hiddenCelebrationSeat = null;
      if (this.celebrationBackdrop && winner) {
        this.board.visible = this.celebrationBackdrop.board;
        this.avatars[winner].plinth.visible = this.celebrationBackdrop.plinth;
        this.avatars[winner].halo.visible = this.celebrationBackdrop.halo;
        this.celebrationBackdrop = undefined;
      }
      this.host.dataset.celebrationBackgroundHidden = 'false';
    }
    this.syncAvatarMotion();
    this.clearWinningLine();
    for (const color of ['black', 'white'] as const) {
      const rig = this.avatars[color];
      rig.character.rotation.z = 0;
      rig.group.position.y = this.avatarFloor();
      rig.group.rotation.x = 0;
      rig.group.rotation.y = Math.atan2(-rig.group.position.x, -rig.group.position.z);
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
    const stone = this.makePlacedStone({ ...point, color: this.color }, true);
    this.preview.add(stone);
    this.onSelectionChange?.(this.selectedPoint);
  }
  clearSelection() {
    if (!this.selected && !this.preview.children.length) return;
    this.selected = null;
    for (const child of [...this.preview.children]) {
      this.preview.remove(child);
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
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
      new THREE.MeshBasicMaterial({ color: 0xe16eab, side: THREE.DoubleSide, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.405, z);
    this.lastMove.add(ring);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf1a6cc,
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
          color: 0xf7c9e6,
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
  private animateImpact(stone: THREE.Object3D, move: Move) {
    this.clearImpact();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf3b5dc,
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
      stone.scale.y *= STONE_SCALE_Y;
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
      color: 0xd957a5,
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
      const stone = this.makePlacedStone(move);
      this.stones.add(stone);
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
