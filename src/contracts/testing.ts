/**
 * The frozen `window.__eiffel` test/inspection API shape.
 * Source of truth: docs/ARCHITECTURE_CONTRACT.md "Test/inspection API" and
 * docs/CAMERA_CONTRACT.md "Testability". E2e waits on these conditions
 * (readouts/flags), never on timeouts.
 */

import type { CameraCueId } from './camera.ts';
import type { QualityTier } from './constants.ts';
import type { GameStateId } from './states.ts';

/** Cabin's local +Y axis transformed to world space, as a plain tuple. */
export type Vec3Tuple = readonly [x: number, y: number, z: number];

/** Everything an e2e test or QA harness needs to read every frame. */
export interface EiffelReadouts {
  /** Normalized track progress, `arcLength / TRACK_LENGTH`, `[0, 1]`. */
  readonly t: number;
  /** Track tangent inclination at the current arc length, degrees. */
  readonly trackTangentDeg: number;
  /** Carrier world rotation about +Z, degrees. */
  readonly carrierAngleDeg: number;
  /** Cabin world tilt, degrees (signed). */
  readonly cabinWorldTiltDeg: number;
  /** Cabin floor's local +Y transformed to world space. */
  readonly cabinFloorNormal: Vec3Tuple;
  /** Piston displacement `p`, meters. */
  readonly pistonDisplacement: number;
  /** Cable travel `c`, meters. */
  readonly cableTravel: number;
  /** Big pulley rotation angle, radians. */
  readonly pulleyAngle: number;
  /** Valve openness, `[0, 1]`. */
  readonly valveOpen: number;
  /** Carrier arc-length speed, meters/second. */
  readonly speed: number;
  /** Active state-machine state. */
  readonly state: GameStateId;
  /** Draw calls in the most recently rendered frame. */
  readonly drawCalls: number;
  /** Active render/quality tier. */
  readonly quality: QualityTier;
  /** Active camera cue. */
  readonly cameraCue: CameraCueId;
  /** Whether the camera's tween to `cameraCue` has finished. */
  readonly cameraSettled: boolean;
  /** Whether sound output is enabled. */
  readonly soundOn: boolean;
  /** Whether the simulation clock is currently paused. */
  readonly paused: boolean;
}

/**
 * `window.__eiffel`. Deterministic mode (`?det=1&seed=N`) disables
 * RAF-driven stepping — only `step(n)` advances the sim clock.
 */
export interface EiffelTestAPI {
  /** Semantic version of this API shape, for QA tooling compatibility checks. */
  readonly version: string;
  /** Active deterministic-mode PRNG seed (mulberry32). */
  readonly seed: number;
  /** Active state-machine state (live). */
  readonly state: GameStateId;
  /** Flips to `true` once the first frame has been rendered. */
  readonly sceneReady: boolean;
  /** Resolves once the first frame has been rendered. */
  readonly sceneReadyPromise: Promise<void>;
  /** Console errors captured via `console.error`/`window.onerror` since boot. */
  readonly errors: readonly string[];
  /** Resolves once all in-flight animations/tweens (camera, leveling assist) are idle. */
  settled(): Promise<void>;
  /** Snapshot every readout in one call. */
  readouts(): EiffelReadouts;
  /** Force-enter a state directly, bypassing normal trigger conditions. */
  gotoState(id: GameStateId): void;
  /** Scrub the track directly to normalized progress `t ∈ [0, 1]` (deterministic mode). */
  setT(t: number): void;
  /** Advance the fixed-step simulation by exactly `n` steps (deterministic mode). */
  step(n: number): void;
}

/** `data-testid` values every interactive DOM control carries. */
export const DATA_TESTID = {
  masterLever: 'master-lever',
  throttleUp: 'throttle-up',
  throttleDown: 'throttle-down',
  levelWheel: 'level-wheel',
  soundToggle: 'sound-toggle',
  pauseButton: 'pause-button',
  replayAgain: 'replay-again',
  replayDescend: 'replay-descend',
  replayMachine: 'replay-machine',
  replayTransition: 'replay-transition',
  stageRoot: 'stage-root',
} as const;

export type DataTestId = (typeof DATA_TESTID)[keyof typeof DATA_TESTID];
