// src/game/phases/opening.ts — Gameplay owner.
// Establish shot: auto-advances after a dwell; any touch skips it immediately.

import { OPENING_DURATION_MS } from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createOpeningController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let elapsedMs = 0;
  let done = false;

  function finish(): void {
    if (done) return;
    done = true;
    advance('hookDown');
  }

  return {
    enter(): void {
      elapsedMs = 0;
      done = false;
    },
    onIntent(intent): void {
      // "待つ/タップでスキップ" — any touch-down skips immediately (age-4: no
      // need to wait for a clean tap classification to feel responsive).
      if (intent.kind === 'down' || intent.kind === 'tap') finish();
    },
    update(dtMs): void {
      elapsedMs += dtMs;
      if (elapsedMs >= ctx.scaleMs(OPENING_DURATION_MS)) finish();
    },
    targetAnchor(): undefined {
      return undefined;
    },
  };
}
