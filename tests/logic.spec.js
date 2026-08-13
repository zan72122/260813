// The stage machine is plain JS with no DOM, so it can be driven far faster
// and far more deterministically here than through a browser.
import { test, expect } from '@playwright/test';
import { Game, STAGE } from '../src/game.js';

/** @param {(g: Game, i: number) => void} player */
function play(seed, seconds, player) {
  const g = new Game({ seed });
  const dt = 1 / 60;
  const seen = [];
  let last = -1;
  for (let i = 0; i < seconds * 60; i++) {
    player(g, i);
    g.update(dt);
    if (g.stage !== last) { seen.push(g.stage); last = g.stage; }
  }
  return { g, seen };
}

test('an engaged child reaches the finale', () => {
  const { g, seen } = play(4242, 200, (g, i) => {
    if (i % 3 === 0) g.turn(0.09, 1 / 60);
    if (g.stage === STAGE.PLACE && i % 600 === 0) g.tap(0, 0);
    if (g.stage === STAGE.PRESS && i % 120 === 0) { const p = g.beginPress(0.1, 0.1); p.s = 1; g.endPress(p); }
    if (g.stage === STAGE.PARTS && i % 200 === 0) g.placeNextPart();
  });
  expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(g.charge).toBe(1);
});

test('a child who only turns the ring, and nothing else, still gets there', () => {
  const { seen } = play(7, 260, (g, i) => { if (i % 4 === 0) g.turn(0.11, 1 / 60); });
  expect(seen[seen.length - 1]).toBe(STAGE.DONE);
});

test('nothing is ever a dead end — even with no input at all', () => {
  const { g, seen } = play(99, 420, () => {});
  expect(seen[seen.length - 1]).toBe(STAGE.DONE);
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
});

test('no stage can livelock on its celebration', () => {
  // 1000 seconds of the most patient possible player
  const { g } = play(3, 1000, (g, i) => { if (i % 6 === 0) g.turn(0.08, 1 / 60); });
  expect(g.stage).toBe(STAGE.DONE);
});

test('colour charge rises with rotation and only with rotation', () => {
  const g = new Game({ seed: 11 });
  g.tap(0, 0);
  for (let i = 0; i < 120; i++) g.update(1 / 60);   // 2s of sitting still
  expect(g.charge).toBe(0);
  const marks = [];
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < 12; i++) { g.turn(0.02, 1 / 60); g.update(1 / 60); }
    marks.push(g.charge);
  }
  // strictly rising the whole way up, and never falling once it saturates
  for (let i = 1; i < marks.length; i++) {
    expect(marks[i]).toBeGreaterThanOrEqual(marks[i - 1]);
    if (marks[i - 1] < 0.99) expect(marks[i]).toBeGreaterThan(marks[i - 1]);
  }
  expect(marks[marks.length - 1]).toBeGreaterThan(0.15);
  // two and a half turns of the ring is enough to reach the full rainbow
  for (let i = 0; i < 300; i++) { g.turn(0.05, 1 / 60); g.update(1 / 60); }
  expect(g.charge).toBe(1);
});

test('every seed makes a piece with sane, pretty-range stress', () => {
  for (let seed = 0; seed < 400; seed++) {
    const g = new Game({ seed });
    for (const p of [g.set.hero, ...g.set.others]) {
      const total = p.ret.reduce((a, b) => a + b, 0) + p.seed[3];
      expect(p.seed[3]).toBeGreaterThan(250);   // the tint plate, in nm
      // stays inside the vivid first few Michel-Lévy orders, never the pale tail
      expect(total).toBeGreaterThan(1100);
      expect(total).toBeLessThan(3400);
      expect(p.size).toBeGreaterThan(0.5);
      expect(Number.isFinite(p.sweet)).toBe(true);
    }
    // the three pieces on stage together are never all the same shape
    expect(new Set([g.set.hero.family, ...g.set.others.map((o) => o.family)]).size)
      .toBeGreaterThan(1);
  }
});

test('replaying the same seed reproduces the piece exactly', () => {
  const a = new Game({ seed: 555 });
  const b = new Game({ seed: 555 });
  expect(JSON.stringify(a.set)).toBe(JSON.stringify(b.set));
  a.replay();
  expect(JSON.stringify(a.set)).toBe(JSON.stringify(b.set));
  a.nextOne();
  expect(JSON.stringify(a.set)).not.toBe(JSON.stringify(b.set));
});
