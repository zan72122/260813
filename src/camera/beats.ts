/**
 * CinematicBeat pose table for B1-B7 per docs/CAMERA_STORYBOARD.md. Pure
 * data plus the one pose that must be *computed* rather than looked up: B4's
 * cutaway framing, which depends on ViewportProfile aspect/orientation.
 */
import type { CameraPose, GamePhase, ViewportProfile } from '../core';

function pose(position: readonly [number, number, number], target: readonly [number, number, number], fov: number): CameraPose {
  return {
    position: { x: position[0], y: position[1], z: position[2] },
    target: { x: target[0], y: target[1], z: target[2] },
    fov
  };
}

/** Held before B1 begins its slow push-in (title phase). */
export const TITLE_POSE = pose([0, 1.75, 6.5], [0, 1.0, -0.9], 44);
/** B1 establish / B5 audience reveal (same angle, for before/after comparison). */
export const B1_ESTABLISH_POSE = pose([0, 1.9, 5.6], [0, 1.05, -1.2], 40);
/** B2 approach: dolly toward the glowing floor hatch. */
export const B2_APPROACH_POSE = pose([0, 1.3, 4.0], [0, 0.15, -0.5], 39);
/** B3 tilt-down: the stage floor cuts away, camera dips toward the cutaway. */
export const B3_TILTDOWN_POSE = pose([0, 0.6, 2.5], [0, -1.0, -0.6], 44);
/** B6 lateral move: gentle sideways parallax after the reveal. */
export const B6_LATERAL_POSE = pose([1.3, 1.9, 5.4], [0, 1.05, -1.2], 40);
/** B7 finale: pulled back to hold the full proscenium frame. */
export const B7_FINALE_POSE = pose([0, 2.05, 6.9], [0, 1.3, -1.4], 45);

/**
 * B4 mechanism-action, the most important beat: a single-camera cross-
 * section that must show stage rig and understage mechanism at once.
 * Portrait stacks them vertically (stage over understage); landscape places
 * the mechanism left / stage right (docs/CAMERA_STORYBOARD.md "B4断面構図").
 */
export function computeB4Pose(viewport: ViewportProfile): CameraPose {
  const aspect = viewport.width / Math.max(viewport.height, 1);
  if (viewport.orientation === 'portrait') {
    // Narrower aspect needs a wider FOV to keep both stage and understage framed in.
    const fov = Math.min(74, Math.max(54, 60 + (0.62 - aspect) * 42));
    return pose([0, 0.3, 3.65], [0, -1.6, -0.7], fov);
  }
  const fov = Math.min(50, Math.max(38, 45 - (aspect - 1.3) * 6));
  return pose([-1.1, -0.5, 3.45], [0.55, -0.9, -1.0], fov);
}

export interface BeatDef {
  readonly id: string;
  readonly durationMs: number;
  readonly to: CameraPose;
  readonly easing: 'linear' | 'easeInOut' | 'easeOut';
}

/** Static (viewport-independent) beat chains, keyed by the GamePhase that starts them. */
export const BEAT_SEQUENCES: Partial<Record<GamePhase, readonly BeatDef[]>> = {
  title: [{ id: 'title-hold', durationMs: 1, to: TITLE_POSE, easing: 'linear' }],
  establish: [{ id: 'B1-establish', durationMs: 6000, to: B1_ESTABLISH_POSE, easing: 'easeInOut' }],
  cue: [{ id: 'B2-approach', durationMs: 3000, to: B2_APPROACH_POSE, easing: 'easeInOut' }],
  descend: [{ id: 'B3-tiltdown', durationMs: 3000, to: B3_TILTDOWN_POSE, easing: 'easeInOut' }],
  reveal1: [
    { id: 'B5-reveal1', durationMs: 4000, to: B1_ESTABLISH_POSE, easing: 'easeOut' },
    { id: 'B6-lateral1', durationMs: 4000, to: B6_LATERAL_POSE, easing: 'easeInOut' }
  ],
  reveal2: [
    { id: 'B5-reveal2', durationMs: 4000, to: B1_ESTABLISH_POSE, easing: 'easeOut' },
    { id: 'B6-lateral2', durationMs: 4000, to: B6_LATERAL_POSE, easing: 'easeInOut' }
  ],
  finale: [{ id: 'B7-finale', durationMs: 3000, to: B7_FINALE_POSE, easing: 'easeOut' }],
  choice: [{ id: 'B7-hold', durationMs: 1000, to: B7_FINALE_POSE, easing: 'easeOut' }]
};

/** Phases whose camera pose is B4, computed dynamically from ViewportProfile; camera is locked here. */
export const B4_PHASE_DURATIONS: Partial<Record<GamePhase, number>> = {
  unlock: 1000,
  pull1: 1,
  cue2: 2400,
  pull2: 1,
  freePlay: 1800
};

/** Fixed re-pose duration on orientation/viewport change, per docs/CAMERA_STORYBOARD.md. */
export const REORIENT_MS = 300;
