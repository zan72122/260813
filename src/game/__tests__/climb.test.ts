import { describe, expect, it } from 'vitest';
import { down, makeHarness, move, tick, up } from './harness';

describe('climb phase (signature moment)', () => {
  it('dragging the lever up raises climb.lever and progress rises while lever > 0.15', () => {
    const h = makeHarness(1, { startPhase: 'climb' });
    down(h, 200, 500);
    move(h, 200, 300, 0, -200); // raises lever well above the 0.15 threshold
    expect(h.store.get().climb.lever).toBeGreaterThan(0.15);
    tick(h, 500);
    expect(h.store.get().climb.progress).toBeGreaterThan(0);
  });

  it('progress is strictly monotonic and never decreases, including across releases', () => {
    const h = makeHarness(1, { startPhase: 'climb' });
    down(h, 200, 500);
    move(h, 200, 350, 0, -150);
    let last = 0;
    for (let i = 0; i < 20; i += 1) {
      tick(h, 50);
      const p = h.store.get().climb.progress;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    // Finger release: lever LATCHES (child letting go must not stall progress).
    up(h, 200, 350);
    for (let i = 0; i < 20; i += 1) {
      tick(h, 50);
      const p = h.store.get().climb.progress;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(h.store.get().climb.lever).toBeGreaterThan(0.15); // still latched, not reset
  });

  it('reaching progress 1 locks, holds a settle beat, then advances to reveal', () => {
    const h = makeHarness(1, { startPhase: 'climb' });
    down(h, 200, 900);
    move(h, 200, 0, 0, -900); // a big single drag to max the lever
    // Enough time to fill progress (~2000ms scaled) + settle (~150ms scaled),
    // but not so much it also blows through reveal's own (~625ms scaled) dwell.
    tick(h, 2400);
    expect(h.store.get().climb.locked).toBe(true);
    expect(h.events.some((e) => e.name === 'climb:locked')).toBe(true);
    expect(h.store.get().phase).toBe('reveal');
  });

  it('a downward drag never raises the lever backwards below its latched value in a way that reduces progress', () => {
    const h = makeHarness(1, { startPhase: 'climb' });
    down(h, 200, 300);
    move(h, 200, 200, 0, -100); // raise
    tick(h, 100);
    const progressAfterRaise = h.store.get().climb.progress;
    move(h, 200, 400, 0, 200); // drag back down
    tick(h, 100);
    expect(h.store.get().climb.progress).toBeGreaterThanOrEqual(progressAfterRaise);
  });
});

describe('playClimb free-play loop', () => {
  it('locks, settles, then auto-resets to the bottom and can climb again', () => {
    const h = makeHarness(1, { startPhase: 'playClimb' });
    down(h, 200, 900);
    move(h, 200, 0, 0, -900);
    tick(h, 2100); // just enough to lock, not enough to also finish the settle beat
    expect(h.store.get().climb.locked).toBe(true);
    tick(h, 2000); // settle beat
    expect(h.store.get().phase).toBe('playClimb'); // never leaves the loop
    expect(h.store.get().climb).toEqual({ lever: 0, progress: 0, locked: false });

    // Can climb again immediately.
    down(h, 200, 900);
    move(h, 200, 0, 0, -900);
    tick(h, 2100);
    expect(h.store.get().climb.locked).toBe(true);
  });
});
