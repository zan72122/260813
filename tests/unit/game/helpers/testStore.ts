/**
 * A minimal, independent `MutableGameStore` implementation for gameplay/math
 * unit tests. Deliberately NOT imported from `src/app/store.ts` — that file
 * belongs to the integrator's exclusive subtree (FILE_OWNERSHIP), and
 * `src/game` tests should exercise `EiffelGameLogic` against nothing more
 * than the frozen `src/contracts` shape it is actually specified against.
 * Not a `*.spec.ts` file, so vitest's `tests/unit/**\/*.spec.ts` include
 * pattern never picks it up as a test file on its own.
 */

import type { GameSnapshot, GameStoreListener, MutableGameStore } from '../../../../src/contracts/store.ts';

export function createDefaultTestSnapshot(seed: number): GameSnapshot {
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

class TestStore implements MutableGameStore {
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<GameStoreListener>();
  /** Every snapshot this store has ever held, in order — handy for trajectory assertions. */
  readonly history: GameSnapshot[] = [];

  constructor(initial: GameSnapshot) {
    this.snapshot = initial;
    this.history.push(initial);
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
    this.history.push(this.snapshot);
    this.notify();
  }

  replace(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    this.history.push(snapshot);
    this.notify();
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener(this.snapshot);
    }
  }
}

export interface TestStoreHandle extends MutableGameStore {
  readonly history: GameSnapshot[];
}

export function createTestStore(seed: number): TestStoreHandle {
  return new TestStore(createDefaultTestSnapshot(seed));
}
