// src/ui/interaction.ts — pure, DOM-free input-timing helpers: the tap
// click-guard (debounce against duplicate/accidental double-activation) and
// a plain trailing debounce for high-frequency DOM events (resize/
// orientationchange). No DOM access, no timers created here — callers own
// `setTimeout`/`requestAnimationFrame` and pass in wall-clock time so this
// stays unit-testable without a browser or fake timers.

/** A tiny time-gated latch: `attempt(now)` returns true (and re-arms the
 * gate) at most once per `cooldownMs` window. Used to stop a single
 * physical tap from firing an action twice (duplicate synthetic events,
 * over-eager double-tap) — NOT to swallow input silently: callers pair this
 * with unconditional visual feedback (see `guardedHandler`) so a
 * gated-out tap is never indistinguishable from a dead button. */
export interface ClickGuard {
  attempt(now: number): boolean;
}

export function createClickGuard(cooldownMs: number): ClickGuard {
  // -Infinity (not 0) so the very first call is never gated out — a click
  // arriving within `cooldownMs` of navigation start would otherwise look
  // "too soon after time zero" against performance.now().
  let last = -Infinity;
  return {
    attempt(now: number): boolean {
      if (now - last < cooldownMs) return false;
      last = now;
      return true;
    },
  };
}

/**
 * Wraps `fn` (a button's real action — advance a phase, toggle mute, …)
 * with a click guard, while guaranteeing every invocation of the returned
 * handler produces *some* immediate, visible acknowledgement via `onTap`
 * — called unconditionally, before the guard is even consulted.
 *
 * This is the fix for the "tap gets silently eaten" failure mode: earlier,
 * a click landing inside the cooldown window did nothing at all — no state
 * change *and* no visual response — which reads to a 4-year-old as a dead,
 * unresponsive button rather than "you already did that". Now the button
 * always pulses on tap, and `fn` itself only ever needs to be idempotent
 * (calling `advance()` again when already off that phase is a documented
 * no-op in the state machine) rather than needing the guard to be perfect.
 */
export function guardedHandler(
  fn: () => void,
  options: { cooldownMs: number; onTap?: () => void; now?: () => number },
): () => void {
  const guard = createClickGuard(options.cooldownMs);
  const now = options.now ?? (() => performance.now());
  return () => {
    options.onTap?.();
    if (guard.attempt(now())) fn();
  };
}

/** Plain trailing debounce: `fn` runs `waitMs` after the last call, however
 * many times the returned function was invoked in the meantime. Used for
 * resize/orientationchange per docs/ARCHITECTURE_CONTRACT.md ("resize/
 * orientationchange は debounce 200ms"). Exposes `cancel()` so callers can
 * clear a pending call on dispose. */
export interface Debounced {
  (): void;
  cancel(): void;
}

export function debounce(fn: () => void, waitMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, waitMs);
  }) as Debounced;
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
