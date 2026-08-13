/**
 * Pure pose authoring for every CAMERA_CONTRACT cue: given a live
 * `CameraContext` (carrier/cabin/machine-room anchors read off the current
 * scene state) and, for the two multi-stage cues, a progress fraction,
 * returns a `{ position, target }` the director chases every frame. Kept
 * separate from the tween/smoothing state machine (`cameraDirector.ts`) so
 * the composition math is easy to read and re-tune during visual
 * iteration.
 */

import * as THREE from 'three';

import { CAMERA_MAX_DOWNWARD_PITCH_DEG } from '../contracts/camera.ts';
import type { Orientation } from '../core/resize.ts';

const DEG2RAD = Math.PI / 180;

export interface CameraContext {
  readonly carrierPosition: THREE.Vector3;
  readonly carrierAngleRad: number;
  readonly cabinWorldPosition: THREE.Vector3;
  readonly pulleyCenter: THREE.Vector3;
  readonly leverBase: THREE.Vector3;
  readonly machineRoomCenter: THREE.Vector3;
  readonly firstFloorPosition: THREE.Vector3;
  readonly secondFloorPosition: THREE.Vector3;
  readonly stationBottom: THREE.Vector3;
  readonly orientation: Orientation;
}

export interface Pose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

/** In-plane tangent/perpendicular basis at the carrier's current attitude. */
function carrierBasis(ctx: CameraContext): { tangent: THREE.Vector3; normal: THREE.Vector3 } {
  // carrierAngleRad = theta - PI/2, so theta = carrierAngleRad + PI/2.
  const theta = ctx.carrierAngleRad + Math.PI / 2;
  const tangent = new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
  const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);
  return { tangent, normal };
}

function landscapeWiden(orientation: Orientation, portraitValue: number, landscapeValue: number): number {
  return orientation === 'landscape' ? landscapeValue : portraitValue;
}

/**
 * INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE `01-opening-
 * cutaway`): the original fixed target `(14, 22, 0)` framed a mid-leg
 * segment with the ground station (and its cabin, at/near the world
 * origin — `trackPoint(0)`) below the bottom edge, and the pull-back was
 * too tight to hold the underground cutaway, the station, AND a legible
 * stretch of leg together on a narrow portrait frame — confirmed visually
 * (the rendered shot showed no cabin at all, and the tower running off the
 * top edge). Target lowered toward the station/cabin and pulled back
 * further so the whole "leg + track + cabin + underground room" reads in
 * one glance per CAMERA_CONTRACT's `establish` requirements.
 */
export function establishPose(_ctx: CameraContext, orientation: Orientation): Pose {
  const back = landscapeWiden(orientation, 62, 78);
  return {
    position: new THREE.Vector3(-back * 0.5, 24, back * 0.82),
    target: new THREE.Vector3(6, 11, 0),
  };
}

/**
 * INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE
 * `02-underground-pistons`): pulled back further so both pistons, the
 * lever pedestal and the pulley's frame-edge sliver are comfortably
 * inside a narrow portrait frame together (the original pull-back left
 * the framing too tight against the accumulator tank looming in front).
 */
export function undergroundPose(ctx: CameraContext, orientation: Orientation): Pose {
  // Negative Z: the earth cutaway's open face is at MACHINE_ROOM_BOUNDS.zMin (-Z);
  // its solid cap wall sits at +Z, so the camera must sit on the -Z side to look in.
  // Framed on the PISTONS (CAMERA_CONTRACT: "both pistons fully in frame from the
  // side, master lever foreground-adjacent") -- the pulley sits off to the target's
  // +X side so the cable run toward it reads at the frame edge, not centered.
  const pull = -landscapeWiden(orientation, 23, 28);
  return {
    position: new THREE.Vector3(ctx.leverBase.x - 3.5, ctx.machineRoomCenter.y + 1.6, pull),
    target: new THREE.Vector3(ctx.leverBase.x + 1.6, ctx.machineRoomCenter.y - 3.2, 0),
  };
}

