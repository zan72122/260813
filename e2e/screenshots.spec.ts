import { expect, test } from '@playwright/test';
import { startGame } from './helpers.ts';

const SCREENSHOT_DIR = 'artifacts/screenshots';

/**
 * A6: additional screenshot coverage beyond the main real-gesture full-loop
 * pass (full-loop.spec.ts) — tablet title/cleanup framing, and seeds 2 & 3
 * title/cleanup so the curated-seed variation is visually inspectable.
 */
test('tablet title + cleanup screenshots', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('tablet'), 'runs only on tablet projects');
  const suffix = testInfo.project.name; // tablet-portrait | tablet-landscape

  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  await expect(page.locator('.title-button')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/title-${suffix}.png` });

  await startGame(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/cleanup-${suffix}.png` });

  const phase = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  expect(phase).toBe('PLAY_CLEANUP');
});

for (const seed of [2, 3] as const) {
  test(`seed ${seed} title + cleanup screenshots`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-portrait', 'one representative viewport is enough for seed variation');

    await page.goto(`/?test=1&seed=${seed}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
    await expect(page.locator('.title-button')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/title-seed${seed}.png` });

    await startGame(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/cleanup-seed${seed}.png` });

    const snapshot = await page.evaluate(() => (window as unknown as { __game: { getSnapshot: () => { seed: number } } }).__game.getSnapshot());
    expect(snapshot.seed).toBe(seed);
  });
}
