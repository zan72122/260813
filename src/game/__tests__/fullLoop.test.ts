// Fixed-step simulation walking the ENTIRE loop from `opening` through
// `complete` via synthetic GameIntents (no browser, no DOM). This is the
// gameplay owner's core proof: every phase's single verb always eventually
// advances, no matter how it's approached (including wrong/harmless input
// mixed in), and the loop is deterministic for a given seed.

import { describe, expect, it } from 'vitest';
import { beamShapeFor } from '../../contracts/machine';
import type { GamePhase } from '../../contracts/types';
import { down, makeHarness, move, swipe, tap, tick, up, type Harness } from './harness';

function fullAnchors(h: Harness): void {
  h.anchors.set({ id: 'beam', x: 200, y: 300, r: 30, active: true });
  h.anchors.set({ id: 'ghost', x: 260, y: 300, r: 40, active: true });
  h.anchors.set({ id: 'bolt0', x: 60, y: 500, r: 20, active: true });
  h.anchors.set({ id: 'bolt1', x: 140, y: 500, r: 20, active: true });
  h.anchors.set({ id: 'hole0', x: 220, y: 260, r: 15, active: true });
  h.anchors.set({ id: 'hole1', x: 300, y: 260, r: 15, active: true });
  h.anchors.set({ id: 'forge', x: 50, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'tongs', x: 150, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'rivetHole', x: 250, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'hammerSpot', x: 250, y: 50, r: 20, active: true });
  h.anchors.set({ id: 'slingClasp', x: 100, y: 100, r: 15, active: true });
  h.anchors.set({ id: 'climbLever', x: 200, y: 500, r: 30, active: true });
}

/** Drives one full opening->complete loop, returning the ordered phase history. */
function walkOneLoop(h: Harness): string[] {
  const history: string[] = [];
  const unsub = h.bus.on('phase:enter', (p) => history.push(p.phase));

  // opening -> hookDown (auto after dwell).
  tick(h, 1000);

  // hookDown -> hoist. Beam anchor is at (200,300); the hook target tracks
  // ~80px above the finger, so dragging the finger down to y=380 lands the
  // (virtual) hook right on it.
  down(h, 200, 100);
  move(h, 200, 380, 0, 280);
  tick(h, 1000);

  // hoist -> align.
  down(h, 200, 600);
  for (let i = 0; i < 60 && h.store.get().phase === 'hoist'; i += 1) {
    move(h, 200, 600 - i * 30, 0, -30);
  }

  // align -> bolts.
  down(h, 200, 300);
  for (let i = 0; i < 60 && h.store.get().phase === 'align'; i += 1) {
    move(h, 200 + i, 300, 1, 0);
    tick(h, 60);
  }
  tick(h, 1000);

  // bolts -> rivetHeat.
  down(h, 60, 500);
  up(h, 220, 260);
  down(h, 140, 500);
  up(h, 300, 260);

  // rivetHeat -> rivetCarry.
  down(h, 50, 50);
  tick(h, 2000);
  up(h, 50, 50);

  // rivetCarry -> rivetInsert.
  swipe(h, 'right');
  swipe(h, 'right');

  // rivetInsert -> rivetHammer.
  tap(h, 250, 50);

  // rivetHammer -> rivetCool (3 hits, spaced past debounce).
  tap(h, 250, 50);
  h.clock.t += 300;
  tap(h, 250, 50);
  h.clock.t += 300;
  tap(h, 250, 50);

  // rivetCool -> sling.
  tick(h, 2000);

  // sling -> climb.
  tap(h, 100, 100);
  tick(h, 1000);

  // climb -> reveal.
  down(h, 200, 900);
  move(h, 200, 0, 0, -900);
  tick(h, 5000);

  // reveal -> complete.
  tick(h, 2000);

  unsub();
  return history;
}

