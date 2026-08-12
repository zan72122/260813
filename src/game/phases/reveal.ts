// src/game/phases/reveal.ts — Gameplay owner.
// Passive camera pull ("見る"). towerLevel was already bumped by the machine's
// PHASE_RESET on entering this phase; we just hold, then hand off to complete.

import { REVEAL_DURATION_MS } from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createRevealController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let elapsedMs = 0;
  let advanced = false;

  return {
    enter(): void {
      elapsedMs = 0;
      advanced = false;
    },
    onIntent(): void {
      // Passive — input during the reveal camera pull is ignored, not an error.
    },
    update(dtMs): void {
      if (advanced) return;
      elapsedMs += dtMs;
      if (elapsedMs >= ctx.scaleMs(REVEAL_DURATION_MS)) {
        advanced = true;
        ctx.bus.emit('reveal:done', {});
        advance('complete');
      }
    },
    targetAnchor(): undefined {
      return undefined;
    },
  };
}
