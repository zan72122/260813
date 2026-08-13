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

  /**
   * Gate B round 3: beat-pipe-cutaway is now a "diagram-style cross-section"
   * (docs/CAMERA_STORYBOARD.md) — a LOCKED side-on view, perpendicular to
   * the display segment's run direction, with only gentle lateral tracking
   * of the slug (no diving/rotating as the curve's own local tangent
   * changes through its drop/cruise/rise zones, which is what earlier
   * rounds' per-point tracking did and made the shot unreadable). The
   * reference frame (side direction + cruise height) is sampled ONCE from
   * the curve's flat mid-cruise point (t=0.5 — see
   * src/scenes/anchors.ts buildPipeCurves), not from the animated t, so it
   * cannot drift frame to frame. Only right at the very end (t -> 1, the
   * slug entering the fountain's riser) does the camera blend into
   * following the actual rising point, continuous into fountain-reveal, per
   * the storyboard's "終端で...カメラも一緒に地上へ抜ける".
   */
  private computePipeRunPose(orientation: Orientation): CameraPose {
    const beat = findBeat('beat-pipe-cutaway');
    const fallbackPoses = orientation === 'portrait' ? beat.portrait : beat.landscape;
    const curve = this.fountain ? getSceneAnchors().pipeCurves[this.fountain] : undefined;
    if (!curve) return fallbackPoses[0] ?? this.currentPose;

    const offsets = PIPE_CAMERA_OFFSETS[orientation];
    const t = clamp01(this.waterT);

    // Fixed reference frame from the flat cruise section — locked, not
    // recomputed from the moving point, so the camera never dives/rotates.
    const refPoint = curve.getPointAt(0.5);
    const refTangent = curve.getTangentAt(0.5).normalize();
    const sideDir = new THREE.Vector3().crossVectors(UP, refTangent);
    if (sideDir.lengthSq() < 1e-6) sideDir.set(1, 0, 0);
    sideDir.normalize();

    const slugPoint = curve.getPointAt(t);
    const alongOffset = slugPoint.clone().sub(refPoint).dot(refTangent);
    // Full 1:1 lateral tracking along the run axis: the slug must stay in
    // frame the WHOLE run (some display segments run 6-14 world units), so
    // "gentle" here means smooth (POSE_SMOOTH_TAU already handles that, plus
    // this pose is itself re-evaluated every frame from a continuous t), not
    // partial/lagging — a lagging follow left the slug outside the frame on
    // longer segments. "Locked" instead refers to height/side-angle/tilt,
    // which stay fixed (no diving/rotating) regardless of along-track position.
    const trackedCenter = refPoint.clone().addScaledVector(refTangent, alongOffset);

    // Blend from the locked cruise height into following the slug's actual
    // (rising) height only in the last stretch of the run.
    const riseBlend = ease((t - 0.82) / 0.18, 'ease-in-out');
    const camY = THREE.MathUtils.lerp(refPoint.y + offsets.above, slugPoint.y + offsets.above * 0.5, riseBlend);

    const camPos = trackedCenter.clone().addScaledVector(sideDir, offsets.side);
    camPos.y = camY;
    // Zero yaw offset along the run axis — the look target shares the
    // camera's along-track position exactly (only Y differs), so the view
    // stays a true perpendicular "side-on" cross-section (no looking ahead/
    // behind along the pipe, which would angle the shot and hide the slug
    // off-center on long segments).
    //
    // The vertical tilt is a fixed, gentle DOWNWARD ANGLE (not "aim directly
    // at the pipe") — aiming straight at the pipe (which sits `above` world
    // units below the camera, a fairly large drop needed for ground
    // clearance) tilts the whole frustum down so steeply its top edge no
    // longer reaches back up to y=0, which was silently discarding the
    // storyboard's "thin strip of ground at the top of frame" layer even
    // though the ground was technically only slightly above camera height.
    // A shallow fixed angle keeps ground, soil, and pipe all inside the
    // vertical FOV span at once; offsets.lookAhead is that angle's tangent
    // multiplier (drop = side * lookAhead).
    const lookTarget = trackedCenter.clone();
    lookTarget.y = camY - offsets.side * offsets.lookAhead;

    return {
      position: [camPos.x, camPos.y, camPos.z],
      lookAt: [lookTarget.x, lookTarget.y, lookTarget.z],
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
