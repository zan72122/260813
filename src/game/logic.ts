// src/game/logic.ts — Gameplay owner.
// DOM-free orchestrator: routes classified GameIntents + a per-frame update
// tick to the active phase's controller, and runs the idle/assist timers.
// This is the "whole loop" and is exactly what unit tests drive directly.

import { advance } from '../contracts/machine';
import { createAlignController } from './phases/align';
import { createBoltsController } from './phases/bolts';
import { createClimbController } from './phases/climb';
import { createHoistController } from './phases/hoist';
import { createHookDownController } from './phases/hookDown';
import { createOpeningController } from './phases/opening';
import {
  createPlayRivetController,
  createRivetCarryController,
  createRivetCoolController,
  createRivetHammerController,
  createRivetHeatController,
  createRivetInsertController,
} from './phases/rivet';
import { createRevealController } from './phases/reveal';
import { createSlingController } from './phases/sling';
import { IDLE_BREATHE_MS, IDLE_POINT_MS } from './constants';
import { makeScaleMs } from './phaseCtx';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { GamePhase } from '../contracts/types';
import type { GameIntent } from './intents';
import type { PhaseController } from './phaseCtx';

export interface GameLogic {
  handleIntent(intent: GameIntent): void;
  update(dtMs: number): void;
  dispose(): void;
}

export function createGameLogic(o: {
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
  testMode: boolean;
}): GameLogic {
  const { store, bus, anchors, testMode } = o;
  const scaleMs = makeScaleMs(testMode);
  const ctx = { store, bus, anchors, testMode, scaleMs };

  function advanceTo(to: GamePhase): void {
    advance(store, bus, to);
  }

  const controllers: Partial<Record<GamePhase, PhaseController>> = {
    opening: createOpeningController(ctx, advanceTo),
    hookDown: createHookDownController(ctx, advanceTo),
    hoist: createHoistController(ctx, advanceTo),
    align: createAlignController(ctx, advanceTo),
    bolts: createBoltsController(ctx, advanceTo),
    rivetHeat: createRivetHeatController(ctx, advanceTo),
    rivetCarry: createRivetCarryController(ctx, advanceTo),
    rivetInsert: createRivetInsertController(ctx, advanceTo),
    rivetHammer: createRivetHammerController(ctx, advanceTo),
    rivetCool: createRivetCoolController(ctx, advanceTo),
    sling: createSlingController(ctx, advanceTo),
    climb: createClimbController(ctx, { loop: false, advance: advanceTo }),
    reveal: createRevealController(ctx, advanceTo),
    playRivet: createPlayRivetController(ctx),
    playClimb: createClimbController(ctx, { loop: true }),
  };

  let breatheEmitted = false;
  let pointEmitted = false;

  function resetIdleFlags(): void {
    breatheEmitted = false;
    pointEmitted = false;
  }

  const unsubscribeEnter = bus.on('phase:enter', (payload) => {
    resetIdleFlags();
    controllers[payload.phase]?.enter();
  });

  // The phase may already be active (e.g. logic constructed mid-phase by a
  // test, or a future hot-reload path) — prime its controller once.
  controllers[store.get().phase]?.enter();

  function handleIntent(intent: GameIntent): void {
    resetIdleFlags();
    if (store.get().idleMs !== 0) store.set({ idleMs: 0 });
    const controller = controllers[store.get().phase];
    controller?.onIntent(intent);
  }

  function update(dtMs: number): void {
    const state = store.get();
    const controller = controllers[state.phase];
    if (!controller) return;

    controller.update(dtMs);

    const target = controller.targetAnchor();
    if (!target) return;

    const idleMs = store.get().idleMs + dtMs;
    store.set({ idleMs });
    if (!breatheEmitted && idleMs >= scaleMs(IDLE_BREATHE_MS)) {
      breatheEmitted = true;
      bus.emit('assist:breathe', { anchor: target });
    }
    if (!pointEmitted && idleMs >= scaleMs(IDLE_POINT_MS)) {
      pointEmitted = true;
      bus.emit('assist:point', { anchor: target });
    }
  }

  function dispose(): void {
    unsubscribeEnter();
  }

  return { handleIntent, update, dispose };
}
