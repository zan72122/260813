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
const click = (sel) => page.locator(sel).click({ force: true });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__GAME__?.ready === true, { timeout: 15000 });
await page.waitForTimeout(1200);
console.log('boot:', JSON.stringify(await state()));
await shot('1-title');

await click('#screen-title .big-btn');
await page.waitForTimeout(450);
await shot('2-pick-card');

await click('[data-card="0"]');
await page.waitForTimeout(400);
await shot('3-pick-stamp');

await click('[data-stamp="2"]');
await page.waitForTimeout(450);
await shot('4-press-empty');

// --- place three stamps by tapping different spots on the card ---
let s = await state();
const spots = [
  [0.32, 0.28],
  [0.68, 0.46],
  [0.42, 0.72],
];
for (let i = 0; i < spots.length; i++) {
  const [u, v] = spots[i];
  await page.mouse.click(
    s.rect.x + (u - 0.5) * s.rect.w,
    s.rect.y + (v - 0.5) * s.rect.h,
  );
  await page.waitForTimeout(400);
  if (i === 1) await shot('5-press-mid');
}
await page.waitForTimeout(1100);
console.log('after press:', JSON.stringify(await state()));
await shot('6-foil-start');

// --- roll the foil on: a swirl, so the grooves clearly curve ---
s = await state();
const toPx = (u, v) => [s.rect.x + (u - 0.5) * s.rect.w, s.rect.y + (v - 0.5) * s.rect.h];
const path = [];
for (let i = 0; i <= 150; i++) {
  const t = i / 150;
  const a = t * Math.PI * 3.4;
  const r = 0.06 + t * 0.42;
  path.push([0.5 + Math.cos(a) * r * 0.9, 0.5 + Math.sin(a) * r * 1.25]);
}
const [sx, sy] = toPx(...path[0]);
await page.mouse.move(sx, sy);
await page.mouse.down();
for (let i = 1; i < path.length; i++) {
  const [x, y] = toPx(...path[i]);
  await page.mouse.move(x, y);
  if (i === 60) await shot('7-foil-mid');
}
await page.mouse.up();
await page.waitForTimeout(300);
console.log('after roll:', JSON.stringify(await state()));
await shot('8-foil-done-button');

await click('[data-action="done"]');
await page.waitForTimeout(1500);
console.log('finish:', JSON.stringify(await state()));
await shot('9-finish');

// --- tilt the finished card ---
for (const [name, tx, ty] of [
  ['left', -0.85, 0.25],
  ['right', 0.85, -0.25],
  ['up', 0.1, 0.9],
]) {
  await page.evaluate(([x, y]) => window.__GAME__.tilt(x, y), [tx, ty]);
  await page.waitForTimeout(700);
  await shot(`10-tilt-${name}`);
}
await page.evaluate(() => window.__GAME__.releaseTilt());

// --- secret lamp ---
await click('[data-action="uv"]');
await page.waitForTimeout(500);
const [lx, ly] = toPx(0.45, 0.4);
await page.mouse.move(lx, ly);
await page.mouse.down();
await page.mouse.move(...toPx(0.55, 0.55), { steps: 8 });
await page.waitForTimeout(400);
await shot('11-uv-lamp');
await page.mouse.up();
await click('[data-action="uv"]');
await page.waitForTimeout(400);

// --- second card with a completely different roll, then the shelf ---
await click('[data-action="again"]');
await page.waitForTimeout(350);
await click('[data-card="1"]');
await click('[data-stamp="0"]');
await page.waitForTimeout(350);
await page.evaluate(() => {
  window.__GAME__.press(0.5, 0.3);
  window.__GAME__.press(0.35, 0.62);
  window.__GAME__.press(0.68, 0.75);
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([0.08 + t * 0.84, 0.12 + t * 0.76]);
  }
  window.__GAME__.stroke(pts, 0.85);
});
await page.waitForTimeout(200);
await page.evaluate(() => window.__GAME__.finishFoil());
await page.waitForTimeout(1400);
await page.evaluate(() => window.__GAME__.tilt(0.6, -0.3));
await page.waitForTimeout(700);
await shot('12-second-card');

await click('.screen.is-active [data-action="album"]');
await page.waitForTimeout(700);
console.log('album:', JSON.stringify(await state()));
await shot('13-album');

// --- does a different roll actually make a different card? ---
const build = async (pts) => {
  await page.evaluate(() => window.__GAME__.start());
  await page.evaluate(() => window.__GAME__.chooseCard(0));
  await page.evaluate(() => window.__GAME__.chooseStamp(0));
  await page.evaluate(() => {
    window.__GAME__.press(0.5, 0.35);
    window.__GAME__.press(0.5, 0.55);
    window.__GAME__.press(0.5, 0.75);
  });
  await page.waitForTimeout(900);
  await page.evaluate((p) => window.__GAME__.stroke(p, 0.5), pts);
  await page.evaluate(() => window.__GAME__.tilt(0.4, -0.2));
  return page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__GAME__.sample();
    return window.__GAME__.pixels();
  });
};
const horiz = [];
const vert = [];
for (let i = 0; i <= 40; i++) {
  horiz.push([0.06 + (i / 40) * 0.88, 0.5]);
  vert.push([0.5, 0.06 + (i / 40) * 0.88]);
}
const a = await build(horiz);
const b = await build(vert);
let diff = 0;
for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]);
console.log(`different rolls -> mean red delta: ${(diff / (a.length / 4)).toFixed(1)} / 255`);

await browser.close();
console.log('done');
