/**
 * PUBLIC API — the single entry point the Wave 4 integrator wires up.
 * Everything else under src/core, src/render, src/scene, src/visual is an
 * implementation detail reached only through {@link createRenderSystem}.
 *
 * ## What this owns
 * A WebGL2 Three.js renderer for the procedural tower scene
 * (scene/sceneBuilder.ts), driven by a fixed-timestep engine loop
 * (core/engineLoop.ts), an adaptive QualityManager (core/qualityManager.ts),
 * a CameraDirector that reacts to `cameraCue` events, a magnifier
 * render-to-texture inset, glow/pulse effects for snap/reveal/settle
 * beats, and per-frame projection of the 4 render-owned interaction
 * handles into the shared HandleRegistry (contracts/handles.ts).
 *
 * ## Engine loop ownership boundary (read this before wiring)
 * `core/engineLoop.ts` is a generic, reusable primitive — this factory
 * uses its OWN internal instance purely for RENDER-side work: per-frame
 * effect/camera easing (`tick`) and the actual draw + HandleRegistry
 * update (`render`), always reading the freshest `GameState` via
 * `getState()`. It does **not** advance game logic — `stateMachine.transition`
 * calls are the Gameplay owner's responsibility, via whatever mechanism
 * they choose (their own use of `core/engineLoop.ts`, or direct
 * intent-driven calls). This is why `getState` is a required constructor
 * argument rather than something this module computes.
 *
 * ## `?quality=` / `?fixedStep=1`
 * Both are read directly from `location.search` at construction time (with
 * safe no-op fallbacks outside a browser), matching
 * `contracts/testing.ts`'s "URL params" section — no extra wiring needed
 * from the integrator. Pass `quality` explicitly to override URL-sniffing
 * (e.g. if the integrator centralizes URL parsing elsewhere).
 *
 * ## HandleRegistry coverage
 * Registers `sandGate`, `pumpHandle`, `wedge`, `hammer` every frame,
 * projected from the CURRENT `state.activeLeg`'s 3D props, with `active`
 * reflecting that leg's current `LegPhase` (contracts/handles.ts's
 * "one-verb-per-phase" rule). **`replayButton` is intentionally NOT
 * registered** — PRODUCT_SPEC's completeMenu ("もう一回"の大ボタン) is a
 * 2D DOM overlay concern more naturally owned by the UX/audio owner
 * (src/ui), not a 3D scene object; the deliverable brief explicitly allows
 * delegating it. If a later wave wants a 3D replay handle instead, it can
 * be added here without changing this module's public shape.
 *
 * ## dispose() vs. replay
 * `dispose()` is for FINAL teardown (frees every GPU resource this system
 * ever allocated — geometries, materials, textures, the render target, the
 * renderer itself). It is intentionally NOT needed between replays:
 * `replayRequested` only resets GameState (Gameplay owner); this renderer
 * re-reads `getState()` every frame and has no per-replay allocation, so
 * `renderer.info.memory.{geometries,textures}` is naturally stable across
 * any number of replays through the same `RenderSystem` instance —
 * satisfying PRODUCT_SPEC's "replay 20回でWebGLリソースリークなし" by
 * construction rather than by an explicit reset step.
 */
import * as THREE from 'three';
import type { EventBus } from '../contracts/events';
import type { HandleRegistry } from '../contracts/handles';
import { LEG_ORDER, type GameState, type LegId } from '../contracts/types';
import { WEDGE_SEAT_THRESHOLD } from '../contracts/constants';
import type { QualityTier } from '../contracts/quality';

import { createEngineLoop, type EngineLoop } from '../core/engineLoop';
import { createQualityManager, parseQualityOverride } from '../core/qualityManager';
import { createResizeWatcher, type ResizeWatcher } from '../core/resize';
import { wireContextRecovery } from '../core/contextRecovery';

