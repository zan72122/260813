import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots';
const DEVICE = process.argv[3] || 'iphone';
const URL = 'http://localhost:4173/';

const VIEWPORTS = {
  iphone: { width: 393, height: 852, dsf: 2 },
  iphoneland: { width: 852, height: 393, dsf: 2 },
  ipad: { width: 820, height: 1180, dsf: 2 },
  ipadland: { width: 1180, height: 820, dsf: 2 },
};

fs.mkdirSync(OUT, { recursive: true });

const vp = VIEWPORTS[DEVICE];

// Claude Code on the web ships a prebuilt Chromium that may not match the
// version @playwright/test wants to download; prefer it when present.
const PREBUILT = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM ?? (fs.existsSync(PREBUILT) ? PREBUILT : undefined);

const browser = await chromium.launch({
  executablePath,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const ctx = await browser.newContext({
  viewport: { width: vp.width, height: vp.height },
  deviceScaleFactor: vp.dsf,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console.error]', m.text());
});
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${DEVICE}-${name}.png` });
  console.log(`  shot: ${DEVICE}-${name}`);
};
const state = () => page.evaluate(() => window.__GAME__.state());

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 });
await page.waitForTimeout(1200);
console.log('boot state:', JSON.stringify(await state()));
await shot('1-title');

// --- start ---
await page.getByRole('button', { name: /はじめる/ }).click({ force: true });
await page.waitForTimeout(500);
await shot('2-pick-card');

// --- pick base card (real tap on the 3rd choice) ---
await page.locator('[data-card="2"]').click({ force: true });
await page.waitForTimeout(450);
await shot('3-pick-pattern');

// --- pick pattern ---
await page.locator('[data-pattern="1"]').click({ force: true });
await page.waitForTimeout(500);
await shot('4-press-empty');

// --- press 3 times, tapping the card ---
let s = await state();
for (let i = 0; i < 3; i++) {
  await page.mouse.click(s.rect.x + (i - 1) * 40, s.rect.y + (i - 1) * 50);
  await page.waitForTimeout(420);
  if (i === 1) await shot('5-press-mid');
}
await page.waitForTimeout(1100);
console.log('after press:', JSON.stringify(await state()));
await shot('6-foil-start');

// --- roll the foil on with a serpentine drag ---
s = await state();
const left = s.rect.x - s.rect.w * 0.42;
const right = s.rect.x + s.rect.w * 0.42;
const top = s.rect.y - s.rect.h * 0.42;
const bottom = s.rect.y + s.rect.h * 0.42;
const rows = 7;
await page.mouse.move(left, top);
await page.mouse.down();
for (let r = 0; r < rows; r++) {
  const y = top + ((bottom - top) * r) / (rows - 1);
  const xs = r % 2 === 0 ? [left, right] : [right, left];
  await page.mouse.move(xs[0], y, { steps: 4 });
  await page.mouse.move(xs[1], y, { steps: 14 });
  if (r === 2) await shot('7-foil-mid');
}
await page.mouse.up();
await page.waitForTimeout(1400);
console.log('after foil:', JSON.stringify(await state()));
await shot('8-finish');

// --- tilt the finished card ---
for (const [name, tx, ty] of [
  ['left', -0.85, 0.2],
  ['right', 0.85, -0.2],
  ['up', 0.1, 0.9],
]) {
  await page.evaluate(([x, y]) => window.__GAME__.tilt(x, y), [tx, ty]);
  await page.waitForTimeout(700);
  await shot(`9-tilt-${name}`);
}
await page.evaluate(() => window.__GAME__.releaseTilt());

// --- colour response check ---
const samples = [];
for (const [tx, ty] of [[-0.9, 0], [-0.3, 0], [0.3, 0], [0.9, 0]]) {
  const c = await page.evaluate(([x, y]) => {
    window.__GAME__.tilt(x, y);
    for (let i = 0; i < 40; i++) window.__GAME__.sample();
    return window.__GAME__.sample();
  }, [tx, ty]);
  samples.push({ tilt: tx, rgb: c.map((v) => Math.round(v)) });
}
console.log('tilt colour response:', JSON.stringify(samples));

await browser.close();
console.log('done');
