// src/game/phases/align.ts — Gameplay owner.
// Drag moves the beam (dx,dy) toward the ghost silhouette; approach gain
// decelerates near the target; snapping within a very generous radius holds
// success for >=1s before advancing.

import { approachGain } from '../math';
import { ALIGN_FALLBACK_TARGET, ALIGN_HOLD_MS, ALIGN_SNAP_FALLBACK_R, ALIGN_SNAP_RATIO } from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createAlignController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let target = { x: ALIGN_FALLBACK_TARGET.x, y: ALIGN_FALLBACK_TARGET.y };
  let captured = false;
  let holding = false;
  let holdMs = 0;

  function captureTarget(): void {
    const beam = ctx.anchors.get('beam');
    const ghost = ctx.anchors.get('ghost');
    if (beam && ghost && beam.active && ghost.active) {
      target = { x: ghost.x - beam.x, y: ghost.y - beam.y };
    } else {
      target = { x: ALIGN_FALLBACK_TARGET.x, y: ALIGN_FALLBACK_TARGET.y };
    }
    captured = true;
  }

  function snapRadius(): number {
    const ghost = ctx.anchors.get('ghost');
    if (ghost && ghost.active) return ghost.r * ALIGN_SNAP_RATIO;
    return ALIGN_SNAP_FALLBACK_R;
  }

  return {
    enter(): void {
      captured = false;
      holding = false;
      holdMs = 0;
    },
    onIntent(intent): void {
      const state = ctx.store.get();
      if (state.align.snapped || intent.kind !== 'move') return;

      // Captured lazily on the first real drag input rather than at phase
      // entry: the renderer publishes anchors on its own rAF cadence, which
      // may not have produced a fresh 'beam'/'ghost' pair in the same tick
      // the phase transition happened. By the time the child actually
      // touches the screen, the anchors are reliably live.
      if (!captured) captureTarget();

      const initialDist = Math.hypot(target.x, target.y) || 1;
      const remainingBefore = Math.hypot(target.x - state.align.dx, target.y - state.align.dy);
      const gain = approachGain(remainingBefore, initialDist);

      let dx = state.align.dx + intent.dx * gain;
      let dy = state.align.dy + intent.dy * gain;
      const remainingAfter = Math.hypot(target.x - dx, target.y - dy);

      let snapped = false;
      if (remainingAfter <= snapRadius()) {
        dx = target.x;
        dy = target.y;
        snapped = true;
      }

      ctx.store.set({ align: { dx, dy, snapped } });

      if (snapped) {
        ctx.bus.emit('snap:align', {});
        holding = true;
        holdMs = 0;
      }
    },
    update(dtMs): void {
      if (!holding) return;
      holdMs += dtMs;
      if (holdMs >= ctx.scaleMs(ALIGN_HOLD_MS)) {
        holding = false;
        advance('bolts');
      }
    },
    targetAnchor(): 'ghost' {
      return 'ghost';
    },
  };
}
