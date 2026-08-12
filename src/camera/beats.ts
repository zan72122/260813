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
const valvePos = anchors.valve.position;

function pose(position: [number, number, number], lookAt: [number, number, number], fov = 45): CameraPose {
  return { position, lookAt, fov };
}

// ---- garden-idle: wide 3/4 establishing shot, slow pan ----------------
const ESTABLISH_PORTRAIT: CameraPose[] = [
  pose([5, 8, -4], [0, 0, -2], 45),
  pose([4.3, 7.4, -3], [0, 0, 0], 45),
];
const ESTABLISH_LANDSCAPE: CameraPose[] = [
  pose([9, 6, -1], [0, 0, -1], 42),
  pose([8, 5.8, 1], [0, 0, 1], 42),
];

// ---- whistle-cue: foreground whistle, background king approach --------
const WHISTLE_CUE_PORTRAIT: CameraPose[] = [pose([1.0, 1.7, 3.2], [-0.6, 0.7, -1.6], 50)];
const WHISTLE_CUE_LANDSCAPE: CameraPose[] = [pose([2.0, 1.6, 3.0], [-0.8, 0.7, -1.6], 46)];

// ---- valve-approach: one continuous dolly from whistle framing --------
const VALVE_MACRO_PORTRAIT_POSE = pose(
  [valvePos.x + 1.1, 1.0, valvePos.z + 1.3],
  [valvePos.x, 0.7, valvePos.z],
  38,
);
const VALVE_MACRO_LANDSCAPE_POSE = pose(
  [valvePos.x + 1.4, 0.9, valvePos.z + 1.0],
  [valvePos.x, 0.65, valvePos.z],
  36,
);
const VALVE_APPROACH_PORTRAIT: CameraPose[] = [WHISTLE_CUE_PORTRAIT[0]!, VALVE_MACRO_PORTRAIT_POSE];
const VALVE_APPROACH_LANDSCAPE: CameraPose[] = [WHISTLE_CUE_LANDSCAPE[0]!, VALVE_MACRO_LANDSCAPE_POSE];

// ---- valve-turn: macro on valve head + wrench --------------------------
const VALVE_MACRO_PORTRAIT: CameraPose[] = [VALVE_MACRO_PORTRAIT_POSE];
const VALVE_MACRO_LANDSCAPE: CameraPose[] = [VALVE_MACRO_LANDSCAPE_POSE];

// ---- pipe-run: nominal data (actual playback follows water-progress t
// along the pipe curve — see PIPE_CAMERA_OFFSETS + player.ts) -----------
const PIPE_CUTAWAY_PORTRAIT: CameraPose[] = [pose([valvePos.x, -0.6, valvePos.z], [valvePos.x, -1.2, valvePos.z], 55)];
const PIPE_CUTAWAY_LANDSCAPE: CameraPose[] = [pose([valvePos.x, -0.9, valvePos.z], [valvePos.x, -1.2, valvePos.z], 60)];

/** Camera offset from the water blob's curve point, per orientation. Portrait
 * emphasizes the vertical plunge (storyboard: "縦画面: 地上→地下→地上"),
 * landscape emphasizes the horizontal run. */
export const PIPE_CAMERA_OFFSETS = {
  portrait: { above: 1.1, side: 0.3, lookAhead: 0.12 },
  landscape: { above: 0.6, side: 1.3, lookAhead: 0.15 },
} as const;

// ---- fountain-reveal (close): per fountain, differentiated angle/motion --
function fanReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-fan'].center;
  return {
    portrait: [pose([c.x, 0.35, c.z + 1.2], [c.x, 1.2, c.z], 55), pose([c.x, 0.55, c.z + 1.0], [c.x, 1.6, c.z], 50)],
    landscape: [
      pose([c.x + 1.8, 0.4, c.z + 1.0], [c.x, 1.1, c.z], 50),
      pose([c.x + 1.6, 0.6, c.z + 0.8], [c.x, 1.5, c.z], 46),
    ],
  };
}

function ringReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-ring'].center;
  // "円環の外周を軽く回り込む" — a light orbit around the rim.
  return {
    portrait: [pose([c.x + 1.6, 0.4, c.z + 1.0], [c.x, 0.6, c.z], 50), pose([c.x - 1.0, 0.5, c.z + 1.6], [c.x, 0.7, c.z], 48)],
    landscape: [pose([c.x + 2.0, 0.45, c.z + 0.6], [c.x, 0.6, c.z], 46), pose([c.x - 1.2, 0.55, c.z + 1.6], [c.x, 0.7, c.z], 44)],
  };
}

function crownReveal(): { portrait: CameraPose[]; landscape: CameraPose[] } {
  const c = anchors.fountains['fountain-crown'].center;
  // "中央噴流の立ち上がりを縦に追う" — camera rises with the central jet.
  return {
    portrait: [pose([c.x, 0.3, c.z + 2.2], [c.x, 0.5, c.z], 50), pose([c.x, 2.4, c.z + 2.6], [c.x, 2.0, c.z], 44)],
    landscape: [pose([c.x + 2.0, 0.4, c.z + 2.3], [c.x, 0.6, c.z], 46), pose([c.x + 2.0, 2.2, c.z + 2.6], [c.x, 2.0, c.z], 42)],
  };
}

// ---- beat-wide-reveal: pull back wide, echoes establish ----------------
const WIDE_REVEAL_PORTRAIT: CameraPose[] = [pose([4.3, 7.4, -3], [0, 0, 0], 46), pose([5, 8, -4], [0, 0, -2], 45)];
const WIDE_REVEAL_LANDSCAPE: CameraPose[] = [pose([8, 5.8, 1], [0, 0, 1], 42), pose([9, 6, -1], [0, 0, -1], 42)];

// ---- finale: widest crane across the whole garden -----------------------
const FINALE_PORTRAIT: CameraPose[] = [pose([6, 9, -6], [0, 0, 0], 48), pose([-6, 9, 6], [0, 0, 0], 48)];
const FINALE_LANDSCAPE: CameraPose[] = [pose([10, 7, -3], [0, 0, 0], 44), pose([-10, 7, 3], [0, 0, 0], 44)];

// ---- replay-choice: hold the finale's resting frame ---------------------
const REPLAY_PORTRAIT: CameraPose[] = [pose([-6, 9, 6], [0, 0, 0], 40)];
const REPLAY_LANDSCAPE: CameraPose[] = [pose([-10, 7, 3], [0, 0, 0], 38)];

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
