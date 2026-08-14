import { test, expect } from '@playwright/test';
import { boot, frames, state, waitForStage, turn, swipe, press, tap, playStage } from './helpers.js';

/**
 * These are play-tests, not pixel tests: they drive the game the way a small
 * child would and check the things the design has to get right — the ending
 * stays hidden, the rollers answer the finger, the faces are big enough, the
 * chocolate only moves while pressed, and the biscuit really does break open.
 */

test('the reveal stays hidden until the end of the line', async ({ page }) => {
  await boot(page);
  for (const stage of [0, 1, 2, 3]) {
    if (stage > 0) await page.evaluate((i) => window.__game.jumpTo(i), stage);
    await frames(page, 6);
    const s = await state(page);
    expect(s.trayVisible, `tray must not be visible at stage ${stage}`).toBe(false);
    expect(s.heroVisible, `no hero biscuit at stage ${stage}`).toBe(false);
  }
  // even during filling, the finished product is still not on screen
  await page.evaluate(() => window.__game.jumpTo(5));
  await frames(page, 6);
  expect((await state(page)).trayVisible).toBe(false);

  // the tray only appears in the reveal module, which is stage 6 of 8
  await page.evaluate(() => window.__game.jumpTo(6));
  await page.waitForFunction(() => window.__game.world.tray.visible, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__game.index / 8)).toBeGreaterThanOrEqual(0.7);
});

test('the printing roller follows the finger and prints as it turns', async ({ page }) => {
  await boot(page, '?stage=1');
  await waitForStage(page, 1);
  const before = await state(page);

  // a small arc: the drum must move on the same frame, not ease into it
  await page.mouse.move(before.anchor.x + 80, before.anchor.y);
  await page.mouse.down();
  await page.mouse.move(before.anchor.x, before.anchor.y - 80);
  const mid = await state(page);
  await page.mouse.up();
  expect(Math.abs(mid.drum - before.drum), 'drum turned with the finger').toBeGreaterThan(0.5);

  // and turning is what prints: keep turning until the batch is done
  await playStage(page, 1, (anchor) => turn(page, anchor.x, anchor.y, 80, 0.6));
  const s = await state(page);
  expect(s.index, 'printing finishes and moves on').toBeGreaterThan(1);
  expect(Math.min(...s.printed), 'every cell carries a face').toBeGreaterThan(0.99);
});

test('the cutter turns the band into separate biscuits', async ({ page }) => {
  await boot(page, '?stage=2');
  await playStage(page, 2, (anchor) => turn(page, anchor.x, anchor.y, 80, 0.6));
  const s = await state(page);
  expect(s.lineCount, 'eight biscuits came off the band').toBe(8);
  expect(s.index).toBeGreaterThan(2);
});

test('the animals are big enough to tell apart', async ({ page }) => {
  await boot(page, '?stage=1');
  await frames(page, 30);
  // while printing, one printed face must be a chunky target on a small phone
  const printing = await state(page);
  expect(printing.pixelsPerBiscuit).toBeGreaterThan(60);

  await page.evaluate(() => window.__game.jumpTo(7));
  await frames(page, 20);
  const tray = await state(page);
  expect(tray.pixelsPerBiscuit, 'even in the wide tray shot').toBeGreaterThan(46);
});

test('chocolate only flows while the finger is down', async ({ page }) => {
  await boot(page, '?stage=5');
  await waitForStage(page, 5);
  await frames(page, 20);
  expect((await state(page)).fill).toBeLessThan(0.2);

  const box = page.viewportSize();
  await press(page, box.width / 2, box.height * 0.55, 900);
  const pressed = await state(page);
  expect(pressed.fill, 'holding fills it').toBeGreaterThan(0.2);

  await frames(page, 20);
  const released = await state(page);
  expect(released.fill, 'letting go stops it').toBeCloseTo(pressed.fill, 2);
});

test('one biscuit breaks open and shows a chocolate centre', async ({ page }) => {
  await boot(page, '?stage=7');
  await waitForStage(page, 7);
  await frames(page, 20);
  const box = page.viewportSize();

  expect((await state(page)).hint, 'the tray invites a tap').toBe('tap');
  await tap(page, box.width / 2, box.height * 0.6);
  await page.waitForFunction(() => window.__game.hud.kind === 'pull', null, { timeout: 15000 });

  const holding = await state(page);
  expect(holding.broken, 'still in one piece before the pull').toBe(false);

  await swipe(page, holding.anchor.x, holding.anchor.y, 150, 0, 30);
  await page.waitForFunction(() => window.__game.world.broken, null, { timeout: 10000 });
  await page.waitForTimeout(900);

  const s = await state(page);
  expect(s.broken).toBe(true);
  expect(s.halfGap, 'the two halves are apart').toBeGreaterThan(0.3);
  expect(s.fill, 'and they are full of chocolate').toBeGreaterThan(0.7);
});

test('a whole run works end to end', async ({ page }) => {
  // a real play-through includes every cinematic beat, and software WebGL is
  // not quick about them
  test.setTimeout(240_000);
  await boot(page);
  const box = page.viewportSize();

  await tap(page, box.width / 2, box.height / 2); // start
  await playStage(page, 1, (a) => turn(page, a.x, a.y, 80, 0.6));
  await playStage(page, 2, (a) => turn(page, a.x, a.y, 80, 0.6));
  await playStage(page, 3, (a) => swipe(page, box.width * 0.14, a.y, box.width * 0.7));
  await playStage(page, 4, (a) => swipe(page, a.x, a.y, 0, -box.height * 0.16, 20));
  await playStage(page, 5, () => press(page, box.width / 2, box.height * 0.55, 1400), 6);
  await waitForStage(page, 6, 40000);
  await waitForStage(page, 7, 40000);

  const s = await state(page);
  expect(s.trayVisible, 'the tray of finished biscuits is finally on screen').toBe(true);
  expect(s.verb).toBe('break');
});
