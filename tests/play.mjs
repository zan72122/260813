/**
 * Automated playtest. Drives the real game with real pointer events at the four
 * device shapes we care about, and writes screenshots for visual review.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = process.env.OUT || 'shots';
fs.mkdirSync(OUT, { recursive: true });

export const DEVICES = {
  'iphone-portrait': { width: 390, height: 844, dpr: 3 },
  'iphone-landscape': { width: 844, height: 390, dpr: 3 },
  'ipad-portrait': { width: 834, height: 1194, dpr: 2 },
  'ipad-landscape': { width: 1194, height: 834, dpr: 2 },
};

const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
];

const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function launch() {
  return chromium.launch({ args: ARGS, executablePath: EXE });
}

export async function openPage(browser, dev, query = '') {
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(URL + query, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  page.__errors = errors;
  return { ctx, page, errors };
}

export const state = (page) => page.evaluate(() => window.__game.state);
export const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** A real finger drag, in steps, so the game sees pointermove like on glass. */
export async function drag(page, from, to, steps = 18) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps),
    );
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}

export async function tapStart(page) {
  await page.click('#startBtn', { force: true });
  await page.waitForTimeout(300);
}

/** Where is a world point on screen right now? */
export function project(page, x, y, z) {
  return page.evaluate(([px, py, pz]) => {
    const g = window.__game;
    const v = new (window.THREE_V ?? Object).constructor;
    return g.__project ? g.__project(px, py, pz) : null;
  }, [x, y, z]);
}
