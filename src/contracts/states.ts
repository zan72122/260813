/**
 * Game state machine ids and transition event names.
 * Source of truth: docs/PRODUCT_SPEC.md "Game flow (states)" table and
 * docs/ARCHITECTURE_CONTRACT.md "State machine". Implemented in
 * `src/game/stateMachine.ts` (Wave 3); every id must be reachable directly
 * via `__eiffel.gotoState(id)` for e2e.
 */

export type GameStateId =
  | 'boot'
  | 'attract'
  | 'machineRoom'
  | 'cableFollow'
  | 'ascendLower'
  | 'transition'
  | 'ascendUpper'
  | 'arrival'
  | 'celebrate'
  | 'replayMenu'
  | 'descend'
  | 'pause';

/** All state ids, in the canonical PRODUCT_SPEC flow order. */
export const GAME_STATE_IDS: readonly GameStateId[] = [
  'boot',
  'attract',
  'machineRoom',
  'cableFollow',
  'ascendLower',
  'transition',
  'ascendUpper',
  'arrival',
  'celebrate',
  'replayMenu',
  'descend',
  'pause',
] as const;

/**
 * Named transition events the state machine reacts to. Re-entrant firing of
 * the event driving the currently-active transition tween is a no-op (no
 * double-fire) per ARCHITECTURE_CONTRACT.
 */
export type GameTransitionEventId =
  /** boot -> attract, once the first frame has rendered. */
  | 'BOOT_READY'
  /** attract -> machineRoom, tap anywhere. */
  | 'BEGIN'
  /** machineRoom -> cableFollow, master lever opened the valve. */
  | 'VALVE_OPENED'
  /** cableFollow -> ascendLower, the causality-chain camera move finished. */
  | 'CABLE_FOLLOW_DONE'
  /** ascendLower -> transition, arc length reached BLEND_START_S. */
  | 'SLOPE_REACHED'
  /** transition -> ascendUpper, cabin leveled and arc length reached BLEND_END_S. */
  | 'LEVELED'
  /** ascendUpper -> arrival, arc length reached STATION_TOP_S. */
  | 'UPPER_ARRIVED'
  /** arrival -> celebrate, doors-open reveal beat finished. */
  | 'CELEBRATE'
  /** celebrate -> replayMenu, sparkle beat finished. */
  | 'MENU_READY'
  /** replayMenu -> ascendLower, "ride again ▲" tile. */
  | 'REPLAY_ASCEND'
  /** replayMenu -> descend, "ride down ▼" tile. */
  | 'REPLAY_DESCEND'
  /** replayMenu -> machineRoom, "machine-room free play" tile. */
  | 'REPLAY_MACHINE_ROOM'
  /** replayMenu -> transition, "slope-change replay" tile (2-tap reachable). */
  | 'REPLAY_TRANSITION'
  /** descend -> replayMenu, arc length reached STATION_BOTTOM_S. */
  | 'DESCEND_ARRIVED'
  /** any state -> pause, reachable anytime. */
  | 'PAUSE'
  /** pause -> the state paused from, resume restores exactly. */
  | 'RESUME';
