// src/game/phases/climb.ts — Gameplay owner. THE signature moment.
// Drag the big climb lever upward; it follows the finger, LATCHES on release
// (a child letting go must not stall), and progress is strictly monotonic.
// Reused (via `loop`) for the `playClimb` free-play phase, which relocks and
// auto-resets to the bottom instead of advancing to `reveal`.

import { clamp } from '../math';
import {
  CLIMB_LEVER_ACTIVE_THRESHOLD,
  CLIMB_LEVER_RANGE_PX,
  CLIMB_PROGRESS_RATE_PER_S,
  CLIMB_SETTLE_MS,
} from '../constants';
import type { GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

export interface ClimbOptions {
  /** playClimb loops back to the bottom instead of leaving the phase. */
  loop: boolean;
  /** Required when loop is false: called once locked+settled to advance to 'reveal'. */
  advance?: (to: GamePhase) => void;
}

export function createClimbController(ctx: PhaseCtx, opts: ClimbOptions): PhaseController {
  let settling = false;
  let settleMs = 0;
  let started = false;

  return {
    enter(): void {
      settling = false;
      settleMs = 0;
      started = false;
    },
    onIntent(intent): void {
      const state = ctx.store.get();
      if (state.climb.locked) return;
      if (intent.kind === 'down') {
        if (!started) {
          started = true;
          ctx.bus.emit('climb:start', {});
        }
        return;
      }
      if (intent.kind !== 'move') return;
      const raise = -intent.dy / CLIMB_LEVER_RANGE_PX;
      const lever = clamp(state.climb.lever + raise, 0, 1);
      ctx.store.set({ climb: { ...state.climb, lever } });
    },
    update(dtMs): void {
      const state = ctx.store.get();
      if (state.climb.locked) {
        if (!settling) return;
        settleMs += dtMs;
        if (settleMs >= ctx.scaleMs(CLIMB_SETTLE_MS)) {
          settling = false;
          if (opts.loop) {
            started = false;
            ctx.store.set({ climb: { lever: 0, progress: 0, locked: false } });
          } else {
            opts.advance?.('reveal');
          }
        }
        return;
      }
      if (state.climb.lever <= CLIMB_LEVER_ACTIVE_THRESHOLD) return;
      const dtSec = dtMs / 1000;
      // Strictly monotonic: only ever adds a non-negative increment.
      const progress = clamp(state.climb.progress + state.climb.lever * CLIMB_PROGRESS_RATE_PER_S * dtSec, 0, 1);
      const locked = progress >= 1;
      ctx.store.set({ climb: { ...state.climb, progress, locked } });
      if (locked) {
        ctx.bus.emit('climb:locked', {});
        settling = true;
        settleMs = 0;
      }
    },
    targetAnchor(): 'climbLever' {
      return 'climbLever';
    },
  };
}
