// src/game/index.ts — Gameplay module (owner: Gameplay, src/game/**, src/input/**).
// createGame()'s shape is the frozen contract (see docs/ARCHITECTURE_CONTRACT.md);
// everything else here is free to evolve. Real work lives in ./logic.ts
// (DOM-free, directly unit-testable) and ../input (DOM pointer plumbing).

import { createGameLogic } from './logic';
import { createPointerInput } from '../input';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';

export interface GameHandle {
  update(dtMs: number): void;
  dispose(): void;
}

export function createGame(o: {
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
  element: HTMLElement;
}): GameHandle {
  const { store, bus, anchors, element } = o;

  const testMode = new URLSearchParams(window.location.search).get('test') === '1';
  const logic = createGameLogic({ store, bus, anchors, testMode });
  const input = createPointerInput({ element, onIntent: logic.handleIntent });

  function update(dtMs: number): void {
    logic.update(dtMs);
  }

  function dispose(): void {
    input.dispose();
    logic.dispose();
  }

  return { update, dispose };
}
