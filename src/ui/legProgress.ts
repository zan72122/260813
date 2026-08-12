/**
 * Pure leg-lock state reducer, driven by `EventBus` 'legLocked'/'replayRequested'
 * events. Kept separate from the DOM-rendering wrapper (`legProgressOverlay.ts`)
 * so the state logic is unit-testable without a DOM — see
 * tests/unit/ui-leg-progress.test.ts.
 */
import type { GameEvent } from '../contracts/events';

export type LegLockState = readonly [boolean, boolean, boolean, boolean];

export const INITIAL_LEG_LOCK_STATE: LegLockState = [false, false, false, false];

/** Pure reducer: same (state, event) always yields the same next state; unrelated events are a no-op (returns the same reference). */
export function legProgressReducer(state: LegLockState, event: GameEvent): LegLockState {
  if (event.type === 'legLocked') {
    if (state[event.leg]) return state;
    const next: [boolean, boolean, boolean, boolean] = [...state];
    next[event.leg] = true;
    return next;
  }
  if (event.type === 'replayRequested') {
    return state.some(Boolean) ? INITIAL_LEG_LOCK_STATE : state;
  }
  return state;
}
