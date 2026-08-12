import { expect, test } from '@playwright/test';

/**
 * Wave 1 smoke test: the app boots against `vite preview`, renders a canvas,
 * exposes the debug hook, and produces zero console errors. Owner C
 * (mobile-qa) expands this into the full docs/ACCEPTANCE.md e2e matrix.
 *
 * Wave 3: GameDirector's real phase FSM (src/game/GameDirector.ts) advances
 * boot -> title on its very first update() tick (no user input needed for
 * that specific transition), so by the time this test reads the debug hook
 * the phase has already left 'boot' — asserting phase==='boot' here would be
 * asserting a race, not a guarantee. progress===0 still holds: nothing in
 * boot/title touches StageTransformProgress.
 */
test('boots with a canvas, debug hook, and no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');
  await page.waitForSelector('#app canvas');

  const snapshot = await page.evaluate(() => window.__stageDebug?.getState());
  expect(snapshot).toBeDefined();
  expect(['boot', 'title']).toContain(snapshot?.phase);
  expect(snapshot?.progress).toBe(0);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
