/**
 * Frozen numeric + palette constants shared by every subsystem.
 *
 * Source of truth: docs/MATH_CONTRACT.md (§1 track, §2 drive pipeline,
 * §3 leveling, §4 interior indicators, §5 motion feel, §6 numeric hygiene,
 * §7 test tolerances) and docs/VISUAL_ACCEPTANCE.md (palette anchors).
 *
 * This module has ZERO side effects and ZERO imports: plain numbers,
 * strings and readonly tuples only. It never changes after Wave 2 (see
 * docs/ARCHITECTURE_CONTRACT.md "Freeze rules").
 */

// ---------------------------------------------------------------------------
// §1 Track geometry (src/game/track.ts consumes these)
// ---------------------------------------------------------------------------

/** Lower-run inclination from horizontal, degrees. MATH_CONTRACT §1. */
export const THETA_LOWER_DEG = 54;
/** Upper-run inclination from horizontal, degrees. MATH_CONTRACT §1. */
export const THETA_UPPER_DEG = 74;
/** Lower-run inclination from horizontal, radians. */
export const THETA_LOWER_RAD = (THETA_LOWER_DEG * Math.PI) / 180;
/** Upper-run inclination from horizontal, radians. */
export const THETA_UPPER_RAD = (THETA_UPPER_DEG * Math.PI) / 180;

/** Total analytic track arc length, meters. */
export const TRACK_LENGTH = 128;
/** Arc length (meters) where the blend curvature begins. */
export const BLEND_START_S = 70;
/** Arc length (meters) where THETA_UPPER is reached. */
export const BLEND_END_S = 86;
/** Arc length of the ground-floor station portal. */
export const STATION_BOTTOM_S = 0;
/** Arc length of the second-floor station platform. */
export const STATION_TOP_S = TRACK_LENGTH;

// ---------------------------------------------------------------------------
// §2 Drive pipeline (single source of motion)
// valveOpen -> pistonSpeed -> pistonDisplacement -> cableTravel -> (s, phi)
// ---------------------------------------------------------------------------

/** Full piston stroke, meters. `pistonDisplacement p ∈ [0, PISTON_STROKE]`. */
export const PISTON_STROKE = 16;
/** Cable travel per meter of piston displacement: `c = MECH_ADVANTAGE * p`. */
export const MECH_ADVANTAGE = 8;
/** Big pulley radius, meters: `pulleyAngle φ = c / PULLEY_RADIUS`. */
export const PULLEY_RADIUS = 1.1;

/**
 * Piston speed at full throttle (valveOpen = 1), meters/second of piston
 * travel. Sized so a full stroke (0 -> PISTON_STROKE) takes ~45s, which
 * yields the ~2.9 m/s cabin/carrier arc-length speed MATH_CONTRACT §5 calls
 * out (`MECH_ADVANTAGE * PISTON_MAX_SPEED` ≈ 2.844 m/s).
 */
export const PISTON_MAX_SPEED = PISTON_STROKE / 45;
/** Carrier/cabin arc-length speed at full throttle, meters/second. */
export const CARRIER_MAX_SPEED = MECH_ADVANTAGE * PISTON_MAX_SPEED;
/** Acceleration limit on carrier arc-length speed, m/s². MATH_CONTRACT §5. */
export const CARRIER_ACCEL_LIMIT = 1.2;
/** Target duration to ease fully to a stop after input release, seconds. */
export const RELEASE_EASE_DURATION_S = 1;

// ---------------------------------------------------------------------------
// §3 Leveling (carrier/cabin residual tilt error dynamics)
// ---------------------------------------------------------------------------

/** Critically-damped convergence time constant for residual tilt error e. */
export const TAU_ASSIST = 0.8;
/** Max convergence-rate multiplier the player's level-wheel input grants. */
export const LEVEL_ASSIST_BOOST_MAX = 3;
/** Magnetic snap band half-width for the level wheel, degrees (|e| < this). */
export const LEVEL_SNAP_BAND_DEG = 6;
/** Guaranteed settle time for the transition assist with zero input, sec. */
export const LEVEL_ASSIST_SETTLE_S = 3;
/** Residual error considered "settled" once assist has run, degrees. */
export const LEVEL_ASSIST_SETTLE_ERROR_DEG = 0.25;

