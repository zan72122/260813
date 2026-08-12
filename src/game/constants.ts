/**
 * Gameplay-owner-local cinematic timing constants. These govern ONLY the
 * GameController's own internal auto-advance timers (establish hold, leg
 * intro pan, orbit-to-next hold, snap slow-mo, reveal beat spacing, and the
 * final hold before the complete menu). They are deliberately NOT part of
 * the frozen src/contracts/constants.ts TIMING table — that table only
 * names the subset of cinematic durations OTHER owners (render/audio) also
 * need to know about; the remainder are purely an implementation detail of
 * how this controller paces its own internally-generated `advance` intents
 * and are free to tune without touching frozen contracts.
 *
 * Where a duration IS also meaningful to another owner (orbit travel, snap
 * slow-mo, reveal beat spacing/settle), this module reuses the shared
 * contracts/constants.ts TIMING value directly instead of duplicating a
 * second number that could drift out of sync.
 */
import { TIMING } from '../contracts/constants';

/** How long the wide `establish` shot holds before auto-advancing to leg 0's intro (PRODUCT_SPEC ~5s). */
export const ESTABLISH_HOLD_MS = 5000;

/** How long each leg's `intro` camera pan holds before auto-advancing to `sand`. */
export const LEG_INTRO_HOLD_MS = 2200;

/** Camera travel duration between two legs — reuses the shared contract value. */
export const ORBIT_HOLD_MS: number = TIMING.orbitToNextMs;

/** Snap slow-motion + magnetic seat cinematic hold — reuses the shared contract value. */
export const SNAP_HOLD_MS: number = TIMING.snapSlowMoMs;

/** Interval between each of the 4 finalReveal joint-glow beats — reuses the shared contract value. */
export const REVEAL_BEAT_INTERVAL_MS: number = TIMING.revealBeatMs;

/** Pause after the 4th reveal beat before the settle (sink) beat plays — reuses the shared contract value. */
export const REVEAL_SETTLE_HOLD_MS: number = TIMING.revealSettleDelayMs;

/** Final hold (pullback framing) before the GamePhase auto-advances to `complete`. */
export const PULLBACK_HOLD_MS = 1200;

/**
 * All internal cinematic hold durations are multiplied by this factor when
 * `reducedMotion` is set (PRODUCT_SPEC "prefers-reduced-motion対応(カメラ移動を
 * 短縮)"), producing a shorter but still legible cinematic instead of an
 * instant cut that would skip events entirely.
 */
export const REDUCED_MOTION_SCALE = 0.4;
