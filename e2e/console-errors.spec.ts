import { expect, test } from '@playwright/test';

/**
 * D5: zero console errors / unhandled rejections across the full loop, in
 * every required viewport. Uses harness fast-forward (completeCurrentObjective
 * + advancePhase) rather than real gestures purely for speed — this spec's
 * job is to catch runtime errors and warnings-as-errors, not to validate
 * interaction correctness (full-loop.spec.ts already does that with real
 * gestures).
 */
test('zero console errors across the full loop', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    // Ignore aborted preflight noise some browsers emit for same-origin module loads on fast navigations.
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });

  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));

  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(300);

  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => (window as unknown as { __game: { completeCurrentObjective: () => void } }).__game.completeCurrentObjective());
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as unknown as { __game: { advancePhase: () => void } }).__game.advancePhase());
    await page.waitForTimeout(300);
  }

  const phase = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  expect(phase).toBe('REPLAY');

  await page.evaluate(() => (window as unknown as { __game: { replaySameDay: () => void } }).__game.replaySameDay());
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as unknown as { __game: { toggleMute: () => void } }).__game.toggleMute());
  await page.evaluate(() => (window as unknown as { __game: { toggleMute: () => void } }).__game.toggleMute());
  await page.waitForTimeout(300);

  expect(errors).toEqual([]);
});
