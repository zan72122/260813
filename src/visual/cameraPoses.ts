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

export function establishPose(_ctx: CameraContext, orientation: Orientation): Pose {
  const back = landscapeWiden(orientation, 46, 58);
  return {
    position: new THREE.Vector3(-back * 0.55, 30, back * 0.86),
    target: new THREE.Vector3(14, 22, 0),
  };
}

export function undergroundPose(ctx: CameraContext, orientation: Orientation): Pose {
  // Negative Z: the earth cutaway's open face is at MACHINE_ROOM_BOUNDS.zMin (-Z);
  // its solid cap wall sits at +Z, so the camera must sit on the -Z side to look in.
  // Framed on the PISTONS (CAMERA_CONTRACT: "both pistons fully in frame from the
  // side, master lever foreground-adjacent") -- the pulley sits off to the target's
  // +X side so the cable run toward it reads at the frame edge, not centered.
  const pull = -landscapeWiden(orientation, 16, 20);
  return {
    position: new THREE.Vector3(ctx.leverBase.x - 2.5, ctx.machineRoomCenter.y + 2.6, pull),
    target: new THREE.Vector3(ctx.leverBase.x + 1.2, ctx.machineRoomCenter.y - 2.6, 0),
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
  const target = ctx.carrierPosition.clone().add(tangent.clone().multiplyScalar(4));
  return { position, target };
}

export function transitionClosePose(ctx: CameraContext, orientation: Orientation): Pose {
  const { normal, tangent } = carrierBasis(ctx);
  // "Closer" than carrierSide/firstSlope (which pull back to normal*11-15) but
  // still far enough past the leg's own cross-section that the nearby chords
  // don't fill the wide-FOV frame -- close-in raking angles here just showed
  // as a wall of foreground struts.
  const zOffset = landscapeWiden(orientation, 7.5, 9.5);
  const position = ctx.carrierPosition
    .clone()
    .add(normal.clone().multiplyScalar(13))
    .add(new THREE.Vector3(0, 0, zOffset))
    .add(tangent.clone().multiplyScalar(0.8));
  // Bias the look-target upward along the track so the carrier/cabin sit in the
  // frame's upper 60% and the bottom 22% (level-wheel safe area) stays clear.
  const target = ctx.carrierPosition.clone().add(tangent.clone().multiplyScalar(3.2)).add(new THREE.Vector3(0, 0.6, 0));
  return { position, target };
}

export function interiorProofPose(ctx: CameraContext): Pose {
  // High corner looking down-and-across the small cabin floor toward the
  // window wall (+X) so the water tank, rolling ball, hanging lamp and
  // window horizon all land in one frame (VISUAL_ACCEPTANCE
  // "06-horizontal-cabin-proof").
  // `cabinWorldPosition` is already lifted ~0.735m above the cabin floor (see
  // `EiffelSceneWorld.cabinWorldPositionScratch`), so these offsets are
  // relative to roughly chest height, not the floor. Camera sits near the
  // tank's wall looking across toward the big front window, so the tank
  // (close, edge of frame), the floor/ball, the lamp (overhead) and the
  // window horizon all land inside one shot.
  const position = ctx.cabinWorldPosition.clone().add(new THREE.Vector3(-0.62, 0.95, 0.02));
  const target = ctx.cabinWorldPosition.clone().add(new THREE.Vector3(0.85, 0.15, -0.05));
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
