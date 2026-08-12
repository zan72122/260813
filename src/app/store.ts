/**
 * Concrete GameStore implementation. The shape (`GameSnapshot`,
 * `GameStore`, `MutableGameStore`) is frozen in `src/contracts/store.ts`;
 * this file is App's (Wave 2/4 integrator's) wiring of that shape, handed
 * to `StubGameLogic` today and to the real `src/game` implementation once
 * Wave 3 lands (App just swaps which subsystem holds the mutation handle).
 */

import type { GameSnapshot, GameStoreListener, MutableGameStore } from '../contracts/store.ts';

/** The snapshot the app boots into, before any input or state transition. */
export function createDefaultSnapshot(seed: number): GameSnapshot {
  return {
    valveOpen: 0,
    direction: 0,
    pistonDisplacement: 0,
    cableTravel: 0,
    arcLength: 0,
    t: 0,
    thetaDeg: 0,
    carrierAngleDeg: 0,
    cabinTiltErrorDeg: 0,
    cabinWorldTiltDeg: 0,
    speed: 0,
    state: 'boot',
    seed,
    quality: 'high',
    soundOn: true,
    reducedMotion: false,
    paused: false,
  };
}

class Store implements MutableGameStore {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<GameStoreListener>();

  constructor(initial: GameSnapshot) {
    this.snapshot = initial;
  }

  get(): GameSnapshot {
    return this.snapshot;
  }

  subscribe(listener: GameStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  set(patch: Partial<GameSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.notify();
  }

  replace(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    this.notify();
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener(this.snapshot);
    }
  }
}

export function createStore(seed: number): MutableGameStore {
  return new Store(createDefaultSnapshot(seed));
}
