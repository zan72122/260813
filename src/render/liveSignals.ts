/**
 * Tiny cache of the two per-leg INPUT signals that drive visuals but are
 * deliberately NOT part of GameState (contracts/types.ts): the sand gate's
 * live open amount and the live sandFlow rate. Both are momentary/
 * continuous values the gameplay owner's input layer emits on the event
 * bus (contracts/events.ts `gateOpened`/`sandFlow`) rather than persisting
 * — GameState only tracks their downstream EFFECT (legOffsetY/sandLevel).
 * The gate-handle's visual rotation and the sand-stream mesh both need the
 * live value itself, hence this small subscriber.
 */
import type { EventBus } from '../contracts/events';
import type { LegId } from '../contracts/types';

export type PerLeg = [number, number, number, number];

export interface LiveSignals {
  /** Last known gateOpened `open` value per leg, 0..1. */
  readonly gateOpen: PerLeg;
  /** Last known sandFlow `rate` value per leg, units/s (0 = stopped). */
  readonly sandFlowRate: PerLeg;
  dispose(): void;
}

/** Subscribes to the bus and keeps `gateOpen`/`sandFlowRate` current. Resets both to 0 on `replayRequested` (a fresh run has no gate/flow history). */
export function createLiveSignals(bus: EventBus): LiveSignals {
  const gateOpen: PerLeg = [0, 0, 0, 0];
  const sandFlowRate: PerLeg = [0, 0, 0, 0];

  const setAt = (arr: PerLeg, leg: LegId, value: number): void => {
    arr[leg] = value;
  };

  const unsubscribers = [
    bus.on('gateOpened', (e) => {
      setAt(gateOpen, e.leg, e.open);
    }),
    bus.on('sandFlow', (e) => {
      setAt(sandFlowRate, e.leg, e.rate);
    }),
    bus.on('sandDepleted', (e) => {
      setAt(sandFlowRate, e.leg, 0);
    }),
    bus.on('replayRequested', () => {
      gateOpen[0] = gateOpen[1] = gateOpen[2] = gateOpen[3] = 0;
      sandFlowRate[0] = sandFlowRate[1] = sandFlowRate[2] = sandFlowRate[3] = 0;
    }),
  ];

  return {
    gateOpen,
    sandFlowRate,
    dispose(): void {
      for (const off of unsubscribers) off();
    },
  };
}
