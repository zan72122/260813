// src/game/phases/sling.ts — Gameplay owner.
// A single tap on the sling clasp releases it; brief cable-slack beat, then climb.

import { anchorAllows } from '../anchorUtil';
import { SLING_CLASP_PAD, SLING_SLACK_MS } from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createSlingController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let awaitingAdvance = false;
  let slackMs = 0;

  return {
    enter(): void {
      awaitingAdvance = false;
      slackMs = 0;
    },
    onIntent(intent): void {
      if (awaitingAdvance || intent.kind !== 'tap') return;
      if (!anchorAllows(ctx.anchors, 'slingClasp', intent.x, intent.y, SLING_CLASP_PAD)) return;
      ctx.store.set({ sling: { released: true } });
      ctx.bus.emit('sling:released', {});
      awaitingAdvance = true;
      slackMs = 0;
    },
    update(dtMs): void {
      if (!awaitingAdvance) return;
      slackMs += dtMs;
      if (slackMs >= ctx.scaleMs(SLING_SLACK_MS)) {
        awaitingAdvance = false;
        advance('climb');
      }
    },
    targetAnchor(): 'slingClasp' {
      return 'slingClasp';
    },
  };
}
