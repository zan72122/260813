// src/camera/player.ts
// CinematicBeatPlayer: plays CAMERA_BEATS (src/camera/beats.ts) driven by
// phase-changed / water-progress from the shared bus. Every beat transition
// is smoothed (never snaps), so cause->effect moments are never cut and the
// pipe-cutaway stays perceptually continuous. Orientation changes blend to
// the other variant's pose (same beat, same progress) over 0.3s.

import * as THREE from 'three';
import type { CameraPose, CinematicBeat, FountainId, GamePhase, SceneContext } from '../contracts';
import { getSceneAnchors } from '../scenes/anchors';
import { CAMERA_BEATS, PIPE_CAMERA_OFFSETS, REVEAL_BEAT_ID_BY_FOUNTAIN, REVEAL_CLOSE_SEC, findBeat } from './beats';

type Orientation = 'portrait' | 'landscape';

const ORIENTATION_BLEND_SEC = 0.3;
/** Exponential smoothing time-constant applied on top of the data-driven
 * target pose. Keeps every transition — including menu-driven ones like
 * replay-choice -> valve-turn for free-valve mode — perceptibly continuous
 * rather than a hard cut, without needing hand-authored inter-beat keyframes
 * for every possible pair. */
const POSE_SMOOTH_TAU = 0.15;

const UP = new THREE.Vector3(0, 1, 0);

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function ease(t: number, easing: CinematicBeat['easing']): number {
  const c = clamp01(t);
  if (easing === 'linear') return c;
  if (easing === 'ease-out') return 1 - (1 - c) * (1 - c);
  return c * c * (3 - 2 * c); // ease-in-out
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    position: lerp3(a.position, b.position, t),
    lookAt: lerp3(a.lookAt, b.lookAt, t),
    fov: (a.fov ?? 45) + ((b.fov ?? 45) - (a.fov ?? 45)) * t,
  };
}

function interpolatePoses(poses: readonly CameraPose[], t: number): CameraPose {
  const first = poses[0];
  if (!first) throw new Error('camera/player.ts: beat has no keyframes');
  if (poses.length === 1) return first;
  const segF = clamp01(t) * (poses.length - 1);
  const idx = Math.min(poses.length - 2, Math.floor(segF));
  const localT = segF - idx;
  const a = poses[idx]!;
  const b = poses[idx + 1]!;
  return lerpPose(a, b, localT);
}

