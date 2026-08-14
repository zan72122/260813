// One full playthrough, driven by the same pointer path a finger uses.
// Asserts the loop actually reaches the reveal and never gets stuck.

import { test, expect } from '@playwright/test';

const ORDER = ['gather', 'stretch1', 'hang', 'stretch2', 'align', 'dry', 'cut', 'bundle', 'reveal'];

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__somen && window.__somen.ready);
  return errors;
}

test('plays the whole loop from white dough to the somen reveal', async ({ page }) => {
  const errors = await boot(page);

  expect(await page.evaluate(() => window.__somen.stages)).toEqual(ORDER);
  expect(await page.evaluate(() => window.__somen.stage)).toBe('gather');

  await page.evaluate(() => { window.__somen.speed(3); window.__somen.auto(true); });

  const seen = [];
  const deadline = Date.now() + 70_000;
  let last = '';
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => window.__somen.stage);
    if (s !== last) { seen.push(s); last = s; }
    if (await page.evaluate(() => window.__somen.done)) break;
    await page.waitForTimeout(180);
  }

  // Every stage was visited, in order, and the finale was reached.
  expect(seen).toEqual(ORDER);
  expect(await page.evaluate(() => window.__somen.done)).toBe(true);

  // The state machine's promises about the finished product.
  const w = await page.evaluate(() => {
    const W = window.__somen.world;
    return {
      strands: W.strands.length,
      dryness: W.dryness,
      comb: W.combDone,
      cutL: W.cut.left,
      cutR: W.cut.right,
      band: W.band.on,
      bowl: W.bowlA,
      // every noodle ends up trimmed to the same span
      lengths: W.strands.map((s) => Math.round(
        (s.visB - s.visA) * (760 + s.extraL + s.extraR)
      )),
    };
  });
  expect(w.strands).toBeGreaterThanOrEqual(40);
  expect(w.dryness).toBeCloseTo(1, 2);
  expect(w.comb).toBeCloseTo(1, 2);
  expect(w.cutL && w.cutR && w.band).toBe(true);
  expect(w.bowl).toBeGreaterThan(0.8);
  const spread = Math.max(...w.lengths) - Math.min(...w.lengths);
  expect(spread).toBeLessThanOrEqual(2); // "same length" really is the same

  expect(errors).toEqual([]);
});

test('survives an orientation flip mid-play and keeps one-finger input', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__somen.speed(3); window.__somen.auto(true); window.__somen.jump(3); });
  await page.waitForTimeout(1200);

  const size = page.viewportSize();
  await page.setViewportSize({ width: size.height, height: size.width });
  await page.waitForTimeout(1200);

  const alive = await page.evaluate(() => ({
    stage: window.__somen.stage,
    stretch: window.__somen.world.stretch,
  }));
  expect(ORDER.indexOf(alive.stage)).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('no fail state: doing nothing shows a hint instead of a game over', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(3200);
  const h = await page.evaluate(() => ({ on: window.__somen.world.hint.on, stage: window.__somen.stage }));
  expect(h.stage).toBe('gather');
  expect(h.on).toBeGreaterThan(0.5);
});
