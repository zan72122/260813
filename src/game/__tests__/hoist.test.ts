import { describe, expect, it } from 'vitest';
import { HOIST_SWAY_MAX_RAD } from '../math';
import { down, makeHarness, move, tick } from './harness';

describe('hoist phase', () => {
  it('upward drag raises hoist.height and reaching 1 advances to align', () => {
    const h = makeHarness(1, { startPhase: 'hoist' });
    down(h, 200, 500);
    let y = 500;
    for (let i = 0; i < 60 && h.store.get().phase === 'hoist'; i += 1) {
      y -= 40;
      move(h, 200, y, 0, -40);
    }
    expect(h.store.get().phase).toBe('align');
  });

  it('downward drag does not raise height (only upward input counts)', () => {
    const h = makeHarness(1, { startPhase: 'hoist' });
    down(h, 200, 100);
    move(h, 200, 200, 0, 100);
    expect(h.store.get().hoist.height).toBe(0);
  });

  it('sway is always within the hard +-6 degree clamp during active hoisting', () => {
    const h = makeHarness(1, { startPhase: 'hoist' });
    down(h, 200, 500);
    let y = 500;
    for (let i = 0; i < 30; i += 1) {
      // Jerky, alternating-speed upward drags to try to provoke large sway.
      const step = i % 3 === 0 ? 5 : 60;
      y -= step;
      move(h, 200, y, 0, -step);
      expect(Math.abs(h.store.get().hoist.sway)).toBeLessThanOrEqual(HOIST_SWAY_MAX_RAD + 1e-9);
    }
  });

  it('passive update() lets sway relax without throwing when idle', () => {
    const h = makeHarness(1, { startPhase: 'hoist' });
    down(h, 200, 500);
    move(h, 200, 300, 0, -200);
    expect(() => tick(h, 500)).not.toThrow();
  });
});
