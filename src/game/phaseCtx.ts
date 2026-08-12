// src/game/phaseCtx.ts — Gameplay owner. Shared per-phase-controller wiring.

import type { AnchorId } from '../contracts/types';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { GameIntent } from './intents';

export interface PhaseCtx {
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
  /** true under ?test=1 — scripted-timing constants should be scaled x0.25. */
  testMode: boolean;
  /** Scales a millisecond duration constant by 0.25 under ?test=1, else identity. */
  scaleMs(ms: number): number;
}

/** A single phase's controller: input routing + passive per-frame update. */
export interface PhaseController {
  /** Called once whenever this phase becomes the active phase (incl. re-entry). */
  enter(): void;
  /** Called every frame while this phase is active. */
  update(dtMs: number): void;
  /** Called for every classified input while this phase is active. */
  onIntent(intent: GameIntent): void;
  /** Anchor to highlight for idle-assist, or undefined if this phase is passive. */
  targetAnchor(): AnchorId | undefined;
}

export function makeScaleMs(testMode: boolean): (ms: number) => number {
  const TEST_TIME_SCALE = 0.25;
  return (ms: number) => (testMode ? ms * TEST_TIME_SCALE : ms);
}
