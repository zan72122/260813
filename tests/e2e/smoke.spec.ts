import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('loads at 390x844, renders canvas, zero console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const canvas = page.locator('canvas#scene');
    await expect(canvas).toBeVisible();

    // Give the rAF loop a couple of frames to render before screenshotting.
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'screenshots/smoke-390x844.png' });

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `unhandled page errors: ${pageErrors.join('\n')}`).toEqual([]);
  });
});
