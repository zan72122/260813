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
    // R3: orbiting purely around (hook, beam) / (beam, towerTop) put BOTH
    // focus points within ~1-2 world units of the operating leg's own
    // curve for most of the hookDown/hoist arc (the crane's boom delivers
    // the load to a radius that sits almost exactly between the leg's own
    // radius at ground level and at platform height) — verified with a
    // real-gesture screenshot sequence: the leg filled the ENTIRE frame
    // for most of the drag, regardless of azimuth/elevation tried. Anchor
    // one end of the orbit at `towerAxis` (always radius 0, i.e. as far
    // from every leg as this framing gets) instead, so the orbit center
    // is pulled well clear of the leg while the other end still tracks
    // the moving load.
    case 'approach':
      return { op: points.towerAxis, target: points.hook };
    case 'hoist':
      return { op: points.towerAxis, target: points.beam };
    case 'align':
      return { op: points.beam, target: points.ghost };
    case 'rivetMacro':
      return { op: points.rivetHole, target: points.forge };
    // R4: climb must read as "the machine climbing" — the wheeled runner
    // on its twin rails, at mid-frame. op/target used to split between the
    // wheels (low) and the sheave (high, out at the end of the boom), so
    // the shot's own focus point sat between them — the composed frame
    // read as "looking up at the boiler/cab from directly underneath",
    // cropping out the carriage/wheels/rails entirely. Anchoring both ends
    // on craneBase (the carriage itself) makes the shot a stable
    // side-elevation of the carriage/wheels/rails throughout the climb.
    case 'climb':
      return { op: points.craneBase, target: points.craneBase };
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

const hoistWideScratch: Transform = { pos: new Vector3(), lookAt: new Vector3(), fov: 52 };
const hoistNarrowScratch: Transform = { pos: new Vector3(), lookAt: new Vector3(), fov: 52 };

/** Over what fraction of the *end* of the hoist drag (state.hoist.height)
 * the camera eases from the wide hoist shot toward align's own framing. */
const HOIST_NARROW_START = 0.7;

/**
 * R3 (align-entry race fix): 'hoist' is deliberately a wide, static shot
 * (op=towerAxis, blend=0 — see cameraCompose.ts's comment) so hook+beam+
 * ghost all stay clear of every leg across the FULL hoist drag. But
 * src/game/phases/align.ts captures its drag target from whatever
 * beam/ghost anchors it first sees after entering align (documented there
 * as assuming they're "reliably live" by the first touch) — jumping
 * straight from hoist's wide framing to align's tight beam/ghost close-up
 * the instant the phase flips races that capture against the camera's own
 * multi-frame ease. Under a large jump plus a slow real frame rate
 * (reproduced via the real full-loop E2E under swiftshader/CI-like
 * contention: the exponential ease's sim-time "finish" doesn't mean the
 * camera has visibly caught up for several REAL seconds), a target
 * captured early is stale by the time the camera settles and align never
 * converges ("align: never snapped", tablet-landscape).
 *
 * Fix: rather than shrinking hoist's wide framing (which reintroduces the
 * original crop/occlusion bug for the early/mid arc, while hook is still
 * down near the yard), ease the DESIRED transform itself from hoist's wide
 * shot toward align's own composed transform over just the final stretch
 * of the drag (hoist.height 0.7->1, by which point hook+beam are already
 * up near the platform/slot, so narrowing the frame doesn't crop anything
 * new). By the moment height actually reaches 1 and the phase flips to
 * align, `desired` already equals align's exact framing, so there is no
 * jump left to race — `current` has had the whole final stretch of the
 * drag (many real frames, not one) to smoothly catch up to it.
 */
function hoistDesiredTransform(
  state: GameState,
  points: ScenePoints,
  width: number,
  height: number,
  out: Transform,
): Transform {
  const wideShot = shotFor('hoist', width, height);
  composeTransform(wideShot, points.towerAxis, points.beam, hoistWideScratch);

  const t = (state.hoist.height - HOIST_NARROW_START) / (1 - HOIST_NARROW_START);
  if (t <= 0) {
    out.pos.copy(hoistWideScratch.pos);
    out.lookAt.copy(hoistWideScratch.lookAt);
    out.fov = hoistWideScratch.fov;
    return out;
  }

  const narrowShot = shotFor('align', width, height);
  composeTransform(narrowShot, points.beam, points.ghost, hoistNarrowScratch);
  const clamped = Math.min(t, 1);
  const eased = clamped * clamped * (3 - 2 * clamped);
  out.pos.copy(hoistWideScratch.pos).lerp(hoistNarrowScratch.pos, eased);
  out.lookAt.copy(hoistWideScratch.lookAt).lerp(hoistNarrowScratch.lookAt, eased);
  out.fov = hoistWideScratch.fov + (hoistNarrowScratch.fov - hoistWideScratch.fov) * eased;
  return out;
}

export function createCameraDirector(bus: EventBus): CameraDirector {
  const camera = new PerspectiveCamera(52, 1, 0.1, 500);

  let overrideCue: CameraCueName | null = null;
  let lastPhase: GamePhase | null = null;
  let lastCue: CameraCueName | null = null;

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
    if (cue === 'hoist') {
      hoistDesiredTransform(state, points, width, height, desired);
    } else {
      const shot = shotFor(cue, width, height);
      const { op, target } = focusFor(cue, points);
      composeTransform(shot, op, target, desired);
    }

    // R3 (align-precision hardening): 'align' is a fine-motor precision
    // drag — src/game/phases/align.ts captures its drag target from the
    // FIRST live beam/ghost anchor pair it sees after entering align
    // (documented there as assuming anchors are "reliably live" by first
    // touch). The *dominant* fix for the real "align: never snapped"
    // failure this round (root-caused via window.__game.anchors(): under
    // the old, tighter align framing the beam anchor could itself land
    // OFF-canvas once the wider R3 hoist shot let it drift farther from the
    // ghost slot before align begins) is cameraCompose.ts's widened align
    // distance/fov, not this hard-cut. This hard-cut is kept as a smaller,
    // still-worthwhile hardening on top of that: it guarantees the camera
    // is never still easing in from a *previous*, very different cue's
    // framing (e.g. hoist's wide static shot) at the exact moment align's
    // first-touch capture can fire, and a child also benefits from a camera
    // that has already stopped moving the instant they're asked to drag
    // something precisely, rather than one still panning under their thumb.
    const cutToTarget = initialized && cue === 'align' && cue !== lastCue;
    lastCue = cue;

    if (!initialized || cutToTarget) {
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
    // Force matrixWorld/matrixWorldInverse to reflect the position/lookAt set
    // above RIGHT NOW: THREE.Object3D normally defers that recompute until
    // the next renderer.render() traversal, which core/index.ts's frame()
    // calls AFTER publishAnchors() reads this camera. Without this, anchor
    // projection would use last frame's camera transform for one frame every
    // time the camera cuts (phase change / cam:cue override) — the published
    // anchor positions would visibly lag a cut by a frame (R10).
    camera.updateMatrixWorld(true);

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
