/**
 * Pure `CameraCue → CameraPose` mapping — the "what should the camera be
 * looking at" half of CameraDirector. No Three.js dependency (plain number
 * tuples), no live GameState dependency: every pose is a function of the
 * cue + the deterministic per-leg `legScenario` (seed, leg) + the current
 * viewport `aspect` (width/height) + the STATIC tower layout
 * (scene/layout.ts), never of the leg's current legOffsetY.
 *
 * That last point (no legOffsetY dependency) is the design's answer to
 * ARCHITECTURE_CONTRACT.md's causality rule ("sand中とjack中はcauseとeffectが
 * 同一フレーム内に両方写る構図をcamera directorが保証する"): rather than
 * dynamically tracking a moving target (which risks a tracking bug letting
 * an element drift out of frame at some offset value), each cut's framing
 * box is sized/aimed to generously contain the leg's ENTIRE possible
 * vertical travel range (scene/mapping.ts's legOffsetToWorldY applied to
 * [-SAND_UNDERSHOOT_MAX, +INITIAL_OFFSET_MAX]) plus the relevant ground
 * props, so the required elements are in frame at every offset by
 * construction, not by per-frame tracking.
 *
 * ## R2 rework (director defect list)
 * Previously `sandboxCutaway`/`jackCloseup` computed camera *position* from
 * `legFramingPose` (a distance/azimuth pair pivoting around the TOWER
 * CENTER at the leg's own angle) and only used the sandbox/jack anchor for
 * the *target* — and even then attenuated toward the origin (`anchor.x *
 * 0.35`). The position math never referenced the anchor at all, so the
 * camera routinely ended up planted almost inside the leg's own truss
 * (`distance` ≈ the leg's own base radius) staring at a point pulled back
 * toward the tower axis — hence "100% dark truss" / "subjects as distant
 * clutter at another leg". Every ground-prop pose below now derives BOTH
 * position and target from the real prop anchors (scene/layout.ts /
 * scene/props/legGroundRig.ts's exported dimensions), and sizes the camera
 * distance from the viewport's actual aspect ratio via `fitDistance` so the
 * required subjects are provably inside the frustum at any aspect — see
 * `outwardFramingPose`.
 */
import type { CameraCue } from '../../contracts/camera';
import type { LegId } from '../../contracts/types';
import { legScenario } from '../../contracts/rng';
import {
  GIRDER_RING_Y,
  GROUND_PROP_LATERAL_OFFSET,
  GROUND_Y,
  JACK_CYLINDER_HEIGHT,
  LEG_CHORD_HALF_WIDTH_BASE,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  jackAnchorXZ,
  legAngleRad,
  legBaseXZ,
  legTangentUnit,
  legTopXZ,
  sandboxAnchorXZ,
  type Vec2,
} from '../../scene/layout';

export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Vertical field of view, degrees. */
  fov: number;
}

const TOWER_CENTER_Y = GIRDER_RING_Y * 0.5;

/** A generic, unremarkable landscape-ish aspect used only as `cueToPose`'s default when a caller doesn't have a live viewport yet (module load, tests) — also reused by cameraDirector.ts's constructor default. Every real render frame passes the actual `camera.aspect`. */
export const DEFAULT_ASPECT = 16 / 9;

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

/**
 * Straight-line camera distance (world units) needed so a subject bounding
 * box of `halfWidth`×`halfHeight` (centered on the look-at target, in the
 * plane perpendicular to the view direction) fits inside a `vfovDeg`
 * vertical-FOV frustum at the given `aspect` (width/height), independently
 * satisfying both the vertical and horizontal fit, times a safety `margin`
 * (>1 leaves breathing room at the frame edges).
 */