import { createHeroMaterials, disposeHeroMaterials, type HeroMaterials } from './materials';
import { buildScene, updateScene, type SceneHandles } from '../scene/sceneBuilder';
import { GIRDER_RING_Y } from '../scene/layout';
import { createLighting, type Lighting } from './lighting';
import { createCameraDirector, type CameraDirector } from './camera/cameraDirector';
import { cueToPose } from './camera/cameraPoses';
import { createMagnifier, type Magnifier } from './magnifier';
import { createLiveSignals, type LiveSignals } from './liveSignals';
import { applyJunctionGlow } from './glow';
import { approach, createPulse, decayPulse, triggerPulse, type Pulse } from './pulse';
import { projectHandle } from './handleProjection';
import { triggerDustPuff, updateDustPuff } from '../visual/dust';
import { advanceStreamScroll } from '../visual/sand/sandVisual';

export interface RenderSystemOptions {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  handles: HandleRegistry;
  /** Polled once per rendered frame — this system never mutates or advances GameState itself. */
  getState: () => GameState;
  /** Overrides the `?quality=` URL param / default 'high' starting tier. */
  quality?: QualityTier;
}

export interface RenderInfo {
  /** renderer.info.memory.geometries. */
  geometries: number;
  /** renderer.info.memory.textures. */
  textures: number;
  /** Total draw calls issued by the most recently rendered frame (main pass + magnifier passes combined). */
  drawCalls: number;
}

export interface RenderSystem {
  /** Starts the self-running RAF loop. No-op (mode toggle only) when `?fixedStep=1` is set — see module doc. */
  start(): void;
  /** Advances exactly `frames` fixed logic+render steps synchronously. Only meaningful under `?fixedStep=1` (contracts/testing.ts); a no-op otherwise. */
  stepFrames(frames: number): void;
  /** Re-measures the canvas's CSS size and re-applies it (also called automatically, debounced, on resize/orientationchange). */
  resize(): void;
  /** Frees every GPU resource this system owns. Final teardown only — see module doc for why replay doesn't need this. */
  dispose(): void;
  renderInfo(): RenderInfo;
  /** True once the camera and all in-flight visual effects (pumps/hammers/snap flashes/reveal beats/settle) are at rest — a safe moment for a screenshot. */
  settled(): boolean;
  /** True while the WebGL context is lost (rendering is paused; resumes automatically on 'webglcontextrestored'). */
  contextLost(): boolean;
}

const SETTLE_DEPTH = 0.18;
const MAGNIFIER_ZOOM_LERP = 0.4;

function readUrlParam(name: string): string | null {
  if (typeof location === 'undefined') return null;
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function readViewportCss(canvas: HTMLCanvasElement): { width: number; height: number } {
  const fallbackW = typeof window !== 'undefined' ? window.innerWidth : 800;
  const fallbackH = typeof window !== 'undefined' ? window.innerHeight : 600;
  return {
    width: Math.max(1, canvas.clientWidth || fallbackW),
    height: Math.max(1, canvas.clientHeight || fallbackH),
  };
}

function devicePixelRatioOf(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
}

function disposeSceneGraph(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh>;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else if (mat) {
      mat.dispose();
    }
  });
}

/**
 * Builds the renderer, scene, camera, and every render-owned subsystem,
 * and returns the small control surface the integrator drives. See the
 * module doc comment above for the engine-loop ownership boundary,
 * HandleRegistry coverage, and dispose()/replay semantics.
 */
