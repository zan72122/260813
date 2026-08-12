/**
 * The one CameraDirector (CAMERA_CONTRACT). Every cue is a pure function of
 * a live `CameraContext` (see `cameraPoses.ts`); this class re-evaluates
 * the active cue's ideal pose every frame and smoothly chases it —
 * simultaneously implementing "tween between cues" AND "carrierSide/
 * firstSlope/transitionClose/descent track the live carrier position"
 * with one mechanism; a cue switch just changes which function is
 * sampled, and the existing camera position/quaternion keep chasing the
 * (now different) ideal smoothly rather than needing a special-cased
 * transition.
 *
 * `cableFollow` and `arrivalReveal` are multi-stage: a progress timer
 * (driven by the same per-frame dt) walks across authored keyframes.
 * `prefers-reduced-motion` shrinks the chase time-constant to ~
 * `CAMERA_REDUCED_MOTION_FADE_MS` (a fast snap standing in for a literal
 * frame cross-fade, which would need a compositing pass this renderer
 * does not have) and collapses the multi-stage cues to discrete steps.
 */

import * as THREE from 'three';

import {
  CAMERA_FAR,
  CAMERA_FOV_LANDSCAPE_DEG,
  CAMERA_FOV_PORTRAIT_DEG,
  CAMERA_NEAR,
  CAMERA_REDUCED_MOTION_FADE_MS,
  type CameraCueId,
} from '../contracts/camera.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import { computeViewport, type Orientation } from '../core/resize.ts';
import {
  arrivalRevealKeyframes,
  cableFollowKeyframes,
  carrierSidePose,
  establishPose,
  firstSlopePose,
  interiorProofPose,
  menuPose,
  transitionClosePose,
  undergroundPose,
  type CameraContext,
  type Pose,
} from './cameraPoses.ts';

/** Normal-motion chase time constants (seconds) -- how "eager" the camera is to reach the ideal pose. */
const TAU_POSITION_NORMAL = 0.9;
const TAU_ROTATION_NORMAL = 0.55;
/** Multi-stage cue total durations (seconds), normal motion. */
const CABLE_FOLLOW_DURATION_S = 6.5;
const ARRIVAL_REVEAL_DURATION_S = 8;

const SETTLE_POSITION_EPSILON = 0.05;
const SETTLE_ANGLE_EPSILON_RAD = 0.01;

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return { position: a.position.clone().lerp(b.position, t), target: a.target.clone().lerp(b.target, t) };
}

function poseToLookQuaternion(pose: Pose): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(pose.position, pose.target, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;

  private activeCue: CameraCueId = 'establish';
  private orientation: Orientation = 'portrait';
  private reducedMotion = false;
  private stageProgress = 0;
  private lastCueForProgressReset: CameraCueId | null = null;
  private lastIdeal: Pose | null = null;
  private lastIdealQuat: THREE.Quaternion | null = null;

  constructor(width: number, height: number) {
    const viewport = computeViewport(width, height);
    this.orientation = viewport.orientation;
    this.camera = new THREE.PerspectiveCamera(viewport.fovDeg, viewport.aspect, CAMERA_NEAR, CAMERA_FAR);
    this.camera.up.set(0, 1, 0);
  }

  get cue(): CameraCueId {
    return this.activeCue;
  }

  requestCue(id: CameraCueId): void {
    if (id === this.activeCue) return; // idempotent: re-requesting the active cue is a no-op
    this.activeCue = id;
  }

  resize(width: number, height: number): void {
    const viewport = computeViewport(width, height);
    this.orientation = viewport.orientation;
    this.camera.aspect = viewport.aspect;
    this.camera.fov = viewport.fovDeg;
    this.camera.updateProjectionMatrix();
  }

  /** Update from the live snapshot + scene anchors. `dt` is the renderer's own inferred frame dt (seconds). */
  update(dt: number, snapshot: GameSnapshot, context: CameraContext): void {
    this.reducedMotion = snapshot.reducedMotion;
    const fovDeg = this.orientation === 'landscape' ? CAMERA_FOV_LANDSCAPE_DEG : CAMERA_FOV_PORTRAIT_DEG;
    if (Math.abs(this.camera.fov - fovDeg) > 1e-6) {
      this.camera.fov = fovDeg;
      this.camera.updateProjectionMatrix();
    }

    const ideal = this.idealPose(dt, context);

    const tauPos = this.reducedMotion ? CAMERA_REDUCED_MOTION_FADE_MS / 1000 : TAU_POSITION_NORMAL;
    const tauRot = this.reducedMotion ? CAMERA_REDUCED_MOTION_FADE_MS / 1000 : TAU_ROTATION_NORMAL;
    const posT = dt > 0 ? 1 - Math.exp(-dt / Math.max(tauPos, 1e-3)) : 0;
    const rotT = dt > 0 ? 1 - Math.exp(-dt / Math.max(tauRot, 1e-3)) : 0;

    this.camera.position.lerp(ideal.position, posT);
    const idealQuat = poseToLookQuaternion(ideal);
    this.camera.quaternion.slerp(idealQuat, rotT);

    this.lastIdeal = ideal;
    this.lastIdealQuat = idealQuat;
  }

  isSettled(): boolean {
    if (!this.lastIdeal || !this.lastIdealQuat) return true;
    const posOk = this.camera.position.distanceTo(this.lastIdeal.position) < SETTLE_POSITION_EPSILON;
    const rotOk = this.camera.quaternion.angleTo(this.lastIdealQuat) < SETTLE_ANGLE_EPSILON_RAD;
    return posOk && rotOk;
  }

  private idealPose(dt: number, context: CameraContext): Pose {
    switch (this.activeCue) {
      case 'establish':
        return establishPose(context, this.orientation);
      case 'underground':
        return undergroundPose(context, this.orientation);
      case 'cableFollow':
        return this.multiStagePose(dt, cableFollowKeyframes(context, this.orientation), CABLE_FOLLOW_DURATION_S);
      case 'carrierSide':
        return carrierSidePose(context, this.orientation, false);
      case 'firstSlope':
        return firstSlopePose(context, this.orientation);
      case 'transitionClose':
        return transitionClosePose(context, this.orientation);
      case 'interiorProof':
        return interiorProofPose(context);
      case 'arrivalReveal':
        return this.multiStagePose(dt, arrivalRevealKeyframes(context, this.orientation), ARRIVAL_REVEAL_DURATION_S);
      case 'descent':
        return carrierSidePose(context, this.orientation, true);
      case 'menu':
        return menuPose();
    }
  }

  /** Walk `keyframes` over `durationS`; reduced motion snaps discretely instead of interpolating. */
  private multiStagePose(dt: number, keyframes: readonly Pose[], durationS: number): Pose {
    if (this.lastCueForProgressReset !== this.activeCue) {
      this.lastCueForProgressReset = this.activeCue;
      this.stageProgress = 0;
    }
    this.stageProgress = Math.min(1, this.stageProgress + dt / durationS);
    const segments = keyframes.length - 1;
    if (segments <= 0) {
      return keyframes[0]!;
    }
    const scaled = this.stageProgress * segments;
    const index = Math.min(segments - 1, Math.floor(scaled));
    const localT = this.reducedMotion ? (scaled - index >= 0.5 ? 1 : 0) : scaled - index;
    const from = keyframes[index]!;
    const to = keyframes[index + 1]!;
    return lerpPose(from, to, localT);
  }
}

export type { CameraContext };
