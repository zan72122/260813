import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { GameFsm, matMarkerPosition } from '../game/fsm.ts';
import { PointerController } from '../input/PointerController.ts';
import type { Phase } from '../game/types.ts';
import { BasketSystem } from './baskets.ts';
import { CameraDirector, type Orientation } from './camera.ts';
import { CART_OUT, SEAT_OFFSETS, TABLE_OUT, buildFurniture, type FurnitureHandles } from './furniture.ts';
import { worldToVec2 } from './constants.ts';
import { buildCurtain, type CurtainHandles } from './curtain.ts';
import { disposeObject3D } from './geometry.ts';
import { LightingRig } from './lighting.ts';
import { MatSystem } from './mats.ts';
import { buildNpcRig, NpcAnimator, updateNpcIdle, type NpcRig } from './npc.ts';
import { createStarSpriteTexture } from './materials/textures.ts';
import { buildRoom, type RoomHandles } from './room.ts';
import { AdaptiveQuality } from './quality.ts';
import { BlobShadowManager } from './shadows.ts';
import { buildStars, type StarsHandles } from './stars.ts';
import { ToySystem } from './toys.ts';
import { Easing, TweenManager } from './tween.ts';

const VIGNETTE_MS = 8000;
const CHAIR_STAGGER_S = 0.16;
const NPC_TEACHER_HOME = new THREE.Vector3(-1.55, 0, 1.05);
const NPC_SPAWN = new THREE.Vector3(1.75, 0, 1.35);

interface Pickable {
  object: THREE.Object3D;
  kind: string;
  id: string;
}

interface HintTarget {
  from: THREE.Vector3;
  to: THREE.Vector3;
  kind: 'drag' | 'tap' | 'swipe';
}

type DragMode =
  | { kind: 'toy'; id: string }
  | { kind: 'table' }
  | { kind: 'cart' }
  | { kind: 'tray'; index: number }
  | { kind: 'mat-carry'; id: string }
  | { kind: 'mat-swipe'; id: string }
  | { kind: 'curtain' }
  | { kind: 'wipe' }
  | null;

export interface SceneRootOptions {
  onFirstInteractionReady?: () => void;
  reducedMotion: boolean;
  testMode: boolean;
}

export class SceneRoot {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameraDirector: CameraDirector;
  private readonly tweens = new TweenManager();
  private readonly lighting: LightingRig;
  private readonly fsm: GameFsm;
  private readonly audio: AudioEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly quality: AdaptiveQuality;
  private readonly pointer: PointerController;

  private room!: RoomHandles;
  private toys!: ToySystem;
  private baskets!: BasketSystem;
  private furniture!: FurnitureHandles;
  private mats!: MatSystem;
  private curtain!: CurtainHandles;
  private stars!: StarsHandles;
  private shadows!: BlobShadowManager;
  private trayProxies: THREE.Mesh[] = [];
  private trayReturned: boolean[] = [false, false, false, false];
  private wipeProxy!: THREE.Mesh;
  private guideArrow!: THREE.Sprite;
  private ghostSprite!: THREE.Sprite;
  private sparklePool: THREE.Sprite[] = [];
  private sparkleIndex = 0;
  private wipeVisitedCells = new Set<number>();
  private readonly wipeGridCols = 5;
  private readonly wipeGridRows = 3;

  private npcAnimator!: NpcAnimator;
  private childRigs: NpcRig[] = [];
  private teacherRig!: NpcRig;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private scratchVec3 = new THREE.Vector3();

  private drag: DragMode = null;
  private dragStartClient = { x: 0, y: 0 };
  private dragLastWorld = new THREE.Vector3();

  private orientation: Orientation = 'portrait';
  private reducedMotion: boolean;
  private testMode: boolean;
  private elapsed = 0;
  private idleSeconds = 0;
  private wiggleTriggered = false;
  private ghostActive = false;
  private started = false;
  private disposed = false;
  private lastFrameTime = performance.now();
  private hidden = false;

  constructor(canvas: HTMLCanvasElement, fsm: GameFsm, audio: AudioEngine, options: SceneRootOptions) {
    this.canvas = canvas;
    this.fsm = fsm;
    this.audio = audio;
    this.reducedMotion = options.reducedMotion;
    this.testMode = options.testMode;

    // MSAA is expensive on software/CPU rasterizers (headless test environments,
    // low-end devices without a hardware GPU) — the diorama's rounded/beveled
    // geometry already reads clean without it, so it stays off.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.quality = new AdaptiveQuality(window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.quality.dpr);

    this.cameraDirector = new CameraDirector(this.computeAspect(), this.tweens);
    this.lighting = new LightingRig(this.scene, this.tweens);
    this.lighting.setMorningAngle(fsm.seedConfig.morningLightAngle);
    this.lighting.applyPhase('TITLE', 0.01);

    this.buildSceneGraph();
    this.subscribeFsm();
    this.updateOrientation();

    this.pointer = new PointerController(canvas, {
      onDown: (x, y) => this.handlePointerDown(x, y),
      onMove: (x, y) => this.handlePointerMove(x, y),
      onUp: (x, y, wasTap) => this.handlePointerUp(x, y, wasTap),
      onCancel: () => this.handlePointerCancel(),
      onActivity: () => this.noteActivity(),
    });

    this.setupContextLossHandling();

    void options.onFirstInteractionReady;
  }

  private contextLossOverlay: HTMLDivElement | null = null;