/** `cableFollow`'s three authored keyframes: piston head -> big pulley -> carrier. */
export function cableFollowKeyframes(ctx: CameraContext, orientation: Orientation): readonly Pose[] {
  const pull = -landscapeWiden(orientation, 8.5, 10.5);
  return [
    {
      position: new THREE.Vector3(ctx.leverBase.x - 1, ctx.machineRoomCenter.y + 1.2, pull),
      target: new THREE.Vector3(ctx.leverBase.x + 3, ctx.machineRoomCenter.y, 0),
    },
    {
      position: new THREE.Vector3(ctx.pulleyCenter.x, ctx.pulleyCenter.y + 1, pull * 1.1),
      target: ctx.pulleyCenter.clone(),
    },
    {
      position: sideCameraPosition(ctx.carrierPosition, carrierBasis(ctx).normal, 9, 8, orientation),
      target: ctx.carrierPosition.clone(),
    },
  ];
}

function sideCameraPosition(
  carrierPos: THREE.Vector3,
  normal: THREE.Vector3,
  zOffset: number,
  back: number,
  orientation: Orientation,
): THREE.Vector3 {
  const zScale = landscapeWiden(orientation, 1, 1.28);
  return carrierPos
    .clone()
    .add(normal.clone().multiplyScalar(back))
    .add(new THREE.Vector3(0, 0, zOffset * zScale));
}

export function carrierSidePose(ctx: CameraContext, orientation: Orientation, mirror = false): Pose {
  const { normal, tangent } = carrierBasis(ctx);
  const sign = mirror ? -1 : 1;
  const position = sideCameraPosition(ctx.carrierPosition, normal, sign * 15, 11, orientation).add(
    tangent.clone().multiplyScalar(1.5),
  );
  const target = ctx.carrierPosition.clone().add(tangent.clone().multiplyScalar(0.5));
  return { position, target };
}

export function firstSlopePose(ctx: CameraContext, orientation: Orientation): Pose {
  const { normal, tangent } = carrierBasis(ctx);
  const position = ctx.carrierPosition
    .clone()
    .add(normal.clone().multiplyScalar(15))
    .add(new THREE.Vector3(0, 0, landscapeWiden(orientation, 10, 13)))
    .add(tangent.clone().multiplyScalar(-3));
  // INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE
  // `04-first-slope`): the original fixed `tangent*4` aim point (well ahead
  // of and above the carrier along the incline) confirmed fine in portrait,
  // but landscape's much shallower vertical extent (46° FOV vs portrait's
  // 58°, on a viewport roughly half the height) compresses everything
  // vertically, so the same aim point left the carrier riding in the
  // bottom third of the frame — directly behind `.eiffel-throttle`
  // (src/styles/base.css), which (unlike `.eiffel-lever`/`.eiffel-wheel`)
  // isn't shrunk for landscape and so overhangs further into the frame
  // than the reserved bottom band. Confirmed visually: the button nearly
  // fully covered the carrier/cabin on phone-landscape, violating
  // PRODUCT_SPEC's "fingers never need to cover the cabin" guarantee.
  // Shrinking the forward aim bias in landscape only (portrait unchanged,
  // already correct) keeps the target closer to the carrier's own height
  // instead of climbing the incline as far ahead, lifting the carrier back
  // into the frame's upper half, clear of the control.
  const target = ctx.carrierPosition.clone().add(tangent.clone().multiplyScalar(landscapeWiden(orientation, 4, 1.2)));
  return { position, target };
}

/**
 * INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE
 * `05-slope-transition`): pulled back a bit further still — a visual QA
 * pass found the sky horizon essentially unreadable behind the lattice at
 * the original distance (the blend region's corridor opening is narrower
 * than the lower leg's, per `CORRIDOR_OPEN_RANGES`), one of the four
 * required witnesses (track, carrier, cabin floor, horizon) barely legible.
 */
export function transitionClosePose(ctx: CameraContext, orientation: Orientation): Pose {
  const { normal, tangent } = carrierBasis(ctx);
  // "Closer" than carrierSide/firstSlope (which pull back to normal*11-15) but
  // still far enough past the leg's own cross-section that the nearby chords
  // don't fill the wide-FOV frame -- close-in raking angles here just showed
  // as a wall of foreground struts.
  const zOffset = landscapeWiden(orientation, 9.5, 12);
  const position = ctx.carrierPosition
    .clone()
    .add(normal.clone().multiplyScalar(16))
    .add(new THREE.Vector3(0, 0, zOffset))
    .add(tangent.clone().multiplyScalar(0.8));
  // Bias the look-target upward along the track so the carrier/cabin sit in the
  // frame's upper 60% and the bottom 22% (level-wheel safe area) stays clear.
  const target = ctx.carrierPosition.clone().add(tangent.clone().multiplyScalar(3.2)).add(new THREE.Vector3(0, 0.6, 0));
  return { position, target };
}

