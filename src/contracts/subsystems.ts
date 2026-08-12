/**
 * The interfaces each Wave-3 owner implements. `src/app` (the integrator)
 * is the ONLY place that constructs and wires these — see
 * ARCHITECTURE_CONTRACT "Dependency rule".
 */

import type { CameraCueId } from './camera.ts';
import type { SoundCueId } from './events.ts';
import type { GameStateId } from './states.ts';
import type { GameSnapshot } from './store.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Throttle direction: -1 down, 0 released, 1 up. PRODUCT_SPEC verb 2. */
export type ThrottleDirection = -1 | 0 | 1;

/**
 * A single-finger gesture translated into a game-domain intent. Exactly the
 * three world-integrated controls in PRODUCT_SPEC "Core verbs" — no
 * abstract UI events.
 */
export type InputIntent =
  /** Master lever slide, machine room. `value` is openness `[0, 1]`. */
  | { readonly kind: 'lever'; readonly value: number }
  /** Up/down throttle, riding states. */
  | { readonly kind: 'throttle'; readonly value: ThrottleDirection }
  /** Level wheel rotation, transition state. `deltaRadians` this frame. */
  | { readonly kind: 'wheel'; readonly deltaRadians: number };

// ---------------------------------------------------------------------------
// Gameplay / math (src/game/**, src/input/**)
// ---------------------------------------------------------------------------

/** Implemented by the gameplay/math owner; drives the GameStore. */
export interface GameLogic {
  /** Advance the simulation by exactly one fixed step (MATH_CONTRACT §6). */
  step(dt: number): void;
  /** Apply a translated single-finger gesture. */
  applyInput(intent: InputIntent): void;
  /** Force-enter a state directly (used by UI flows and the test API). */
  gotoState(state: GameStateId): void;
  /** Current snapshot, plain data. */
  serialize(): GameSnapshot;
  /** Reset all sim state to its initial values under a given seed. */
  reset(seed: number): void;
}

// ---------------------------------------------------------------------------
// Renderer / mechanics (src/core/**, src/render/**, src/scene/**, src/visual/**)
// ---------------------------------------------------------------------------

/** Implemented by the renderer/mechanics owner; owns the WebGLRenderer, scene and camera. */
export interface SceneWorld {
  /** Build the renderer/scene/camera and mount its canvas into `container`. */
  init(container: HTMLElement): void | Promise<void>;
  /** Update the scene's visual state from a sim snapshot, `alpha` = render interpolation factor `[0, 1]`. */
  updateFromSnapshot(snapshot: GameSnapshot, alpha: number): void;
  /** Request a named camera cue (delegates to the CameraDirector). */
  setCameraCue(cue: CameraCueId): void;
  /** Relayout for a new viewport size (orientation change, resize). */
  resize(width: number, height: number): void;
  /** Free all GPU resources (geometries, materials, textures, renderer). */
  dispose(): void;
  /** `webglcontextlost` handler: stop rendering, keep GameStore intact. */
  onContextLost(): void;
  /** `webglcontextrestored` handler: rebuild the scene. */
  onContextRestored(): void;
}

// ---------------------------------------------------------------------------
// UX (src/ui/**, src/audio/**, src/styles/**)
// ---------------------------------------------------------------------------

/** Implemented by the UX owner; DOM/scene-integrated controls and pictogram menus. */
export interface UiLayer {
  /** Mount all DOM controls into `root` (must live in the bottom safe-area band). */
  mount(root: HTMLElement): void;
  /** Reflect a sim snapshot in the DOM (button states, replay tiles, etc). */
  updateFromSnapshot(snapshot: GameSnapshot): void;
  /** Unmount and remove all DOM nodes/listeners this layer added. */
  dispose(): void;
}

/** Implemented by the UX owner; synthesized WebAudio sound engine. */
export interface AudioEngine {
  /** Unlock the AudioContext on first user gesture (per ARCHITECTURE_CONTRACT "Error policy"). */
  unlock(): void | Promise<void>;
  /** Play (or start/stop looping) the given cue. */
  handleCue(cue: SoundCueId): void;
  /** Toggle sound output without tearing down the engine. */
  setEnabled(enabled: boolean): void;
  /** Release all WebAudio nodes. */
  dispose(): void;
}