function fitDistance(halfWidth: number, halfHeight: number, vfovDeg: number, aspect: number, margin: number): number {
  const vfovRad = (vfovDeg * Math.PI) / 180;
  const hfovRad = 2 * Math.atan(Math.tan(vfovRad / 2) * Math.max(0.2, aspect));
  const distV = halfHeight / Math.tan(vfovRad / 2);
  const distH = halfWidth / Math.tan(Math.max(0.05, hfovRad / 2));
  return Math.max(distV, distH) * margin;
}

/**
 * Builds a pose that looks INWARD at `center` (world XZ) from a position
 * pushed OUTWARD along `viewAngleRad` (+ a small per-leg `yawSwingRad`), at
 * whatever distance `fitDistance` says is needed to hold a
 * `halfWidth`×`halfHeight` box around the target, elevated above the target
 * by `elevationFactor` × that distance (a fixed downward look angle,
 * independent of the fitted distance, so closer/farther cuts keep a
 * consistent "looking down at the machinery" feel).
 *
 * `viewAngleRad` is deliberately a SEPARATE parameter from `center`'s own
 * angle-from-tower-origin: `props/legGroundRig.ts`'s sandbox is authored
 * with its open (cutaway) face on local +Z, which `legOutwardYawRadians`
 * maps onto the LEG's own radial direction (`legAngleRad(leg)`) — not the
 * `center` framing point's direction, which is skewed off that radial line
 * by the sandbox/jack's tangential offset from the leg. Pivoting the camera
 * around `center`'s own angle instead of the leg's would view the box
 * obliquely enough to mostly see a solid side wall instead of through the
 * open cutaway face — exactly the "sandbox interior reads as near-black"
 * symptom this function's callers were built to avoid.
 */
