// Smoke E2E: the page boots WebGL, and all 16 scenes advance to the finale
// without page errors. Uses ?test=1 (fixed seed, ~25x animation speed,
// deterministic state exposed via window.__state / window.__advance).
const { test, expect } = require('@playwright/test');
const path = require('path');

test('all 16 scenes advance to the finale without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?test=1';
  await page.goto(url);

  await page.waitForFunction(() => window.__state && window.__state.ready);
  expect(await page.locator('#stage canvas').count()).toBe(1);

  for (let i = 0; i < 16; i++) {
    await page.waitForFunction(() => window.__state.busy === false);
    await page.evaluate(() => window.__advance());
    await page.waitForFunction((n) => window.__state.scene === n, i);
  }

  // finale settles: not busy, replay button shown, whole sentence highlighted
  await page.waitForFunction(() => window.__state.busy === false);
  expect(await page.evaluate(() => window.__state.scene)).toBe(15);
  await expect(page.locator('#replay')).toBeVisible();
  const doneCount = await page.locator('#bar span.done').count();
  expect(doneCount).toBe(15);

  expect(errors).toEqual([]);
});
