// src/game/index.ts — Gameplay module (owner: Gameplay, src/game/**, src/input/**).
// Wave 2 note: MINIMAL-BUT-FUNCTIONAL skeleton — only auto-advances
// opening -> hookDown after its dwell time so the loop is not stuck.
// Wave 3b Gameplay replaces internals but MUST keep createGame()'s shape.

import { advance } from '../contracts/machine';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';

export interface GameHandle {
  update(dtMs: number): void;
  dispose(): void;
}

const OPENING_DURATION_MS = 2500;
/** ?test=1 shortens scripted-timing animations to 25% (PRODUCT_SPEC/contract). */
const TEST_TIME_SCALE = 0.25;

export function createGame(o: {
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
  element: HTMLElement;
}): GameHandle {
  const { store, bus } = o;

  const testMode = new URLSearchParams(window.location.search).get('test') === '1';
  const openingDuration = testMode ? OPENING_DURATION_MS * TEST_TIME_SCALE : OPENING_DURATION_MS;

  let openingElapsedMs = 0;

  const unsubscribe = bus.on('phase:enter', (payload) => {
    if (payload.phase === 'opening') openingElapsedMs = 0;
  });

  function update(dtMs: number): void {
    const { phase } = store.get();
    if (phase === 'opening') {
      openingElapsedMs += dtMs;
      if (openingElapsedMs >= openingDuration) {
        advance(store, bus, 'hookDown');
      }
    }
  }

  function dispose(): void {
    unsubscribe();
  }

  return { update, dispose };
}
