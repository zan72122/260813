import { describe, expect, it } from 'vitest';
import { down, makeHarness, move, tick } from './harness';

describe('align phase', () => {
  it('approach gain decelerates near the target (small mid-range gain vs far gain)', () => {
    const h = makeHarness(1, { startPhase: 'align' });
    h.anchors.set({ id: 'beam', x: 0, y: 0, r: 20, active: true });
    h.anchors.set({ id: 'ghost', x: 400, y: 0, r: 40, active: true }); // target vector (400,0)
    down(h, 0, 0);

    // Far from target: a 100px move should apply close to full gain (near 100).
    move(h, 100, 0, 100, 0);
    const dxAfterFirst = h.store.get().align.dx;
    expect(dxAfterFirst).toBeGreaterThan(90);

    // Push close to the target, then measure the effect of one more 100px move —
    // gain should now be much smaller than 1 (decelerating near target).
    move(h, 380, 0, 280, 0);
    const dxBeforeLast = h.store.get().align.dx;
    move(h, 480, 0, 100, 0);
    const dxAfterLast = h.store.get().align.dx;
    const lastStepEffect = dxAfterLast - dxBeforeLast;
    expect(lastStepEffect).toBeLessThan(50);
  });

  it('snaps within the generous snap radius and holds success before advancing to bolts', () => {
    const h = makeHarness(1, { startPhase: 'align' });
    h.anchors.set({ id: 'beam', x: 0, y: 0, r: 20, active: true });
    h.anchors.set({ id: 'ghost', x: 100, y: 0, r: 40, active: true }); // snapR = 0.9*40 = 36
    down(h, 0, 0);
    move(h, 90, 0, 90, 0); // remaining = 10px <= snapR -> should snap
    expect(h.store.get().align.snapped).toBe(true);
    expect(h.events.some((e) => e.name === 'snap:align')).toBe(true);
    expect(h.store.get().phase).toBe('align'); // hold, not yet advanced
    tick(h, 2000); // scaled >=1s hold
    expect(h.store.get().phase).toBe('bolts');
  });

  it('never dead-ends: works with a fallback target when no beam/ghost anchors exist', () => {
    const h = makeHarness(1, { startPhase: 'align' });
    down(h, 0, 0);
    for (let i = 0; i < 200 && h.store.get().phase === 'align'; i += 1) {
      move(h, i * 10, i * 10, 10, 10);
      tick(h, 50);
    }
    expect(h.store.get().phase).toBe('bolts');
  });
});
