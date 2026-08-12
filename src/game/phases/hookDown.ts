// src/game/phases/hookDown.ts — Gameplay owner.
// Vertical drag ANYWHERE lowers/raises the hook. Near the beam's top -> magnetic
// attach, brief attach beat, then auto-advance. No failure possible.

import { clamp, dist } from '../math';
import {
  HOOK_ATTACH_BEAT_MS,
  HOOK_DRAG_RANGE_PX,
  HOOK_FALLBACK_DEPTH,
  HOOK_FINGER_OFFSET_Y,
  HOOK_SNAP_PADDING,
} from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createHookDownController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let attachTimerMs = 0;
  let awaitingAdvance = false;

  return {
    enter(): void {
      attachTimerMs = 0;
      awaitingAdvance = false;
    },
    onIntent(intent): void {
      const state = ctx.store.get();
      if (state.hook.attached || intent.kind !== 'move') return;

      const depth = clamp(state.hook.depth + intent.dy / HOOK_DRAG_RANGE_PX, 0, 1);

      const hookScreenY = intent.y - HOOK_FINGER_OFFSET_Y;
      const beam = ctx.anchors.get('beam');
      let attached: boolean;
      if (beam && beam.active) {
        attached = dist(intent.x, hookScreenY, beam.x, beam.y) <= beam.r + HOOK_SNAP_PADDING;
      } else {
        // No 'beam' anchor published yet — fall back to a depth threshold so
        // the verb can still complete (soft-lock prevention).
        attached = depth >= HOOK_FALLBACK_DEPTH;
      }

      ctx.store.set({ hook: { depth, attached } });

      if (attached) {
        ctx.bus.emit('snap:hook', {});
        awaitingAdvance = true;
        attachTimerMs = 0;
      }
    },
    update(dtMs): void {
      if (!awaitingAdvance) return;
      attachTimerMs += dtMs;
      if (attachTimerMs >= ctx.scaleMs(HOOK_ATTACH_BEAT_MS)) {
        awaitingAdvance = false;
        advance('hoist');
      }
    },
    targetAnchor(): 'beam' {
      return 'beam';
    },
  };
}