  /**
   * M8 fix (fix-round-1): a lost WebGL context previously froze the game
   * silently forever (render() kept being called but drew nothing, no
   * feedback to the player). `webglcontextlost` fires just before the
   * context actually goes away — preventDefault() tells the browser we'll
   * handle recovery ourselves (otherwise it won't fire contextrestored at
   * all). We pause the render loop and show a tap-to-continue overlay;
   * a full in-place GPU-resource rebuild is out of scope for a context-loss
   * recovery this rare, so the tap does a plain reload — cheap, reliable,
   * and the title screen resumes instantly (last seed is persisted).
   */
  private setupContextLossHandling(): void {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.setPaused(true);
      this.showContextLossOverlay();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      // Context is back at the driver level, but our GPU resources (buffers,
      // textures, programs) are gone — wait for the player's tap rather than
      // silently resuming render() against now-invalid resources.
    });
  }

  private showContextLossOverlay(): void {
    if (this.contextLossOverlay) return;
    const el = document.createElement('div');
    el.className = 'context-loss-overlay';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'tap to continue');
    el.innerHTML =
      '<div class="context-loss-icon"><svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="50" cy="50" r="46" fill="#F7D97B"/>' +
      '<path d="M63 23 A29 29 0 1 1 21 50" stroke="#FAF3E7" stroke-width="15" fill="none" stroke-linecap="round"/>' +
      '<path d="M49 10 L68 23 L48 35 Z" fill="#FAF3E7"/>' +
      '</svg></div>';
    el.addEventListener('pointerdown', () => {
      window.location.reload();
    });
    this.canvas.parentElement?.appendChild(el);
    this.contextLossOverlay = el;
  }

  private computeAspect(): number {
    return window.innerWidth / window.innerHeight;
  }

  // ---------------------------------------------------------------------
  // Scene graph construction
  // ---------------------------------------------------------------------

  private buildSceneGraph(): void {
    const seed = this.fsm.seedConfig;
    this.shadows = new BlobShadowManager(48);
    this.room = buildRoom(seed.shelfTheme);
    this.room.setWeather(seed.weather);
    this.toys = new ToySystem(seed, this.tweens, this.shadows);
    this.baskets = new BasketSystem(seed, this.tweens);
    this.furniture = buildFurniture(this.tweens);
    this.mats = new MatSystem(seed, this.tweens);
    const windowCenter = new THREE.Vector3(0.55, 1.15, -1.5 + 0.02);
    this.curtain = buildCurtain(windowCenter, 0.95, 0.85);
    this.stars = buildStars(44);
    this.stars.points.position.set(0, 0, 0);

    this.npcAnimator = new NpcAnimator(this.tweens);
    this.teacherRig = buildNpcRig(seed.children[0]!, true);
    this.teacherRig.group.position.copy(NPC_TEACHER_HOME);
    this.teacherRig.group.visible = true;
    for (const child of seed.children) {
      const rig = buildNpcRig(child, false);
      rig.group.visible = false;
      this.childRigs.push(rig);
    }

    // Wipe-trace proxy over the table top (invisible, LUNCH_CLEANUP only).
    this.wipeProxy = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.6), new THREE.MeshBasicMaterial());
    this.wipeProxy.visible = false;
    this.wipeProxy.rotation.x = -Math.PI / 2;
    this.wipeProxy.position.set(TABLE_OUT.x, 0.445, TABLE_OUT.z);

    // Tray proxies (4), positioned each frame relative to their instance matrix.
    for (let i = 0; i < 4; i++) {
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial());
      proxy.visible = false;
      this.trayProxies.push(proxy);
    }

    const glowTex = createStarSpriteTexture(64);
    const arrowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xf7d97b, transparent: true, opacity: 0, depthTest: false });
    this.guideArrow = new THREE.Sprite(arrowMat);
    this.guideArrow.scale.set(0.3, 0.3, 0.3);
    this.guideArrow.renderOrder = 10;

    const ghostMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    this.ghostSprite = new THREE.Sprite(ghostMat);
    this.ghostSprite.scale.set(0.22, 0.22, 0.22);
    this.ghostSprite.renderOrder = 11;

    for (let i = 0; i < 20; i++) {
      const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xbfe8f2, transparent: true, opacity: 0, depthTest: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.06, 0.06, 0.06);
      this.sparklePool.push(sp);
      this.scene.add(sp);
    }

    this.scene.add(
      this.room.group,
      this.toys.group,
      this.baskets.group,
      this.furniture.group,
      this.mats.group,
      this.curtain.group,
      this.stars.points,
      this.shadows.group,
      this.teacherRig.group,
      this.wipeProxy,
      this.guideArrow,
      this.ghostSprite,
    );
    for (const rig of this.childRigs) this.scene.add(rig.group);
    for (const proxy of this.trayProxies) this.scene.add(proxy);
  }

  // ---------------------------------------------------------------------
  // FSM wiring
  // ---------------------------------------------------------------------

  private subscribeFsm(): void {
    this.fsm.events.on('phaseChange', ({ to }) => this.onPhaseChange(to));
    this.fsm.events.on('toyCaptured', ({ toyId, basketId }) => this.onToyCaptured(toyId, basketId));
    this.fsm.events.on('toyRejected', ({ toyId, nearestBasketId }) => this.onToyRejected(toyId, nearestBasketId));
    this.fsm.events.on('seedChanged', () => this.onSeedChanged());
  }

  private onSeedChanged(): void {
    // Rebuild the seed-dependent visuals (toys/baskets/mats/weather/light angle) for a fresh run.
    this.scene.remove(this.toys.group, this.baskets.group, this.mats.group);
    // B6/B7 fix (fix-round-1): dispose the OLD systems (frees blob-shadow
    // slots + per-instance geometries/materials) before building new ones —
    // previously nothing here ever freed them, so the shared 48-slot shadow
    // pool overflowed after ~6 reshuffles and geometries/materials leaked.
    this.toys.dispose();
    this.baskets.dispose();
    this.mats.dispose();
    this.toys = new ToySystem(this.fsm.seedConfig, this.tweens, this.shadows);
    this.baskets = new BasketSystem(this.fsm.seedConfig, this.tweens);
    this.mats = new MatSystem(this.fsm.seedConfig, this.tweens);
    this.scene.add(this.toys.group, this.baskets.group, this.mats.group);
    this.room.setWeather(this.fsm.seedConfig.weather);
    this.lighting.setMorningAngle(this.fsm.seedConfig.morningLightAngle);
    this.resetFurnitureAndRoom();
  }

  private resetFurnitureAndRoom(): void {
    this.furniture.setTableProgress(0);
    this.furniture.setCartProgress(0);
    for (let i = 0; i < 4; i++) this.furniture.stackChair(i);
    this.curtain.setProgress(0);
    this.stars.setOpacity(0);
    for (const rig of this.childRigs) rig.group.visible = false;
    this.teacherRig.group.position.copy(NPC_TEACHER_HOME);
    this.trayReturned = [false, false, false, false];
    this.lunchCleanupAdvanceScheduled = false;
    this.matCamHandedOff = false;
  }

  private onPhaseChange(phase: Phase): void {
    this.wiggleTriggered = false;
    this.hideGhost();
    this.idleSeconds = 0;
    const duration = this.reducedMotion ? 0.5 : 1.1;
    this.lighting.applyPhase(phase, duration);

    switch (phase) {
      case 'TITLE':
        this.cameraDirector.tweenTo('overview', 0.01, true);
        this.audio.stopAmbience();
        this.setBasketsVisible(true, false);
        break;
      case 'PLAY_CLEANUP':
        this.resetFurnitureAndRoom();
        this.lunchVignetteStarted = false;
        this.napVignetteStarted = false;
        this.cameraDirector.tweenTo('cleanup', 1.1);
        this.audio.stopAmbience();
        this.setBasketsVisible(true, true);
        break;
      case 'LUNCH_SETUP':
        this.cameraDirector.tweenTo('transform', 1.2);
        this.setBasketsVisible(false, true);
        break;
      case 'LUNCH_CLEANUP':
        this.cameraDirector.tweenTo('transform', 1.1);
        this.sendChildrenHome();
        this.wipeVisitedCells.clear();
        break;
      case 'NAP_SETUP':
        this.cameraDirector.tweenTo('mat', 1.1);
        break;
      case 'WAKE_RESTORE':
        this.cameraDirector.tweenTo('mat', 0.9);
        break;
      case 'REPLAY':
        this.cameraDirector.tweenTo('overview', 1.2);
        this.audio.stopAmbience();
        break;
      case 'FREE_PLAY':
        this.applyFreePlayMode('playroom');
        break;
    }
  }

  private onToyCaptured(toyId: string, basketId: string): void {
    const toy = this.fsm.seedConfig.toys.find((t) => t.id === toyId)!;
    const basketPos = this.baskets.worldPositionOf(basketId);
    this.audio.playToySound(toy.material);
    this.toys.playCaptureBounce(toyId, basketPos, () => {
      this.audio.playBasketGulp();
    });
    this.baskets.playWiggle(basketId);
    this.baskets.clearAllAttention();
    if (this.fsm.isPlayCleanupComplete()) {
      window.setTimeout(() => this.playCleanupCompleteSequence(), 500);
    }
  }

  private onToyRejected(toyId: string, nearestBasketId: string | null): void {
    // fsm only emits toyRejected when the drop was actually near a specific
    // wrong basket (see fsm.attemptStoreToy B4 fix), so nearestBasketId is
    // always set here in practice; the fallback keeps this defensive.
    const basketPos = nearestBasketId ? this.baskets.worldPositionOf(nearestBasketId) : this.toys.worldPositionOf(toyId);
    this.toys.playRejectReturn(toyId, basketPos);
    this.audio.playRejectPop();
    this.baskets.clearAllAttention();
  }

  private playCleanupCompleteSequence(): void {
    this.cameraDirector.tweenTo('overview', 1.0);
    this.guideArrow.position.set(0.15, 0.9, -0.6);
    this.tweens.add(this.reducedMotion ? 0.6 : 1.4, Easing.sineInOut, (p) => {
      const mat = this.guideArrow.material as THREE.SpriteMaterial;
      mat.opacity = Math.sin(p * Math.PI) * 0.9;
      this.guideArrow.position.z = THREE.MathUtils.lerp(-0.6, -1.1, p);
    });
    this.npcAnimator.playPointGesture(this.teacherRig, 1.2);
    window.setTimeout(
      () => {
        if (this.fsm.phase !== 'PLAY_CLEANUP') return;
        this.fsm.advance();
      },
      this.reducedMotion ? 900 : 1600,
    );
  }

  private sendChildrenHome(): void {
    for (const rig of this.childRigs) {
      if (!rig.group.visible) continue;
      rig.eating = false;
      this.npcAnimator.standUp(rig, NPC_SPAWN, 0.5, () => {
        rig.group.visible = false;
      });
    }
  }

  // ---------------------------------------------------------------------
  // Lunch furniture sequence helpers (called from interaction handlers)
  // ---------------------------------------------------------------------

  private checkLunchFurnitureReady(): void {
    if (this.fsm.isLunchFurnitureReady() && !this.lunchVignetteStarted) {
      this.lunchVignetteStarted = true;
      window.setTimeout(() => this.startEatingVignette(), 400);
    }
  }
  private lunchVignetteStarted = false;
  private napVignetteStarted = false;
  private basketsVisible = true;

  /**
   * M1 fix (fix-round-1): baskets are a PLAY_CLEANUP/playroom-only prop —
   * previously they stayed visible straight through LUNCH/NAP/WAKE/REPLAY,
   * a continuity break once the room had "become" the lunch/nap room. Pops
   * each basket in/out with a small scale tween (cheap, no material/opacity
   * plumbing needed) rather than a hard show/hide cut.
   */
  private setBasketsVisible(visible: boolean, animate: boolean): void {
    if (visible === this.basketsVisible) return;
    this.basketsVisible = visible;
    const baskets = [...this.baskets.baskets.values()];
    if (visible) {
      this.baskets.group.visible = true;
      for (const b of baskets) {
        if (!animate) {
          b.group.scale.setScalar(1);
          continue;
        }
        b.group.scale.setScalar(0.001);
        this.tweens.add(0.4, Easing.backOut, (p) => b.group.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, p)));
      }
    } else if (!animate) {
      this.baskets.group.visible = false;
      for (const b of baskets) b.group.scale.setScalar(1);
    } else {
      let remaining = baskets.length;
      if (remaining === 0) {
        this.baskets.group.visible = false;
        return;
      }
      for (const b of baskets) {
        this.tweens.add(
          0.28,
          Easing.cubicOut,
          (p) => b.group.scale.setScalar(THREE.MathUtils.lerp(1, 0.001, p)),
          () => {
            remaining--;
            if (remaining <= 0) this.baskets.group.visible = false;
          },
        );
      }
    }
  }

  private startEatingVignette(): void {
    this.cameraDirector.tweenTo('overview', 1.0);
    this.audio.startLunchMurmur();
    this.childRigs.forEach((rig, i) => {
      rig.group.visible = true;
      rig.group.position.copy(NPC_SPAWN);
      const seat = this.furniture.seatWorldPosition(i);
      const facing = Math.atan2(SEAT_OFFSETS[i]!.x, SEAT_OFFSETS[i]!.z) + Math.PI;
      window.setTimeout(() => {
        this.npcAnimator.walkTo(rig, seat.clone().add(new THREE.Vector3(0, 0, 0.1)), 0.7, () => {
          this.npcAnimator.sitDown(rig, seat, facing, 0.35, () => {
            rig.eating = true;
            rig.breathing = true;
          });
        });
      }, i * 220);
    });

    const vignetteMs = this.reducedMotion ? VIGNETTE_MS * 0.6 : VIGNETTE_MS;
    window.setTimeout(() => {
      if (this.fsm.phase !== 'LUNCH_SETUP') return;
      this.fsm.completeEatingVignette();
      this.fsm.advance();
    }, vignetteMs);
  }

  private startNapVignette(): void {
    this.cameraDirector.tweenTo('napReveal', 1.2);
    this.audio.startNapAmbience();
    this.tweens.add(this.reducedMotion ? 1.0 : 2.2, Easing.cubicOut, (p) => this.stars.setOpacity(p * 0.9));

    this.childRigs.forEach((rig, i) => {
      rig.group.visible = true;
      const mat = this.fsm.seedConfig.mats[i];
      if (!mat) return;
      const markerWorld = this.mats.markerWorldPosition(mat.id);
      const lieTarget = markerWorld.clone();
      lieTarget.x += 0.22;
      rig.group.position.copy(NPC_SPAWN);
      window.setTimeout(() => {
        this.npcAnimator.walkTo(rig, lieTarget.clone().add(new THREE.Vector3(0, 0, 0.05)), 0.6, () => {
          this.npcAnimator.lieDown(rig, lieTarget, Math.PI / 2, 0.6, () => {
            rig.breathing = true;
          });
        });
      }, i * 200);
    });

    window.setTimeout(() => {
      this.npcAnimator.walkTo(this.teacherRig, new THREE.Vector3(0.9, 0, 0.6), 0.8);
    }, 300);

    const vignetteMs = this.reducedMotion ? VIGNETTE_MS * 0.6 : VIGNETTE_MS;
    window.setTimeout(() => {
      if (this.fsm.phase !== 'NAP_SETUP') return;
      this.fsm.completeNapVignette();
      this.fsm.advance();
    }, vignetteMs);
  }

  /** Skips the currently running auto-advancing vignette (tap-to-skip). */
  skipVignette(): void {
    if (this.fsm.phase === 'LUNCH_SETUP' && this.lunchVignetteStarted && !this.fsm.lunchSetup.vignetteComplete) {
      this.fsm.completeEatingVignette();
      this.fsm.advance();
    } else if (this.fsm.phase === 'NAP_SETUP' && this.napVignetteStarted && !this.fsm.napSetup.vignetteComplete) {
      this.fsm.completeNapVignette();
      this.fsm.advance();
    }
  }

  // ---------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------

  private getPickables(): Pickable[] {
    const phase = this.fsm.phase;
    const list: Pickable[] = [];
    if (phase === 'PLAY_CLEANUP') {
      for (const [id, t] of this.toys.toys) {
        if (!t.stored) list.push({ object: t.proxy, kind: 'toy', id });
      }
    } else if (phase === 'LUNCH_SETUP') {
      if (!this.fsm.lunchSetup.tableOut) list.push({ object: this.furniture.tableProxy, kind: 'table', id: 'table' });
      if (this.fsm.lunchSetup.chairsOut < 4) list.push({ object: this.furniture.chairStackProxy, kind: 'chairStack', id: 'chairs' });
      if (this.fsm.lunchSetup.traysPlaced < 4) list.push({ object: this.furniture.cartProxy, kind: 'cart', id: 'cart' });
    } else if (phase === 'LUNCH_CLEANUP') {
      const lc = this.fsm.lunchCleanup;
      if (lc.traysReturned < 4) {
        this.trayProxies.forEach((proxy, i) => {
          if (!this.trayReturned[i]) {
            proxy.position.copy(this.furniture.seatWorldPosition(i));
            proxy.position.y = 0.44;
            list.push({ object: proxy, kind: 'tray', id: String(i) });
          }
        });
      }
      // Wipe only becomes pickable once trays are clear — the wipe proxy spans the
      // whole table top and would otherwise overlap/steal raycasts from tray proxies
      // sitting on that same surface.
      if (lc.wipeProgress < 1 && lc.traysReturned >= 4) list.push({ object: this.wipeProxy, kind: 'wipe', id: 'table' });
      if (lc.wipeProgress >= 1 && !lc.tableStored) list.push({ object: this.furniture.tableProxy, kind: 'tableStore', id: 'table' });
    } else if (phase === 'NAP_SETUP') {
      const ns = this.fsm.napSetup;
      for (const mat of this.fsm.seedConfig.mats) {
        const visual = this.mats.mats.get(mat.id)!;
        if (!visual.placed) {
          list.push({ object: visual.proxy, kind: 'mat-carry', id: mat.id });
        } else if ((ns.unrollProgress[mat.id] ?? 0) < 1) {
          list.push({ object: visual.proxy, kind: 'mat-swipe', id: mat.id });
        }
      }
      if (ns.matsPlaced >= 4 && ns.matsUnrolled >= 4 && !ns.curtainClosed) {
        list.push({ object: this.curtain.proxy, kind: 'curtain-close', id: 'curtain' });
      }
    } else if (phase === 'WAKE_RESTORE') {
      const wr = this.fsm.wakeRestore;
      if (!wr.curtainOpened) list.push({ object: this.curtain.proxy, kind: 'curtain-open', id: 'curtain' });
      else {
        for (const mat of this.fsm.seedConfig.mats) {
          const visual = this.mats.mats.get(mat.id)!;
          if (visual.placed) list.push({ object: visual.proxy, kind: 'mat-rollback', id: mat.id });
        }
      }
    } else if (phase === 'FREE_PLAY') {
      // Free play uses DOM buttons exclusively; no 3D pickables required.
    }
    return list;
  }

  private raycastPick(clientX: number, clientY: number, pickables: Pickable[]): Pickable | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.cameraDirector.camera);
    const objects = pickables.map((p) => p.object);
    const hits = this.raycaster.intersectObjects(objects, false);
    if (hits.length === 0) return null;
    const hitObj = hits[0]!.object;
    return pickables.find((p) => p.object === hitObj) ?? null;
  }

  private groundIntersect(clientX: number, clientY: number, liftPx = 0, planeY = 0): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - liftPx - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.cameraDirector.camera);
    this.groundPlane.constant = -planeY;
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.scratchVec3);
    return hit;
  }

  // ---------------------------------------------------------------------
  // Pointer handling
  // ---------------------------------------------------------------------

  private handlePointerDown(clientX: number, clientY: number): void {
    this.audio.resume();
    const pickables = this.getPickables();
    const hit = this.raycastPick(clientX, clientY, pickables);
    this.dragStartClient = { x: clientX, y: clientY };
    if (!hit) {
      this.drag = null;
      return;
    }
    this.cameraDirector.setLocked(true);
    switch (hit.kind) {
      case 'toy':
        this.drag = { kind: 'toy', id: hit.id };
        this.toys.setHeld(hit.id, true);
        break;
      case 'table':
        this.drag = { kind: 'table' };
        break;
      case 'cart':
        this.drag = { kind: 'cart' };
        break;
      case 'chairStack':
      case 'tableStore': {
        // Tap-only targets: no drag, resolved in handlePointerUp via wasTap.
        this.drag = null;
        this.cameraDirector.setLocked(false);
        break;
      }
      case 'tray':
        this.drag = { kind: 'tray', index: Number(hit.id) };
        break;
      case 'mat-carry':
        this.drag = { kind: 'mat-carry', id: hit.id };
        break;
      case 'mat-swipe':
        this.drag = { kind: 'mat-swipe', id: hit.id };
        break;
      case 'curtain-close':
      case 'curtain-open':
        this.drag = { kind: 'curtain' };
        break;
      case 'wipe':
        this.drag = { kind: 'wipe' };
        break;
      case 'mat-rollback':
        this.drag = { kind: 'mat-swipe', id: hit.id };
        break;
      default:
        this.drag = null;
        this.cameraDirector.setLocked(false);
    }
  }

  private handlePointerMove(clientX: number, clientY: number): void {
    if (!this.drag) return;
    const drag = this.drag;
    switch (drag.kind) {
      case 'toy': {
        const world = this.groundIntersect(clientX, clientY, 40);
        if (!world) return;
        this.toys.setDragPosition(drag.id, world.x, world.z, 0.14);
        const symbol = this.toys.getSymbol(drag.id);
        for (const basket of this.fsm.seedConfig.baskets) {
          const bPos = this.baskets.worldPositionOf(basket.id);
          const dist = Math.hypot(world.x - bPos.x, world.z - bPos.z);
          const attentionRadius = basket.radius * 1.55 * 2.2 * 1.6;
          const strength = symbol === basket.symbol ? Math.max(0, 1 - dist / Math.max(attentionRadius, 0.0001)) : 0;
          this.baskets.setAttention(basket.id, strength, world.x, world.z);
        }
        break;
      }
      case 'table': {
        const dy = this.dragStartClient.y - clientY;
        const progress = THREE.MathUtils.clamp(dy / 150, 0, 1);
        this.furniture.setTableProgress(progress);
        break;
      }
      case 'cart': {
        const dy = this.dragStartClient.y - clientY;
        const progress = THREE.MathUtils.clamp(dy / 150, 0, 1);
        this.furniture.setCartProgress(progress);
        break;
      }
      case 'tray': {
        const world = this.groundIntersect(clientX, clientY, 40, 0.44);
        if (!world) return;
        this.dragLastWorld.copy(world);
        const proxy = this.trayProxies[drag.index]!;
        proxy.position.copy(world);
        this.furniture.trays.setMatrixAt(
          drag.index,
          new THREE.Matrix4().compose(world, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)),
        );
        this.furniture.trays.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'mat-carry': {
        const world = this.groundIntersect(clientX, clientY, 40);
        if (!world) return;
        this.mats.setCarryPosition(drag.id, world.x, world.z);
        break;
      }
      case 'mat-swipe': {
        const world = this.groundIntersect(clientX, clientY, 0);
        if (!world) return;
        const marker = this.mats.markerWorldPosition(drag.id);
        const isRollback = this.fsm.phase === 'WAKE_RESTORE';
        const dx = world.x - marker.x;
        const rawProgress = THREE.MathUtils.clamp(dx / 0.62, 0, 1);
        const prev = this.fsm.napSetup.unrollProgress[drag.id] ?? (isRollback ? 1 : 0);
        this.mats.setUnrollProgress(drag.id, rawProgress);
        this.fsm.setMatUnrollProgress(drag.id, rawProgress);
        // Read back the FSM's stored value rather than reusing the raw local
        // one — the FSM reducer snaps "close enough" progress (>0.97) up to
        // exactly 1, so comparing against the un-snapped raw value here could
        // miss the completion transition the FSM already recorded.
        const progress = this.fsm.napSetup.unrollProgress[drag.id] ?? rawProgress;
        if (Math.abs(rawProgress - prev) > 0.02) {
          this.audio.playMatWhooshTick(Math.abs(rawProgress - prev) * 4);
        }
        if (progress >= 1 && prev < 1) {
          this.mats.showBedding(drag.id);
          this.audio.playToySound('fabric');
          if (this.fsm.phase === 'NAP_SETUP') {
            // Bedding snaps into place visually the moment the mat is fully
            // unrolled — record it in FSM state too, otherwise
            // isNapFurnitureReady() (which requires beddingPlaced >= total)
            // could never become true through real play.
            this.fsm.placeBeddingItem();
            this.checkAllMatsUnrolled();
          }
        }
        break;
      }
      case 'curtain': {
        const dx = Math.abs(clientX - this.dragStartClient.x);
        const swept = THREE.MathUtils.clamp(dx / 220, 0, 1);
        const isOpening = this.fsm.phase === 'WAKE_RESTORE';
        this.curtain.setProgress(isOpening ? 1 - swept : swept);
        break;
      }
      case 'wipe': {
        const world = this.groundIntersect(clientX, clientY, 0, 0.445);
        if (!world) return;
        const localX = world.x - (TABLE_OUT.x - 0.425);
        const localZ = world.z - (TABLE_OUT.z - 0.3);
        const col = Math.floor((localX / 0.85) * this.wipeGridCols);
        const row = Math.floor((localZ / 0.6) * this.wipeGridRows);
        if (col >= 0 && col < this.wipeGridCols && row >= 0 && row < this.wipeGridRows) {
          const cellIndex = row * this.wipeGridCols + col;
          if (!this.wipeVisitedCells.has(cellIndex)) {
            this.wipeVisitedCells.add(cellIndex);
            const total = this.wipeGridCols * this.wipeGridRows;
            this.fsm.addWipeProgress(1 / total);
            this.audio.playWipeSqueak();
            this.spawnSparkle(world.x, 0.45, world.z);
            this.checkLunchCleanupComplete();
          }
        }
        break;
      }
    }
  }

  private handlePointerUp(clientX: number, clientY: number, wasTap: boolean): void {
    const drag = this.drag;
    this.drag = null;
    this.cameraDirector.setLocked(false);

    if (!drag) {
      if (wasTap) {
        const pickables = this.getPickables();
        const hit = this.raycastPick(clientX, clientY, pickables);
        if (hit?.kind === 'chairStack') this.handleChairTap();
        else if (hit?.kind === 'tableStore') this.handleTableStoreTap();
        else this.skipVignette();
      }
      return;
    }

    switch (drag.kind) {
      case 'toy': {
        const attempt = this.fsm.attemptStoreToy(drag.id, worldToVec2(this.toys.worldPositionOf(drag.id)));
        // B4 fix: attemptStoreToy already fired toyRejected (-> playRejectReturn,
        // a float away from the wrong basket) when attempt.basketId is set — do
        // NOT also call settleAtCurrentPosition here, or the two tweens race for
        // the same toy. Only a true dead-space miss (basketId null) settles in place.
        if (!attempt.success && !attempt.basketId) {
          this.toys.settleAtCurrentPosition(drag.id);
        }
        this.baskets.clearAllAttention();
        break;
      }
      case 'table': {
        const dy = this.dragStartClient.y - clientY;
        if (dy > 20) {
          this.furniture.animateTableTo(1, 0.5, () => {
            this.fsm.dragTableOut();
            this.checkLunchFurnitureReady();
          });
        } else {
          this.furniture.animateTableTo(0, 0.3);
        }
        break;
      }
      case 'cart': {
        const dy = this.dragStartClient.y - clientY;
        if (dy > 20) {
          this.furniture.animateCartTo(1, 0.5, () => this.placeTraysSequence());
        } else {
          this.furniture.animateCartTo(0, 0.3);
        }
        break;
      }
      case 'tray': {
        const world = this.dragLastWorld;
        const cartPos = this.furniture.cart.position;
        const success = this.fsm.attemptReturnTray({ x: world.x, z: world.z }, { x: cartPos.x, z: cartPos.z }, 0.32);
        if (success) {
          this.trayReturned[drag.index] = true;
          this.furniture.returnTray(drag.index, world.x, world.z);
          this.audio.playToySound('plastic');
          this.checkLunchCleanupComplete();
        }
        break;
      }
      case 'mat-carry': {
        const success = this.fsm.attemptPlaceMat(drag.id, worldToVec2(this.mats.worldPositionOf(drag.id)));
        if (success) {
          this.mats.playPlaceSnap(drag.id, () => {
            this.checkNapFurnitureReady();
          });
          this.audio.playToySound('fabric');
        }
        break;
      }
      case 'mat-swipe':
        if (this.fsm.phase === 'WAKE_RESTORE') {
          const progress = this.fsm.napSetup.unrollProgress[drag.id] ?? 1;
          if (progress <= 0.05) {
            this.fsm.rollMatBack();
            const shelfIndex = this.mats.mats.get(drag.id)!.index;
            this.mats.hopToShelf(drag.id, shelfIndex, () => {
              this.fsm.shelveMatBack();
              this.checkWakeRestoreComplete();
            });
          }
        } else {
          this.checkNapFurnitureReady();
        }
        break;
      case 'curtain': {
        const t = this.curtain.getProgress();
        if (this.fsm.phase === 'NAP_SETUP') {
          if (t > 0.55) {
            this.curtain.setProgress(1);
            this.fsm.closeCurtainNap();
            this.audio.playCurtainSlide();
            this.checkNapFurnitureReady();
          } else {
            this.curtain.setProgress(0);
          }
        } else if (this.fsm.phase === 'WAKE_RESTORE') {
          if (t < 0.45) {
            this.curtain.setProgress(0);
            this.fsm.openCurtainWake();
            this.audio.playCurtainSlide();
            this.checkWakeRestoreComplete();
          } else {
            this.curtain.setProgress(1);
          }
        }
        break;
      }
      case 'wipe':
        break;
    }
  }

  /**
   * M9 fix (fix-round-1): pointercancel must NEVER complete a drag — it has
   * no reliable coordinates to evaluate a completion threshold against (see
   * PointerHandlers.onCancel). Every drag kind snaps back to (or is simply
   * left in, for kinds whose normal "not near target" outcome is already a
   * no-op) its pre-drag state instead of running any of handlePointerUp's
   * success-path logic.
   */
  private handlePointerCancel(): void {
    const drag = this.drag;
    this.drag = null;
    this.cameraDirector.setLocked(false);
    if (!drag) return;

    switch (drag.kind) {
      case 'toy':
        this.toys.settleAtCurrentPosition(drag.id);
        this.baskets.clearAllAttention();
        break;
      case 'table':
        this.furniture.animateTableTo(0, 0.3);
        break;
      case 'cart':
        this.furniture.animateCartTo(0, 0.3);
        break;
      case 'tray':
      case 'mat-carry':
      case 'mat-swipe':
      case 'curtain':
      case 'wipe':
        // These kinds' normal "drop not near enough to complete" outcome is
        // already a no-op (see handlePointerUp) — nothing further to revert.
        break;
    }
  }

  private handleTableStoreTap(): void {
    if (this.fsm.lunchCleanup.tableStored) return;
    this.furniture.animateTableTo(0, 0.5, () => {
      this.fsm.tapTableToStore();
      this.autoStackChairs();
    });
  }

  private handleChairTap(): void {
    const index = this.fsm.lunchSetup.chairsOut;
    if (index >= 4) return;
    this.furniture.popChair(index, () => {
      this.audio.playChairTick();
    });
    this.fsm.popChairOut();
    this.checkLunchFurnitureReady();
  }

  private autoStackChairs(): void {
    for (let i = 0; i < 4; i++) {
      window.setTimeout(
        () => {
          this.furniture.stackChair(i, () => this.audio.playChairTick());
          this.fsm.stackChairBack();
          if (i === 3) this.checkLunchCleanupComplete();
        },
        i * CHAIR_STAGGER_S * 1000,
      );
    }
  }

  private lunchCleanupAdvanceScheduled = false;

  private checkLunchCleanupComplete(): void {
    if (this.lunchCleanupAdvanceScheduled) return;
    if (!this.fsm.isLunchCleanupComplete()) return;
    this.lunchCleanupAdvanceScheduled = true;
    window.setTimeout(() => {
      if (this.fsm.phase === 'LUNCH_CLEANUP') this.fsm.advance();
    }, 500);
  }

  private placeTraysSequence(): void {
    for (let i = 0; i < 4; i++) {
      window.setTimeout(
        () => {
          this.furniture.placeTray(i, () => this.audio.playToySound('plastic'));
          this.fsm.placeTrayOnTable();
          this.checkLunchFurnitureReady();
        },
        i * 180,
      );
    }
  }

  private matCamHandedOff = false;

  /** Once every mat is unrolled (but before the curtain step), pull the camera back
   * from the low mat-cam to the wider napReveal framing — the curtain sits high on
   * the back wall and was never meant to be grabbed from the low floor-level shot. */
  private checkAllMatsUnrolled(): void {
    if (this.matCamHandedOff) return;
    if (this.fsm.napSetup.matsUnrolled >= 4 && this.fsm.napSetup.matsPlaced >= 4) {
      this.matCamHandedOff = true;
      this.cameraDirector.tweenTo('napReveal', 1.1);
    }
  }

  private checkNapFurnitureReady(): void {
    if (this.fsm.isNapFurnitureReady() && !this.napVignetteStarted) {
      this.napVignetteStarted = true;
      window.setTimeout(() => this.startNapVignette(), 500);
    }
  }

  private checkWakeRestoreComplete(): void {
    const wr = this.fsm.wakeRestore;
    if (wr.curtainOpened && wr.matsShelved >= 4 && !wr.toysPopped) {
      this.fsm.popToysBackOut();
      this.toys.popAllOut(this.fsm.seedConfig, 0.12);
      this.npcAnimator.walkTo(this.teacherRig, NPC_TEACHER_HOME, 0.8);
      this.audio.startMorningBirds();
      this.cameraDirector.tweenTo('overview', 1.3);
      window.setTimeout(() => {
        if (this.fsm.phase === 'WAKE_RESTORE') this.fsm.advance();
      }, 1400);
    }
  }

  /** Generic idle-hint "wiggle" pulse for non-toy targets (furniture handles, mat, curtain proxies). */
  private pulseAt(worldPos: THREE.Vector3): void {
    const sp = this.sparklePool[this.sparkleIndex % this.sparklePool.length]!;
    this.sparkleIndex++;
    sp.position.copy(worldPos);
    sp.position.y += 0.1;
    const mat = sp.material as THREE.SpriteMaterial;
    mat.opacity = 0.8;
    this.tweens.add(0.6, Easing.elasticOut, (p) => {
      sp.scale.setScalar(0.08 + Math.sin(p * Math.PI) * 0.05);
      mat.opacity = 0.8 * (1 - p);
    });
  }

  private spawnSparkle(x: number, y: number, z: number): void {
    if (this.reducedMotion) return;
    const sp = this.sparklePool[this.sparkleIndex % this.sparklePool.length]!;
    this.sparkleIndex++;
    sp.position.set(x, y, z);
    (sp.material as THREE.SpriteMaterial).opacity = 0.9;
    this.tweens.add(0.5, Easing.cubicOut, (p) => {
      (sp.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - p);
      sp.scale.setScalar(0.06 + p * 0.05);
    });
  }

  private hideGhost(): void {
    this.ghostActive = false;
    (this.ghostSprite.material as THREE.SpriteMaterial).opacity = 0;
  }

  private noteActivity(): void {
    this.idleSeconds = 0;
    this.wiggleTriggered = false;
    if (this.ghostActive) this.hideGhost();
  }

  // ---------------------------------------------------------------------
  // Hint target resolution
  // ---------------------------------------------------------------------

  private computeHintTarget(): HintTarget | null {
    const phase = this.fsm.phase;
    if (phase === 'PLAY_CLEANUP') {
      for (const toy of this.fsm.seedConfig.toys) {
        const visual = this.toys.toys.get(toy.id)!;
        if (visual.stored) continue;
        const basket = this.fsm.seedConfig.baskets.find((b) => b.symbol === toy.symbol);
        if (!basket) continue;
        return { from: this.toys.worldPositionOf(toy.id), to: this.baskets.worldPositionOf(basket.id), kind: 'drag' };
      }
    } else if (phase === 'LUNCH_SETUP') {
      if (!this.fsm.lunchSetup.tableOut) return { from: this.furniture.tableProxy.position.clone(), to: TABLE_OUT.clone(), kind: 'drag' };
      if (this.fsm.lunchSetup.chairsOut < 4) return { from: this.furniture.chairStackProxy.position.clone(), to: this.furniture.chairStackProxy.position.clone(), kind: 'tap' };
      if (this.fsm.lunchSetup.traysPlaced < 4) return { from: this.furniture.cartProxy.position.clone(), to: CART_OUT.clone(), kind: 'drag' };
    } else if (phase === 'NAP_SETUP') {
      for (const mat of this.fsm.seedConfig.mats) {
        const visual = this.mats.mats.get(mat.id)!;
        if (!visual.placed) return { from: visual.proxy.position.clone(), to: this.mats.markerWorldPosition(mat.id), kind: 'drag' };
        if ((this.fsm.napSetup.unrollProgress[mat.id] ?? 0) < 1) {
          const marker = this.mats.markerWorldPosition(mat.id);
          return { from: marker, to: marker.clone().add(new THREE.Vector3(0.5, 0, 0)), kind: 'swipe' };
        }
      }
      if (this.fsm.napSetup.matsPlaced >= 4 && this.fsm.napSetup.matsUnrolled >= 4 && !this.fsm.napSetup.curtainClosed) {
        return { from: this.curtain.proxy.position.clone(), to: this.curtain.proxy.position.clone(), kind: 'drag' };
      }
    } else if (phase === 'LUNCH_CLEANUP') {
      const lc = this.fsm.lunchCleanup;
      if (lc.traysReturned < 4) {
        const i = this.trayReturned.findIndex((done) => !done);
        if (i >= 0) return { from: this.furniture.seatWorldPosition(i), to: this.furniture.cart.position.clone(), kind: 'drag' };
      }
      if (lc.wipeProgress < 1) return { from: this.wipeProxy.position.clone(), to: this.wipeProxy.position.clone(), kind: 'swipe' };
      if (!lc.tableStored) return { from: this.furniture.tableProxy.position.clone(), to: this.furniture.tableProxy.position.clone(), kind: 'tap' };
    } else if (phase === 'WAKE_RESTORE') {
      const wr = this.fsm.wakeRestore;
      if (!wr.curtainOpened) return { from: this.curtain.proxy.position.clone(), to: this.curtain.proxy.position.clone(), kind: 'drag' };
      for (const mat of this.fsm.seedConfig.mats) {
        const visual = this.mats.mats.get(mat.id)!;
        if (visual.placed) return { from: visual.proxy.position.clone(), to: this.mats.markerWorldPosition(mat.id), kind: 'swipe' };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  start(): void {
    this.started = true;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  /** FREE_PLAY sandbox: morphs the room directly into one of the three setups, no objective tracking or ordering. */
  applyFreePlayMode(mode: 'playroom' | 'lunch' | 'nap'): void {
    if (mode === 'playroom') {
      this.furniture.animateTableTo(0, 0.6);
      this.furniture.animateCartTo(0, 0.6);
      for (let i = 0; i < 4; i++) this.furniture.stackChair(i);
      this.curtain.setProgress(0);
      this.stars.setOpacity(0);
      for (const rig of this.childRigs) rig.group.visible = false;
      for (const mat of this.fsm.seedConfig.mats) this.mats.setStateInstant(mat.id, false, 0, false);
      this.lighting.applyPhase('WAKE_RESTORE', 1.0);
      this.cameraDirector.tweenTo('overview', 1.0);
      this.audio.stopAmbience();
      this.setBasketsVisible(true, true);
    } else if (mode === 'lunch') {
      this.setBasketsVisible(false, true);
      this.furniture.animateTableTo(1, 0.6, () => {
        for (let i = 0; i < 4; i++) {
          window.setTimeout(() => this.furniture.popChair(i, () => this.audio.playChairTick()), i * 150);
        }
        window.setTimeout(() => {
          this.furniture.animateCartTo(1, 0.5, () => {
            for (let i = 0; i < 4; i++) {
              window.setTimeout(() => this.furniture.placeTray(i, () => this.audio.playToySound('plastic')), i * 150);
            }
          });
        }, 700);
      });
      for (const mat of this.fsm.seedConfig.mats) this.mats.setStateInstant(mat.id, false, 0, false);
      this.curtain.setProgress(0);
      this.stars.setOpacity(0);
      this.lighting.applyPhase('LUNCH_SETUP', 1.0);
      this.cameraDirector.tweenTo('transform', 1.0);
      this.audio.startLunchMurmur();
    } else {
      this.setBasketsVisible(false, true);
      for (const mat of this.fsm.seedConfig.mats) this.mats.setStateInstant(mat.id, true, 1, true);
      this.curtain.setProgress(1);
      this.tweens.add(1.2, Easing.cubicOut, (p) => this.stars.setOpacity(p * 0.9));
      this.furniture.animateTableTo(0, 0.5);
      this.furniture.animateCartTo(0, 0.5);
      for (let i = 0; i < 4; i++) this.furniture.stackChair(i);
      this.lighting.applyPhase('NAP_SETUP', 1.0);
      this.cameraDirector.tweenTo('napReveal', 1.0);
      this.audio.startNapAmbience();
    }
  }

  updateOrientation(): void {
    const portrait = window.innerHeight >= window.innerWidth;
    this.orientation = portrait ? 'portrait' : 'landscape';
    // Tablet vs phone framing: based on the shorter CSS-px dimension, which
    // stays stable across an orientation flip (e.g. 393x852 phone vs
    // 834x1194 tablet both stay "phone"/"tablet" whichever way they're held).
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const deviceClass = shortSide >= 600 ? 'tablet' : 'phone';
    this.cameraDirector.setOrientation(this.orientation, this.computeAspect(), deviceClass);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, true);
    this.updateOrientation();
  }

  setPaused(paused: boolean): void {
    this.hidden = paused;
  }

  render(): void {
    if (this.disposed) return;
    const now = performance.now();
    const dtMs = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;
    if (this.hidden) return;
    const dt = dtMs / 1000;
    this.elapsed += dt;

    if (this.quality.sampleFrame(dtMs)) {
      this.renderer.setPixelRatio(this.quality.dpr);
    }

    this.tweens.update(dt);
    this.cameraDirector.applyIdleSway(this.elapsed, this.reducedMotion);

    for (const rig of this.childRigs) updateNpcIdle(rig, this.elapsed, this.reducedMotion);
    updateNpcIdle(this.teacherRig, this.elapsed, this.reducedMotion);

    this.updateHints(dt);

    this.renderer.render(this.scene, this.cameraDirector.camera);
  }

  private updateHints(dt: number): void {
    if (!this.started || this.drag || this.testMode) return;
    if (!['PLAY_CLEANUP', 'LUNCH_SETUP', 'LUNCH_CLEANUP', 'NAP_SETUP', 'WAKE_RESTORE'].includes(this.fsm.phase)) return;
    this.idleSeconds += dt;
    const wiggleMs = 3000;
    const ghostMs = 7000;
    if (this.idleSeconds * 1000 >= wiggleMs && !this.wiggleTriggered) {
      this.wiggleTriggered = true;
      const target = this.computeHintTarget();
      if (target) {
        this.audio.playChime();
        // M5 fix (fix-round-1): the wiggle/pulse motion hint must be
        // suppressed under reduced motion (INTERACTION_SPEC) — only the
        // (slower) ghost-trail hint below is allowed to keep animating.
        // The chime still plays either way so there's still a hint signal.
        if (!this.reducedMotion) {
          if (this.fsm.phase === 'PLAY_CLEANUP') {
            const toy = this.fsm.seedConfig.toys.find((t) => !this.toys.toys.get(t.id)!.stored);
            if (toy) this.toys.playWiggle(toy.id);
          } else {
            this.pulseAt(target.from);
          }
        }
      }
    }
    if (this.idleSeconds * 1000 >= ghostMs) {
      const target = this.computeHintTarget();
      if (target) {
        this.ghostActive = true;
        const loopS = this.reducedMotion ? 8 : 6;
        const t = ((this.idleSeconds * 1000 - ghostMs) / 1000 % loopS) / loopS;
        const swing = t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4;
        this.ghostSprite.position.lerpVectors(target.from, target.to, THREE.MathUtils.clamp(swing, 0, 1));
        this.ghostSprite.position.y += 0.12;
        (this.ghostSprite.material as THREE.SpriteMaterial).opacity = 0.85;
      }
    }
  }

  /**
   * B7 fix (fix-round-1): this used to only dispose the pointer controller
   * and the renderer, leaving every geometry/material/texture created for
   * the scene graph (room, furniture, curtain, stars, NPC rigs, blob-shadow
   * pool, plus the seed-scoped toy/basket/mat systems) to whatever the GC
   * happened to reclaim. Now walks every subsystem's group.
   */
  dispose(): void {
    this.disposed = true;
    this.pointer.dispose();
    this.toys.dispose();
    this.baskets.dispose();
    this.mats.dispose();
    disposeObject3D(this.room.group);
    disposeObject3D(this.furniture.group);
    disposeObject3D(this.curtain.group);
    disposeObject3D(this.stars.points);
    disposeObject3D(this.teacherRig.group);
    for (const rig of this.childRigs) disposeObject3D(rig.group);
    disposeObject3D(this.shadows.group);
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------
  // Test-harness helpers
  // ---------------------------------------------------------------------

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  /** T1 diagnostic: count of currently-allocated blob-shadow pool slots (see B6 fix-round-1). */
  get shadowSlotsUsed(): number {
    return this.shadows.usedCount;
  }

  simulateStoreAllToys(): void {
    for (const toy of this.fsm.seedConfig.toys) {
      const visual = this.toys.toys.get(toy.id);
      if (visual?.stored) continue;
      const basket = this.fsm.seedConfig.baskets.find((b) => b.symbol === toy.symbol);
      if (!basket) continue;
      this.fsm.attemptStoreToy(toy.id, basket.position);
    }
  }

  /**
   * Test-only fast-forward that finishes whatever is left of the CURRENT
   * phase's objective through the same FSM setters + visual update paths a
   * real gesture uses (unlike the harness's raw completeCurrentObjective(),
   * this keeps furniture/mat/curtain visuals in sync) — used by e2e specs to
   * demonstrate each signature gesture once for real and then skip repeating
   * it 4-7x, since headless software-rendered WebGL makes every synthesized
   * pointer round-trip far more expensive than on a real device.
   */
  forceCompleteCurrentPhaseVisuals(): void {
    const phase = this.fsm.phase;
    if (phase === 'PLAY_CLEANUP') {
      this.simulateStoreAllToys();
    } else if (phase === 'LUNCH_SETUP') {
      if (!this.fsm.lunchSetup.tableOut) {
        this.furniture.setTableProgress(1);
        this.fsm.dragTableOut();
      }
      for (let i = this.fsm.lunchSetup.chairsOut; i < 4; i++) {
        this.furniture.popChair(i, () => this.audio.playChairTick());
        this.fsm.popChairOut();
      }
      if (this.fsm.lunchSetup.traysPlaced < 4) {
        this.furniture.setCartProgress(1);
        for (let i = this.fsm.lunchSetup.traysPlaced; i < 4; i++) {
          this.furniture.placeTray(i, () => this.audio.playToySound('plastic'));
          this.fsm.placeTrayOnTable();
        }
      }
      this.checkLunchFurnitureReady();
    } else if (phase === 'LUNCH_CLEANUP') {
      const cartPos = this.furniture.cart.position.clone();
      for (let i = 0; i < 4; i++) {
        if (this.trayReturned[i]) continue;
        this.trayReturned[i] = true;
        this.furniture.returnTray(i, cartPos.x, cartPos.z);
        this.fsm.attemptReturnTray({ x: cartPos.x, z: cartPos.z }, { x: cartPos.x, z: cartPos.z }, 0.5);
      }
      if (this.fsm.lunchCleanup.wipeProgress < 1) this.fsm.addWipeProgress(1);
      if (!this.fsm.lunchCleanup.tableStored) {
        this.furniture.setTableProgress(0);
        this.fsm.tapTableToStore();
        for (let i = 0; i < 4; i++) {
          this.furniture.stackChair(i, () => this.audio.playChairTick());
          this.fsm.stackChairBack();
        }
      }
      this.checkLunchCleanupComplete();
    } else if (phase === 'NAP_SETUP') {
      for (const mat of this.fsm.seedConfig.mats) {
        const v = this.mats.mats.get(mat.id)!;
        if (!v.placed) {
          this.mats.setStateInstant(mat.id, true, 1, true);
          this.fsm.attemptPlaceMat(mat.id, matMarkerPosition(mat.markerIndex));
          this.fsm.setMatUnrollProgress(mat.id, 1);
          this.fsm.placeBeddingItem();
        } else if ((this.fsm.napSetup.unrollProgress[mat.id] ?? 0) < 1) {
          this.mats.setUnrollProgress(mat.id, 1);
          this.fsm.setMatUnrollProgress(mat.id, 1);
          this.mats.showBedding(mat.id);
          this.fsm.placeBeddingItem();
        }
      }
      if (!this.fsm.napSetup.curtainClosed) {
        this.curtain.setProgress(1);
        this.fsm.closeCurtainNap();
        this.matCamHandedOff = true;
      }
      this.checkNapFurnitureReady();
    } else if (phase === 'WAKE_RESTORE') {
      if (!this.fsm.wakeRestore.curtainOpened) {
        this.curtain.setProgress(0);
        this.fsm.openCurtainWake();
      }
      for (const mat of this.fsm.seedConfig.mats) {
        const v = this.mats.mats.get(mat.id)!;
        if (!v.placed) continue;
        const idx = v.index;
        this.mats.hopToShelf(mat.id, idx);
        this.fsm.rollMatBack();
        this.fsm.shelveMatBack();
      }
      this.checkWakeRestoreComplete();
    }
  }

  /** Projects a world-space point to CSS client coordinates — lets e2e tests target real pointer gestures precisely. */
  projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const v = worldPos.clone().project(this.cameraDirector.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (1 - (v.y * 0.5 + 0.5)) * rect.height + rect.top,
    };
  }

  screenPositionOfToy(id: string): { x: number; y: number } | null {
    const t = this.toys.toys.get(id);
    if (!t) return null;
    return this.projectToScreen(t.group.position);
  }

  screenPositionOfBasket(id: string): { x: number; y: number } | null {
    const b = this.baskets.baskets.get(id);
    if (!b) return null;
    return this.projectToScreen(b.group.position);
  }

  screenPositionOfMat(id: string): { x: number; y: number } | null {
    const v = this.mats.mats.get(id);
    if (!v) return null;
    return this.projectToScreen(v.proxy.position);
  }

  /** The anchor a carried mat must be dropped near to snap into place (matches the FSM capture-radius check). */
  screenPositionOfMatMarker(id: string): { x: number; y: number } | null {
    const v = this.mats.mats.get(id);
    if (!v) return null;
    return this.projectToScreen(v.marker);
  }

  /** Where the far/unrolled edge of a placed mat ends up — useful as the aim point for the unroll swipe. */
  screenPositionOfMatUnrollTarget(id: string): { x: number; y: number } | null {
    const v = this.mats.mats.get(id);
    if (!v) return null;
    const target = v.marker.clone();
    target.x += 0.62;
    return this.projectToScreen(target);
  }

  screenPositionOfHandle(kind: 'table' | 'cart' | 'chairStack' | 'curtain' | 'wipe'): { x: number; y: number } {
    const map: Record<typeof kind, THREE.Object3D> = {
      table: this.furniture.tableProxy,
      cart: this.furniture.cartProxy,
      chairStack: this.furniture.chairStackProxy,
      curtain: this.curtain.proxy,
      wipe: this.wipeProxy,
    };
    return this.projectToScreen(map[kind].position);
  }

  screenPositionOfTray(index: number): { x: number; y: number } {
    const proxy = this.trayProxies[index]!;
    const pos = this.furniture.seatWorldPosition(index);
    pos.y = 0.44;
    return this.projectToScreen(proxy.visible ? proxy.position : pos);
  }

  debugPickables(): { kind: string; id: string; screen: { x: number; y: number } }[] {
    return this.getPickables().map((p) => ({ kind: p.kind, id: p.id, screen: this.projectToScreen(p.object.position) }));
  }
}
