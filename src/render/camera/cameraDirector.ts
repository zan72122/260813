/**
 * CameraDirector: subscribes to `cameraCue` events (contracts/events.ts)
 * and smoothly eases the live camera pose from wherever it currently is
 * toward `cueToPose(cue, seed)`'s target (cameraPoses.ts) — "smooth eased
 * transitions" per the deliverable brief. `state.reducedMotion` collapses
 * every transition to a near-instant cut (PRODUCT_SPEC "prefers-reduced-motion
 * 対応(カメラ移動を短縮)").
 *
 * Split the same way as the rest of this module: pure functions (duration
 * lookup, easing curve, pose interpolation) factored out and independently
 * testable, wrapped by a small stateful class that render/index.ts drives
 * once per frame with `update(dtSeconds)`.
 */
import type { CameraCue } from '../../contracts/camera';
import { cueToPose, DEFAULT_ASPECT, type CameraPose } from './cameraPoses';

/** Per-cue-kind transition duration (ms) at normal motion. */
export const CAMERA_CUE_DURATION_MS: Record<CameraCue['kind'], number> = {
  establish: 1000,
  activeLeg: 900,
  sandboxCutaway: 700,
  jackCloseup: 700,
  alignment: 650,
  wedge: 650,
  orbitToNext: 1400,
  topReveal: 1600,
  pullback: 1400,
};

/** Reduced-motion duration (ms) — every cut becomes a near-instant snap. */
export const REDUCED_MOTION_DURATION_MS = 80;

/** Duration (seconds) a transition into `cue` should take, honoring reducedMotion. */
export function durationForCue(cueKind: CameraCue['kind'], reducedMotion: boolean): number {
  const ms = reducedMotion ? REDUCED_MOTION_DURATION_MS : CAMERA_CUE_DURATION_MS[cueKind];
  return ms / 1000;
}

/** Smoothstep-style ease-in-out; flat tangents at both ends for a gentle start/stop. */
export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Componentwise lerp of two CameraPoses (position, target, fov). Not a great-circle arc — a straight blend, which reads as "smooth" for the short travel distances every cut here uses. */
export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    position: [lerp(a.position[0], b.position[0], t), lerp(a.position[1], b.position[1], t), lerp(a.position[2], b.position[2], t)],
    target: [lerp(a.target[0], b.target[0], t), lerp(a.target[1], b.target[1], t), lerp(a.target[2], b.target[2], t)],
    fov: lerp(a.fov, b.fov, t),
  };
}

export interface CameraDirector {
  /** Begins easing toward `cue`'s pose from the current live pose. */
  setCue(cue: CameraCue): void;
  setReducedMotion(reducedMotion: boolean): void;
  /**
   * Updates the live viewport aspect (width/height) that aspect-aware poses
   * (cameraPoses.ts's ground-prop close-ups) are framed against. Cheap —
   * safe to call every frame (render/index.ts does). Does NOT retroactively
   * reframe an in-flight transition's `toPose`; it takes effect on the
   * NEXT `setCue`, same as `setReducedMotion` — an orientation change
   * mid-cut re-settling one cut later reads as a minor, not a snap/pop.
   */
  setAspect(aspect: number): void;
  /** Advances the in-flight transition by `dtSeconds`. */
  update(dtSeconds: number): void;
  /** Current interpolated pose — read this every frame to drive the actual THREE.PerspectiveCamera. */
  readonly pose: CameraPose;
  /** True once the in-flight transition has fully reached its target (camera is at rest). */
  settled(): boolean;
}

class CameraDirectorImpl implements CameraDirector {
  private fromPose: CameraPose;
  private toPose: CameraPose;
  private elapsedS = 0;
  private durationS = 0;
  private reducedMotion: boolean;
  private aspect: number;
  pose: CameraPose;

  constructor(
    private readonly seed: number,
    reducedMotion: boolean,
    aspect: number = DEFAULT_ASPECT,
  ) {
    this.reducedMotion = reducedMotion;
    this.aspect = aspect;
    const initial = cueToPose({ kind: 'establish' }, seed, aspect);
    this.fromPose = initial;
    this.toPose = initial;
    this.pose = initial;
    this.elapsedS = 0;
    this.durationS = 0; // already settled at construction
  }

  setCue(cue: CameraCue): void {
    this.fromPose = this.pose;
    this.toPose = cueToPose(cue, this.seed, this.aspect);
    this.elapsedS = 0;
    this.durationS = durationForCue(cue.kind, this.reducedMotion);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
  }

  update(dtSeconds: number): void {
    if (this.durationS <= 0) {
      this.pose = this.toPose;
      return;
    }
    this.elapsedS = Math.min(this.durationS, this.elapsedS + Math.max(0, dtSeconds));
    const t = easeInOutCubic(this.elapsedS / this.durationS);
    this.pose = lerpPose(this.fromPose, this.toPose, t);
  }

  settled(): boolean {
    return this.elapsedS >= this.durationS;
  }
}

/** Creates a CameraDirector. `seed` is the run seed (for legScenario cameraYaw); `reducedMotion` mirrors GameState.reducedMotion at construction and can change later via setReducedMotion. `aspect` (viewport width/height) seeds the initial `establish` pose and can change later via setAspect — defaults to a generic landscape-ish ratio when omitted (tests). */
export function createCameraDirector(seed: number, reducedMotion: boolean, aspect?: number): CameraDirector {
  return new CameraDirectorImpl(seed, reducedMotion, aspect);
}