function applyPose(camera: THREE.PerspectiveCamera, pose: CameraPose): void {
  camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
  if (pose.fov !== undefined && Math.abs(pose.fov - camera.fov) > 1e-4) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

export class CinematicBeatPlayer {
  private readonly ctx: SceneContext;
  private phase: GamePhase = 'title';
  private fountain: FountainId | null = null;
  private phaseElapsed = 0;
  private waterT = 0;

  private orientation: Orientation;
  private blendFromOrientation: Orientation;
  private blendRemaining = 0;

  private currentPose: CameraPose;

  private readonly unsubscribe: () => void;

  constructor(ctx: SceneContext) {
    this.ctx = ctx;
    this.orientation = ctx.viewport.orientation;
    this.blendFromOrientation = this.orientation;

    const dir = new THREE.Vector3();
    ctx.camera.updateMatrixWorld(true); // ensure quaternion from any prior lookAt() is reflected
    ctx.camera.getWorldDirection(dir);
    const p = ctx.camera.position;
    this.currentPose = {
      position: [p.x, p.y, p.z],
      lookAt: [p.x + dir.x, p.y + dir.y, p.z + dir.z],
      fov: ctx.camera.fov,
    };

    this.unsubscribe = ctx.bus.onEvent((event) => {
      if (event.kind === 'phase-changed') {
        this.phase = event.phase;
        this.fountain = event.fountain;
        this.phaseElapsed = 0;
        if (event.phase === 'pipe-run') this.waterT = 0;
      } else if (event.kind === 'water-progress') {
        this.waterT = event.t;
      }
    });
  }

  dispose(): void {
    this.unsubscribe();
  }

  update(dt: number): void {
    this.phaseElapsed += dt;

    const nextOrientation = this.ctx.viewport.orientation;
    if (nextOrientation !== this.orientation) {
      this.blendFromOrientation = this.orientation;
      this.orientation = nextOrientation;
      this.blendRemaining = ORIENTATION_BLEND_SEC;
    }

    const target = this.computeTargetPose(this.orientation);
    let finalTarget = target;
    if (this.blendRemaining > 0) {
      const fromPose = this.computeTargetPose(this.blendFromOrientation);
      const blendT = ease(1 - this.blendRemaining / ORIENTATION_BLEND_SEC, 'ease-in-out');
      finalTarget = lerpPose(fromPose, target, blendT);
      this.blendRemaining = Math.max(0, this.blendRemaining - dt);
    }

    const alpha = dt > 0 ? 1 - Math.exp(-dt / POSE_SMOOTH_TAU) : 1;
    this.currentPose = lerpPose(this.currentPose, finalTarget, alpha);
    applyPose(this.ctx.camera, this.currentPose);
  }

  private computeTargetPose(orientation: Orientation): CameraPose {
    if (this.phase === 'pipe-run') return this.computePipeRunPose(orientation);
    if (this.phase === 'fountain-reveal') return this.computeRevealPose(orientation);

    const beat = CAMERA_BEATS.find((b) => b.phase === this.phase);
    if (!beat) return this.currentPose;
    const poses = orientation === 'portrait' ? beat.portrait : beat.landscape;
    const progress = beat.durationSec === 'hold' ? 1 : this.phaseElapsed / beat.durationSec;
    return interpolatePoses(poses, ease(progress, beat.easing));
  }

  private computePipeRunPose(orientation: Orientation): CameraPose {
    const beat = findBeat('beat-pipe-cutaway');
    const fallbackPoses = orientation === 'portrait' ? beat.portrait : beat.landscape;
    const curve = this.fountain ? getSceneAnchors().pipeCurves[this.fountain] : undefined;
    if (!curve) return fallbackPoses[0] ?? this.currentPose;

    const offsets = PIPE_CAMERA_OFFSETS[orientation];
    const t = clamp01(this.waterT);
    const point = curve.getPointAt(t);
    const ahead = curve.getPointAt(clamp01(t + offsets.lookAhead));

    // Offset perpendicular to the pipe's actual running direction (not a
    // fixed world axis) — each fountain's pipe runs at a different angle
    // from the valve, so a fixed +X/+Y offset could still leave the camera
    // nearly coincident with a diagonal pipe/trench (Gate B fix #4).
    const tangent = curve.getTangentAt(t);
    const sideDir = new THREE.Vector3().crossVectors(UP, tangent);
    if (sideDir.lengthSq() < 1e-6) sideDir.set(1, 0, 0);
    sideDir.normalize();

    const camPos = point
      .clone()
      .addScaledVector(UP, offsets.above)
      .addScaledVector(sideDir, offsets.side);

    // Aim noticeably below the camera's own (already-shallow) height, biased
    // toward the trench floor/pipe rather than "ahead at roughly camera
    // height" — a near-level gaze down a long trench put its close, raking
    // near wall in the way of almost the whole frame. Tilting the look
    // target down keeps the wall to a border/frame instead.
    const lookTarget: [number, number, number] = [ahead.x, ahead.y - offsets.above * 1.1, ahead.z];

    return {
      position: [camPos.x, camPos.y, camPos.z],
      lookAt: lookTarget,
      fov: fallbackPoses[0]?.fov ?? 50,
    };
  }

  private computeRevealPose(orientation: Orientation): CameraPose {
    const fountain = this.fountain ?? 'fountain-fan';
    if (this.phaseElapsed < REVEAL_CLOSE_SEC) {
      const beat = findBeat(REVEAL_BEAT_ID_BY_FOUNTAIN[fountain]);
      const poses = orientation === 'portrait' ? beat.portrait : beat.landscape;
      return interpolatePoses(poses, ease(this.phaseElapsed / REVEAL_CLOSE_SEC, beat.easing));
    }
    const beat = findBeat('beat-wide-reveal');
    const poses = orientation === 'portrait' ? beat.portrait : beat.landscape;
    const localElapsed = this.phaseElapsed - REVEAL_CLOSE_SEC;
    const duration = beat.durationSec === 'hold' ? 1 : beat.durationSec;
    return interpolatePoses(poses, ease(localElapsed / duration, beat.easing));
  }
}
