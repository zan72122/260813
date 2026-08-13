import { expect, test, type Page } from '@playwright/test';
import { WIPE_GRID, retryUntil, sweepPointer } from './helpers.ts';

/**
 * T3 (fix-round-1, addresses M5): reduced motion must actually change
 * behavior, not just skip the idle wiggle hint (which the test harness's
 * updateHints() early-return on testMode makes untestable via idle-timeout
 * anyway). Verifies two concrete, testable INTERACTION_SPEC-mandated
 * effects of the setting:
 *   - the eating vignette's auto-advance wall-clock is shortened
 *     (VIGNETTE_MS * 0.6 instead of the full VIGNETTE_MS)
 *   - sparkles are suppressed: a real wipe gesture (which spawns a sparkle
 *     per cell visited, independent of the idle-hint system and NOT gated
 *     by testMode) spawns zero sparkles under reduced motion.
 */

async function startAndReachLunchSetupEntry(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
  await page.waitForFunction(() => (window as unknown as { __game: { phase: string } }).__game.phase === 'LUNCH_SETUP', undefined, { timeout: 15_000 });
}

async function returnAllTraysAndWipe(page: Page): Promise<boolean> {
  // The wipe pickable only exists once every tray is back on the cart (see
  // SceneRoot.getPickables: `lc.traysReturned >= 4`) — simulateReturnTray is
  // FSM-only (no visual/wipeProgress side effect), so this sets up the
  // precondition without touching what the test is actually measuring.
  for (let i = 0; i < 4; i++) {
    await page.evaluate((idx) => (window as unknown as { __game: { simulateReturnTray: (i: number) => boolean } }).__game.simulateReturnTray(idx), i);
  }
  return retryUntil(
    async () => {
      const wipeCenter = await page.evaluate(() => (window as unknown as { __game: { screenPositionOfHandle: (k: string) => { x: number; y: number } } }).__game.screenPositionOfHandle('wipe'));
      await sweepPointer(page, wipeCenter, WIPE_GRID);
    },
    async () => (await page.evaluate(() => (window as unknown as { __game: { getProgress: () => { lunchCleanup: { wipeProgress: number } } } }).__game.getProgress())).lunchCleanup.wipeProgress > 0,
    page,
  );
}

test('reduced motion shortens the eating vignette and suppresses sparkles', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));

  await page.evaluate(() => (window as unknown as { __game: { setReducedMotion: (v: boolean) => void } }).__game.setReducedMotion(true));
  await startAndReachLunchSetupEntry(page);

  // Furniture-ready fires the eating vignette; measure real wall-clock time
  // until it auto-advances to LUNCH_CLEANUP.
  const t0 = Date.now();
  await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
  await page.waitForFunction(() => (window as unknown as { __game: { phase: string } }).__game.phase === 'LUNCH_CLEANUP', undefined, { timeout: 15_000 });
  const vignetteMs = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log('reduced-motion eating vignette wall-clock:', vignetteMs, 'ms');

  // Full VIGNETTE_MS is 8000ms (+400ms furniture-ready delay = ~8400ms);
  // reduced motion should land near 0.6x that (~5200ms). A generous upper
  // bound well under the un-reduced total proves it was actually shortened.
  expect(vignetteMs).toBeLessThan(7000);

  // ---- sparkle suppression: a real wipe gesture during LUNCH_CLEANUP ----
  await page.waitForTimeout(1500); // let the transform camera tween fully settle (see M2 fix-round-1 note on slow-render dt clamping)
  const sparklesBefore = await page.evaluate(() => (window as unknown as { __game: { sparkleSpawnedCount: number } }).__game.sparkleSpawnedCount);
  const wiped = await returnAllTraysAndWipe(page);
  await page.waitForTimeout(300);
  const sparklesAfter = await page.evaluate(() => (window as unknown as { __game: { sparkleSpawnedCount: number } }).__game.sparkleSpawnedCount);

  // Sanity: the wipe gesture itself worked (progress advanced) — otherwise
  // "zero sparkles" would trivially and meaninglessly pass.
  expect(wiped, 'wipe gesture should have registered progress').toBe(true);
  expect(sparklesAfter - sparklesBefore, 'no sparkles should spawn under reduced motion').toBe(0);

  expect(consoleErrors).toEqual([]);
});

test('without reduced motion, the same wipe gesture DOES spawn sparkles (control)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  await startAndReachLunchSetupEntry(page);
  await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
  await page.waitForFunction(() => (window as unknown as { __game: { phase: string } }).__game.phase === 'LUNCH_CLEANUP', undefined, { timeout: 15_000 });
  await page.waitForTimeout(1500); // let the transform camera tween fully settle (see M2 fix-round-1 note on slow-render dt clamping)

  const sparklesBefore = await page.evaluate(() => (window as unknown as { __game: { sparkleSpawnedCount: number } }).__game.sparkleSpawnedCount);
  const wiped = await returnAllTraysAndWipe(page);
  await page.waitForTimeout(300);
  const sparklesAfter = await page.evaluate(() => (window as unknown as { __game: { sparkleSpawnedCount: number } }).__game.sparkleSpawnedCount);

  expect(wiped, 'wipe gesture should have registered progress').toBe(true);
  expect(sparklesAfter - sparklesBefore, 'sparkles should spawn without reduced motion').toBeGreaterThan(0);
});
