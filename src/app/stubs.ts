/**
 * Wave-3 replacement points. Every class here implements a frozen
 * `src/contracts/subsystems.ts` interface with the smallest honest
 * behavior that proves the DI wiring works end-to-end — NONE of them
 * implement real gameplay, rendering, UX or audio. Wave 3 owners replace
 * these one-for-one; App never changes when they do (see `App.ts`).
 */

import * as THREE from 'three';

import { CAMERA_FAR, CAMERA_FOV_PORTRAIT_DEG, CAMERA_NEAR, type CameraCueId } from '../contracts/camera.ts';
import { DPR_CAP_HIGH, PALETTE } from '../contracts/constants.ts';
import type { EventBus } from '../contracts/events.ts';
import type { GameStateId } from '../contracts/states.ts';
import type { GameSnapshot, MutableGameStore } from '../contracts/store.ts';
import type {
  AudioEngine,
  GameLogic,
  InputIntent,
  SceneWorld,
  UiLayer,
} from '../contracts/subsystems.ts';

/** Radians/millisecond spin rate for the idle placeholder pulley. Purely decorative. */
const PLACEHOLDER_PULLEY_SPIN_RATE = 0.0012;

// ---------------------------------------------------------------------------
// StubGameLogic — src/game/** replacement point
// ---------------------------------------------------------------------------

/**
 * Holds a snapshot with defaults and mirrors raw input 1:1. Deliberately
 * does NOT implement the real drive pipeline (valveOpen -> pistonSpeed ->
 * pistonDisplacement -> cableTravel -> arcLength/pulleyAngle) or leveling
 * dynamics — that is the gameplay/math owner's job (MATH_CONTRACT).
 */
export class StubGameLogic implements GameLogic {
  constructor(
    private readonly store: MutableGameStore,
    private readonly bus: EventBus,
  ) {}

  step(_dt: number): void {
    // No simulation to advance yet — honestly a no-op.
  }

  applyInput(intent: InputIntent): void {
    switch (intent.kind) {
      case 'lever':
        this.store.set({ valveOpen: clamp01(intent.value) });
        return;
      case 'throttle':
        this.store.set({ direction: intent.value });
        return;
      case 'wheel':
        // No leveling-assist simulation in the stub.
        return;
    }
  }

  gotoState(state: GameStateId): void {
    const previous = this.store.get().state;
    if (previous === state) return; // re-entrant triggers are ignored
    this.store.set({ state });
    this.bus.emit('state:changed', { state, previous });
  }

  serialize(): GameSnapshot {
    return this.store.get();
  }

  reset(seed: number): void {
    const current = this.store.get();
    this.store.set({
      valveOpen: 0,
      direction: 0,
      pistonDisplacement: 0,
      cableTravel: 0,
      arcLength: 0,
      t: 0,
      thetaDeg: 0,
      carrierAngleDeg: 0,
      cabinTiltErrorDeg: 0,
      cabinWorldTiltDeg: 0,
      speed: 0,
      seed,
    });
    if (current.state !== 'boot') {
      this.gotoState('boot');
    }
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// StubSceneWorld — src/core|render|scene|visual/** replacement point
// ---------------------------------------------------------------------------

/**
 * An empty three.js scene with a colored background and one spinning
 * placeholder pulley, so "renders something" is provable. Wires the real
 * WebGL context-loss recovery pattern (rebuild on restore, store untouched)
 * even though there is nothing meaningful to rebuild yet.
 */
export class StubSceneWorld implements SceneWorld {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private pulley: THREE.Mesh | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private lastFrameTimeMs: number | null = null;
  private contextLost = false;
  private onFirstFrame: (() => void) | undefined;

  /** Registered once by App, fired the first time a frame is actually rendered. */
  setOnFirstFrame(callback: () => void): void {
    this.onFirstFrame = callback;
  }

  /** Draw calls from the most recent render, for the test API's `readouts().drawCalls`. */
  getDrawCalls(): number {
    return this.renderer?.info.render.calls ?? 0;
  }

  init(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(canvas);
    this.canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP_HIGH));
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.skyZenith);
    this.scene = scene;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_PORTRAIT_DEG, width / height, CAMERA_NEAR, CAMERA_FAR);
    camera.up.set(0, 1, 0);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    this.camera = camera;

    const light = new THREE.HemisphereLight(PALETTE.skyHorizon, PALETTE.iron, 3);
    scene.add(light);

    const pulley = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.28, 16, 32),
      new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.4, metalness: 0.6 }),
    );
    scene.add(pulley);
    this.pulley = pulley;

    this.resize(width, height);

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.onContextRestored();
    });
  }

  updateFromSnapshot(snapshot: GameSnapshot, _alpha: number): void {
    const { renderer, scene, camera, pulley } = this;
    if (!renderer || !scene || !camera || !pulley || this.contextLost) return;

    const now = performance.now();
    const deltaMs = this.lastFrameTimeMs === null ? 0 : now - this.lastFrameTimeMs;
    this.lastFrameTimeMs = now;
    if (!snapshot.paused) {
      pulley.rotation.z -= deltaMs * PLACEHOLDER_PULLEY_SPIN_RATE;
    }

    renderer.render(scene, camera);
    if (!this.onFirstFrame) return;
    const fire = this.onFirstFrame;
    this.onFirstFrame = undefined;
    fire();
  }

  setCameraCue(_cue: CameraCueId): void {
    // No CameraDirector yet — the stub has exactly one framing.
  }

  resize(width: number, height: number): void {
    const { renderer, camera } = this;
    if (!renderer || !camera) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.pulley?.geometry.dispose();
    if (this.pulley?.material instanceof THREE.Material) {
      this.pulley.material.dispose();
    }
    this.renderer?.dispose();
    this.canvas?.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.pulley = null;
    this.canvas = null;
  }

  onContextLost(): void {
    this.contextLost = true;
  }

  onContextRestored(): void {
    this.contextLost = false;
    // The real renderer owner rebuilds every GPU resource here; the stub
    // has nothing beyond the pulley, which three.js keeps in JS memory and
    // simply re-uploads on the next render call.
  }
}

// ---------------------------------------------------------------------------
// StubUiLayer — src/ui/** replacement point
// ---------------------------------------------------------------------------

/** Mounts an empty layer. The real UX owner renders pictogram controls here. */
export class StubUiLayer implements UiLayer {
  private element: HTMLElement | null = null;

  mount(root: HTMLElement): void {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    root.appendChild(el);
    this.element = el;
  }

  updateFromSnapshot(_snapshot: GameSnapshot): void {
    // Intentionally empty.
  }

  dispose(): void {
    this.element?.remove();
    this.element = null;
  }
}

// ---------------------------------------------------------------------------
// StubAudioEngine — src/audio/** replacement point
// ---------------------------------------------------------------------------

/** No-op WebAudio engine. */
export class StubAudioEngine implements AudioEngine {
  unlock(): void {
    // No AudioContext to unlock yet.
  }

  handleCue(): void {
    // No sound cues to play yet.
  }

  setEnabled(): void {
    // Nothing to toggle yet.
  }

  dispose(): void {
    // Nothing to release yet.
  }
}