describe('full loop: opening -> complete', () => {
  it('walks every phase exactly once, in canonical order, via synthetic intents only', () => {
    const h = makeHarness(42, { startPhase: 'opening' });
    fullAnchors(h);
    const history = walkOneLoop(h);
    expect(history).toEqual([
      'hookDown',
      'hoist',
      'align',
      'bolts',
      'rivetHeat',
      'rivetCarry',
      'rivetInsert',
      'rivetHammer',
      'rivetCool',
      'sling',
      'climb',
      'reveal',
      'complete',
    ]);
    expect(h.store.get().phase).toBe('complete');
    expect(h.store.get().towerLevel).toBe(1);
  });

  it('every step-advancing event fires exactly once across a clean run (no double-advance)', () => {
    const h = makeHarness(7, { startPhase: 'opening' });
    fullAnchors(h);
    walkOneLoop(h);
    for (const name of ['snap:hook', 'snap:align', 'rivet:heated', 'rivet:formed', 'rivet:cooled', 'sling:released', 'climb:locked', 'reveal:done']) {
      expect(h.events.filter((e) => e.name === name)).toHaveLength(1);
    }
    expect(h.events.filter((e) => e.name === 'bolt:seated')).toHaveLength(2);
  });

  it('replaying with the same seed reproduces the same beamShape sequence deterministically', () => {
    const seed = 99;
    const shapesA = [0, 1, 2, 3].map((level) => beamShapeFor(seed, level));
    const shapesB = [0, 1, 2, 3].map((level) => beamShapeFor(seed, level));
    expect(shapesA).toEqual(shapesB);

    // And driving two independent harnesses with the same seed through a full
    // loop lands on the same beamShape for towerLevel 0, unaffected by the
    // (deterministic) gameplay simulation itself.
    const h1 = makeHarness(seed, { startPhase: 'opening' });
    const h2 = makeHarness(seed, { startPhase: 'opening' });
    fullAnchors(h1);
    fullAnchors(h2);
    expect(h1.store.get().beamShape).toBe(h2.store.get().beamShape);
    walkOneLoop(h1);
    walkOneLoop(h2);
    expect(h1.store.get().towerLevel).toBe(h2.store.get().towerLevel);
  });
});

describe('no dead ends: from every interactive phase, the designed verb always eventually advances', () => {
  const cases: Array<{ phase: GamePhase; drive: (h: Harness) => void; next: GamePhase }> = [
    {
      phase: 'hookDown',
      next: 'hoist',
      drive: (h) => {
        down(h, 200, 100);
        for (let i = 0; i < 20; i += 1) move(h, 200, 100 + i * 20, 0, 20);
        tick(h, 1000);
      },
    },
    {
      phase: 'hoist',
      next: 'align',
      drive: (h) => {
        down(h, 200, 900);
        for (let i = 0; i < 80 && h.store.get().phase === 'hoist'; i += 1) move(h, 200, 900 - i * 30, 0, -30);
      },
    },
    {
      phase: 'align',
      next: 'bolts',
      drive: (h) => {
        down(h, 0, 0);
        for (let i = 0; i < 200 && h.store.get().phase === 'align'; i += 1) {
          move(h, i * 10, i * 10, 10, 10);
          tick(h, 50);
        }
      },
    },
    {
      phase: 'bolts',
      next: 'rivetHeat',
      drive: (h) => {
        down(h, 0, 0);
        up(h, 0, 0);
        down(h, 0, 0);
        up(h, 0, 0);
      },
    },
    {
      phase: 'rivetHeat',
      next: 'rivetCarry',
      drive: (h) => {
        down(h, 0, 0);
        tick(h, 2000);
      },
    },
    {
      phase: 'rivetCarry',
      next: 'rivetInsert',
      drive: (h) => {
        swipe(h, 'left'); // wrong direction first — must be absorbed, not stuck
        swipe(h, 'right');
        swipe(h, 'right');
      },
    },
    {
      phase: 'rivetInsert',
      next: 'rivetHammer',
      drive: (h) => tap(h, 0, 0),
    },
    {
      phase: 'rivetHammer',
      next: 'rivetCool',
      drive: (h) => {
        let t = 0;
        for (let i = 0; i < 10; i += 1) {
          t += 300;
          h.logic.handleIntent({ kind: 'tap', x: 0, y: 0, t });
        }
      },
    },
    {
      phase: 'rivetCool',
      next: 'sling',
      drive: (h) => tick(h, 2000),
    },
    {
      phase: 'sling',
      next: 'climb',
      drive: (h) => {
        tap(h, 0, 0);
        tick(h, 1000);
      },
    },
    {
      phase: 'climb',
      next: 'reveal',
      drive: (h) => {
        down(h, 200, 900);
        move(h, 200, 0, 0, -900);
        tick(h, 2400); // enough to lock + settle, not enough to also clear reveal's dwell
      },
    },
    {
      phase: 'reveal',
      next: 'complete',
      drive: (h) => tick(h, 3000),
    },
  ];

  for (const { phase, drive, next } of cases) {
    it(`${phase} -> ${next}`, () => {
      const h = makeHarness(3, { startPhase: phase });
      // Deliberately do NOT publish any anchors here: verifies the
      // no-anchor-yet fallback path never dead-ends either.
      drive(h);
      expect(h.store.get().phase).toBe(next);
    });
  }
});
