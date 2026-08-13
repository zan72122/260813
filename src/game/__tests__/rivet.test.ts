import { describe, expect, it } from 'vitest';
import { down, makeHarness, move, swipe, tap, tick, up } from './harness';

function anchors(h: ReturnType<typeof makeHarness>): void {
  h.anchors.set({ id: 'forge', x: 50, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'tongs', x: 150, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'rivetHole', x: 250, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'hammerSpot', x: 250, y: 50, r: 20, active: true });
}

describe('rivetHeat', () => {
  it('holding the forge raises temp to 1 over ~1.2s (scaled) and advances', () => {
    const h = makeHarness(1, { startPhase: 'rivetHeat' });
    anchors(h);
    down(h, 50, 50);
    tick(h, 2000); // well past the scaled heat duration
    expect(h.store.get().rivet.temp).toBe(1);
    expect(h.events.some((e) => e.name === 'rivet:heated')).toBe(true);
    expect(h.store.get().phase).toBe('rivetCarry');
  });

  it('releasing the forge stops heating (no progress while not held)', () => {
    const h = makeHarness(1, { startPhase: 'rivetHeat' });
    anchors(h);
    down(h, 50, 50);
    tick(h, 100);
    const tempWhileHeld = h.store.get().rivet.temp;
    up(h, 50, 50);
    tick(h, 500);
    expect(h.store.get().rivet.temp).toBe(tempWhileHeld);
  });
});

describe('rivetCarry', () => {
  it('right swipes advance the station 0->1->2 and then advance to rivetInsert', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    swipe(h, 'right');
    expect(h.store.get().rivet.station).toBe(1);
    swipe(h, 'right');
    expect(h.store.get().phase).toBe('rivetInsert');
  });

  it('a wrong-direction swipe is absorbed harmlessly: no state change, no crash', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    expect(() => swipe(h, 'left')).not.toThrow();
    expect(h.store.get().rivet.station).toBe(0);
    expect(h.store.get().phase).toBe('rivetCarry');
  });

  // G2: a slow, deliberate rightward drag never qualifies as a fast swipe
  // (src/input/gestures.ts would classify it as 'drag', not 'swipe'), so the
  // phase itself must accumulate cumulative rightward displacement from raw
  // down/move/up intents and hand off once it crosses the threshold — a
  // careful 4-year-old must never be stuck just for not flicking.
  it('a slow rightward drag past the handoff threshold advances the station, with no swipe intent involved', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    down(h, 100, 100);
    // Ten 7px steps = 70px net rightward — well under any swipe
    // velocity/window threshold, but past the 60px drag-handoff threshold.
    for (let i = 1; i <= 10; i += 1) move(h, 100 + i * 7, 100, 7, 0);
    expect(h.store.get().rivet.station).toBe(1);
    up(h, 170, 100);
  });

  it('a single continuous slow drag can chain both handoffs without lifting the finger', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    down(h, 0, 100);
    // 130px of continuous rightward drag in small steps: crosses the 60px
    // threshold twice (station 0->1->2), advancing straight to rivetInsert.
    for (let i = 1; i <= 26; i += 1) move(h, i * 5, 100, 5, 0);
    expect(h.store.get().rivet.station).toBe(2);
    expect(h.store.get().phase).toBe('rivetInsert');
  });

  it('a slow drag under the threshold does not advance the station', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    down(h, 100, 100);
    // Five 7px steps = 35px net rightward — stays under the 60px threshold.
    for (let i = 1; i <= 5; i += 1) move(h, 100 + i * 7, 100, 7, 0);
    expect(h.store.get().rivet.station).toBe(0);
    expect(h.store.get().phase).toBe('rivetCarry');
  });

  it('a slow leftward drag is absorbed harmlessly: no state change, no crash', () => {
    const h = makeHarness(1, { startPhase: 'rivetCarry' });
    anchors(h);
    down(h, 200, 100);
    expect(() => {
      for (let i = 1; i <= 10; i += 1) move(h, 200 - i * 7, 100, -7, 0);
    }).not.toThrow();
    expect(h.store.get().rivet.station).toBe(0);
    expect(h.store.get().phase).toBe('rivetCarry');
  });
});

