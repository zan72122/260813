// Shared driving helpers. Everything goes through the same synthetic-pointer
// surface the game exposes, so the tests exercise the real gesture code.

export const APP = '/?fast=1&dpr=1';

/** @param {import('@playwright/test').Page} page */
export async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction(() => !!globalThis.__GAME__);
  await page.waitForTimeout(300);
  return errors;
}

export const state = (page) => page.evaluate(() => globalThis.__GAME__.state());
export const step = (page, n = 60) => page.evaluate((k) => globalThis.__GAME__.step(k), n);

/** One left-right (or right-left) stroke. @param {import('@playwright/test').Page} page */
export function stroke(page, { y, hold = 2, rev = false, x0 = 0.12, x1 = 0.88 }) {
  return page.evaluate(
    (o) => {
      const { innerWidth: w, innerHeight: h } = window;
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push([w * (o.x0 + (i / 14) * (o.x1 - o.x0)), h * o.y]);
      globalThis.__GAME__.drag(o.rev ? pts.reverse() : pts, o.hold);
    },
    { y, hold, rev, x0, x1 },
  );
}

/**
 * Repeated strokes that stop the moment the stage moves on - otherwise a long
 * burst of synthetic input runs straight through the next stage as well.
 * @param {import('@playwright/test').Page} page
 */
export async function sweeps(page, { passes, y0, dy, hold = 2, stages = null }) {
  for (let p = 0; p < passes; p++) {
    if (stages && !stages.includes((await state(page)).stage)) return;
    await stroke(page, { y: y0 + (p % 6) * dy, hold, rev: p % 2 === 1 });
  }
}

export async function tapStart(page) {
  await page.evaluate(() =>
    globalThis.__GAME__.press(window.innerWidth / 2, window.innerHeight / 2, 4),
  );
  await step(page, 90);
}

export async function doFlatten(page) {
  await sweeps(page, { passes: 40, y0: 0.4, dy: 0.03, hold: 1, stages: ['flatten'] });
  await step(page, 120);
}

export async function doStamp(page) {
  await page.evaluate(() => {
    const { innerWidth: w, innerHeight: h } = window;
    const pts = [];
    for (let i = 0; i <= 14; i++) pts.push([w * 0.5, h * (0.3 + (i / 14) * 0.45)]);
    globalThis.__GAME__.drag(pts, 3);
  });
  await step(page, 150);
}

export async function doPour(page) {
  await sweeps(page, { passes: 30, y0: 0.36, dy: 0.06, hold: 6, stages: ['pour'] });
  await step(page, 20);
}

export async function doFlip(page) {
  await step(page, 10); // let go, so the flip swipe is a deliberate new gesture
  for (let i = 0; i < 4 && (await state(page)).stage === 'flip'; i++) {
    await page.evaluate(() => {
      const { innerWidth: w, innerHeight: h } = window;
      const pts = [];
      for (let k = 0; k <= 30; k++) {
        const a = Math.PI * (k / 30);
        pts.push([w * (0.5 - Math.cos(a) * 0.35), h * (0.6 - Math.sin(a) * 0.25)]);
      }
      globalThis.__GAME__.drag(pts, 2);
    });
    await step(page, 60);
  }
  await step(page, 90);
}

export async function doDig(page, passes = 12) {
  await sweeps(page, { passes, y0: 0.38, dy: 0.045, hold: 2, stages: ['dig', 'free'] });
  await step(page, 40);
}

export async function doPolish(page) {
  await sweeps(page, { passes: 40, y0: 0.4, dy: 0.05, hold: 2, stages: ['polish'] });
  await step(page, 120);
}
