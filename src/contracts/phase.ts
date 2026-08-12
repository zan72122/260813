// src/contracts/phase.ts
// Game phase state machine + fountain identifiers.
// Owned by Integrator. Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

export type GamePhase =
  | 'title'
  | 'garden-idle'
  | 'whistle-cue'
  | 'valve-approach'
  | 'valve-turn'
  | 'pipe-run'
  | 'fountain-reveal'
  | 'finale'
  | 'replay-choice';

export type FountainId = 'fountain-fan' | 'fountain-ring' | 'fountain-crown';

/** Ordered list of all phases, useful for skeleton state machines / tests. */
export const ALL_GAME_PHASES: readonly GamePhase[] = [
  'title',
  'garden-idle',
  'whistle-cue',
  'valve-approach',
  'valve-turn',
  'pipe-run',
  'fountain-reveal',
  'finale',
  'replay-choice',
];

/** Ordered list of all fountains, in play order. */
export const ALL_FOUNTAIN_IDS: readonly FountainId[] = [
  'fountain-fan',
  'fountain-ring',
  'fountain-crown',
];
