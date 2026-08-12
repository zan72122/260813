// src/render/camera.ts
// Camera director: maps GamePhase -> CameraCueName (with 'cam:cue' bus
// events able to refine the choice mid-phase), then continuously composes
// a camera transform from live scene focus points (src/scene/index.ts's
// ScenePoints) using the per-aspect shot table in cameraCompose.ts. The
// transform is approached with exponential smoothing (not a hard cut),
// which reads as an eased ~1.2s transition and naturally keeps "following"
// moving subjects (hook swinging, crane climbing) without re-triggering a
// fresh transition every frame.

import { PerspectiveCamera, Vector3 } from 'three';
import type { EventBus } from '../contracts/bus';
import type { CameraCueName, GamePhase, GameState } from '../contracts/types';
import { shotFor, transitionDurationMs, type CameraShot } from './cameraCompose';
import type { ScenePoints } from '../scene/index';

const PHASE_CUE_MAP: Record<GamePhase, CameraCueName> = {
  loading: 'establish',
  title: 'establish',
  opening: 'establish',
  hookDown: 'approach',
  hoist: 'hoist',
  align: 'align',
  bolts: 'align',
  rivetHeat: 'rivetMacro',
  rivetCarry: 'rivetMacro',
  rivetInsert: 'rivetMacro',
  rivetHammer: 'rivetMacro',
  rivetCool: 'rivetMacro',
  sling: 'approach',
  climb: 'climb',
  reveal: 'reveal',
  complete: 'complete',
  playRivet: 'rivetMacro',
  playClimb: 'climb',
};

const SETTLE_EPS_POS = 0.05;
const SETTLE_EPS_FOV = 0.3;

function focusFor(cue: CameraCueName, points: ScenePoints): { op: Vector3; target: Vector3 } {
  switch (cue) {
    case 'establish':
      return { op: points.towerAxis, target: points.craneTop };
    case 'approach':
      return { op: points.hook, target: points.beam };
    case 'hoist':
      return { op: points.beam, target: points.towerTop };
    case 'align':
      return { op: points.beam, target: points.ghost };
    case 'rivetMacro':
      return { op: points.rivetHole, target: points.forge };
    case 'climb':
      return { op: points.craneBase, target: points.craneTop };
    case 'reveal':
      return { op: points.towerAxis, target: points.craneTop };
    case 'complete':
      return { op: points.towerAxis, target: points.beam };
    default:
      return { op: points.towerAxis, target: points.craneTop };
  }
}

interface Transform {
  pos: Vector3;
  lookAt: Vector3;
  fov: number;
}

const centerScratch = new Vector3();

/**
 * Orbit `center` (an op/target blend) with standard world-space spherical
 * coordinates — NOT relative to the op->target axis, which would degenerate
 * unpredictably whenever op and target nearly coincide (e.g. an early-game
 * establish shot where the tower is still short). azimuth=0 puts the camera
 * on the +Z side (away from the Paris backdrop at -Z), looking back toward
 * -Z so the tower reads against the backdrop beyond it.
 */
function composeTransform(shot: CameraShot, op: Vector3, target: Vector3, out: Transform): Transform {
  centerScratch.copy(op).lerp(target, shot.blend);

  const horiz = shot.distance * Math.cos(shot.elevation);
  out.pos.set(
    centerScratch.x + horiz * Math.sin(shot.azimuth),
    centerScratch.y + shot.distance * Math.sin(shot.elevation),
    centerScratch.z + horiz * Math.cos(shot.azimuth),
  );

  out.lookAt.copy(centerScratch);
  out.lookAt.y += shot.lookAtHeightOffset;

  out.fov = shot.fov;
  return out;
}

export interface CameraDirector {
  camera: PerspectiveCamera;
  update(state: GameState, points: ScenePoints, width: number, height: number, dtMs: number, testMode: boolean): void;
  isSettled(): boolean;
  dispose(): void;
}

export function createCameraDirector(bus: EventBus): CameraDirector {
  const camera = new PerspectiveCamera(52, 1, 0.1, 500);

  let overrideCue: CameraCueName | null = null;
  let lastPhase: GamePhase | null = null;

  const unsubscribe = bus.on('cam:cue', (payload) => {
    overrideCue = payload.cue;
  });

  const current: Transform = { pos: new Vector3(0, 8, 20), lookAt: new Vector3(0, 5, 0), fov: 52 };
  const desired: Transform = { pos: new Vector3(), lookAt: new Vector3(), fov: 52 };
  let initialized = false;
  let settled = true;

  function update(
    state: GameState,
    points: ScenePoints,
    width: number,
    height: number,
    dtMs: number,
    testMode: boolean,
  ): void {
    if (state.phase !== lastPhase) {
      overrideCue = null;
      lastPhase = state.phase;
    }
    const cue = overrideCue ?? PHASE_CUE_MAP[state.phase];
    const shot = shotFor(cue, width, height);
    const { op, target } = focusFor(cue, points);
    composeTransform(shot, op, target, desired);

    if (!initialized) {
      current.pos.copy(desired.pos);
      current.lookAt.copy(desired.lookAt);
      current.fov = desired.fov;
      initialized = true;
    }

    const durationMs = transitionDurationMs(testMode, state.prefs.reducedMotion);
    const tau = Math.max(durationMs / 3, 1);
    const smoothing = 1 - Math.exp(-dtMs / tau);

    current.pos.lerp(desired.pos, smoothing);
    current.lookAt.lerp(desired.lookAt, smoothing);
    current.fov += (desired.fov - current.fov) * smoothing;

    camera.aspect = width / Math.max(height, 1);
    camera.fov = current.fov;
    camera.position.copy(current.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(current.lookAt);
    camera.updateProjectionMatrix();

    settled =
      current.pos.distanceTo(desired.pos) < SETTLE_EPS_POS &&
      current.lookAt.distanceTo(desired.lookAt) < SETTLE_EPS_POS &&
      Math.abs(current.fov - desired.fov) < SETTLE_EPS_FOV;
  }

  function isSettled(): boolean {
    return settled;
  }

  function dispose(): void {
    unsubscribe();
  }

  return { camera, update, isSettled, dispose };
}
