import { expect, test } from '@playwright/test';
import { startGame } from './helpers.ts';

/**
 * T2 (fix-round-1, addresses M9): pointercancel must never complete a drag.
 * Before the fix, PointerController forwarded pointercancel through the
 * same onUp(clientX, clientY, wasTap) callback used for a real release,
 * passing the cancel event's own (often 0,0 / unreliable per spec)
 * coordinates — table/cart's "dragged up far enough" check used exactly
 * that y-coordinate, so a cancel could accidentally satisfy it and
 * complete the drag. Verifies with a real drag-up gesture on the table
 * handle followed by a synthetic pointercancel (garbage 0,0 coords): the
 * table must NOT end up "out" and must animate back toward its stored
 * position instead of staying wherever the drag left it.
 */
test('pointercancel mid table-drag does not complete the drag; table returns to stored', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?test=1&seed=1');
  await startGame(page);
  await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
  await page.waitForFunction(() => (window as unknown as { __game: { phase: string } }).__game.phase === 'LUNCH_SETUP', undefined, { timeout: 15_000 });
  await page.waitForTimeout(600);

  const before = await page.evaluate(() => (window as unknown as { __game: { screenPositionOfHandle: (k: string) => { x: number; y: number } } }).__game.screenPositionOfHandle('table'));

  // Real drag well past the completion threshold (dy > 20px).
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x, before.y - 160, { steps: 8 });

  // Dispatch pointercancel directly (Playwright has no native cancel API) —
  // this simulates what a real cancel delivers: no reliable coordinates.
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, clientX: 0, clientY: 0, bubbles: true }));
  });
  await page.waitForTimeout(600);

  const tableOut = await page.evaluate(() => (window as unknown as { __game: { getProgress: () => { lunchSetup: { tableOut: boolean } } } }).__game.getProgress());
  expect(tableOut.lunchSetup.tableOut, 'table must NOT be marked "out" after a cancel').toBe(false);

  const after = await page.evaluate(() => (window as unknown as { __game: { screenPositionOfHandle: (k: string) => { x: number; y: number } } }).__game.screenPositionOfHandle('table'));
  // Should have animated back down toward its pre-drag (stored) position,
  // not stayed up near the mid-drag point (before.y - 160).
  expect(after.y, 'table handle should snap back near its stored position, not stay mid-drag').toBeGreaterThan(before.y - 60);

  // A real pointerup afterwards (pointerId now stale/released) should not
  // throw or do anything odd either.
  await page.mouse.up();
  await page.waitForTimeout(200);

  expect(consoleErrors).toEqual([]);
});
