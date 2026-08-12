/**
 * Pure `CameraCue → CameraPose` mapping — the "what should the camera be
 * looking at" half of CameraDirector. No Three.js dependency (plain number
 * tuples), no live GameState dependency: every pose is a function of the
 * cue + the deterministic per-leg `legScenario` (seed, leg) and the STATIC
 * tower layout (scene/layout.ts), never of the leg's current legOffsetY.
 *
 * That last point is the design's answer to ARCHITECTURE_CONTRACT.md's
 * causality rule ("sand中とjack中はcauseとeffectが同一フレーム内に両方写る
 * 構図をcamera directorが保証する"): rather than dynamically tracking a
 * moving target (which risks a tracking bug letting an element drift out
 * of frame at some offset value), each cut's framing box is sized/aimed to
 * generously contain the leg's ENTIRE possible vertical travel range
 * (scene/mapping.ts's legOffsetToWorldY applied to
 * [-SAND_UNDERSHOOT_MAX, +INITIAL_OFFSET_MAX]) plus the relevant ground
 * props, so the required elements are in frame at every offset by
 * construction, not by per-frame tracking.
 */
import type { CameraCue } from '../../contracts/camera';
import type { LegId } from '../../contracts/types';
import { legScenario } from '../../contracts/rng';
import {
  GIRDER_RING_Y,
  GROUND_Y,
  jackAnchorXZ,
  legAngleRad,
  legBaseXZ,
  legTopXZ,
  sandboxAnchorXZ,
} from '../../scene/layout';

export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Vertical field of view, degrees. */
  fov: number;
}

const TOWER_CENTER_Y = GIRDER_RING_Y * 0.5;

/** Clamps a per-leg cameraYaw scenario value (radians, [0,2π)) into a modest ± swing around a cut's base azimuth, so leg variety never swings the framing box off its required subjects. */
function yawSwing(scenarioYaw: number, maxSwingRad: number): number {
  return (scenarioYaw / (Math.PI * 2) - 0.5) * 2 * maxSwingRad;
}

function establishLikePose(distance: number, height: number, azimuth: number, targetY: number, fov: number): CameraPose {
  return {
    position: [Math.cos(azimuth) * distance, height, Math.sin(azimuth) * distance],
    target: [0, targetY, 0],
    fov,
  };
}

function legFramingPose(
  leg: LegId,
  seed: number,
  distance: number,
  height: number,
  targetY: number,
  fov: number,
  maxYawSwing: number,
): CameraPose {
  const base = legAngleRad(leg);
  const swing = yawSwing(legScenario(seed, leg).cameraYaw, maxYawSwing);
  const azimuth = base + swing;
  const top = legTopXZ(leg);
  const bottom = legBaseXZ(leg);
  const targetX = (top.x + bottom.x) * 0.18;
  const targetZ = (top.z + bottom.z) * 0.18;
  return {
    position: [Math.cos(azimuth) * distance, height, Math.sin(azimuth) * distance],
    target: [targetX, targetY, targetZ],
    fov,
  };
}

/** Pure cue→pose mapping. `seed` supplies each leg's deterministic camera-yaw variety (rng.ts legScenario). */
export function cueToPose(cue: CameraCue, seed: number): CameraPose {
  switch (cue.kind) {
    case 'establish':
      return establishLikePose(88, 46, Math.PI * 0.15, TOWER_CENTER_Y, 48);

    case 'activeLeg':
      // Wide enough to hold the leg's full lattice, its ground props, AND the girder end above it.
      return legFramingPose(cue.leg, seed, 46, 26, TOWER_CENTER_Y * 0.9, 46, 0.5);

    case 'sandboxCutaway': {
      // Causality: gate + stream + leg + pin + ring all in frame — spans ground (sandbox) to GIRDER_RING_Y.
      const anchor = sandboxAnchorXZ(cue.leg);
      const pose = legFramingPose(cue.leg, seed, 30, 17, GIRDER_RING_Y * 0.42, 52, 0.35);
      return { ...pose, target: [anchor.x * 0.35, GIRDER_RING_Y * 0.35, anchor.z * 0.35] };
    }

    case 'jackCloseup': {
      // Causality: lever + piston + leg all in frame.
      const anchor = jackAnchorXZ(cue.leg);
      const pose = legFramingPose(cue.leg, seed, 24, 14, GIRDER_RING_Y * 0.3, 46, 0.3);
      return { ...pose, target: [anchor.x * 0.4, GIRDER_RING_Y * 0.28, anchor.z * 0.4] };
    }

    case 'alignment':
      // Tight on the pin/ring junction near the top — magnifier's source view.
      return legFramingPose(cue.leg, seed, 16, GIRDER_RING_Y + 4, GIRDER_RING_Y, 34, 0.25);

    case 'wedge':
      return legFramingPose(cue.leg, seed, 13, GIRDER_RING_Y + 2, GIRDER_RING_Y - 0.5, 36, 0.2);

    case 'orbitToNext': {
      // A wide pass roughly between the two legs' angular positions — the director eases through this en route to the next 'activeLeg' cue.
      const a = legAngleRad(cue.from);
      const b = legAngleRad(cue.to);
      let mid = (a + b) / 2;
      if (Math.abs(a - b) > Math.PI) mid += Math.PI; // take the short way around
      return establishLikePose(70, 40, mid, TOWER_CENTER_Y, 50);
    }

    case 'topReveal':
      return {
        position: [Math.cos(0.4) * 10, GIRDER_RING_Y + 78, Math.sin(0.4) * 10],
        target: [0, GIRDER_RING_Y, 0],
        fov: 40,
      };

    case 'pullback':
      return establishLikePose(120, 58, Math.PI * 0.15, TOWER_CENTER_Y, 44);
  }
}

/** Y (world) exactly at the ground plane — re-exported so cameraDirector.ts's tests don't need a second import of scene/layout.ts just for this constant. */
export const CAMERA_GROUND_Y = GROUND_Y;
