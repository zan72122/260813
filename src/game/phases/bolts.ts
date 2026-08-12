// src/game/phases/bolts.ts — Gameplay owner.
// Drag each oversized bolt from the tray toward its hole; released far away
// glides gently back (no state change, no penalty). Either order.

import { withinAnchor } from '../anchorUtil';
import { BOLT_HIT_PADDING, HOLE_SNAP_R } from '../constants';
import type { AnchorId, GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

type BoltIndex = 0 | 1;

export function createBoltsController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let dragging: BoltIndex | null = null;

  function pickBolt(x: number, y: number): BoltIndex | null {
    const state = ctx.store.get();
    const b0 = ctx.anchors.get('bolt0');
    const b1 = ctx.anchors.get('bolt1');
    if (!b0 && !b1) {
      // No anchors published yet: grab the first unseated bolt so the verb
      // never dead-ends while the renderer is still coming online.
      if (!state.bolts[0]) return 0;
      if (!state.bolts[1]) return 1;
      return null;
    }
    if (!state.bolts[0] && b0 && b0.active && withinAnchor(x, y, b0, BOLT_HIT_PADDING)) return 0;
    if (!state.bolts[1] && b1 && b1.active && withinAnchor(x, y, b1, BOLT_HIT_PADDING)) return 1;
    return null;
  }

  function tryToSeat(index: BoltIndex, x: number, y: number): void {
    const holeId: AnchorId = index === 0 ? 'hole0' : 'hole1';
    const hole = ctx.anchors.get(holeId);
    const seated = hole && hole.active ? withinAnchor(x, y, hole, HOLE_SNAP_R) : true;
    if (!seated) return;

    ctx.store.update((s) => {
      const bolts: [boolean, boolean] = [s.bolts[0], s.bolts[1]];
      bolts[index] = true;
      return { bolts };
    });
    ctx.bus.emit('bolt:seated', { index });

    const state = ctx.store.get();
    if (state.bolts[0] && state.bolts[1]) advance('rivetHeat');
  }

  return {
    enter(): void {
      dragging = null;
    },
    onIntent(intent): void {
      if (intent.kind === 'down') {
        dragging = pickBolt(intent.x, intent.y);
        return;
      }
      if (intent.kind === 'up') {
        if (dragging !== null) {
          const index = dragging;
          dragging = null;
          tryToSeat(index, intent.x, intent.y);
        }
        return;
      }
      if (intent.kind === 'cancel') {
        dragging = null;
      }
    },
    update(): void {
      // No passive behavior — bolts only move on drag.
    },
    targetAnchor(): AnchorId {
      const state = ctx.store.get();
      return !state.bolts[0] ? 'hole0' : 'hole1';
    },
  };
}
