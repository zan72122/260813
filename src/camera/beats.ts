// src/camera/beats.ts
// Data-driven CinematicBeat definitions for every beat in
// docs/CAMERA_STORYBOARD.md, portrait + landscape keyframe variants.
// Durations reuse src/game/timing.ts so the camera never drifts out of sync
// with the phase auto-transitions that pace it (e.g. the ~2.2s valve-approach
// dolly finishes exactly when the game moves to valve-turn).
//
// fountain-reveal actually plays two storyboard beats back-to-back within the
// single GamePhase 'fountain-reveal': a per-fountain close reveal, then
// beat-wide-reveal. CinematicBeat.phase can't carry a fountain id (frozen
// contract), so the three reveal variants are distinguished by `id` instead,
// and src/camera/player.ts looks them up via REVEAL_BEAT_ID_BY_FOUNTAIN.
//
// Gate B Wave 5 fix round: every pose below was re-derived by actually
// screenshotting the real render (390x844 + 844x390) and pulling back /
// repositioning until each state reads clearly — see the per-section notes.

import type { CameraPose, CinematicBeat, FountainId } from '../contracts';
import { getSceneAnchors } from '../scenes/anchors';
import {
  FINALE_HOLD_SEC,
  GARDEN_IDLE_APPROACH_SEC,
  PIPE_RUN_BASE_SEC,
  REVEAL_HOLD_SEC,
  REVEAL_STAGE1_SEC,
  REVEAL_STAGE2_SEC,
  REVEAL_WIDE_SEC,
  VALVE_APPROACH_SEC,
} from '../game/timing';

const anchors = getSceneAnchors();
const valveHead = anchors.valve.headPosition;
const whistlePos = anchors.whistlePosition;

function pose(position: [number, number, number], lookAt: [number, number, number], fov = 45): CameraPose {
  return { position, lookAt, fov };
}

// ---- garden-idle: wide 3/4 establishing shot, slow pan -----------------
// The valve/whistle nook sits near the garden entrance (src/scenes/anchors.ts
// VALVE_POSITION, z=-8.5), so a camera further back behind it, looking down
// the whole path length toward +Z, reads: whistle in the near/lower
// foreground, the stone path + hedges + all 3 fountains receding into the
// distance, and the king's procession wherever it currently is along that
// path — all in one glance, per Gate B fix #1.
const ESTABLISH_PORTRAIT: CameraPose[] = [
  pose([-8.5, 15, -18], [-1, 1, 3], 52),
  pose([-7.5, 14, -17], [-1, 1, 4], 52),
];
const ESTABLISH_LANDSCAPE: CameraPose[] = [
  pose([-10.5, 11, -14], [-1, 1, 2], 50),
  pose([-9.5, 10.5, -13], [-1, 1, 3], 50),
];

// ---- whistle-cue: foreground whistle, background king approach ---------
const WHISTLE_CUE_PORTRAIT: CameraPose[] = [
  pose([whistlePos.x + 3.1, 1.6, whistlePos.z + 4.2], [whistlePos.x, 0.8, whistlePos.z], 46),
];
const WHISTLE_CUE_LANDSCAPE: CameraPose[] = [
  pose([whistlePos.x + 3.6, 1.5, whistlePos.z + 3.6], [whistlePos.x, 0.8, whistlePos.z], 44),
];

// ---- valve-approach: one continuous dolly from whistle framing ---------
// Gate B fix #3: pulled back so the FULL wrench circle (handle sweep radius
// ~1.0 world unit) fits with margin — valve head sits slightly above screen
// center (lookAt is below the head), handle sweep stays inside the outer
// 2/3 of the frame instead of exiting it.
const VALVE_MACRO_PORTRAIT_POSE = pose(
  [valveHead.x + 3.15, valveHead.y + 1.1, valveHead.z + 3.7],
  [valveHead.x, valveHead.y - 0.2, valveHead.z],
  44,
);
const VALVE_MACRO_LANDSCAPE_POSE = pose(
  [valveHead.x + 3.95, valveHead.y + 0.8, valveHead.z + 2.8],
  [valveHead.x, valveHead.y - 0.2, valveHead.z],
  42,
);
const VALVE_APPROACH_PORTRAIT: CameraPose[] = [WHISTLE_CUE_PORTRAIT[0]!, VALVE_MACRO_PORTRAIT_POSE];
const VALVE_APPROACH_LANDSCAPE: CameraPose[] = [WHISTLE_CUE_LANDSCAPE[0]!, VALVE_MACRO_LANDSCAPE_POSE];

