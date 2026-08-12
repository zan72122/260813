// src/game/phases/rivet.ts — Gameplay owner.
// The historical 4-person rivet relay, compressed: heat -> carry (0->1->2) ->
// insert -> hammer (x3) -> cool -> sling. Adults do the "dangerous" steps;
// the child assists (heats, relays, inserts, hammers). Also hosts the
// `playRivet` free-play loop, which cycles the same steps endlessly within a
// single GamePhase (the transition table has no sub-phases for it).

import { anchorAllows } from '../anchorUtil';
import { clamp } from '../math';
import {
  RIVET_COOL_DURATION_MS,
  RIVET_FORGE_PAD,
  RIVET_HAMMER_DEBOUNCE_MS,
  RIVET_HAMMER_PAD,
  RIVET_HEAT_DURATION_MS,
  RIVET_HEAT_TAP_PULSE_MS,
  RIVET_INSERT_PAD,
} from '../constants';
import type { AnchorId, GamePhase } from '../../contracts/types';
import type { PhaseCtx, PhaseController } from '../phaseCtx';

// ---- rivetHeat --------------------------------------------------------------

export function createRivetHeatController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let holding = false;
  let advanced = false;

  function applyHeat(deltaMs: number): void {
    const state = ctx.store.get();
    if (advanced || state.rivet.temp >= 1) return;
    const duration = ctx.scaleMs(RIVET_HEAT_DURATION_MS);
    const temp = clamp(state.rivet.temp + deltaMs / duration, 0, 1);
    ctx.store.update((s) => ({ rivet: { ...s.rivet, temp } }));
    if (temp >= 1) {
      advanced = true;
      ctx.bus.emit('rivet:heated', {});
      advance('rivetCarry');
    }
  }

  return {
    enter(): void {
      holding = false;
      advanced = false;
    },
    onIntent(intent): void {
      if (advanced) return;
      const hitsForge = (x: number, y: number): boolean =>
        anchorAllows(ctx.anchors, 'forge', x, y, RIVET_FORGE_PAD);
      if (intent.kind === 'down') {
        holding = hitsForge(intent.x, intent.y);
        return;
      }
      if (intent.kind === 'up' || intent.kind === 'cancel') {
        holding = false;
        return;
      }
      if (intent.kind === 'tap' && hitsForge(intent.x, intent.y)) {
        applyHeat(RIVET_HEAT_TAP_PULSE_MS);
      }
    },
    update(dtMs): void {
      if (holding) applyHeat(dtMs);
    },
    targetAnchor(): 'forge' {
      return 'forge';
    },
  };
}

// ---- rivetCarry ---------------------------------------------------------------

export function createRivetCarryController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let advanced = false;
  return {
    enter(): void {
      advanced = false;
    },
    onIntent(intent): void {
      if (advanced || intent.kind !== 'swipe') return;
      if (intent.dir !== 'right') {
        // Wrong-direction swipe: harmlessly absorbed — worker shakes head,
        // we nudge the assist highlight so the child sees where to swipe.
        ctx.bus.emit('assist:breathe', { anchor: 'tongs' });
        return;
      }
      const state = ctx.store.get();
      const station = Math.min(state.rivet.station + 1, 2) as 0 | 1 | 2 | 3;
      ctx.store.update((s) => ({ rivet: { ...s.rivet, station } }));
      ctx.bus.emit('rivet:handoff', { station });
      if (station >= 2) {
        advanced = true;
        advance('rivetInsert');
      }
    },
    update(): void {
      // Purely input-driven — no passive behavior.
    },
    targetAnchor(): 'tongs' {
      return 'tongs';
    },
  };
}

// ---- rivetInsert --------------------------------------------------------------

export function createRivetInsertController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let advanced = false;
  return {
    enter(): void {
      advanced = false;
    },
    onIntent(intent): void {
      if (advanced || intent.kind !== 'tap') return;
      if (!anchorAllows(ctx.anchors, 'rivetHole', intent.x, intent.y, RIVET_INSERT_PAD)) return;
      advanced = true;
      ctx.store.update((s) => ({ rivet: { ...s.rivet, inserted: true } }));
      ctx.bus.emit('rivet:inserted', {});
      advance('rivetHammer');
    },
    update(): void {
      // No passive behavior.
    },
    targetAnchor(): 'rivetHole' {
      return 'rivetHole';
    },
  };
}

// ---- rivetHammer ----------------------------------------------------------------

export function createRivetHammerController(
  ctx: PhaseCtx,
  advance: (to: GamePhase) => void,
): PhaseController {
  let lastHitT = -Infinity;
  let advanced = false;
  return {
    enter(): void {
      lastHitT = -Infinity;
      advanced = false;
    },
    onIntent(intent): void {
      if (advanced || intent.kind !== 'tap') return;
      if (!anchorAllows(ctx.anchors, 'hammerSpot', intent.x, intent.y, RIVET_HAMMER_PAD)) return;
      // Debounce so mashing counts cleanly (one hit per real tap, not per ms).
      if (intent.t - lastHitT < RIVET_HAMMER_DEBOUNCE_MS) return;
      lastHitT = intent.t;

      const state = ctx.store.get();
      const hits = Math.min(state.rivet.hits + 1, 3) as 1 | 2 | 3;
      const formed = hits / 3;
      ctx.store.update((s) => ({ rivet: { ...s.rivet, hits, formed } }));
      ctx.bus.emit('rivet:hit', { hits });
      if (hits >= 3) {
        advanced = true;
        ctx.bus.emit('rivet:formed', {});
        advance('rivetCool');
      }
    },
    update(): void {
      // No passive behavior.
    },
    targetAnchor(): 'hammerSpot' {
      return 'hammerSpot';
    },
  };
}

