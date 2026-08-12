import { expect, test } from '@playwright/test';

/**
 * Wave 2 e2e skeleton: page loads, no console errors, window.__eiffel
 * exists and reaches ready after DOMContentLoaded. Runs across all 4
 * viewport projects declared in playwright.config.ts. The full gameplay
 * loop (tests/e2e/full-loop.spec.ts) is added by the Wave 4 Integrator.
 */
test('page loads with no console errors and __eiffel becomes ready', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  await page.goto('/');

  await expect(page.locator('#app')).toBeAttached();

  // window.__eiffel is declared non-optional (testing.ts), but at runtime it
  // only exists once main.ts's DOMContentLoaded handler fires — guard the
  // poll so we retry rather than reject while it is still undefined.
  await page.waitForFunction(
    () => {
      try {
        return window.__eiffel.ready;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 10_000 },
  );

  const ready = await page.evaluate(() => window.__eiffel.ready);
  expect(ready).toBe(true);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  expect(consoleErrors, `console.error calls: ${consoleErrors.join('; ')}`).toEqual([]);
});
