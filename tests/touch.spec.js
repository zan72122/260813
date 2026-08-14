// Drives the game with real touch events through the DOM, not the internal
// autoplay hook — this is the path a child's finger actually takes.

import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__somen && window.__somen.ready);
  return errors;
}

test('a real finger can gather the dough and start stretching it', async ({ page }) => {
  const errors = await boot(page);

  // Tap each lump where it actually is on screen.
  for (let i = 0; i < 8; i++) {
    const target = await page.evaluate(() => {
      const g = window.__somen;
      if (g.stage !== 'gather') return null;
      const b = g.world.blobs.find((x) => x.state === 'idle');
      return b ? { x: b.x, y: b.y } : null;
    });
    if (!target) break;
    const pt = await page.evaluate(([wx, wy]) => window.__somenToScreen(wx, wy), [target.x, target.y]);
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(120);
  }

  await expect.poll(
    () => page.evaluate(() => window.__somen.world.blobs.every((b) => b.state === 'gone')),
    { timeout: 8000 },
  ).toBe(true);

  await expect.poll(() => page.evaluate(() => window.__somen.stage), { timeout: 8000 })
    .toBe('stretch1');

  // Now drag: the dough must actually get longer.
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => window.__somen.world.rope.len);
  const start = await page.evaluate(() => {
    const r = window.__somen.world.rope;
    return window.__somenToScreen(r.hx, r.hy);
  });
  await page.touchscreen.tap(start.x, start.y); // wake audio + focus
  const box = page.viewportSize();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(start.x + (box.width * 0.5 * i) / 12, start.y);
    await page.waitForTimeout(24);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => window.__somen.world.rope.len);
  expect(after).toBeGreaterThan(before + 50);
  expect(errors).toEqual([]);
});

test('a second finger cannot hijack the drag', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__somen.jump(1));
  await page.waitForTimeout(900);

  // Press with one pointer, then send a second pointerdown elsewhere.
  await page.evaluate(() => {
    const c = document.getElementById('stage');
    const mk = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch',
    }));
    mk('pointerdown', 1, 100, 300);
    mk('pointerdown', 2, 300, 300);   // ignored
    mk('pointermove', 2, 320, 300);   // ignored
  });
  const id = await page.evaluate(() => window.__somenPointerId());
  expect(id).toBe(1);
});