// ---- rivetCool ------------------------------------------------------------------

export function createRivetCoolController(
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
      // Passive phase ("見る") — input is ignored, no dead end risk either way.
    },
    update(dtMs): void {
      if (advanced) return;
      elapsedMs += dtMs;
      const duration = ctx.scaleMs(RIVET_COOL_DURATION_MS);
      const cooled = clamp(elapsedMs / duration, 0, 1);
      ctx.store.update((s) => ({ rivet: { ...s.rivet, cooled } }));
      if (cooled >= 1) {
        advanced = true;
        ctx.bus.emit('rivet:cooled', {});
        advance('sling');
      }
    },
    targetAnchor(): undefined {
      return undefined;
    },
  };
}

// ---- playRivet: endless loop within a single GamePhase -----------------------

type RivetSubPhase = 'heat' | 'carry' | 'insert' | 'hammer' | 'cool';

export function createPlayRivetController(ctx: PhaseCtx): PhaseController {
  let sub: RivetSubPhase = 'heat';
  let holding = false;
  let lastHitT = -Infinity;
  let coolElapsedMs = 0;

  function resetCycle(): void {
    sub = 'heat';
    holding = false;
    lastHitT = -Infinity;
    coolElapsedMs = 0;
    ctx.store.set({ rivet: { temp: 0, station: 0, inserted: false, hits: 0, formed: 0, cooled: 0 } });
  }

  function applyHeat(deltaMs: number): void {
    const state = ctx.store.get();
    const duration = ctx.scaleMs(RIVET_HEAT_DURATION_MS);
    const temp = clamp(state.rivet.temp + deltaMs / duration, 0, 1);
    ctx.store.update((s) => ({ rivet: { ...s.rivet, temp } }));
    if (temp >= 1) {
      ctx.bus.emit('rivet:heated', {});
      sub = 'carry';
    }
  }

  return {
    enter(): void {
      resetCycle();
    },
    onIntent(intent): void {
      switch (sub) {
        case 'heat': {
          const hitsForge = intent.kind !== 'cancel' && anchorAllows(ctx.anchors, 'forge', intent.x, intent.y, RIVET_FORGE_PAD);
          if (intent.kind === 'down') holding = hitsForge;
          else if (intent.kind === 'up' || intent.kind === 'cancel') holding = false;
          else if (intent.kind === 'tap' && hitsForge) applyHeat(RIVET_HEAT_TAP_PULSE_MS);
          break;
        }
        case 'carry': {
          if (intent.kind !== 'swipe') break;
          if (intent.dir !== 'right') {
            ctx.bus.emit('assist:breathe', { anchor: 'tongs' });
            break;
          }
          const state = ctx.store.get();
          const station = Math.min(state.rivet.station + 1, 2) as 0 | 1 | 2 | 3;
          ctx.store.update((s) => ({ rivet: { ...s.rivet, station } }));
          ctx.bus.emit('rivet:handoff', { station });
          if (station >= 2) sub = 'insert';
          break;
        }
        case 'insert': {
          if (intent.kind !== 'tap') break;
          if (!anchorAllows(ctx.anchors, 'rivetHole', intent.x, intent.y, RIVET_INSERT_PAD)) break;
          ctx.store.update((s) => ({ rivet: { ...s.rivet, inserted: true } }));
          ctx.bus.emit('rivet:inserted', {});
          sub = 'hammer';
          break;
        }
        case 'hammer': {
          if (intent.kind !== 'tap') break;
          if (!anchorAllows(ctx.anchors, 'hammerSpot', intent.x, intent.y, RIVET_HAMMER_PAD)) break;
          if (intent.t - lastHitT < RIVET_HAMMER_DEBOUNCE_MS) break;
          lastHitT = intent.t;
          const state = ctx.store.get();
          const hits = Math.min(state.rivet.hits + 1, 3) as 1 | 2 | 3;
          const formed = hits / 3;
          ctx.store.update((s) => ({ rivet: { ...s.rivet, hits, formed } }));
          ctx.bus.emit('rivet:hit', { hits });
          if (hits >= 3) {
            ctx.bus.emit('rivet:formed', {});
            sub = 'cool';
            coolElapsedMs = 0;
          }
          break;
        }
        case 'cool':
          break;
      }
    },
    update(dtMs): void {
      if (sub === 'heat') {
        if (holding) applyHeat(dtMs);
        return;
      }
      if (sub === 'cool') {
        coolElapsedMs += dtMs;
        const duration = ctx.scaleMs(RIVET_COOL_DURATION_MS);
        const cooled = clamp(coolElapsedMs / duration, 0, 1);
        ctx.store.update((s) => ({ rivet: { ...s.rivet, cooled } }));
        if (cooled >= 1) {
          ctx.bus.emit('rivet:cooled', {});
          resetCycle();
        }
      }
    },
    targetAnchor(): AnchorId | undefined {
      switch (sub) {
        case 'heat':
          return 'forge';
        case 'carry':
          return 'tongs';
        case 'insert':
          return 'rivetHole';
        case 'hammer':
          return 'hammerSpot';
        case 'cool':
          return undefined;
      }
    },
  };
}
