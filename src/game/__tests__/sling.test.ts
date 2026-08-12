import { describe, expect, it } from 'vitest';
import { makeHarness, tap, tick } from './harness';

describe('sling phase', () => {
  it('a single tap on the clasp releases it, then advances to climb after the slack beat', () => {
    const h = makeHarness(1, { startPhase: 'sling' });
    h.anchors.set({ id: 'slingClasp', x: 100, y: 100, r: 15, active: true });
    tap(h, 100, 100);
    expect(h.store.get().sling.released).toBe(true);
    expect(h.events.some((e) => e.name === 'sling:released')).toBe(true);
    expect(h.store.get().phase).toBe('sling');
    tick(h, 1000);
    expect(h.store.get().phase).toBe('climb');
  });

  it('a tap far from the clasp does nothing (no accidental release)', () => {
    const h = makeHarness(1, { startPhase: 'sling' });
    h.anchors.set({ id: 'slingClasp', x: 100, y: 100, r: 15, active: true });
    tap(h, 900, 900);
    expect(h.store.get().sling.released).toBe(false);
  });

  it('spamming taps after release never double-advances', () => {
    const h = makeHarness(1, { startPhase: 'sling' });
    h.anchors.set({ id: 'slingClasp', x: 100, y: 100, r: 15, active: true });
    for (let i = 0; i < 10; i += 1) tap(h, 100, 100);
    tick(h, 1000);
    expect(h.store.get().phase).toBe('climb');
  });
});
