// src/game/phases/hoist.ts — Gameplay owner.
// Upward drag/swipe raises the load; an analytic, always-damping pendulum
// sway grows with input jerk and is hard-clamped to +-6 degrees. No fall.

import { clamp, SwayOscillator } from '../math';
import { HOIST_EASE_DOWN_PER_S, HOIST_HEIGHT_RANGE_PX, HOIST_RATE } from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export function createHoistController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  const sway = new SwayOscillator();
  let lastSampleT = 0;
  let advanced = false;

  function applyHeight(deltaPx: number, swayVal: number): void {
    const state = ctx.store.get();
    if (state.hoist.height >= 1) return;
    const height = clamp(state.hoist.height + (deltaPx * HOIST_RATE) / HOIST_HEIGHT_RANGE_PX, 0, 1);
    ctx.store.set({ hoist: { height, sway: swayVal } });
    if (height >= 1 && !advanced) {
      advanced = true;
      advance('align');
    }
  }

  return {
    enter(): void {
      sway.reset();
      lastSampleT = 0;
      advanced = false;
    },
    onIntent(intent): void {
      if (advanced) return;
      if (intent.kind === 'down') {
        lastSampleT = intent.t;
        return;
      }
      if (intent.kind === 'move') {
        const dtSec = Math.max((intent.t - lastSampleT) / 1000, 1 / 240);
        lastSampleT = intent.t;
        const upPx = Math.max(-intent.dy, 0);
        const swayVal = sway.update(dtSec, -intent.dy / dtSec);
        applyHeight(upPx, swayVal);
        return;
      }
      if (intent.kind === 'swipe' && intent.dir === 'up') {
        const swayVal = sway.update(1 / 60, -intent.vy * 1000);
        applyHeight(Math.abs(intent.vy) * 150, swayVal);
      }
    },
    update(dtMs): void {
      if (advanced) return;
      const state = ctx.store.get();
      if (state.hoist.height <= 0) return;
      const dtSec = dtMs / 1000;
      const swayVal = sway.update(dtSec, 0);
      const height = clamp(state.hoist.height - HOIST_EASE_DOWN_PER_S * dtSec, 0, 1);
      ctx.store.set({ hoist: { height, sway: swayVal } });
    },
    targetAnchor(): 'beam' {
      return 'beam';
    },
  };
}
