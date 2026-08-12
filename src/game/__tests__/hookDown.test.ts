import { describe, expect, it } from 'vitest';
import { down, makeHarness, move, tick } from './harness';

describe('hookDown phase', () => {
  it('vertical drag anywhere raises hook.depth, clamped to [0,1]', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    down(h, 200, 100);
    move(h, 200, 300, 0, 200);
    expect(h.store.get().hook.depth).toBeGreaterThan(0);
    expect(h.store.get().hook.depth).toBeLessThanOrEqual(1);
  });

  it('snaps and advances to hoist when near the published beam anchor', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    h.anchors.set({ id: 'beam', x: 200, y: 100, r: 20, active: true });
    down(h, 200, 100);
    // Drag the (virtual, finger-offset) hook target right onto the beam anchor.
    move(h, 200, 180, 0, 80);
    expect(h.store.get().hook.attached).toBe(true);
    expect(h.events.some((e) => e.name === 'snap:hook')).toBe(true);
    expect(h.store.get().phase).toBe('hookDown'); // attach beat hasn't elapsed yet
    tick(h, 1000); // scaled attach beat under testMode
    expect(h.store.get().phase).toBe('hoist');
  });

  it('never dead-ends: falls back to a depth threshold when no beam anchor is published', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    down(h, 200, 100);
    for (let i = 0; i < 20; i += 1) move(h, 200, 100 + i * 20, 0, 20);
    expect(h.store.get().hook.attached).toBe(true);
    tick(h, 1000);
    expect(h.store.get().phase).toBe('hoist');
  });

  it('a wrong-direction (upward) drag is harmlessly absorbed, never errors', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    down(h, 200, 300);
    expect(() => move(h, 200, 100, 0, -200)).not.toThrow();
    expect(h.store.get().hook.depth).toBe(0);
  });
});
