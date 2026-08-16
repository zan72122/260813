// Chromium smoke E2E. Uses the deterministic sim API (window.__game) to
// advance logical time directly instead of judging visuals under SwiftShader.
import { test, expect } from '@playwright/test';

const URL = 'http://127.0.0.1:8734/index.html?e2e=1&seed=42&n=150';

test('boots, renders, and a full baseline run completes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.frames > 5);

  // Everyone is waiting at the corners, light is red.
  const state = await page.evaluate(() => window.__game.state());
  expect(state).toBe('ready');
  expect(await page.evaluate(() => window.__game.agentCount())).toBe(150);

  // Press the signal and advance simulated time until the run finishes.
  await page.evaluate(() => window.__game.pressGo());
  await page.evaluate(() => window.__game.stepSeconds(90));
  const m = await page.evaluate(() => window.__game.metrics());
  expect(m.complete).toBe(true);
  expect(m.crossed).toBeGreaterThan(100);          // 100+ people crossed
  expect(m.leftBehind).toBeGreaterThan(5);         // baseline strands some
  expect(m.peakJam).toBeGreaterThan(20);           // baseline visibly jams

  expect(errors).toEqual([]);
});

test('widening + longer green makes the same crowd flow better', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.frames > 5);

  // Baseline run.
  await page.evaluate(() => {
    window.__game.pressGo();
    window.__game.stepSeconds(90);
  });
  const base = await page.evaluate(() => window.__game.metrics());

  // Intervene: widen all crosswalks and lengthen the green, then RESET and
  // replay the identical crowd.
  await page.evaluate(() => {
    window.__game.setWidthAll(9.5);
    window.__game.setGreen(20);
    window.__game.reset();
    window.__game.pressGo();
    window.__game.stepSeconds(90);
  });
  const after = await page.evaluate(() => window.__game.metrics());

  expect(after.complete).toBe(true);
  expect(after.leftBehind).toBeLessThan(Math.max(1, base.leftBehind));
  expect(after.jamSum).toBeLessThan(base.jamSum * 0.65);

  // The canvas is actually drawing frames.
  const frames = await page.evaluate(() => window.__game.frames);
  await page.waitForTimeout(400);
  const frames2 = await page.evaluate(() => window.__game.frames);
  expect(frames2).toBeGreaterThan(frames);
});
