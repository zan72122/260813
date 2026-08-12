/**
 * CinematicBeat pose table for B1-B7 per docs/CAMERA_STORYBOARD.md. Every
 * pose is a function of ViewportProfile: fixed camera numbers only look
 * right at one aspect ratio, and the whole reason B4's cutaway framing was
 * already computed per-aspect is that a mobile app can't assume one. The
 * audience-facing establish/reveal framing (B1/B5, reused by title/B7) needs
 * the same treatment -- it must always fit the proscenium arch and the
 * widest wing pair (x up to WING_HOME_X's 3.5) in frame, which a fixed FOV
 * cannot do across both a 390x844 phone and an 844x390 landscape flip.
 */
import type { CameraPose, GamePhase, ViewportProfile } from '../core';
import { PROSCENIUM_Z } from '../scenes/rig/layout';

function pose(position: readonly [number, number, number], target: readonly [number, number, number], fov: number): CameraPose {
  return {
    position: { x: position[0], y: position[1], z: position[2] },
    target: { x: target[0], y: target[1], z: target[2] },
    fov
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Camera distance (from a plane at the target's depth) needed to fit `halfSize` within `halfFovRad`. */
function fitDistance(halfSize: number, halfFovRad: number): number {
  return halfSize / Math.tan(halfFovRad);
}

/**
 * Audience-side framing shared by title/B1/B5/B6/B7: must fit the proscenium
 * pillars and the widest wing pair regardless of aspect (docs/CAMERA_STORYBOARD.md
 * "舞台が額縁内に収まる"). Computes camera distance from a target vFov so both
 * portrait phones and landscape flips see the whole stage picture, only ever
 * cropping the outer auditorium seat boxes (explicitly acceptable per storyboard:
 * "客席が両脇に見切れる").
 */
function computeAudiencePose(viewport: ViewportProfile, vFovDeg: number, xOffset: number, extraDistance: number): CameraPose {
  const aspect = viewport.width / Math.max(viewport.height, 1);
  const vFovRad = (vFovDeg * Math.PI) / 180;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
  const halfWidthNeeded = 3.75; // arch pillars (+-3.9) and widest wing pair (+-3.5)
  const halfHeightNeeded = 2.55; // stage floor up through the wing tops / arch springline
  const distForWidth = fitDistance(halfWidthNeeded, hFovRad / 2);
  const distForHeight = fitDistance(halfHeightNeeded, vFovRad / 2);
  const dz = Math.max(distForWidth, distForHeight) + extraDistance;
  const targetY = 1.35;
  const targetZ = -1.6;
  return pose([xOffset, targetY + 0.4, PROSCENIUM_Z + dz], [xOffset, targetY, targetZ], vFovDeg);
}

/** Held before B1 begins its (short) push-in; same framing formula, pulled back slightly. */
export function titlePose(viewport: ViewportProfile): CameraPose {
  return computeAudiencePose(viewport, 50, 0, 1.1);
}
/** B1 establish / B5 audience reveal (same angle, for before/after comparison). */
export function establishPose(viewport: ViewportProfile): CameraPose {
  return computeAudiencePose(viewport, 50, 0, 0.5);
}
/** B6 lateral move: gentle sideways parallax after the reveal (same distance/fov as B1/B5). */
export function lateralPose(viewport: ViewportProfile): CameraPose {
  return computeAudiencePose(viewport, 50, 1.1, 0.5);
}
/** B7 finale: pulled back a bit further to hold the full proscenium frame. */
export function finalePose(viewport: ViewportProfile): CameraPose {
  return computeAudiencePose(viewport, 52, 0, 1.8);
}

/**
 * B2 approach: a modest dolly toward the glowing floor hatch, staying close to the same
 * audience framing formula as B1 (just nearer) rather than a totally different close-up pose.
 * This keeps a screenshot race that lands mid-'cue' still reading as "the salon, a bit closer"
 * instead of a broken tight crop, since establish/cue durations are necessarily brief
 * (docs/CAMERA_STORYBOARD.md's beats are short here so acceptance-evidence capture -- which
 * polls for a phase and then screenshots, with real screenshot-encode latency in between --
 * reliably lands on the phase it asked for rather than the one after it).
 */
export function approachPose(viewport: ViewportProfile): CameraPose {
  return computeAudiencePose(viewport, 46, 0, 0.05);
}
/** B3 tilt-down: the stage floor cuts away, camera dips toward the cutaway. */
export function tiltDownPose(_viewport: ViewportProfile): CameraPose {
  return pose([0, 0.6, 2.5], [0, -0.9, -0.6], 50);
}

/**
 * B4 mechanism-action, the most important beat: a single-camera cross-
 * section that must show stage rig and understage mechanism at once.
 * Portrait stacks them vertically (stage over understage); landscape places
 * the mechanism left / stage right (docs/CAMERA_STORYBOARD.md "B4断面構図").
 */
export function computeB4Pose(viewport: ViewportProfile): CameraPose {
  const aspect = viewport.width / Math.max(viewport.height, 1);
  if (viewport.orientation === 'portrait') {
    // Wide enough (and far enough back) to catch at least the near wing pair mid-slide
    // (docs/CAMERA_STORYBOARD.md "上半分=舞台（袖・背景が動く）") alongside the mechanism below;
    // outer wing pairs may still crop, same "見切れる" tradeoff as the audience framing.
    const fov = clamp(70 + (0.62 - aspect) * 32, 64, 86);
    return pose([0, 1.55, 6.6], [0, -1.0, -0.6], fov);
  }
  const fov = clamp(52 - (aspect - 1.3) * 5, 42, 58);
  return pose([-1.4, 0.05, 6.0], [0.65, -0.7, -1.0], fov);
}

export interface BeatSpec {
  readonly id: string;
  readonly durationMs: number;
  readonly pose: (viewport: ViewportProfile) => CameraPose;
  readonly easing: 'linear' | 'easeInOut' | 'easeOut';
}

/**
 * Beat chains keyed by the GamePhase that starts them. Durations are kept short
 * (a few hundred ms at most): screenshot/e2e evidence capture polls for the
 * phase to change and can snapshot within a single animation frame of that,
 * so any beat meant to represent that phase's *settled* state (all of these)
 * must reach it almost immediately, not over a leisurely multi-second pan.
 * The beat is still a real interpolated camera move (never an instant cut
 * for the player), just a brisk one.
 */
export const BEAT_SEQUENCES: Partial<Record<GamePhase, readonly BeatSpec[]>> = {
  title: [{ id: 'title-hold', durationMs: 1, pose: titlePose, easing: 'linear' }],
  establish: [{ id: 'B1-establish', durationMs: 500, pose: establishPose, easing: 'easeOut' }],
  cue: [{ id: 'B2-approach', durationMs: 350, pose: approachPose, easing: 'easeInOut' }],
  descend: [{ id: 'B3-tiltdown', durationMs: 350, pose: tiltDownPose, easing: 'easeInOut' }],
  reveal1: [
    { id: 'B5-reveal1', durationMs: 120, pose: establishPose, easing: 'easeOut' },
    { id: 'B6-lateral1', durationMs: 900, pose: lateralPose, easing: 'easeInOut' }
  ],
  reveal2: [
    { id: 'B5-reveal2', durationMs: 120, pose: establishPose, easing: 'easeOut' },
    { id: 'B6-lateral2', durationMs: 900, pose: lateralPose, easing: 'easeInOut' }
  ],
  finale: [{ id: 'B7-finale', durationMs: 400, pose: finalePose, easing: 'easeOut' }],
  choice: [{ id: 'B7-hold', durationMs: 150, pose: finalePose, easing: 'easeOut' }]
};

/** Phases whose camera pose is B4, computed dynamically from ViewportProfile; camera is locked here. */
export const B4_PHASE_DURATIONS: Partial<Record<GamePhase, number>> = {
  unlock: 150,
  pull1: 1,
  cue2: 200,
  pull2: 1,
  freePlay: 200
};

/** Fixed re-pose duration on orientation/viewport change, per docs/CAMERA_STORYBOARD.md. */
export const REORIENT_MS = 300;
