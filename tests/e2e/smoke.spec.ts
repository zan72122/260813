import { expect, test, type Page } from '@playwright/test';

/**
 * One full trip through the factory, driven the way a child would drive it
 * (taps and drags), plus the checks that matter most: tilting the finished card
 * really changes the pixels, and two different rolls really make two different
 * cards.
 *
 * `?fast=1` drops to dpr 1 and disables the glint noise and confetti so this
 * stays cheap under SwiftShader. Nothing here judges visual quality.
 */

interface DebugState {
  phase: string;
  card: number;
  motif: number;
  presses: number;
  points: number;
  emboss: number;
  coverage: number;
  uv: boolean;
  albumCount: number;
  rect: { x: number; y: number; w: number; h: number };
}

declare global {
  interface Window {
    __GAME__: {
      ready: boolean;
      state(): DebugState;
      start(): void;
      chooseCard(i: number): void;
      chooseStamp(i: number): void;
      press(u?: number, v?: number): void;
      stroke(points: [number, number][], pitch?: number): void;
      fillFoil(): void;
      finishFoil(): void;
      toggleUv(): void;
      openAlbum(): void;
      tilt(x: number, y: number): void;
      releaseTilt(): void;
      sample(): [number, number, number];
      pixels(): number[];
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

/** Build a card with a given roll and return the card's pixels. */
async function buildCard(
  page: Page,
  card: number,
  motif: number,
  stamps: [number, number][],
  roll: [number, number][],
): Promise<number[]> {
  await page.evaluate(() => window.__GAME__.start());
  await page.evaluate((i) => window.__GAME__.chooseCard(i), card);
  await page.evaluate((i) => window.__GAME__.chooseStamp(i), motif);
  await page.evaluate((pts) => {
    for (const [u, v] of pts) window.__GAME__.press(u, v);
  }, stamps);
  await expect.poll(async () => (await state(page)).phase, { timeout: 6000 }).toBe('foil');
  await page.evaluate((pts) => window.__GAME__.stroke(pts), roll);
  await page.evaluate(() => window.__GAME__.tilt(0.45, -0.2));
  return page.evaluate(() => {
    // let the damped tilt settle, then read the pixels back
    for (let i = 0; i < 50; i++) window.__GAME__.sample();
    return window.__GAME__.pixels();
  });
}

function meanChannelDelta(a: number[], b: number[]): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (a.length / 4) / 3;
}

const LINE = (from: [number, number], to: [number, number], n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [
    from[0] + ((to[0] - from[0]) * i) / n,
    from[1] + ((to[1] - from[1]) * i) / n,
  ]);

test('a whole card gets made, and tilting it changes what is on screen', async ({ page }) => {
  await boot(page);
  expect((await state(page)).phase).toBe('title');

  await tap(page, '#screen-title .big-btn');
  await expect.poll(async () => (await state(page)).phase).toBe('pickCard');

  await tap(page, '[data-card="1"]');
  await expect.poll(async () => (await state(page)).phase).toBe('pickStamp');
  expect((await state(page)).card).toBe(1);

  await tap(page, '[data-stamp="2"]');
  await expect.poll(async () => (await state(page)).phase).toBe('press');
  expect((await state(page)).motif).toBe(2);

  // --- press the micro-pattern in by tapping three different spots ---
  const before = await state(page);
  expect(before.emboss).toBeLessThan(0.1);
  for (const [u, v] of [
    [0.35, 0.3],
    [0.66, 0.5],
    [0.42, 0.74],
  ]) {
    await page.mouse.click(
      before.rect.x + (u - 0.5) * before.rect.w,
      before.rect.y + (v - 0.5) * before.rect.h,
    );
    await page.waitForTimeout(250);
  }
  await expect.poll(async () => (await state(page)).presses).toBe(3);
  await expect.poll(async () => (await state(page)).emboss, { timeout: 5000 }).toBeGreaterThan(0.9);

  // --- roll the foil on with a single continuous drag ---
  await expect.poll(async () => (await state(page)).phase, { timeout: 6000 }).toBe('foil');
  await expect(page.locator('[data-action="done"]')).toBeHidden();

  const card = (await state(page)).rect;
  const px = (u: number, v: number): [number, number] => [
    card.x + (u - 0.5) * card.w,
    card.y + (v - 0.5) * card.h,
  ];
  await page.mouse.move(...px(0.12, 0.15));
  await page.mouse.down();
  for (let r = 0; r < 7; r++) {
    const v = 0.15 + (r / 6) * 0.7;
    const [a, b] = r % 2 === 0 ? [0.12, 0.88] : [0.88, 0.12];
    await page.mouse.move(...px(a, v), { steps: 3 });
    await page.mouse.move(...px(b, v), { steps: 14 });
  }
  await page.mouse.up();

  const rolled = await state(page);
  expect(rolled.points, 'the roll must be recorded, not thrown away').toBeGreaterThan(20);
  expect(rolled.coverage).toBeGreaterThan(0.1);

  // --- the child decides when it is finished ---
  await expect(page.locator('[data-action="done"]')).toBeVisible();
  await tap(page, '[data-action="done"]');
  await expect.poll(async () => (await state(page)).phase, { timeout: 8000 }).toBe('finish');
  await expect(page.locator('[data-action="again"]')).toBeVisible();

  // Tilting has to visibly change the card. Compared per pixel, not on the
  // average: averaging a travelling rainbow over the whole card comes out
  // almost constant however far the bands actually move.
  const pixelsAt = (tx: number, ty: number) =>
    page.evaluate(
      ([x, y]) => {
        window.__GAME__.tilt(x, y);
        for (let i = 0; i < 60; i++) window.__GAME__.sample();
        return window.__GAME__.pixels();
      },
      [tx, ty],
    );
  const leftTilt = await pixelsAt(-0.9, 0.1);
  const rightTilt = await pixelsAt(0.9, -0.1);
  expect(
    meanChannelDelta(leftTilt, rightTilt),
    'tilting the card must change what is on screen',
  ).toBeGreaterThan(8);

  // --- and it must be instantly replayable ---
  await page.evaluate(() => window.__GAME__.releaseTilt());
  await tap(page, '[data-action="again"]');
  await expect.poll(async () => (await state(page)).phase).toBe('pickCard');
  expect((await state(page)).presses).toBe(0);
  expect((await state(page)).coverage).toBe(0);
});

test('the same choices with a different roll make a different card', async ({ page }) => {
  await boot(page);
  const stamps: [number, number][] = [
    [0.5, 0.32],
    [0.5, 0.52],
    [0.5, 0.72],
  ];

  // Identical card, identical stamps, identical press head - only the direction
  // the foil was rolled in differs. That has to be enough to tell them apart.
  const across = await buildCard(page, 0, 0, stamps, LINE([0.08, 0.5], [0.92, 0.5]));
  const down = await buildCard(page, 0, 0, stamps, LINE([0.5, 0.08], [0.5, 0.92]));
  expect(
    meanChannelDelta(across, down),
    'rolling across vs down must not produce the same card',
  ).toBeGreaterThan(4);

  // ...and rolling the very same path twice must reproduce it exactly, or the
  // album could not restore what the child made.
  const againA = await buildCard(page, 0, 0, stamps, LINE([0.08, 0.5], [0.92, 0.5]));
  expect(meanChannelDelta(across, againA), 'the same roll must be reproducible').toBeLessThan(1);
});

test('every base card and every press head can be chosen', async ({ page }) => {
  await boot(page);
  await tap(page, '#screen-title .big-btn');

  for (const card of [0, 1, 2]) {
    for (const motif of [0, 1, 2]) {
      await expect.poll(async () => (await state(page)).phase).toBe('pickCard');
      await tap(page, `[data-card="${card}"]`);
      await tap(page, `[data-stamp="${motif}"]`);
      await expect.poll(async () => (await state(page)).phase).toBe('press');

      const s = await state(page);
      expect(s.card).toBe(card);
      expect(s.motif).toBe(motif);

      await page.evaluate(() => {
        window.__GAME__.press(0.4, 0.35);
        window.__GAME__.press(0.6, 0.55);
        window.__GAME__.press(0.45, 0.75);
      });
      await expect.poll(async () => (await state(page)).phase, { timeout: 6000 }).toBe('foil');
      await page.evaluate(() => window.__GAME__.fillFoil());
      await expect.poll(async () => (await state(page)).phase, { timeout: 6000 }).toBe('finish');
      await tap(page, '[data-action="again"]');
    }
  }
});

test('finished cards land on the shelf and can be opened again', async ({ page }) => {
  await boot(page);
  const stamps: [number, number][] = [
    [0.4, 0.35],
    [0.6, 0.6],
    [0.45, 0.78],
  ];
  await buildCard(page, 2, 1, stamps, LINE([0.1, 0.2], [0.9, 0.8]));
  await page.evaluate(() => window.__GAME__.finishFoil());
  await expect.poll(async () => (await state(page)).phase, { timeout: 8000 }).toBe('finish');
  await expect.poll(async () => (await state(page)).albumCount).toBeGreaterThan(0);

  await page.evaluate(() => window.__GAME__.openAlbum());
  await expect.poll(async () => (await state(page)).phase).toBe('album');
  const items = page.locator('[data-album-item]');
  await expect(items.first()).toBeVisible();

  await items.first().click({ force: true });
  await expect.poll(async () => (await state(page)).phase, { timeout: 8000 }).toBe('finish');
  expect((await state(page)).card).toBe(2);

  // The shelf survives a reload, because it stores the materials, not a picture.
  const beforeReload = (await state(page)).albumCount;
  await page.reload();
  await page.waitForFunction(() => window.__GAME__?.ready === true);
  await page.evaluate(() => window.__GAME__.openAlbum());
  expect((await state(page)).albumCount).toBe(beforeReload);
});

test('the secret lamp turns on and off', async ({ page }) => {
  await boot(page);
  await buildCard(
    page,
    0,
    0,
    [
      [0.4, 0.4],
      [0.6, 0.6],
      [0.5, 0.75],
    ],
    LINE([0.1, 0.5], [0.9, 0.5]),
  );
  await page.evaluate(() => window.__GAME__.finishFoil());
  await expect.poll(async () => (await state(page)).phase, { timeout: 8000 }).toBe('finish');

  const lit = await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__GAME__.sample();
    return window.__GAME__.sample();
  });
  await tap(page, '.screen.is-active [data-action="uv"]');
  await expect.poll(async () => (await state(page)).uv).toBe(true);
  const dark = await page.evaluate(() => {
    for (let i = 0; i < 60; i++) window.__GAME__.sample();
    return window.__GAME__.sample();
  });
  expect(dark[0] + dark[1] + dark[2], 'the lamp view must be darker').toBeLessThan(
    lit[0] + lit[1] + lit[2],
  );

  await tap(page, '.screen.is-active [data-action="uv"]');
  await expect.poll(async () => (await state(page)).uv).toBe(false);
});

test('the card stays on screen when the device is rotated', async ({ page }) => {
  await boot(page);
  await tap(page, '#screen-title .big-btn');
  await tap(page, '[data-card="0"]');
  await tap(page, '[data-stamp="0"]');
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
