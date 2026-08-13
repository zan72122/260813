import { describe, expect, it, vi } from 'vitest';
import { createClickGuard, debounce, guardedHandler } from '../interaction';

describe('createClickGuard', () => {
  it('allows the very first attempt regardless of how early it arrives', () => {
    const guard = createClickGuard(500);
    expect(guard.attempt(0)).toBe(true);
  });

  it('gates out a second attempt inside the cooldown window', () => {
    const guard = createClickGuard(500);
    expect(guard.attempt(1000)).toBe(true);
    expect(guard.attempt(1200)).toBe(false);
  });

  it('re-arms once the cooldown has elapsed', () => {
    const guard = createClickGuard(500);
    expect(guard.attempt(1000)).toBe(true);
    expect(guard.attempt(1499)).toBe(false);
    expect(guard.attempt(1500)).toBe(true);
  });
});

describe('guardedHandler (U2: taps must never be silently eaten)', () => {
  it('calls onTap on every invocation, even ones the guard suppresses', () => {
    const fn = vi.fn();
    const onTap = vi.fn();
    let now = 0;
    const handler = guardedHandler(fn, { cooldownMs: 500, onTap, now: () => now });

    handler();
    now = 100; // well inside the cooldown
    handler();
    now = 200;
    handler();

    expect(onTap).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires fn again once the cooldown has elapsed', () => {
    const fn = vi.fn();
    let now = 0;
    const handler = guardedHandler(fn, { cooldownMs: 500, now: () => now });

    handler();
    now = 600;
    handler();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never leaves a tap with zero effect: every call produces feedback even when the action is gated', () => {
    const fn = vi.fn();
    const feedbackLog: number[] = [];
    let now = 0;
    const handler = guardedHandler(fn, {
      cooldownMs: 500,
      onTap: () => feedbackLog.push(now),
      now: () => now,
    });

    for (const t of [0, 50, 100, 150, 700, 750]) {
      now = t;
      handler();
    }

    // Every single call produced feedback...
    expect(feedbackLog).toEqual([0, 50, 100, 150, 700, 750]);
    // ...while the guarded action only fired for the two calls outside a
    // 500ms cooldown of the previous *successful* activation (t=0 and t=700).
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('debounce', () => {
  it('runs fn once after the wait, coalescing rapid repeated calls', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);

      debounced();
      vi.advanceTimersByTime(100);
      debounced();
      vi.advanceTimersByTime(100);
      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() prevents a pending call from firing', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);
      debounced();
      debounced.cancel();
      vi.advanceTimersByTime(500);
      expect(fn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