export function createRenderSystem(options: RenderSystemOptions): RenderSystem {
  const { canvas, bus, handles, getState } = options;

  const urlQuality = parseQualityOverride(readUrlParam('quality'));
  const fixedStepMode = readUrlParam('fixedStep') === '1';
  const qualityManager = createQualityManager({ initialTier: options.quality ?? urlQuality ?? 'high' });
  let lastAppliedTier = qualityManager.state.tier;

  const initialQuality = qualityManager.state;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: initialQuality.tier !== 'low',
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = initialQuality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const initialState = getState();

  let materials: HeroMaterials = createHeroMaterials();
  let sceneHandles: SceneHandles = buildScene(materials, initialQuality);
  let lighting: Lighting = createLighting(initialQuality);
  sceneHandles.scene.add(lighting.key, lighting.key.target, lighting.hemi);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 400);

  // Seeds the aspect-aware ground-prop framing (cameraPoses.ts's R2 rework)
  // with the REAL initial viewport, not a generic default — doResize()
  // (below) keeps it current via cameraDirector.setAspect() on every resize.
  const initialViewport = readViewportCss(canvas);
  const cameraDirector: CameraDirector = createCameraDirector(
    initialState.seed,
    initialState.reducedMotion,
    initialViewport.width / initialViewport.height,
  );
  const magnifier: Magnifier = createMagnifier();
  const liveSignals: LiveSignals = createLiveSignals(bus);

  let contextLostFlag = false;
  let lastDrawCalls = 0;
  let activeMagnifierLeg: LegId = initialState.activeLeg;
  let settleProgress = 0;
  let settleTarget = 0;
  let dustProgress = 1;

  const pumpPulses: [Pulse, Pulse, Pulse, Pulse] = [createPulse(), createPulse(), createPulse(), createPulse()];
  const hammerPulses: [Pulse, Pulse, Pulse, Pulse] = [createPulse(), createPulse(), createPulse(), createPulse()];
  const snapPulses: [Pulse, Pulse, Pulse, Pulse] = [createPulse(), createPulse(), createPulse(), createPulse()];
  const revealPulses: [Pulse, Pulse, Pulse, Pulse] = [createPulse(), createPulse(), createPulse(), createPulse()];

  function doResize(): void {
    const { width, height } = readViewportCss(canvas);
    renderer.setPixelRatio(Math.min(devicePixelRatioOf(), qualityManager.state.dprCap));
    renderer.setSize(width, height, true);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    magnifier.resize(width, height);
    cameraDirector.setAspect(width / height);
  }

  const resizeWatcher: ResizeWatcher = createResizeWatcher({ onResize: doResize });
  doResize();

  const unwireContext = wireContextRecovery(canvas, {
    onLost: () => {
      contextLostFlag = true;
      loop.stop();
    },
    onRestored: () => {
      disposeSceneGraph(sceneHandles.scene);
      disposeHeroMaterials(materials);
      lighting.dispose();
      materials = createHeroMaterials();
      sceneHandles = buildScene(materials, qualityManager.state);
      lighting = createLighting(qualityManager.state);
      sceneHandles.scene.add(lighting.key, lighting.key.target, lighting.hemi);
      contextLostFlag = false;
      loop.start();
    },
  });

  const unsubscribers: (() => void)[] = [
    bus.on('cameraCue', (e) => {
      cameraDirector.setCue(e.cue);
    }),
    bus.on('pauseChanged', (e) => {
      if (e.paused) loop.stop();
      else loop.start();
    }),
    bus.on('magnifierShown', (e) => {
      magnifier.setShown(e.shown);
      activeMagnifierLeg = e.leg;
    }),
    bus.on('jackPumped', (e) => {
      triggerPulse(pumpPulses[e.leg]);
    }),
    bus.on('hammered', (e) => {
      triggerPulse(hammerPulses[e.leg]);
      const origin = new THREE.Vector3();
      sceneHandles.wedgeRigs[e.leg].wedge.getWorldPosition(origin);
      triggerDustPuff(sceneHandles.dustPuff, origin);
      dustProgress = 0;
    }),
    bus.on('snapped', (e) => {
      triggerPulse(snapPulses[e.leg]);
    }),
    bus.on('revealBeat', (e) => {
      triggerPulse(revealPulses[e.index]);
    }),
    bus.on('settled', () => {
      settleTarget = 1;
    }),
    bus.on('replayRequested', () => {
      settleProgress = 0;
      settleTarget = 0;
    }),
  ];

  function tick(dtSeconds: number): void {
    const state = getState();
    cameraDirector.setReducedMotion(state.reducedMotion);
    cameraDirector.update(dtSeconds);
    magnifier.update(dtSeconds);
    for (const leg of LEG_ORDER) {
      decayPulse(pumpPulses[leg], dtSeconds, 0.15);
      decayPulse(hammerPulses[leg], dtSeconds, 0.2);
      decayPulse(snapPulses[leg], dtSeconds, 0.35);
      decayPulse(revealPulses[leg], dtSeconds, 0.5);
      advanceStreamScroll(sceneHandles.sandVisuals[leg].stream, dtSeconds, liveSignals.sandFlowRate[leg]);
    }
    settleProgress = approach(settleProgress, settleTarget, dtSeconds, 0.35);
    dustProgress = Math.min(1, dustProgress + dtSeconds / 0.5);
    updateDustPuff(sceneHandles.dustPuff, dustProgress);
  }

  function applySettle(): void {
    const settleY = -SETTLE_DEPTH * settleProgress;
    sceneHandles.girderRing.position.y = settleY;
    for (const leg of LEG_ORDER) {
      sceneHandles.pinAndRings[leg].ring.position.y = GIRDER_RING_Y + settleY;
      sceneHandles.wedgeRigs[leg].group.position.y = GIRDER_RING_Y + settleY;
    }
  }

  function applyKinematicPulses(): void {
    for (const leg of LEG_ORDER) {
      sceneHandles.groundRigs[leg].pumpPivot.rotation.x = -pumpPulses[leg].value * 0.5;
      const hammerRig = sceneHandles.wedgeRigs[leg];
      hammerRig.hammer.rotation.x = hammerRig.hammerRestRotationX - hammerPulses[leg].value * 1.1;
    }
  }

  function applyGlow(state: GameState): void {
    for (const leg of LEG_ORDER) {
      const pinMat = sceneHandles.legRigs[leg].pin.material as THREE.MeshStandardMaterial;
      const ringMat = sceneHandles.pinAndRings[leg].ring.material as THREE.MeshStandardMaterial;
      const pulse = Math.max(snapPulses[leg].value, revealPulses[leg].value);
      applyJunctionGlow(pinMat, ringMat, state.legs[leg].alignmentError, pulse);
    }
  }

  function updateHandles(state: GameState): void {
    const { width, height } = readViewportCss(canvas);
    const leg = state.activeLeg;
    const legPhase = state.legs[leg].phase;
    const inLegPhase = state.phase === 'leg';
    const groundRig = sceneHandles.groundRigs[leg];
    const wedgeRig = sceneHandles.wedgeRigs[leg];

    const gateWorld = new THREE.Vector3();
    groundRig.gatePivot.getWorldPosition(gateWorld);
    handles.set(
      projectHandle(
        { id: 'sandGate', worldPosition: gateWorld, axis: 'vertical', range: 140, active: inLegPhase && legPhase === 'sand' },
        camera,
        width,
        height,
      ),
    );

    const pumpWorld = new THREE.Vector3();
    groundRig.pumpPivot.getWorldPosition(pumpWorld);
    handles.set(
      projectHandle(
        { id: 'pumpHandle', worldPosition: pumpWorld, axis: 'vertical', range: 160, active: inLegPhase && legPhase === 'jack' },
        camera,
        width,
        height,
      ),
    );

    const wedgeWorld = new THREE.Vector3();
    wedgeRig.wedge.getWorldPosition(wedgeWorld);
    const wedgeActive = inLegPhase && legPhase === 'wedge' && state.legs[leg].wedgeProgress < WEDGE_SEAT_THRESHOLD;
    handles.set(projectHandle({ id: 'wedge', worldPosition: wedgeWorld, axis: 'free', range: 120, active: wedgeActive }, camera, width, height));

    const hammerWorld = new THREE.Vector3();
    wedgeRig.hammer.getWorldPosition(hammerWorld);
    const hammerActive = inLegPhase && legPhase === 'wedge' && state.legs[leg].wedgeProgress >= WEDGE_SEAT_THRESHOLD;
    handles.set(
      projectHandle({ id: 'hammer', worldPosition: hammerWorld, axis: 'vertical', range: 60, active: hammerActive }, camera, width, height),
    );
  }

  function render(): void {
    if (contextLostFlag) return;
    const startMs = performance.now();
    const state = getState();

    updateScene(sceneHandles, state, qualityManager.state, liveSignals);
    applySettle();
    applyKinematicPulses();
    applyGlow(state);
    sceneHandles.scene.updateMatrixWorld(true);

    const { width, height } = readViewportCss(canvas);
    camera.position.set(cameraDirector.pose.position[0], cameraDirector.pose.position[1], cameraDirector.pose.position[2]);
    camera.fov = cameraDirector.pose.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.lookAt(cameraDirector.pose.target[0], cameraDirector.pose.target[1], cameraDirector.pose.target[2]);
    // Handle projection (below) needs camera.matrixWorldInverse current NOW — renderer.render()
    // normally refreshes it, but that happens after updateHandles() in this function, so without
    // this explicit call HandleRegistry would read a one-frame-stale camera transform.
    camera.updateMatrixWorld(true);

    updateHandles(state);

    renderer.info.reset();

    if (magnifier.isVisible()) {
      const alignmentPose = cueToPose({ kind: 'alignment', leg: activeMagnifierLeg }, state.seed);
      const target = new THREE.Vector3(...alignmentPose.target);
      const wide = new THREE.Vector3(...alignmentPose.position);
      const zoomed = target.clone().lerp(wide, MAGNIFIER_ZOOM_LERP);
      magnifier.aim(zoomed, target);
      renderer.setRenderTarget(magnifier.renderTarget);
      renderer.render(sceneHandles.scene, magnifier.camera);
      renderer.setRenderTarget(null);
    }

    renderer.autoClear = true;
    renderer.render(sceneHandles.scene, camera);

    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(magnifier.overlayScene, magnifier.overlayCamera);
    renderer.autoClear = true;

    lastDrawCalls = renderer.info.render.calls;

    const frameMs = performance.now() - startMs;
    const newQuality = qualityManager.sample(frameMs);
    if (newQuality.tier !== lastAppliedTier) {
      lastAppliedTier = newQuality.tier;
      renderer.setPixelRatio(Math.min(devicePixelRatioOf(), newQuality.dprCap));
      renderer.shadowMap.enabled = newQuality.shadows;
      lighting.applyQuality(newQuality);
    }
  }

  const loop: EngineLoop = createEngineLoop({ tick, render }, { fixedStep: fixedStepMode });

  return {
    start(): void {
      loop.start();
    },
    stepFrames(frames: number): void {
      loop.stepFrames(frames);
    },
    resize(): void {
      doResize();
    },
    dispose(): void {
      loop.stop();
      resizeWatcher.dispose();
      unwireContext();
      liveSignals.dispose();
      for (const off of unsubscribers) off();
      magnifier.dispose();
      lighting.dispose();
      disposeSceneGraph(sceneHandles.scene);
      disposeHeroMaterials(materials);
      renderer.dispose();
      renderer.forceContextLoss();
    },
    renderInfo(): RenderInfo {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        drawCalls: lastDrawCalls,
      };
    },
    settled(): boolean {
      if (!cameraDirector.settled()) return false;
      if (settleProgress !== settleTarget) return false;
      for (const leg of LEG_ORDER) {
        if (pumpPulses[leg].value > 0 || hammerPulses[leg].value > 0 || snapPulses[leg].value > 0 || revealPulses[leg].value > 0) {
          return false;
        }
      }
      return true;
    },
    contextLost(): boolean {
      return contextLostFlag;
    },
  };
}
