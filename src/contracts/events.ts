// src/contracts/events.ts
// Published by the game layer (gameplay-camera owner: src/game/**), consumed by
// render/audio/UI layers. Do not edit outside src/contracts/**.

import type { FountainId, GamePhase } from './phase';

/** Game events broadcast from game logic toward rendering / audio / UI. */
export type GameEvent =
  | { kind: 'phase-changed'; phase: GamePhase; fountain: FountainId | null }
  | { kind: 'whistle-blown' }
  | {
      kind: 'valve-progress';
      openness: number; // 0..1 monotonically increasing
      angularVelocityRadPerSec: number;
    }
  | { kind: 'valve-opened'; fountain: FountainId }
  | { kind: 'water-progress'; t: number; fountain: FountainId } // position in pipe 0..1
  | { kind: 'water-arrived'; fountain: FountainId }
  | { kind: 'fountain-flow'; fountain: FountainId; intensity: number } // 0..1
  | { kind: 'finale-started' }
  | { kind: 'loop-completed' }
  | { kind: 'hint'; target: 'whistle' | 'valve' | 'choice' }; // fires after 3-5s idle