/**
 * INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE
 * `06-horizontal-cabin-proof`): a first Wave-4 fix pass lowered the camera
 * below the hanging lamp shade's height, but left it positioned almost
 * exactly ON TOP of the water tank (`src/scene/interior.ts`'s
 * `TANK_LOCAL_POS` is `(-0.57, 0.5, 0.55)`; that pass's position offset put
 * the camera at local `(-0.55, ~1.05, 0.4)` — within 0.15m of the tank on
 * both the x and z axes, directly above it) with the look target pitched
 * upward almost back toward the lamp — confirmed visually still broken (the
 * lamp shade still dominated the frame with a heavily blurred, indistinct
 * foreground below it, textbook near-clipping against the tank).
 *
 * Re-picked the position entirely, iterating against real renders (this is
 * a tight ~1.7m x 1.7m x 2.1m box — `CABIN_FLOOR_HALF_EXTENTS` /
 * `CABIN_INTERIOR_HEIGHT` — sharing floor space with the water tank, the
 * ball, the robot and two passenger figures, viewed through portrait's
 * narrow ~29 horizontal FOV half-angle, so no single corner viewpoint gets
 * all four VISUAL_ACCEPTANCE witnesses simultaneously centered): camera now
 * sits pulled back into the high back-left corner (away from the tank AND
 * the floor figures), aimed diagonally across the room toward the tank's
 * side. This reliably reads the lamp (upper frame, hanging, not filling
 * it) and the water tank (clear glass box, lower-right, its surface
 * legibly level) together with the floor and a rider for context. The
 * rolling ball and the front window's horizon are NOT reliably both in
 * this same frame too (moving the aim toward either one pushes the lamp or
 * the tank back out) — a real composition limit of this room's scale
 * versus the portrait FOV, not a leftover bug; flagged here rather than
 * silently claimed as fully satisfying every witness in VISUAL_ACCEPTANCE's
 * list.
 */
export function interiorProofPose(ctx: CameraContext): Pose {
  // `cabinWorldPosition` is already lifted ~0.735m above the cabin floor
  // (see `EiffelSceneWorld.cabinWorldPositionScratch`), i.e. it corresponds
  // to local `(0, 0.735, 0)` — offsets below are relative to that anchor,
  // in the same world-aligned axes the (near-level, settled) cabin's own
  // local axes match at this cue (VISUAL_ACCEPTANCE "06-horizontal-cabin-
  // proof": level water surface, centered ball, vertical lamp, horizon in
  // window, all four legible in one frame).
  const position = ctx.cabinWorldPosition.clone().add(new THREE.Vector3(-0.75, 1.215, -0.7));
  const target = ctx.cabinWorldPosition.clone().add(new THREE.Vector3(-0.1, 0.115, 0.5));
  return { position, target };
}

export function menuPose(): Pose {
  return {
    position: new THREE.Vector3(-30, 26, 40),
    target: new THREE.Vector3(10, 14, 0),
  };
}

/** `arrivalReveal`'s two authored stages: Paris pan, then a pitched look back down the track. */
export function arrivalRevealKeyframes(ctx: CameraContext, orientation: Orientation): readonly Pose[] {
  const platform = ctx.secondFloorPosition;
  const pan: Pose = {
    position: platform.clone().add(new THREE.Vector3(-4, 4.2, landscapeWiden(orientation, 16, 21))),
    target: platform.clone().add(new THREE.Vector3(30, 6, 0)),
  };
  const dir = new THREE.Vector3().subVectors(ctx.stationBottom, platform);
  dir.z = 0;
  dir.normalize();
  const pitchRad = (CAMERA_MAX_DOWNWARD_PITCH_DEG - 6) * DEG2RAD;
  const horizontalDistance = 34;
  const lookBackTarget = platform
    .clone()
    .add(dir.clone().multiplyScalar(horizontalDistance))
    .add(new THREE.Vector3(0, -horizontalDistance * Math.tan(pitchRad), 0));
  const lookBack: Pose = {
    position: platform.clone().add(new THREE.Vector3(1.5, 3.4, 9)),
    target: lookBackTarget,
  };
  return [pan, lookBack];
}