describe('rivetInsert', () => {
  it('tapping the hole inserts the rivet and advances to rivetHammer', () => {
    const h = makeHarness(1, { startPhase: 'rivetInsert' });
    anchors(h);
    tap(h, 250, 50);
    expect(h.store.get().rivet.inserted).toBe(true);
    expect(h.store.get().phase).toBe('rivetHammer');
  });
});

describe('rivetHammer', () => {
  it('debounce ignores a mashed second tap within 250ms of the first', () => {
    const h = makeHarness(1, { startPhase: 'rivetHammer' });
    anchors(h);
    tap(h, 250, 50);
    expect(h.store.get().rivet.hits).toBe(1);
    // Immediately mash again — inside the 250ms debounce window, should not count.
    h.logic.handleIntent({ kind: 'tap', x: 250, y: 50, t: h.clock.t + 10 });
    expect(h.store.get().rivet.hits).toBe(1);
  });

  it('spamming taps never double-advances past rivetCool', () => {
    const h = makeHarness(1, { startPhase: 'rivetHammer' });
    anchors(h);
    let t = 0;
    for (let i = 0; i < 20; i += 1) {
      t += 300; // spaced past the debounce window each time
      h.logic.handleIntent({ kind: 'tap', x: 250, y: 50, t });
    }
    expect(h.store.get().rivet.hits).toBe(3);
    expect(h.store.get().phase).toBe('rivetCool');
    // Extra taps after leaving the phase must be no-ops (routed to rivetCool's
    // controller, which ignores all input).
    expect(h.store.get().rivet.formed).toBe(1);
  });
});

describe('rivetCool', () => {
  it('passively cools 0->1 over ~1.5s (scaled) and advances to sling', () => {
    const h = makeHarness(1, { startPhase: 'rivetCool' });
    tick(h, 2000);
    expect(h.store.get().rivet.cooled).toBe(1);
    expect(h.events.some((e) => e.name === 'rivet:cooled')).toBe(true);
    expect(h.store.get().phase).toBe('sling');
  });
});

describe('playRivet free-play loop', () => {
  it('cycles heat -> carry -> insert -> hammer -> cool -> heat forever, staying in playRivet', () => {
    const h = makeHarness(1, { startPhase: 'playRivet' });
    anchors(h);

    // Cycle 1: heat.
    down(h, 50, 50);
    tick(h, 2000);
    expect(h.store.get().phase).toBe('playRivet');
    expect(h.store.get().rivet.temp).toBe(1);
    up(h, 50, 50);

    // carry.
    swipe(h, 'right');
    swipe(h, 'right');
    // insert.
    tap(h, 250, 50);
    // hammer x3 (spaced past the 250ms debounce window each time).
    tap(h, 250, 50);
    h.clock.t += 300;
    tap(h, 250, 50);
    h.clock.t += 300;
    tap(h, 250, 50);
    expect(h.store.get().rivet.formed).toBe(1);

    // cool, then auto-reset back into a fresh rivet (still playRivet).
    tick(h, 2000);
    expect(h.store.get().phase).toBe('playRivet');
    expect(h.store.get().rivet).toEqual({ temp: 0, station: 0, inserted: false, hits: 0, formed: 0, cooled: 0 });

    // A second full cycle works too (heat again).
    down(h, 50, 50);
    tick(h, 2000);
    expect(h.store.get().rivet.temp).toBe(1);
  });

  it('carry sub-phase also accepts a slow rightward drag (G2), not just a swipe', () => {
    const h = makeHarness(1, { startPhase: 'playRivet' });
    anchors(h);
    down(h, 50, 50);
    tick(h, 2000); // heat
    up(h, 50, 50);

    down(h, 0, 100);
    for (let i = 1; i <= 26; i += 1) move(h, i * 5, 100, 5, 0); // 130px slow drag
    expect(h.store.get().rivet.station).toBe(2);
    expect(h.store.get().phase).toBe('playRivet'); // sub-phase advanced, GamePhase unchanged
  });
});
