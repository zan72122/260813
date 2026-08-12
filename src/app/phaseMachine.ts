// src/app/phaseMachine.ts
// GamePhase state machine skeleton. Wave 1 only advances title -> garden-idle on
// the first tap intent (to prove the bus wiring end-to-end); Worker A
// (src/game/**) owns the real phase transition logic for the rest of the loop.
// Owned by Integrator (src/app/**).

import { ALL_GAME_PHASES, type EventBus, type FountainId, type GamePhase } from '../contracts';

export interface PhaseMachine {
  getPhase(): GamePhase;
  getFountain(): FountainId | null;
  /** Force a transition and broadcast it. Intended for workers/tests, not UI code. */
  setPhase(phase: GamePhase, fountain?: FountainId | null): void;
  dispose(): void;
}

export function isGamePhase(value: string): value is GamePhase {
  return (ALL_GAME_PHASES as readonly string[]).includes(value);
}

export function createPhaseMachine(bus: EventBus, initial: GamePhase = 'title'): PhaseMachine {
  let phase: GamePhase = initial;
  let fountain: FountainId | null = null;

  function setPhase(next: GamePhase, nextFountain: FountainId | null = fountain): void {
    phase = next;
    fountain = nextFountain;
    bus.emitEvent({ kind: 'phase-changed', phase, fountain });
  }

  // Skeleton transition: a tap during 'title' unlocks audio + starts the loop.
  // Real gameplay transitions (whistle-cue -> valve-approach -> ... ) are owned
  // by Worker A and should subscribe to intents/events themselves.
  const unsubscribe = bus.onIntent((intent) => {
    if (intent.kind === 'tap' && phase === 'title') {
      setPhase('garden-idle');
    }
  });

  // Announce the initial phase so subscribers set up before this call observe it.
  bus.emitEvent({ kind: 'phase-changed', phase, fountain });

  return {
    getPhase: () => phase,
    getFountain: () => fountain,
    setPhase,
    dispose: () => {
      unsubscribe();
    },
  };
}
