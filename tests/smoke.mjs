// Chromium スモーク E2E: 実際の指の動きに近いドラッグでゲームを一周する。
// 使い方: node tests/smoke.mjs [--landscape] [--out DIR]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

// playwright はグローバル導入のことがあるので CJS 解決（NODE_PATH 有効）で読む。
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const landscape = args.includes('--landscape');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : 'shots';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
mkdirSync(OUT, { recursive: true });

const viewport = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };

const ORDER = [
  'caramelize',
  'pour-caramel',
  'mix',
  'pour-custard',
  'steam',
  'chill',
  'plate-on',
  'flip',
  'demold',
  'reveal',
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + (process.env.Q ? `/?q=${process.env.Q}` : '/?fast=1'), { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/00-title.png` });

const W = viewport.width;
const H = viewport.height;
const cx = W / 2;
const cy = H * (landscape ? 0.62 : 0.8);

async function drag(x0, y0, x1, y1, steps = 22, hold = 6) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    await page.waitForTimeout(hold);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
}

async function circle(times = 2) {
  const r = Math.min(W, H) * 0.16;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 1; i <= 30 * times; i++) {
    const a = (i / 30) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7);
    await page.waitForTimeout(6);
  }
  await page.mouse.up();
}

const stageId = () => page.evaluate(() => window.__game.stageId());
const info = () =>
  page.evaluate(() => ({
    stage: window.__game.stageId(),
    phase: window.__game.app.phase,
    p: +window.__game.app.progress.toFixed(3),
    released: !!window.__game.g.released,
    flow: +(window.__game.g.caramelFlow || 0).toFixed(2),
  }));

async function act(id) {
  const up = H * 0.28;
  switch (id) {
    case 'caramelize':
      return drag(cx, cy - up, cx, cy + up * 0.8);
    case 'pour-caramel':
    case 'pour-custard':
      return drag(cx - W * 0.3, cy, cx + W * 0.34, cy);
    case 'mix':
      return circle(2);
    case 'steam':
    case 'plate-on':
      return drag(cx, cy - up, cx, cy + up * 0.8);
    case 'chill':
      return drag(cx + W * 0.34, cy, cx - W * 0.3, cy);
    case 'flip':
      return drag(cx - W * 0.36, cy, cx + W * 0.38, cy - H * 0.06, 26, 5);
    case 'demold':
      return drag(cx, cy + up * 0.6, cx, cy - up * 0.9, 30, 12);
    default:
      return page.waitForTimeout(200);
  }
}

// タイトル -> 開始
await page.mouse.click(cx, H * 0.55);
await page.waitForTimeout(500);

const log = [];
for (const id of ORDER) {
  if (id === 'reveal') break;
  const n = String(ORDER.indexOf(id) + 1).padStart(2, '0');
  // ステージ開始直後（ヒントが出ている状態）
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${OUT}/${n}a-${id}-start.png` });
  let guard = 0;
  // outro 中（= すでに操作は完了している）は数えない
  const stillNeedsInput = async () => {
    const i = await info();
    return i.stage === id && i.phase === 'play';
  };
  while ((await stillNeedsInput()) && guard < 14) {
    await act(id);
    if (guard === 0) await page.screenshot({ path: `${OUT}/${n}b-${id}-mid.png` });
    if (id === 'demold' && guard === 0) {
      // リプレイ磁石の 3 秒間を細かく記録
      for (let i = 0; i < 9; i++) {
        await page.screenshot({ path: `${OUT}/${n}c-demold-t${i}.png` });
        await page.waitForTimeout(260);
      }
    }
    await page.waitForTimeout(160);
    guard++;
  }
  const cur = await info();
  log.push(`${id}: ${guard} gesture(s) -> ${cur.phase} (${cur.stage})`);
  if (await stillNeedsInput()) {
    errors.push(`stage "${id}" did not complete after ${guard} gestures`);
    break;
  }
  // outro が終わって次のステージに移るまで待つ
  for (let w = 0; w < 40 && (await stageId()) === id; w++) await page.waitForTimeout(100);
}

await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/10-reveal.png` });
log.push('final: ' + JSON.stringify(await info()));

// リプレイ（型ぬきをもう一度）ボタンを押す
const btn = await page.evaluate(() => {
  const b = window.__game.app.buttons;
  const big = b.reduce((a, c) => (c.r > (a?.r ?? 0) ? c : a), null);
  return big ? { x: big.x, y: big.y } : null;
});
if (!btn) errors.push('replay button not found');
else {
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${OUT}/11-replay-ready.png` });
  log.push('after replay tap: ' + JSON.stringify(await info()));
  await act('demold');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/12-replay-done.png` });
  log.push('replay result: ' + JSON.stringify(await info()));
}

console.log(log.join('\n'));
await browser.close();
if (errors.length) {
  console.error('\nFAILURES:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nOK');
