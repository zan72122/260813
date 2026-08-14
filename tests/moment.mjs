// リプレイ磁石の 3 秒間（型を持ち上げる直前 → 外れる → ぷるん → カラメルが流れる）
// だけを細かくコマ撮りして検証するためのスクリプト。
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const landscape = args.includes('--landscape');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : 'moment';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
mkdirSync(OUT, { recursive: true });

const viewport = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE + (process.env.Q ? `/?q=${process.env.Q}` : '/?fast=1'), { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => window.__game.jump('demold'));
await page.waitForTimeout(400);

const W = viewport.width;
const H = viewport.height;
const cx = W / 2;
const cy = H * (landscape ? 0.72 : 0.82);

let n = 0;
const shot = async (tag) =>
  page.screenshot({ path: `${OUT}/${String(n++).padStart(3, '0')}-${tag}.png` });

await shot('before');
// ゆっくり上へ引き抜く
await page.mouse.move(cx, cy);
await page.mouse.down();
const total = 34;
for (let i = 1; i <= total; i++) {
  await page.mouse.move(cx, cy - (i / total) * H * 0.34);
  await page.waitForTimeout(14);
  if (i % 6 === 0) await shot('lift');
}
await page.mouse.up();
// 外れた瞬間からの 3 秒を 90ms 刻みで
for (let i = 0; i < 22; i++) {
  await shot('purun');
  await page.waitForTimeout(90);
}
const st = await page.evaluate(() => ({
  released: window.__game.g.released,
  wobble: +window.__game.g.wobble.toFixed(2),
  squash: +window.__game.g.squash.toFixed(3),
  flow: +window.__game.g.caramelFlow.toFixed(2),
}));
console.log(JSON.stringify(st));
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('frames:', n);
