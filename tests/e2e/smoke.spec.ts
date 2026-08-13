import { expect, test, type Page } from '@playwright/test';

/**
 * One full trip through the factory, driven the way a child would drive it
 * (taps and drags), plus a check that tilting the finished card really does
 * change the pixels - that being the whole point of the game.
 *
 * `?fast=1` drops to dpr 1 and disables the glint noise and confetti so this
 * stays cheap under SwiftShader. Nothing here judges visual quality.
 */

interface DebugState {
  phase: string;
  card: number;
  pattern: number;
  presses: number;
  emboss: number;
  coverage: number;
  rect: { x: number; y: number; w: number; h: number };
}

declare global {
  interface Window {
    __GAME__: {
      ready: boolean;
      state(): DebugState;
      tilt(x: number, y: number): void;
      releaseTilt(): void;
      sample(): [number, number, number];
      press(): void;
      fillFoil(): void;
    };
  }
}

const state = (page: Page) => page.evaluate(() => window.__GAME__.state());

async function boot(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fast=1');
  await page.waitForFunction(() => window.__GAME__?.ready === true);
  await expect(page.locator('#unsupported')).toBeHidden();
  expect(errors).toEqual([]);
}

// The idle animation means nothing is ever "stable"; that is intended for the
// child, so click through it.
const tap = (page: Page, selector: string) => page.locator(selector).click({ force: true });

test('a whole card gets made, and tilting it changes what is on screen', async ({ page }) => {
  await boot(page);
  expect((await state(page)).phase).toBe('title');

  await tap(page, '#screen-title .big-btn');
  await expect.poll(async () => (await state(page)).phase).toBe('pickCard');

  await tap(page, '[data-card="1"]');
  await expect.poll(async () => (await state(page)).phase).toBe('pickPattern');
  expect((await state(page)).card).toBe(1);

  await tap(page, '[data-pattern="2"]');
  await expect.poll(async () => (await state(page)).phase).toBe('press');
  expect((await state(page)).pattern).toBe(2);

  // --- press the micro-pattern in by tapping the card ---
  const before = await state(page);
  expect(before.emboss).toBeLessThan(0.1);
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(before.rect.x, before.rect.y);
    await page.waitForTimeout(250);
  }
  await expect.poll(async () => (await state(page)).presses).toBe(3);
  await expect.poll(async () => (await state(page)).emboss, { timeout: 5000 }).toBeGreaterThan(0.9);

  // --- roll the foil on with a single continuous drag ---
  await expect.poll(async () => (await state(page)).phase, { timeout: 5000 }).toBe('foil');
  const card = (await state(page)).rect;
  const left = card.x - card.w * 0.4;
  const right = card.x + card.w * 0.4;
  const top = card.y - card.h * 0.42;
  const bottom = card.y + card.h * 0.42;

  await page.mouse.move(left, top);
  await page.mouse.down();
  for (let r = 0; r < 8; r++) {
    const y = top + ((bottom - top) * r) / 7;
    const [a, b] = r % 2 === 0 ? [left, right] : [right, left];
    await page.mouse.move(a, y, { steps: 3 });
    await page.mouse.move(b, y, { steps: 12 });
  }
  await page.mouse.up();

  // --- the finished card ---
  await expect.poll(async () => (await state(page)).phase, { timeout: 15000 }).toBe('finish');
  expect((await state(page)).coverage).toBeGreaterThan(0.6);
  await expect(page.locator('[data-action="again"]')).toBeVisible();

  // Tilting has to visibly change the card, not just the numbers.
  const sampleAt = (tx: number, ty: number) =>
    page.evaluate(
      ([x, y]) => {
        window.__GAME__.tilt(x, y);
        // let the damped tilt settle, then read the pixels back
        for (let i = 0; i < 60; i++) window.__GAME__.sample();
        return window.__GAME__.sample();
      },
      [tx, ty],
    );

  const leftTilt = await sampleAt(-0.9, 0.1);
  const rightTilt = await sampleAt(0.9, -0.1);
  const delta =
    Math.abs(leftTilt[0] - rightTilt[0]) +
    Math.abs(leftTilt[1] - rightTilt[1]) +
    Math.abs(leftTilt[2] - rightTilt[2]);
  expect(delta, 'tilting the card must change its colour').toBeGreaterThan(12);

  // --- and it must be instantly replayable ---
  await page.evaluate(() => window.__GAME__.releaseTilt());
  await tap(page, '[data-action="again"]');
  await expect.poll(async () => (await state(page)).phase).toBe('pickCard');
  expect((await state(page)).presses).toBe(0);
  expect((await state(page)).coverage).toBe(0);
});

test('every base card and every pattern can be chosen', async ({ page }) => {
  await boot(page);
  await tap(page, '#screen-title .big-btn');

  for (const card of [0, 1, 2]) {
    for (const pattern of [0, 1, 2]) {
      await expect.poll(async () => (await state(page)).phase).toBe('pickCard');
      await tap(page, `[data-card="${card}"]`);
      await tap(page, `[data-pattern="${pattern}"]`);
      await expect.poll(async () => (await state(page)).phase).toBe('press');

      const s = await state(page);
      expect(s.card).toBe(card);
      expect(s.pattern).toBe(pattern);

      // shortcut the making so this stays a coverage check, not nine playthroughs
      await page.evaluate(() => {
        window.__GAME__.press();
        window.__GAME__.press();
        window.__GAME__.press();
      });
      await expect.poll(async () => (await state(page)).phase, { timeout: 5000 }).toBe('foil');
      await page.evaluate(() => window.__GAME__.fillFoil());
      await expect.poll(async () => (await state(page)).phase, { timeout: 5000 }).toBe('finish');
      await tap(page, '[data-action="again"]');
    }
  }
});

test('the card stays on screen when the device is rotated', async ({ page }) => {
  await boot(page);
  await tap(page, '#screen-title .big-btn');
  await tap(page, '[data-card="0"]');
  await tap(page, '[data-pattern="0"]');
  await expect.poll(async () => (await state(page)).phase).toBe('press');

  for (const size of [
    { width: 393, height: 852 },
    { width: 852, height: 393 },
    { width: 1180, height: 820 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    const { rect } = await state(page);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.x - rect.w / 2).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w / 2).toBeLessThanOrEqual(size.width + 1);
    expect(rect.y - rect.h / 2).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.h / 2).toBeLessThanOrEqual(size.height + 1);
  }
});
