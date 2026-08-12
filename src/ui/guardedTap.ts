/**
 * Wraps the frozen `TapGuard` (src/input/gestures.ts) into a ready-to-call
 * trigger: button mashing / double taps never double-fire a state
 * transition or replay action (PRODUCT_SPEC "Guarantees"). Time is supplied
 * by an injected `now()` so it is unit-testable with a fake clock.
 */

import { TapGuard } from '../input/gestures.ts';

export type NowFn = () => number;

/**
 * Returns a zero-argument trigger that calls `fire()` only when the guard
 * allows it. `nowFn` defaults to `Date.now` but tests should inject a fake
 * clock instead of relying on wall time.
 */
export function createGuardedTrigger(
  fire: () => void,
  options: { readonly minIntervalMs?: number; readonly now?: NowFn } = {},
): () => void {
  const guard = new TapGuard(options.minIntervalMs);
  const now = options.now ?? Date.now;
  return () => {
    if (guard.canFire(now())) {
      fire();
    }
  };
}
