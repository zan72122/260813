// 各工程の見た目を素早く確認するためのスクリーンショット採取。
// node scripts/preview.mjs [portrait|landscape]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const which = process.argv[2] || 'portrait';
const DEV = {
  portrait: { name: 'p', width: 390, height: 844, dpr: 2 },
  landscape: { name: 'l', width: 844, height: 390, dpr: 2 },
  ipad: { name: 'ipad', width: 1180, height: 820, dpr: 2 },
}[which];

const dir = path.join(process.cwd(), 'shots', 'preview');
fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({
  viewport: { width: DEV.width, height: DEV.height },
  deviceScaleFactor: DEV.dpr, hasTouch: true, isMobile: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/?pdb=1&tier=' + (process.env.TIER || '2'), { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__nori);

for (const st of ['mix', 'pour', 'spread', 'press', 'dry', 'peel', 'reveal']) {
  await page.evaluate((s) => window.__nori.jump(s), st);
  await sleep(260);
  await page.screenshot({ path: path.join(dir, `${DEV.name}-${st}.png`) });
}
// 剥がし途中
for (const t of [0.25, 0.55, 0.85]) {
  await page.evaluate(() => window.__nori.jump('peel'));
  await page.evaluate((v) => window.__nori.setPeel(v), t);
  await sleep(200);
  await page.screenshot({ path: path.join(dir, `${DEV.name}-peel-${Math.round(t * 100)}.png`) });
}
// リビール進行
await page.evaluate(() => window.__nori.jump('reveal'));
for (const t of [1.6, 3.4, 5.4]) {
  await page.evaluate((v) => { window.__nori.game.rt = v; }, t);
  await sleep(200);
  await page.screenshot({ path: path.join(dir, `${DEV.name}-reveal-${Math.round(t * 10)}.png`) });
}

// 光にかざす場面
for (const k of [0.0, 0.55, 1.0]) {
  await page.evaluate((v) => window.__nori.setHold(v), k);
  await sleep(260);
  await page.screenshot({ path: path.join(dir, `${DEV.name}-hold-${Math.round(k * 100)}.png`) });
}

await browser.close();
console.log('preview shots ->', dir);
