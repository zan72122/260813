/**
 * Runs the CinematicBeat chain (B1-B7, docs/CAMERA_STORYBOARD.md). No free
 * camera: every pose reachable outside a beat transition is either a fixed
 * story pose or an aspect-derived framing (audience establish/reveal poses,
 * B4's cutaway). `applyPose` seeds/holds a camera immediately (used once by
 * App's Wave-1 boot wiring); `update` additionally takes the live
 * GameStateSnapshot so it can select/advance beats -- App's own per-frame
 * call omits the snapshot and is a no-op here, so the real driving happens
 * via TheaterScene, which has the snapshot every frame and holds the same
 * camera reference through SceneContext.
 */
import type { PerspectiveCamera } from 'three';
import type { CameraPose, EventBus, GamePhase, GameStateSnapshot, ViewportProfile, Vec3 } from '../core';
import { B4_PHASE_DURATIONS, BEAT_SEQUENCES, REORIENT_MS, computeB4Pose, titlePose, type BeatSpec } from './beats';

/** Phases where "pull中はカメラほぼ固定" applies: no idle sway, no re-triggered beats mid-drag. */
const LOCKED_PHASES = new Set<GamePhase>(['unlock', 'pull1', 'pull2', 'freePlay']);

/** A BeatSpec with its viewport-dependent `pose` already resolved to a concrete CameraPose. */
interface ResolvedBeat {
  readonly id: string;
  readonly durationMs: number;
  readonly to: CameraPose;
  readonly easing: BeatSpec['easing'];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return { position: lerpVec3(a.position, b.position, t), target: lerpVec3(a.target, b.target, t), fov: lerp(a.fov, b.fov, t) };
}

function ease(kind: BeatSpec['easing'], t: number): number {
  if (kind === 'linear') return t;
  if (kind === 'easeOut') return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t); // easeInOut (smoothstep)
}

function viewportKey(v: ViewportProfile): string {
  return `${v.width}x${v.height}:${v.orientation}`;
}

function resolve(spec: BeatSpec, viewport: ViewportProfile): ResolvedBeat {
  return { id: spec.id, durationMs: spec.durationMs, to: spec.pose(viewport), easing: spec.easing };
}

export class CameraDirector {
  private camera: PerspectiveCamera | null = null;
  private settledPose: CameraPose | null = null;
  private queue: BeatSpec[] = [];
  private activeBeat: ResolvedBeat | null = null;
  private activeFrom: CameraPose | null = null;
  private elapsedMs = 0;
  private idleClock = 0;
  private lastPhase: GamePhase | null = null;
  private lastViewportKey: string | null = null;
  private lastWritten: CameraPose | null = null;

  constructor(private readonly bus?: EventBus) {}

  /** Seeds/holds the camera at an explicit pose. Called once by App at boot; also used internally. */
  applyPose(camera: PerspectiveCamera, pose: CameraPose): void {
    this.camera = camera;
    this.settledPose = pose;
    this.activeBeat = null;
    this.queue = [];
    this.writePose(pose);
  }

  /**
   * Advances the active beat (if any) or holds/sways at the settled pose.
   * `state` is optional so App's Wave-1 `update(dt)` call (no snapshot) stays
   * a harmless no-op; TheaterScene drives real behavior by passing state.
   */
  update(dt: number, state?: Readonly<GameStateSnapshot>): void {
    if (!this.camera || !state) return;
    this.syncPhase(state);
    this.syncViewport(state);
    this.advance(dt, state);
  }

  private syncPhase(state: Readonly<GameStateSnapshot>): void {
    if (state.phase === this.lastPhase) return;
    this.lastPhase = state.phase;
    this.lastViewportKey = viewportKey(state.viewport);
    const sequence = BEAT_SEQUENCES[state.phase];
    if (sequence) {
      this.queue = [...sequence];
      this.startNextBeat(state.viewport);
      return;
    }
    const b4Duration = B4_PHASE_DURATIONS[state.phase];
    if (b4Duration !== undefined) {
      this.queue = [{ id: `B4-${state.phase}`, durationMs: b4Duration, pose: computeB4Pose, easing: 'easeInOut' }];
      this.startNextBeat(state.viewport);
      return;
    }
    // boot or any phase without a defined beat: hold the current settled pose.
    this.queue = [];
    this.activeBeat = null;
  }

  private syncViewport(state: Readonly<GameStateSnapshot>): void {
    const key = viewportKey(state.viewport);
    if (key === this.lastViewportKey) return;
    this.lastViewportKey = key;
    const target = this.restPoseFor(state);
    if (!target) return;
    // Orientation/resize re-pose: fixed 0.3s, preserving phase/progress (docs/CAMERA_STORYBOARD.md).
    this.queue = [];
    this.activeFrom = this.currentWrittenPose();
    this.activeBeat = { id: 'reorient', durationMs: REORIENT_MS, to: target, easing: 'easeOut' };
    this.elapsedMs = 0;
  }

  private restPoseFor(state: Readonly<GameStateSnapshot>): CameraPose | null {
    const sequence = BEAT_SEQUENCES[state.phase];
    if (sequence && sequence.length > 0) return sequence[sequence.length - 1]!.pose(state.viewport);
    const b4Duration = B4_PHASE_DURATIONS[state.phase];
    if (b4Duration !== undefined) return computeB4Pose(state.viewport);
    return null;
  }

  private startNextBeat(viewport: ViewportProfile): void {
    const next = this.queue.shift();
    if (!next) {
      this.activeBeat = null;
      return;
    }
    this.activeBeat = resolve(next, viewport);
    this.activeFrom = this.settledPose ?? this.activeBeat.to;
    this.elapsedMs = 0;
    this.bus?.emit({ type: 'beatStarted', beatId: next.id });
  }

  private advance(dt: number, state: Readonly<GameStateSnapshot>): void {
    if (!this.activeBeat || !this.activeFrom) {
      this.applyIdleSway(dt, state);
      return;
    }
    const scale = state.reducedMotion ? 0.5 : 1;
    const durationMs = Math.max(1, this.activeBeat.durationMs * scale);
    this.elapsedMs += dt * 1000;
    const t = Math.min(1, this.elapsedMs / durationMs);
    const eased = ease(this.activeBeat.easing, t);
    const pose = lerpPose(this.activeFrom, this.activeBeat.to, eased);
    this.writePose(pose);
    if (t >= 1) {
      this.settledPose = this.activeBeat.to;
      const finishedId = this.activeBeat.id;
      this.bus?.emit({ type: 'beatFinished', beatId: finishedId });
      this.startNextBeat(state.viewport);
    }
  }

  private applyIdleSway(dt: number, state: Readonly<GameStateSnapshot>): void {
    const settled = this.settledPose;
    if (!settled) return;
    if (state.reducedMotion || LOCKED_PHASES.has(state.phase)) {
      this.writePose(settled);
      return;
    }
    this.idleClock += dt;
    const sway = Math.sin(this.idleClock * 0.35) * 0.045;
    this.writePose({
      position: { x: settled.position.x + sway, y: settled.position.y, z: settled.position.z },
      target: settled.target,
      fov: settled.fov
    });
  }

  private currentWrittenPose(): CameraPose {
    return this.lastWritten ?? this.settledPose ?? titlePose({ width: 390, height: 844, dpr: 1, orientation: 'portrait', safeArea: { top: 0, bottom: 0, left: 0, right: 0 } });
  }

  private writePose(pose: CameraPose): void {
    this.lastWritten = pose;
    const camera = this.camera;
    if (!camera) return;
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}