function outwardFramingPose(
  center: Vec2,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  fov: number,
  aspect: number,
  elevationFactor: number,
  viewAngleRad: number,
  yawSwingRad: number,
  margin: number,
): CameraPose {
  const distance = fitDistance(halfWidth, halfHeight, fov, aspect, margin);
  const angle = viewAngleRad + yawSwingRad;
  // Camera sits on the ray FROM the target THROUGH `center`, extended
  // `distance` further out along `angle` — guarantees the view direction is
  // exactly `angle` (the box's real opening normal) regardless of how far
  // `center` itself deviates from that ray.
  return {
    position: [center.x + Math.cos(angle) * distance, centerY + distance * elevationFactor, center.z + Math.sin(angle) * distance],
    target: [center.x, centerY, center.z],
    fov,
  };
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Generous estimate (world units) of how far the jack's two-hand pump lever
 * reaches beyond the jack's own anchor point, on the side AWAY from the
 * leg (props/legGroundRig.ts's pumpPivot + leverArm + leverGrip, all
 * extending outward in local +X). Kept as a single named, generously-
 * rounded constant here (rather than re-deriving legGroundRig.ts's exact
 * local offsets) since camera framing only needs "definitely wide enough",
 * not pixel-exact — see `cueToPose`'s jackCloseup case.
 */
const JACK_LEVER_REACH = 5.6;

/** Pure cue→pose mapping. `seed` supplies each leg's deterministic camera-yaw variety (rng.ts legScenario). `aspect` (viewport width/height) drives aspect-aware framing for the ground-prop close-ups — portrait cuts favor a taller vertical box + wider fov (subjects stacked vertically); landscape cuts favor the wide horizontal spread (subjects side-by-side). Defaults to a generic landscape-ish aspect so callers without a live viewport (tests) still get a sane pose. */
export function cueToPose(cue: CameraCue, seed: number, aspect: number = DEFAULT_ASPECT): CameraPose {
  const isPortrait = aspect < 1;

  switch (cue.kind) {
    case 'establish':
      return establishLikePose(isPortrait ? 100 : 88, isPortrait ? 50 : 46, Math.PI * 0.15, TOWER_CENTER_Y, isPortrait ? 54 : 48);

    case 'activeLeg':
      // Wide enough to hold the leg's full lattice, its ground props, AND the girder end above it.
      return legFramingPose(cue.leg, seed, isPortrait ? 54 : 46, isPortrait ? 30 : 26, TOWER_CENTER_Y * 0.9, isPortrait ? 52 : 46, 0.5);

    case 'sandboxCutaway': {
      // Causality (VISUAL_ACCEPTANCE "sand flow"): gate + falling stream +
      // sandbox cutaway + leg + (ideally) pin/ring in ONE frame at generous
      // size. `center` sits between the sandbox and the leg's own base so
      // both share the frame; portrait reaches modestly higher up the leg
      // than landscape (stacking sandbox-then-leg vertically, per the "portrait:
      // subjects stacked vertically" rule) WITHOUT reaching all the way to
      // the pin/ring — that would shrink the sandbox to a sliver of the
      // frame, failing "at generous size", the higher-priority half of the
      // "(ideally) pin/ring" requirement.
      const anchor = sandboxAnchorXZ(cue.leg);
      const base = legBaseXZ(cue.leg);
      const center = midpoint(anchor, base);
      const halfWidth = GROUND_PROP_LATERAL_OFFSET / 2 + Math.max(SANDBOX_WIDTH / 2, LEG_CHORD_HALF_WIDTH_BASE) + 0.8;
      const topY = isPortrait ? SANDBOX_HEIGHT * 3.4 : SANDBOX_HEIGHT * 2.5;
      const bottomY = GROUND_Y - 0.4;
      const halfHeight = (topY - bottomY) / 2;
      const centerY = (topY + bottomY) / 2;
      const fov = isPortrait ? 54 : 50;
      const swing = yawSwing(legScenario(seed, cue.leg).cameraYaw, 0.3);
      return outwardFramingPose(center, centerY, halfWidth, halfHeight, fov, aspect, 0.28, legAngleRad(cue.leg), swing, 1.08);
    }

    case 'jackCloseup': {
      // Causality (VISUAL_ACCEPTANCE "jack close-up"): pump handle + piston
      // + leg junction in ONE frame. `halfWidth` accounts for the lever's
      // full outward reach (the farthest thing from `center`), not just the
      // jack cylinder, so the whole two-hand lever stays in frame.
      const anchor = jackAnchorXZ(cue.leg);
      const base = legBaseXZ(cue.leg);
      const tangent = legTangentUnit(cue.leg);
      // jackAnchorXZ = legBase − tangent·offset (layout.ts), and the lever
      // extends further in that SAME outward direction from the jack's own
      // center (props/legGroundRig.ts's pumpPivot/leverArm sit at local +X
      // within the jack's own group, which maps to this same −tangent world
      // direction) — so the tip continues by SUBTRACTING more tangent, not
      // adding it.
      const leverTip = { x: anchor.x - tangent.x * JACK_LEVER_REACH, z: anchor.z - tangent.z * JACK_LEVER_REACH };
      const center = midpoint(leverTip, base);
      const halfWidth = Math.hypot(leverTip.x - center.x, leverTip.z - center.z) + 0.6;
      const topY = JACK_CYLINDER_HEIGHT * 1.7;
      const bottomY = GROUND_Y - 0.4;
      const halfHeight = (topY - bottomY) / 2;
      const centerY = (topY + bottomY) / 2;
      const fov = isPortrait ? 56 : 48;
      const swing = yawSwing(legScenario(seed, cue.leg).cameraYaw, 0.25);
      return outwardFramingPose(center, centerY, halfWidth, halfHeight, fov, aspect, 0.22, legAngleRad(cue.leg), swing, 1.15);
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

    // istanbul ignore next -- exhaustiveness guard; CameraCue's union is closed and every member is handled above.
    default: {
      const exhaustive: never = cue;
      throw new Error(`cueToPose: unhandled cue kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Y (world) exactly at the ground plane — re-exported so cameraDirector.ts's tests don't need a second import of scene/layout.ts just for this constant. */
export const CAMERA_GROUND_Y = GROUND_Y;
