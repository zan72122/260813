// REAL input, through the DOM.
//
// Everything else in this suite drives the game through `__GAME__`, which
// injects straight into the pointer handler. That is deterministic, but it
// bypasses hit-testing entirely - so a HUD layer silently swallowing every
// tap looks exactly like a passing test. These cases use the browser's own
// mouse and touch, and they must keep working on a desktop too.
import { expect, test } from '@playwright/test';
import { boot, state } from './helpers.js';

/** Nothing in the HUD may sit on top of the canvas while the game is playable. */
async function whatIsUnderTheMiddle(page) {
  return page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return { tag: el?.tagName, id: el?.id, cls: el?.className };
  });
}

test.describe('real pointer input', () => {
  test('the canvas, not the HUD, is what the middle of the screen hits', async ({ page }) => {
    await boot(page);
    const hit = await whatIsUnderTheMiddle(page);
    expect(hit.id).toBe('stage');
  });

  test('a mouse click on the title starts the game', async ({ page }) => {
    await boot(page);
    expect((await state(page)).stage).toBe('title');
    await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height / 2);
    await expect.poll(async () => (await state(page)).stage, { timeout: 5000 }).toBe('flatten');
  });

  test('a real drag flattens the powder', async ({ page }) => {
    await boot(page);
    const { width: w, height: h } = page.viewportSize();
    await page.mouse.click(w / 2, h / 2);
    await expect.poll(async () => (await state(page)).stage, { timeout: 5000 }).toBe('flatten');

    for (let pass = 0; pass < 4; pass++) {
      const y = h * (0.42 + pass * 0.03);
      await page.mouse.move(w * 0.15, y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(w * (0.15 + (i / 10) * 0.7), y);
      await page.mouse.up();
    }
    await expect.poll(async () => (await state(page)).flatten, { timeout: 8000 }).toBeGreaterThan(
      0.05,
    );
  });

  test('a real touch tap starts the game too', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch emulation only');
    await boot(page);
    await page.touchscreen.tap(page.viewportSize().width / 2, page.viewportSize().height / 2);
    await expect.poll(async () => (await state(page)).stage, { timeout: 5000 }).toBe('flatten');
  });

  test('the sound button still receives its own taps', async ({ page }) => {
    await boot(page);
    const btn = page.locator('.icon-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    // the button toggled, and the click did NOT also start the game
    await expect(btn).toHaveText('🔇');
    expect((await state(page)).stage).toBe('title');
  });
});
