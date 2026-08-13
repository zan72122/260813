// 実際の指の動き（ポインタイベント）だけでゲームが最後まで進むかを確かめる。
// Playwright はグローバル導入のものを使う。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as presolve } from 'node:path';
import { serve } from './server.mjs';

const require = createRequire(import.meta.url);
// Playwright はプロジェクト内にあればそれを、なければグローバル導入のものを使う
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright/index.js'));
}

const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), '..');
const started = process.env.BASE ? null : await serve(ROOT);
const BASE = process.env.BASE || `http://127.0.0.1:${started.port}/index.html`;
const OUT = process.env.OUT || null;
const HEADFUL = process.env.HEADFUL === '1';

const viewports = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
];

const launchOpts = {
  headless: !HEADFUL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
};
if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOpts);

let failures = 0;
const log = (...a) => console.log(...a);

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`${BASE}?seed=4242`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

  const state = () => page.evaluate(() => ({
    stage: __game.stage, align: +__game.align.toFixed(3),
    charge: +__game.charge.toFixed(2), open: +__game.open.toFixed(2),
  }));

  const cx = vp.width / 2, cy = vp.height / 2;
  const m = Math.min(vp.width, vp.height);

  // 1. 置く（タップ）
  await page.mouse.click(cx, cy);
  await page.waitForFunction(() => __game.stage === 'ring', null, { timeout: 8000 });
  log(`[${vp.name}] tap -> ring`, JSON.stringify(await state()));

  // 2. 偏光リングを回す（円運動）
  const R = m * 0.30;
  await page.mouse.move(cx + R, cy);
  await page.mouse.down();
  for (let i = 1; i <= 130; i++) {
    const a = (i / 40) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  await page.mouse.up();
  await page.waitForFunction(() => __game.stage === 'spin', null, { timeout: 10000 });
  log(`[${vp.name}] circle -> spin`, JSON.stringify(await state()));

  // 3. 左右スワイプで結晶を回す（だんだん小さく動かす＝子どもの試行錯誤の代わり）
  const swipe = async (dx, dy) => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  const climb = async (stageName, useTilt, limit) => {
    let step = m * 0.18;
    let dir = 1;
    for (let i = 0; i < limit; i++) {
      if ((await page.evaluate(() => __game.stage)) !== stageName) return true;
      const a0 = await page.evaluate(() => __game.align);
      await swipe(step * dir, 0);
      const a1 = await page.evaluate(() => __game.align);
      if (a1 < a0) { dir = -dir; step *= 0.85; }
      if (useTilt) {
        const b0 = await page.evaluate(() => __game.align);
        await swipe(0, step * 0.6);
        const b1 = await page.evaluate(() => __game.align);
        if (b1 < b0) await swipe(0, -step * 1.2);
      }
      step = Math.max(step, m * 0.04);
      await page.waitForTimeout(200);
    }
    return (await page.evaluate(() => __game.stage)) !== stageName;
  };

  if (!(await climb('spin', false, 40))) throw new Error('spin 段階を抜けられなかった');
  await page.waitForFunction(() => __game.stage === 'enter' || __game.stage === 'eye', null, { timeout: 15000 });
  log(`[${vp.name}] swipe -> ${(await state()).stage}`);

  // 4. 中へ入るのを待つ
  await page.waitForFunction(() => __game.stage === 'eye', null, { timeout: 20000 });
  log(`[${vp.name}] entered eye`, JSON.stringify(await state()));

  // 5. 上下左右で目をまんなかへ
  if (!(await climb('eye', true, 60))) throw new Error('eye 段階を抜けられなかった');
  log(`[${vp.name}] eye -> ${(await state()).stage}`, JSON.stringify(await state()));

  // 6. フィナーレ〜もういちど
  await page.waitForFunction(() => __game.stage === 'rest', null, { timeout: 30000 });
  log(`[${vp.name}] finale -> rest`, JSON.stringify(await state()));
  await page.waitForSelector('#again.show', { timeout: 8000 });
  const seedBefore = await page.evaluate(() => __game.seed);
  await page.click('#again');
  await page.waitForFunction((s) => __game.seed !== s, seedBefore, { timeout: 8000 });
  log(`[${vp.name}] again -> new crystal`, JSON.stringify(await state()));

  if (OUT) await page.screenshot({ path: `${OUT}/play-${vp.name}.png` });

  if (errors.length) {
    failures++;
    log(`[${vp.name}] ERRORS:\n  ` + errors.join('\n  '));
  } else {
    log(`[${vp.name}] no console/page errors`);
  }
  await page.close();
}

await browser.close();
if (started) started.server.close();
if (failures) {
  console.error(`FAILED (${failures})`);
  process.exit(1);
}
console.log('ALL OK');
