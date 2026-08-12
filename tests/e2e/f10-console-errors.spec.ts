import { expect, test } from '@playwright/test';
import { dragCanvasVertical, releaseDrag, walkToward } from './helpers';

/**
 * F10 (docs/ACCEPTANCE.md): zero console errors and zero unhandled
 * rejections across a full interaction pass (boot -> as far through the
 * phase table as the current build supports -> resize -> teardown-adjacent
 * interactions). Runs regardless of how far walkToward gets, so it is
 * meaningful today (boot-only) and stays meaningful once the full phase
 * machine lands.
 */
test.describe('F10: console error / unhandled rejection budget', () => {
  test.setTimeout(45_000);

  test('a full best-effort playthrough produces no console errors or page errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto('/');
    await page.waitForSelector('#app canvas');

    await walkToward(page, 'choice');
    await dragCanvasVertical(page, 0.2, 0.8, { steps: 6 });
    await releaseDrag(page);

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(50);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
