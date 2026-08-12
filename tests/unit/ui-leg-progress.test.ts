import { describe, expect, it } from 'vitest';
import { INITIAL_LEG_LOCK_STATE, legProgressReducer } from '../../src/ui/legProgress';
import type { GameEvent } from '../../src/contracts/events';

describe('legProgressReducer', () => {
  it('starts with all four legs unlocked', () => {
    expect(INITIAL_LEG_LOCK_STATE).toEqual([false, false, false, false]);
  });

  it('legLocked sets only the given leg, leaving the others untouched', () => {
    const next = legProgressReducer(INITIAL_LEG_LOCK_STATE, { type: 'legLocked', leg: 2 });
    expect(next).toEqual([false, false, true, false]);
  });

  it('locking each leg in turn accumulates independently', () => {
    let state = INITIAL_LEG_LOCK_STATE;
    state = legProgressReducer(state, { type: 'legLocked', leg: 0 });
    state = legProgressReducer(state, { type: 'legLocked', leg: 3 });
    expect(state).toEqual([true, false, false, true]);
  });

  it('re-locking an already-locked leg is a no-op that returns the same reference', () => {
    const once = legProgressReducer(INITIAL_LEG_LOCK_STATE, { type: 'legLocked', leg: 1 });
    const twice = legProgressReducer(once, { type: 'legLocked', leg: 1 });
    expect(twice).toBe(once);
  });

  it('replayRequested resets all legs to unlocked when any were locked', () => {
    const locked = legProgressReducer(INITIAL_LEG_LOCK_STATE, { type: 'legLocked', leg: 0 });
    const reset = legProgressReducer(locked, { type: 'replayRequested' });
    expect(reset).toEqual([false, false, false, false]);
  });

  it('replayRequested on an already-fresh state is a no-op that returns the same reference', () => {
    const reset = legProgressReducer(INITIAL_LEG_LOCK_STATE, { type: 'replayRequested' });
    expect(reset).toBe(INITIAL_LEG_LOCK_STATE);
  });

  it('unrelated events are a no-op that returns the same reference', () => {
    const unrelated: GameEvent[] = [
      { type: 'sandFlow', leg: 0, rate: 2 },
      { type: 'jackPumped', leg: 0, stroke: 1 },
      { type: 'settled' },
      { type: 'soundToggled', on: false },
    ];
    for (const e of unrelated) {
      expect(legProgressReducer(INITIAL_LEG_LOCK_STATE, e)).toBe(INITIAL_LEG_LOCK_STATE);
    }
  });
});