// ---- valve-turn: macro on valve head + wrench ---------------------------
const VALVE_MACRO_PORTRAIT: CameraPose[] = [VALVE_MACRO_PORTRAIT_POSE];
const VALVE_MACRO_LANDSCAPE: CameraPose[] = [VALVE_MACRO_LANDSCAPE_POSE];

// ---- pipe-run: nominal data (actual playback follows water-progress t
// along the pipe curve — see PIPE_CAMERA_OFFSETS + player.ts) ------------
const PIPE_CUTAWAY_PORTRAIT: CameraPose[] = [
  pose([valveHead.x + 1.5, -0.4, valveHead.z + 0.5], [valveHead.x, -1.1, valveHead.z + 1.5], 50),
];
const PIPE_CUTAWAY_LANDSCAPE: CameraPose[] = [
  pose([valveHead.x + 2.2, -0.2, valveHead.z], [valveHead.x, -1.1, valveHead.z + 1.5], 52),
];

/** Camera offset from the water blob's curve point, per orientation — Gate B
 * fix #4, second pass: an (above:2.3, side:2.0) offset pulled the camera
 * clear of the pipe/trench itself, but "above" pushed the camera's absolute
 * Y back ABOVE ground level (the pipe curve's Y is only -1.3..-0.35), so its
 * view of the trench clipped straight through the single large lawn plane
 * at y=0 (src/scenes/build/ground.ts) — filling the frame with a close-up
 * of the lawn's underside instead of the trench. `above` must stay small
 * enough that point.y + above never reaches 0 across the whole curve (worst
 * case near arrival, point.y ≈ -0.35); `side` (horizontal only — sideDir has
 * no Y component) is free to be larger for a proper 3rd-person trench view.
 * Portrait still emphasizes the vertical plunge (storyboard: "縦画面: 地上→
 * 地下→地上"), landscape the horizontal run. */
export const PIPE_CAMERA_OFFSETS = {
  portrait: { above: 0.33, side: 1.1, lookAhead: 0.07 },
  landscape: { above: 0.31, side: 1.5, lookAhead: 0.09 },
} as const;

// ---- fountain-reveal (close): per fountain, differentiated angle/motion --
// Gate B fix #5: pulled back from the water surface so the WHOLE fountain
// (basin rim to full jet height) fits in frame with sky visible above.
function fanReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-fan'].center;
  return {
    portrait: [
      pose([c.x + 0.4, 0.9, c.z + 6.2], [c.x, 1.0, c.z], 48),
      pose([c.x + 0.7, 1.1, c.z + 5.6], [c.x, 1.2, c.z], 44),
    ],
    landscape: [
      pose([c.x + 4.8, 0.95, c.z + 4.8], [c.x, 1.0, c.z], 46),
      pose([c.x + 4.3, 1.15, c.z + 4.3], [c.x, 1.2, c.z], 42),
    ],
  };
}

function ringReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-ring'].center;
  // "円環の外周を軽く回り込む" — a light orbit around the rim, pulled back
  // enough to keep the full ring + basin in frame throughout the arc.
  return {
    portrait: [
      pose([c.x + 4.5, 0.95, c.z + 3.2], [c.x, 0.7, c.z], 46),
      pose([c.x - 2.9, 1.05, c.z + 4.8], [c.x, 0.8, c.z], 44),
    ],
    landscape: [
      pose([c.x + 5.6, 1.0, c.z + 2.1], [c.x, 0.7, c.z], 44),
      pose([c.x - 3.4, 1.1, c.z + 4.5], [c.x, 0.8, c.z], 42),
    ],
  };
}

function crownReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-crown'].center;
  // "中央噴流の立ち上がりを縦に追う" — camera rises with the central jet,
  // starting far/low enough to read the whole basin against the sky first.
  return {
    portrait: [
      pose([c.x + 0.5, 0.75, c.z + 7.2], [c.x, 0.9, c.z], 48),
      pose([c.x + 0.8, 2.9, c.z + 6.6], [c.x, 2.1, c.z], 44),
    ],
    landscape: [
      pose([c.x + 5.6, 0.85, c.z + 5.6], [c.x, 0.9, c.z], 46),
      pose([c.x + 5.0, 2.7, c.z + 5.3], [c.x, 2.1, c.z], 42),
    ],
  };
}

// ---- beat-wide-reveal: pull back wide, echoes establish -----------------
const WIDE_REVEAL_PORTRAIT: CameraPose[] = [
  pose([-7.5, 14, -17], [-1, 1, 4], 52),
  pose([-8.5, 15, -18], [-1, 1, 3], 52),
];
const WIDE_REVEAL_LANDSCAPE: CameraPose[] = [
  pose([-9.5, 10.5, -13], [-1, 1, 3], 50),
  pose([-10.5, 11, -14], [-1, 1, 2], 50),
];

