import { describe, expect, it } from 'vitest';

import { createGuardedTrigger } from '../../../src/ui/guardedTap.ts';

describe('createGuardedTrigger (TapGuard-integrated double-fire prevention)', () => {
  it('fires on the first call', () => {
    let calls = 0;
    const now = 1000;
    const trigger = createGuardedTrigger(() => (calls += 1), { now: () => now });
    trigger();
    expect(calls).toBe(1);
  });

  it('suppresses a second call within the debounce window (button mashing / double taps)', () => {
    let calls = 0;
    let now = 1000;
    const trigger = createGuardedTrigger(() => (calls += 1), {
      minIntervalMs: 350,
      now: () => now,
    });
    trigger();
    now += 100; // well within 350ms
    trigger();
    expect(calls).toBe(1);
  });

  it('allows a subsequent call once the debounce window has elapsed', () => {
    let calls = 0;
    let now = 1000;
    const trigger = createGuardedTrigger(() => (calls += 1), {
      minIntervalMs: 350,
      now: () => now,
    });
    trigger();
    now += 350;
    trigger();
    expect(calls).toBe(2);
  });

  it('a rapid mash of 10 taps within the window fires exactly once', () => {
    let calls = 0;
    let now = 0;
    const trigger = createGuardedTrigger(() => (calls += 1), { now: () => now });
    for (let i = 0; i < 10; i += 1) {
      now += 5; // 5ms apart — well under the 350ms default
      trigger();
    }
    expect(calls).toBe(1);
  });

  it('defaults to a real clock when no now() is injected (still guards immediate re-fires)', () => {
    let calls = 0;
    const trigger = createGuardedTrigger(() => (calls += 1));
    trigger();
    trigger();
    expect(calls).toBe(1);
  });
});
