/**
 * Cross-subsystem communication channel #1: the single source of truth.
 * Plain-data snapshot, observable via `subscribe`. Only the gameplay/math
 * subsystem (`src/game/**`) may mutate it — see `MutableGameStore`.
 */

import type { QualityTier } from './constants.ts';
import type { GameStateId } from './states.ts';

/**
 * A complete, immutable snapshot of simulation state at one instant.
 * Every field is a plain number/string/boolean — no class instances, no
 * three.js types — so it can cross subsystem boundaries freely and be
 * captured/replayed/diffed trivially in tests.
 */
export interface GameSnapshot {
  /** Valve openness driving the pistons, `[0, 1]`. */
  readonly valveOpen: number;
  /** Drive direction: -1 descending, 0 idle, 1 ascending. */
  readonly direction: -1 | 0 | 1;
  /** Piston displacement `p`, meters, `[0, PISTON_STROKE]`. */
  readonly pistonDisplacement: number;
  /** Cable travel `c = MECH_ADVANTAGE * p`, meters. */
  readonly cableTravel: number;
  /** Carrier arc length along the track, meters, `[0, TRACK_LENGTH]`. */
  readonly arcLength: number;
  /** Normalized arc length, `arcLength / TRACK_LENGTH`, `[0, 1]`. */
  readonly t: number;
  /** Track inclination at the current arc length, degrees. */
  readonly thetaDeg: number;
  /** Carrier world rotation about +Z, degrees. */
  readonly carrierAngleDeg: number;
  /** Residual cabin leveling error `e`, degrees (signed). */
  readonly cabinTiltErrorDeg: number;
  /** Resulting cabin world tilt, degrees (signed, `|.| <= CABIN_MAX_WORLD_TILT_DEG`). */
  readonly cabinWorldTiltDeg: number;
  /** Carrier arc-length speed `ds/dt`, meters/second. */
  readonly speed: number;
  /** Active state-machine state. */
  readonly state: GameStateId;
  /** Deterministic-mode PRNG seed (mulberry32). */
  readonly seed: number;
  /** Active render/quality tier. */
  readonly quality: QualityTier;
  /** Whether sound output is enabled (persisted setting). */
  readonly soundOn: boolean;
  /** Mirrors `prefers-reduced-motion`. */
  readonly reducedMotion: boolean;
  /** Whether the simulation clock is currently paused. */
  readonly paused: boolean;
}

export type GameStoreListener = (snapshot: GameSnapshot) => void;

/** Read + observe surface available to every subsystem. */
export interface GameStore {
  /** Current snapshot (synchronous, always defined). */
  get(): GameSnapshot;
  /** Subscribe to every snapshot change; returns an unsubscribe function. */
  subscribe(listener: GameStoreListener): () => void;
}

/**
 * Mutation surface reserved for the gameplay/math subsystem. No other
 * subsystem may hold or call this — see ARCHITECTURE_CONTRACT "Dependency
 * rule": all cross-subsystem communication is one-directional through the
 * store's read surface plus the EventBus.
 */
export interface MutableGameStore extends GameStore {
  /** Shallow-merge a partial update into the current snapshot. */
  set(patch: Partial<GameSnapshot>): void;
  /** Replace the entire snapshot (e.g. on `reset`/`gotoState`). */
  replace(snapshot: GameSnapshot): void;
}