// ---- finale: widest crane across the whole garden ------------------------
const FINALE_PORTRAIT: CameraPose[] = [pose([9, 13, -10], [0, 1, 0], 50), pose([-9, 13, 10], [0, 1, 0], 50)];
const FINALE_LANDSCAPE: CameraPose[] = [pose([14, 10, -7], [0, 1, 0], 46), pose([-14, 10, 7], [0, 1, 0], 46)];

// ---- replay-choice: hold the finale's resting frame ----------------------
const REPLAY_PORTRAIT: CameraPose[] = [pose([-9, 13, 10], [0, 1, 0], 42)];
const REPLAY_LANDSCAPE: CameraPose[] = [pose([-14, 10, 7], [0, 1, 0], 40)];

export const REVEAL_CLOSE_SEC = REVEAL_STAGE1_SEC + REVEAL_STAGE2_SEC + REVEAL_HOLD_SEC;

export const REVEAL_BEAT_ID_BY_FOUNTAIN: Record<FountainId, string> = {
  'fountain-fan': 'beat-fountain-reveal-fan',
  'fountain-ring': 'beat-fountain-reveal-ring',
  'fountain-crown': 'beat-fountain-reveal-crown',
};

const fan = fanReveal();
const ring = ringReveal();
const crown = crownReveal();

export const CAMERA_BEATS: CinematicBeat[] = [
  {
    id: 'beat-establish',
    phase: 'garden-idle',
    portrait: ESTABLISH_PORTRAIT,
    landscape: ESTABLISH_LANDSCAPE,
    durationSec: GARDEN_IDLE_APPROACH_SEC,
    easing: 'ease-in-out',
  },
  {
    id: 'beat-whistle-cue',
    phase: 'whistle-cue',
    portrait: WHISTLE_CUE_PORTRAIT,
    landscape: WHISTLE_CUE_LANDSCAPE,
    durationSec: 'hold',
    easing: 'ease-out',
  },
  {
    id: 'beat-valve-approach',
    phase: 'valve-approach',
    portrait: VALVE_APPROACH_PORTRAIT,
    landscape: VALVE_APPROACH_LANDSCAPE,
    durationSec: VALVE_APPROACH_SEC,
    easing: 'ease-in-out',
  },
  {
    id: 'beat-valve-macro',
    phase: 'valve-turn',
    portrait: VALVE_MACRO_PORTRAIT,
    landscape: VALVE_MACRO_LANDSCAPE,
    durationSec: 'hold',
    easing: 'linear',
  },
  {
    id: 'beat-pipe-cutaway',
    phase: 'pipe-run',
    portrait: PIPE_CUTAWAY_PORTRAIT,
    landscape: PIPE_CUTAWAY_LANDSCAPE,
    durationSec: PIPE_RUN_BASE_SEC,
    easing: 'linear',
  },
  {
    id: 'beat-fountain-reveal-fan',
    phase: 'fountain-reveal',
    portrait: fan.portrait,
    landscape: fan.landscape,
    durationSec: REVEAL_CLOSE_SEC,
    easing: 'ease-out',
  },
  {
    id: 'beat-fountain-reveal-ring',
    phase: 'fountain-reveal',
    portrait: ring.portrait,
    landscape: ring.landscape,
    durationSec: REVEAL_CLOSE_SEC,
    easing: 'ease-out',
  },
  {
    id: 'beat-fountain-reveal-crown',
    phase: 'fountain-reveal',
    portrait: crown.portrait,
    landscape: crown.landscape,
    durationSec: REVEAL_CLOSE_SEC,
    easing: 'ease-out',
  },
  {
    id: 'beat-wide-reveal',
    phase: 'fountain-reveal',
    portrait: WIDE_REVEAL_PORTRAIT,
    landscape: WIDE_REVEAL_LANDSCAPE,
    durationSec: REVEAL_WIDE_SEC,
    easing: 'ease-in-out',
  },
  {
    id: 'beat-finale',
    phase: 'finale',
    portrait: FINALE_PORTRAIT,
    landscape: FINALE_LANDSCAPE,
    durationSec: FINALE_HOLD_SEC,
    easing: 'ease-in-out',
  },
  {
    id: 'beat-replay',
    phase: 'replay-choice',
    portrait: REPLAY_PORTRAIT,
    landscape: REPLAY_LANDSCAPE,
    durationSec: 'hold',
    easing: 'linear',
  },
];

export function findBeat(id: string): CinematicBeat {
  const beat = CAMERA_BEATS.find((b) => b.id === id);
  if (!beat) throw new Error(`camera/beats.ts: unknown beat id "${id}"`);
  return beat;
}
