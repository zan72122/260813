import { expect, test } from '@playwright/test';
import {
  boot,
  doDig,
  doFlatten,
  doFlip,
  doPolish,
  doPour,
  doStamp,
  state,
  step,
  tapStart,
} from './helpers.js';

test.describe('しろい こなの こうじょう', () => {
  test('boots into an achromatic world with nothing gummy on screen', async ({ page }) => {
    const errors = await boot(page);
    const s = await state(page);
    expect(s.stage).toBe('title');
    expect(s.gummies).toBe(0);
    expect(s.colorsVisible).toEqual([]);
    // the title itself must not give the surprise away
    await expect(page).toHaveTitle(/しろい/);
    expect(await page.locator('.title h1').textContent()).not.toMatch(/グミ|ぐみ/);
    expect(errors).toEqual([]);
  });

  test('plays the whole line from powder to a table of gummies', async ({ page }) => {
    const errors = await boot(page);
    test.setTimeout(120_000);

    await tapStart(page);
    expect((await state(page)).stage).toBe('flatten');

    await doFlatten(page);
    expect((await state(page)).flatten).toBeGreaterThan(0.5);
    await expect
      .poll(async () => (await state(page)).stage, { timeout: 20_000 })
      .toBe('stamp');

    // no colour has entered the world yet
    expect((await state(page)).colorsVisible).toEqual([]);

    await doStamp(page);
    await expect
      .poll(async () => (await state(page)).stage, { timeout: 20_000 })
      .toBe('pour');

    await doPour(page);
    const poured = await state(page);
    expect(poured.filled).toBe(poured.cells);
    // several different juices, not one flat colour
    expect(poured.colorsVisible.length).toBeGreaterThanOrEqual(3);

    await expect
      .poll(async () => (await state(page)).stage, { timeout: 30_000 })
      .toBe('flip');

    await doFlip(page);
    await expect
      .poll(async () => (await state(page)).stage, { timeout: 30_000 })
      .toBe('dig');

    // everything is buried again: colour is gone from the screen
    const buried = await state(page);
    expect(buried.gummies).toBeGreaterThan(0);
    expect(buried.revealed).toBe(0);
    expect(buried.colorsVisible).toEqual([]);

    await doDig(page, 16);
    expect((await state(page)).revealed).toBeGreaterThan(0);

    await expect
      .poll(async () => (await state(page)).stage, { timeout: 40_000 })
      .toBe('polish');

    await doPolish(page);
    await expect
      .poll(async () => (await state(page)).stage, { timeout: 40_000 })
      .toBe('finale');

    // the pull-back: many gummies, many colours, all shiny
    const done = await state(page);
    expect(done.gummies).toBeGreaterThanOrEqual(15);
    expect(done.colorsVisible.length).toBeGreaterThanOrEqual(4);
    await expect(page.locator('.panel.show')).toBeVisible({ timeout: 20_000 });

    expect(errors).toEqual([]);
  });

  test('free play re-buries a fresh set and only asks for brushing', async ({ page }) => {
    await boot(page);
    test.setTimeout(90_000);
    await page.evaluate(() => globalThis.__GAME__.game.startFreeRound());
    await step(page, 30);

    const s = await state(page);
    expect(s.stage).toBe('free');
    expect(s.gummies).toBeGreaterThan(0);
    expect(s.revealed).toBe(0);
    expect(s.colorsVisible).toEqual([]); // hidden again, no spoilers

    await doDig(page, 14);
    expect((await state(page)).revealed).toBeGreaterThan(0);
  });
});
