// src/core/index.ts — Renderer module (owner: Renderer, src/core/**).
// Implements the frozen createRenderer() contract from
// docs/ARCHITECTURE_CONTRACT.md: WebGL2 renderer + its own internal rAF
// loop, resize, adaptive quality, context-loss recovery, and the anchor
// projection pass. All procedural content lives in scene/render/visual;
// this file is the thin GPU/lifecycle shell around it.

import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { Anchor, AnchorId, QualityLevel } from '../contracts/types';
import { createCameraDirector, type CameraDirector } from '../render/camera';
import { initialQualityStepState, QUALITY_SETTINGS, stepQuality, type QualityStepState } from '../render/quality';
import { projectToScreenInto, projectedRadius, type ScreenPoint } from '../render/anchorProject';
import { createSceneRig, type SceneRig } from '../scene/index';
import { makeSkyTexture } from '../visual/textures';

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  fps: number;
}

export interface RendererHandle {
  ready: Promise<void>;
  start(): void;
  stop(): void;
  resize(): void;
  setQuality(q: QualityLevel): void;
  isSettled(): boolean;
  getStats(): RendererStats;
  dispose(): void;
}

const DPR_HIGH = 1.75;
const DPR_LARGE_CANVAS = 1.5;
const LARGE_CANVAS_MIN_CSS_PX = 900;

function isTestMode(): boolean {
  return new URLSearchParams(window.location.search).get('test') === '1';
}

