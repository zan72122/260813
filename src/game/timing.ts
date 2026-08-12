// src/game/timing.ts
// Canonical pacing constants shared across the game director, the camera beat
// player, and the garden scene's procession animation. Keeping a single
// source of truth here means the ~2.2s valve-approach dolly (camera/beats.ts)
// and the game phase auto-transition that follows it never drift apart.
//
// Owned by Worker A (gameplay-camera). Not part of src/contracts/** — this is
// plain shared configuration within our own owned trees (src/game, src/scenes,
// src/camera), not a cross-worker runtime channel.

/** Seconds the king's procession spends walking up to each fountain stop. */
export const GARDEN_IDLE_APPROACH_SEC = 4.5;

/** Continuous dolly from the whistle-cue framing into the valve macro shot. */
export const VALVE_APPROACH_SEC = 2.2;

/** Baseline pipe-run travel time, before adjusting for the player's average
 * valve-turn speed (faster turning => faster water => shorter travel time). */
export const PIPE_RUN_BASE_SEC = 3.0;
export const PIPE_RUN_MIN_SEC = 1.8;
export const PIPE_RUN_MAX_SEC = 4.5;
/** Reference average angular velocity (rad/s) used to normalize pipe speed. */
export const PIPE_RUN_REFERENCE_ANGULAR_VELOCITY = 3.0;

/** fountain-reveal envelope: single jet -> full shape -> hold. */
export const REVEAL_STAGE1_SEC = 0.5; // single jet rises
export const REVEAL_STAGE2_SEC = 1.0; // opens to full shape
export const REVEAL_HOLD_SEC = 1.6; // must be >= 1.5s per MASTER_SPEC
export const REVEAL_WIDE_SEC = 2.5; // pull back to wide (beat-wide-reveal)
export const REVEAL_TOTAL_SEC =
  REVEAL_STAGE1_SEC + REVEAL_STAGE2_SEC + REVEAL_HOLD_SEC + REVEAL_WIDE_SEC;

/** finale: all three fountains at once, held per storyboard (6-8s). */
export const FINALE_HOLD_SEC = 7;

/** Idle-hint timing: 3-5s of no relevant input fires a non-verbal hint. */
export const HINT_MIN_SEC = 3;
export const HINT_MAX_SEC = 5;

/** Total wrench rotation (in full turns) mapped across openness 0..1, per
 * CONTRACTS.md: "レンチ回転角 = openness*2.5回転相当". */
export const VALVE_TOTAL_TURNS = 2.5;
export const VALVE_TOTAL_RADIANS = VALVE_TOTAL_TURNS * Math.PI * 2;

/** Low-pass smoothing factor for angular velocity (per received sample). */
export const VALVE_VELOCITY_SMOOTHING = 0.3;
/** Exponential decay time-constant (s) applied to filtered velocity when no
 * valve-rotate intents arrive — models "finger stops -> wrench stops". */
export const VALVE_VELOCITY_DECAY_TAU = 0.12;
