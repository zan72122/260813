// The four questions the brief asks us to answer on a real device, encoded as
// assertions. Note: these check MECHANICS (does the powder retreat, is the
// reveal staged, is the camera still, is the finger clear of the action).
// Whether it *feels* good, and whether it runs smoothly, can only be judged on
// hardware - see README.
import { expect, test } from '@playwright/test';
import { boot, state, step } from './helpers.js';

/** Jump straight to a buried mound without replaying the factory line. */
async function buried(page) {
  await boot(page);
  await page.evaluate(() => globalThis.__GAME__.game.startFreeRound());
  await step(page, 130); // let the reveal shot finish its move before measuring
}

const strokeAt = (page, yFrac, rev = false) =>
  page.evaluate(
    (o) => {
      const { innerWidth: w, innerHeight: h } = window;
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push([w * (0.12 + (i / 14) * 0.76), h * o.y]);
      globalThis.__GAME__.drag(o.rev ? pts.reverse() : pts, 2);
    },
    { y: yFrac, rev },
  );

/** Sweep horizontally right through the row a known gummy is sitting in. */
async function strokeThroughAGummy(page, index = 0) {
  const y = await page.evaluate((i) => {
    const g = globalThis.__GAME__.game.gummies.items[i];
    return globalThis.__GAME__.aimAt(g.x, g.z).y / window.innerHeight;
  }, index);
  await strokeAt(page, y);
  return y;
}

test.describe('the reveal', () => {
  test('the camera never cuts while the child is brushing', async ({ page }) => {
    await buried(page);
    const before = await page.evaluate(() => ({
      pos: globalThis.__GAME__.game.view.camera.position.toArray(),
      shot: globalThis.__GAME__.game.view.shot.frameW,
    }));
    for (let i = 0; i < 3; i++) await strokeAt(page, 0.42 + i * 0.03, i % 2 === 1);
    await step(page, 30);
    const after = await page.evaluate(() => ({
      pos: globalThis.__GAME__.game.view.camera.position.toArray(),
      shot: globalThis.__GAME__.game.view.shot.frameW,
      stage: globalThis.__GAME__.stage,
    }));
    expect(after.stage).toBe('free');
    expect(after.shot).toBe(before.shot);
    const moved = Math.hypot(
      after.pos[0] - before.pos[0],
      after.pos[1] - before.pos[1],
      after.pos[2] - before.pos[2],
    );
    expect(moved).toBeLessThan(0.5); // only the settle from the entry move
  });

  test('reveals in stages - colour before the whole shape', async ({ page }) => {
    await buried(page);
    await strokeThroughAGummy(page);
    await step(page, 6);
    const dusts = await page.evaluate(() =>
      globalThis.__GAME__.game.gummies.items.map((g) => g.dust),
    );
    // at least one gummy is halfway out: not buried (1) and not clean (0)
    expect(dusts.some((d) => d > 0.08 && d < 0.92)).toBe(true);
    expect(dusts.some((d) => d > 0.92)).toBe(true); // and others are still hidden
  });

  test('the powder is not heavy: a handful of strokes uncovers gummies', async ({ page }) => {
    await buried(page);
    const total = (await state(page)).gummies;
    for (let i = 0; i < 6; i++) await strokeAt(page, 0.38 + i * 0.045, i % 2 === 1);
    await step(page, 30);
    const s = await state(page);
    expect(s.dig).toBeGreaterThan(0.2);
    expect(s.revealed).toBeGreaterThanOrEqual(Math.min(2, total));
  });

  test('the brush works above the fingertip, so a hand never hides the find', async ({
    page,
  }) => {
    await buried(page);
    const gap = await page.evaluate(() => {
      const g = globalThis.__GAME__.game;
      const x = window.innerWidth * 0.5;
      const y = window.innerHeight * 0.55;
      g.pointer.inject('down', x, y);
      g.update(1 / 60);
      const screen = g.view.worldToScreen(g._toolPos.clone());
      g.pointer.inject('up', x, y);
      return { fingerY: y, contactY: screen.y, dpr: window.devicePixelRatio };
    });
    // the powder is being swept well above where the finger is resting
    expect(gap.fingerY - gap.contactY).toBeGreaterThan(40);
  });

  test('nothing gummy-coloured is on screen before the child brushes', async ({ page }) => {
    await buried(page);
    expect((await state(page)).colorsVisible).toEqual([]);
    await strokeThroughAGummy(page);
    await step(page, 30);
    expect((await state(page)).colorsVisible.length).toBeGreaterThan(0);
  });
});

test.describe('layout', () => {
  test('fits the viewport in both orientations without scrolling', async ({ page }) => {
    await boot(page);
    const box = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      w: window.innerWidth,
      h: window.innerHeight,
      canvasW: document.getElementById('stage').clientWidth,
      canvasH: document.getElementById('stage').clientHeight,
    }));
    expect(box.scrollW).toBeLessThanOrEqual(box.w + 1);
    expect(box.scrollH).toBeLessThanOrEqual(box.h + 1);
    expect(box.canvasW).toBe(box.w);
    expect(box.canvasH).toBe(box.h);
  });

  test('the whole tray is inside the frame at the opening shot', async ({ page }) => {
    await boot(page);
    const inside = await page.evaluate(() => {
      const g = globalThis.__GAME__.game;
      const THREE = g.view.camera.constructor;
      void THREE;
      const corners = [
        [-6.5, 0, -4.5],
        [6.5, 0, -4.5],
        [-6.5, 0, 4.5],
        [6.5, 0, 4.5],
      ];
      return corners.map((c) => {
        const v = new g.view.camera.position.constructor(c[0], c[1], c[2]);
        const s = g.view.worldToScreen(v);
        return s.x >= -2 && s.x <= window.innerWidth + 2 && s.y >= -2 && s.y <= window.innerHeight + 2;
      });
    });
    expect(inside.every(Boolean)).toBe(true);
  });
});