export function createRenderer(o: {
  canvas: HTMLCanvasElement;
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
}): RendererHandle {
  const { canvas, store, bus, anchors } = o;
  const testMode = isTestMode();

  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  // Warm afternoon gradient (horizon haze band matches the fog color below)
  // instead of a flat color, so the sky itself already reads as "grounded"
  // atmosphere rather than a solid backdrop the buildings float against.
  const skyTexture = makeSkyTexture();
  scene.background = skyTexture;
  scene.fog = new Fog('#e2cfa8', 55, 230);

  // R7: bumped from 0.85/1.35 — align/bolts (and the rivet macro shots)
  // read as too dark/low-contrast against the tower leg's own dark iron,
  // especially the bolt holes. Still exactly 2 lights total (directional +
  // hemisphere) per PERFORMANCE_BUDGET.md; this only raises their
  // intensity/ground-bounce color, it doesn't add a 3rd light.
  const hemi = new HemisphereLight('#fdf3d8', '#6f5a46', 1.05);
  const sun = new DirectionalLight('#ffe9bd', 1.55);
  sun.position.set(18, 26, 12);
  scene.add(hemi, sun);

  const cameraDirector: CameraDirector = createCameraDirector(bus);

  // Note: procedural details seeded once at construction (worker cloth
  // colors, backdrop cloud/building layout) intentionally do not re-seed if
  // the store's `seed` changes later (e.g. the "different beam" replay
  // option) — only `state.beamShape`/`state.towerLevel`-driven geometry
  // (the beam itself, tower height) reacts live every frame. See
  // docs/handoffs/renderer.md for the full rationale.
  const initialSeed = store.get().seed;
  const sceneRig: SceneRig = createSceneRig(initialSeed, bus);
  scene.add(sceneRig.root);

  let qualityState: QualityStepState = initialQualityStepState(testMode ? 'mid' : 'high');
  applyQualitySettings(qualityState.level);

  function dprCapForCanvas(): number {
    const cssWidth = canvas.clientWidth || window.innerWidth;
    const cssHeight = canvas.clientHeight || window.innerHeight;
    const isLargeCanvas = Math.max(cssWidth, cssHeight) >= LARGE_CANVAS_MIN_CSS_PX;
    return isLargeCanvas ? DPR_LARGE_CANVAS : DPR_HIGH;
  }

  function applyQualitySettings(level: QualityLevel): void {
    const settings = QUALITY_SETTINGS[level];
    const cap = Math.min(settings.dprCap, dprCapForCanvas());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    sceneRig.setQualityDetail(settings.backdropDetail);
    sceneRig.setParticleCaps(settings.steamMax, settings.sparkMax);
  }

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    // DPR may need re-capping if the canvas crossed the "large canvas" threshold.
    applyQualitySettings(qualityState.level);
  }

  // The internal rAF loop (running) and GPU-context availability (contextLost)
  // are orthogonal: stop()/start() fully own `running` (cancels/resumes the
  // loop itself, per the frozen contract); a context loss just makes frame()
  // skip its render/update body while the loop keeps ticking (cheap no-op),
  // so restoration picks back up on the very next scheduled frame with no
  // separate "was it running before" bookkeeping needed.
  let contextLost = false;
  function onContextLost(event: Event): void {
    event.preventDefault();
    contextLost = true;
  }
  function onContextRestored(): void {
    contextLost = false;
    // three.js's WebGLRenderer re-uploads GPU resources from its retained
    // JS-side geometry/material/texture descriptions automatically on the
    // next render call; the scene graph itself (built once at construction
    // and driven by GameState every frame) needs no rebuild.
    resize();
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  // ---- anchor projection --------------------------------------------------
  // Per-AnchorId scratch objects, allocated once (lazily, on each id's first
  // publish) and mutated in place every frame after — AnchorRegistry.set()
  // stores the object BY REFERENCE (contracts/anchors.ts, frozen), so a
  // single shared scratch object across all ids would alias every anchor to
  // the same final values; one persistent object per id avoids that while
  // still allocating nothing in steady state (R9).
  const anchorScratch = new Map<AnchorId, Anchor>();
  const screenScratch: ScreenPoint = { x: 0, y: 0, visible: false };
  function publishAnchors(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    for (const [id, entry] of sceneRig.anchorWorld) {
      projectToScreenInto(screenScratch, cameraDirector.camera, entry.pos.x, entry.pos.y, entry.pos.z, width, height);
      const r = Math.max(
        projectedRadius(cameraDirector.camera, entry.pos.x, entry.pos.y, entry.pos.z, entry.r, width, height),
        48,
      );
      let anchor = anchorScratch.get(id as AnchorId);
      if (!anchor) {
        anchor = { id: id as AnchorId, x: 0, y: 0, r: 0, active: false };
        anchorScratch.set(id as AnchorId, anchor);
      }
      anchor.x = screenScratch.x;
      anchor.y = screenScratch.y;
      anchor.r = r;
      anchor.active = entry.active && screenScratch.visible;
      anchors.set(anchor);
    }
  }

  // R3 (align-entry race fix): a phase change can fire, and be immediately
  // followed by a phase-specific gesture (e.g. align's own first drag), all
  // within the SAME synchronous input-processing burst — well before this
  // module's own rAF-driven frame() below gets a chance to run again. A
  // phase controller that lazily captures its target from "whatever anchors
  // are currently published" (src/game/phases/align.ts's documented
  // first-touch capture) can therefore read anchors that still reflect the
  // *previous* phase's camera framing, not the new one. Re-running the
  // update+publish pass synchronously the instant a phase changes (dtMs=0:
  // re-derives positions from the now-current state without advancing any
  // local animation timers) keeps the published anchors — and, combined
  // with render/camera.ts's own hard-cut-on-cue-change, the camera itself —
  // already consistent with the new phase before any of its own input can
  // possibly arrive. bus.emit() (contracts/bus.ts) calls listeners
  // synchronously, so this genuinely runs before control returns to
  // whatever dispatched the phase change.
  const unsubscribePhaseEnter = bus.on('phase:enter', () => {
    if (contextLost) return;
    const state = store.get();
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    sceneRig.update(state, 0, cameraDirector.camera, testMode);
    cameraDirector.update(state, sceneRig.points, width, height, 0, testMode);
    publishAnchors();
  });

  // ---- render loop ----------------------------------------------------------
  let running = false;
  let rafId = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsWindowStart = performance.now();
  let lastFrameTime = 0;

  function frame(now: number): void {
    if (!running) return;
    const dtMs = testMode ? 1000 / 60 : Math.min(now - (lastFrameTime || now), 100);
    lastFrameTime = now;

    if (!contextLost) {
      const state = store.get();
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;

      sceneRig.update(state, dtMs, cameraDirector.camera, testMode);
      cameraDirector.update(state, sceneRig.points, width, height, dtMs, testMode);
      publishAnchors();

      renderer.render(scene, cameraDirector.camera);

      fpsFrames += 1;
      const elapsed = now - fpsWindowStart;
      if (elapsed >= 500) {
        fps = (fpsFrames * 1000) / elapsed;
        fpsFrames = 0;
        fpsWindowStart = now;
      }

      qualityState = stepQuality(qualityState, dtMs, testMode);
      if (qualityState.level !== lastAppliedQualityLevel) {
        lastAppliedQualityLevel = qualityState.level;
        applyQualitySettings(qualityState.level);
      }
    }

    rafId = requestAnimationFrame(frame);
  }
  let lastAppliedQualityLevel: QualityLevel = qualityState.level;

  function start(): void {
    if (running) return;
    running = true;
    lastFrameTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(rafId);
  }

  const ready = new Promise<void>((resolve) => {
    resize();
    // Render one frame synchronously so the very first paint (before start()
    // is called by app/index.ts) already shows the built scene, and so
    // sceneReady only resolves once real geometry exists on screen.
    const state = store.get();
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    sceneRig.update(state, 16.67, cameraDirector.camera, testMode);
    cameraDirector.update(state, sceneRig.points, width, height, 16.67, testMode);
    publishAnchors();
    renderer.render(scene, cameraDirector.camera);
    resolve();
  });

  function setQuality(q: QualityLevel): void {
    qualityState = { level: q, avgFrameMs: qualityState.avgFrameMs, overBudgetMs: 0 };
    lastAppliedQualityLevel = q;
    applyQualitySettings(q);
  }

  function isSettled(): boolean {
    return cameraDirector.isSettled();
  }

  function getStats(): RendererStats {
    return {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps: Math.round(fps),
    };
  }

  function dispose(): void {
    stop();
    unsubscribePhaseEnter();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    cameraDirector.dispose();
    scene.remove(sceneRig.root);
    sceneRig.dispose();
    skyTexture.dispose();
    renderer.dispose();
  }

  return { ready, start, stop, resize, setQuality, isSettled, getStats, dispose };
}
