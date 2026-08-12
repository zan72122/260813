import { describe, expect, it } from 'vitest';
import { down, makeHarness, up } from './harness';

function setupAnchors(h: ReturnType<typeof makeHarness>): void {
  h.anchors.set({ id: 'bolt0', x: 50, y: 500, r: 20, active: true });
  h.anchors.set({ id: 'bolt1', x: 150, y: 500, r: 20, active: true });
  h.anchors.set({ id: 'hole0', x: 50, y: 200, r: 15, active: true });
  h.anchors.set({ id: 'hole1', x: 150, y: 200, r: 15, active: true });
}

describe('bolts phase', () => {
  it('dragging a bolt onto its hole seats it and emits bolt:seated', () => {
    const h = makeHarness(1, { startPhase: 'bolts' });
    setupAnchors(h);
    down(h, 50, 500); // grab bolt0
    up(h, 50, 200); // release right on hole0
    expect(h.store.get().bolts).toEqual([true, false]);
    expect(h.events.some((e) => e.name === 'bolt:seated' && (e.payload as { index: number }).index === 0)).toBe(
      true,
    );
  });

  it('releasing far from the hole glides back with no state change (no penalty)', () => {
    const h = makeHarness(1, { startPhase: 'bolts' });
    setupAnchors(h);
    down(h, 50, 500); // grab bolt0
    up(h, 900, 900); // release far away from any hole
    expect(h.store.get().bolts).toEqual([false, false]);
    expect(h.events.some((e) => e.name === 'bolt:seated')).toBe(false);
  });

  it('order does not matter: seating both bolts (in either order) advances to rivetHeat', () => {
    const h = makeHarness(1, { startPhase: 'bolts' });
    setupAnchors(h);
    down(h, 150, 500); // bolt1 first
    up(h, 150, 200);
    expect(h.store.get().phase).toBe('bolts');
    down(h, 50, 500); // then bolt0
    up(h, 50, 200);
    expect(h.store.get().bolts).toEqual([true, true]);
    expect(h.store.get().phase).toBe('rivetHeat');
  });

  it('a cancelled drag drops the bolt without seating it', () => {
    const h = makeHarness(1, { startPhase: 'bolts' });
    setupAnchors(h);
    down(h, 50, 500);
    h.logic.handleIntent({ kind: 'cancel', t: 999 });
    expect(h.store.get().bolts).toEqual([false, false]);
  });

  it('never dead-ends: grabs the first unseated bolt when no anchors are published yet', () => {
    const h = makeHarness(1, { startPhase: 'bolts' });
    down(h, 0, 0); // no anchors registered at all
    up(h, 999, 999); // no hole anchors either -> fallback forgives the seat
    expect(h.store.get().bolts[0]).toBe(true);
  });
});
