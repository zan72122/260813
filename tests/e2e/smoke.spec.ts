// tests/e2e/smoke.spec.ts — boots the app in all 4 viewport projects and
// walks title -> beyond-title using only state waits (no fixed sleeps).

import { expect, test } from '@playwright/test';
import { gotoGame, waitForPhase } from './helpers';

test.describe('smoke', () => {
  test('loads to title, starts, and exposes window.__game with no console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await gotoGame(page, { seed: '42' });

    // Either the loading screen is visible right away and then hides, or it
    // is already gone by the time we can observe it — both are acceptable;
    // what matters is that we deterministically reach `title`.
    await waitForPhase(page, 'title');
    await expect(page.getByTestId('loading-screen')).toBeHidden();
    await expect(page.getByTestId('title-start')).toBeVisible();

    await page.getByTestId('title-start').click();

    await page.waitForFunction(
      () => window.__game !== undefined && window.__game.getState().phase !== 'title',
      undefined,
      { timeout: 10_000 },
    );

    const hasGameApi = await page.evaluate(() => typeof window.__game === 'object');
    expect(hasGameApi).toBe(true);

    expect(consoleErrors).toEqual([]);
  });
});
