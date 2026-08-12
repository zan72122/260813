import { expect, test } from '@playwright/test';

/**
 * Wave 1 smoke test: the app boots against `vite preview`, renders a canvas,
 * exposes the debug hook, and produces zero console errors. Owner C
 * (mobile-qa) expands this into the full docs/ACCEPTANCE.md e2e matrix.
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
  expect(snapshot?.phase).toBe('boot');
  expect(snapshot?.progress).toBe(0);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