// ---------------------------------------------------------------------------
// Clamps & steady-state invariants (child-safety: water never spills)
// ---------------------------------------------------------------------------

/** Hard clamp on cabin world tilt at ALL times, degrees. Never exceeded. */
export const CABIN_MAX_WORLD_TILT_DEG = 8;
/** Cabin world tilt considered steady once theta has been constant this long, sec. */
export const CABIN_STEADY_HOLD_S = 2;
/** Cabin world tilt bound once steady (theta constant ≥ CABIN_STEADY_HOLD_S). */
export const CABIN_STEADY_TILT_DEG = 1;

// ---------------------------------------------------------------------------
// §4 Interior indicators (water tank, hanging lamp, ball)
// ---------------------------------------------------------------------------

/** Max water-surface slosh angle, degrees. */
export const WATER_SLOSH_MAX_DEG = 4;
/** Water slosh considered settled below this angle, degrees. */
export const WATER_SLOSH_SETTLE_DEG = 0.5;
/** Water slosh settle time budget, seconds. */
export const WATER_SLOSH_SETTLE_S = 1.5;
/** Max hanging-lamp pendulum swing, degrees. */
export const LAMP_SWING_MAX_DEG = 10;

// ---------------------------------------------------------------------------
// §6 Determinism & numeric hygiene
// ---------------------------------------------------------------------------

/** Fixed simulation step, seconds (60 Hz). All gameplay math advances only here. */
export const SIM_DT = 1 / 60;

// ---------------------------------------------------------------------------
// §7 Test tolerances (Vitest)
// ---------------------------------------------------------------------------

/** Relative tolerance for the drive-pipeline identities (c = 8p, φ = c/r). */
export const TOLERANCE_DRIVE_RELATIVE = 1e-9;
/** Absolute tolerance for tangent continuity at track joints. */
export const TOLERANCE_TANGENT_CONTINUITY = 1e-9;
/** Absolute tolerance for full-cycle replay reset of drive scalars. */
export const TOLERANCE_REPLAY_RESET = 1e-9;
/** Absolute tolerance for 20-cycle drift of (p, c, s, φ, e). */
export const TOLERANCE_CYCLE_DRIFT = 1e-6;

// ---------------------------------------------------------------------------
// Rendering / performance quality tiers (docs/PERFORMANCE_BUDGET.md)
// ---------------------------------------------------------------------------

export type QualityTier = 'high' | 'medium' | 'low';
export const QUALITY_TIERS: readonly QualityTier[] = ['high', 'medium', 'low'] as const;

/** Device pixel ratio cap per tier. */
export const DPR_CAP_HIGH = 2;
export const DPR_CAP_LOW = 1.5;

// ---------------------------------------------------------------------------
// Palette anchors (docs/VISUAL_ACCEPTANCE.md) — museum cutaway model art
// direction. Hex strings so any subsystem (canvas textures, CSS, three.js
// materials via `new Color(hex)`) can consume them without conversion.
// ---------------------------------------------------------------------------

export const PALETTE = {
  /** Dark iron lattice — near-black warm grey. */
  iron: '#2b2b30',
  /** Polished brass accents on valve wheels / piston collars. */
  brass: '#b08d3f',
  /** Historic yellow passenger cabin ochre. */
  cabinOchre: '#e0a83c',
  /** Water tank / sight-glass fluid — friendly teal-blue. */
  waterTeal: '#3fa8b8',
  /** Paris sky gradient — zenith (pale blue-grey). */
  skyZenith: '#cfd8e3',
  /** Paris sky gradient — horizon (warm pale cream). */
  skyHorizon: '#f2e8d8',
  /** Underground machine-room lamplight glow. */
  undergroundLamplight: '#ffb36b',
} as const;

export type PaletteKey = keyof typeof PALETTE;
