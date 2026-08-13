/**
 * 実時間の試遊（合成 API を使わず、本物のポインタ操作で一周する）。
 * 「はじめて遊ぶ子の最初の30秒」を再現し、fps とコンソールエラーも見る。
 *
 *   npm run build && npm run preview   # べつのシェルで
 *   node scripts/playthrough.mjs
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'test-results/playthrough';
const URL = process.env.SHOOT_URL ?? 'http://127.0.0.1:4173/?seed=7';
const EXE = '/opt/pw-browsers/chromium';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log(`  [${at()}] shot ${n}`);
};
const fps = async (ms) => {
  const a = await page.evaluate(() => window.__lab.frames);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => window.__lab.frames);
  return Math.round(((b - a) / ms) * 1000);
};
/** 実際に指を置いて、おしつづける */
const hold = async (x, y, ms) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
};
const release = () => page.mouse.up();

await page.goto(URL);
await page.waitForFunction(() => Boolean(window.__lab));

console.log('■ さいしょの30秒（4歳児がなにを見るか）');
await page.waitForTimeout(1500);
await shot('t01-title-1.5s');
console.log(`  タイトルの自動デモ fps=${await fps(1000)}`);
await shot('t02-title-3s');

console.log('■ ラボであそぶ');
await page.getByRole('button', { name: 'ラボ' }).click();
await page.waitForTimeout(400);
await shot('t03-lab-wide'); // 実験台の全景
await page.waitForTimeout(1800);
await shot('t04-lab-closeup'); // 模型の接写

await page.getByRole('button', { name: 'はし' }).click();
await page.waitForTimeout(2000);
await hold(195, 380, 350);
await shot('t05-press-short');
const fpsPress = await fps(1500);
await shot('t06-press-long');
await page.mouse.move(250, 380, { steps: 12 }); // 指をすべらせる
await page.waitForTimeout(400);
await shot('t07-press-drag');
await release();
await page.waitForTimeout(700);
await shot('t08-released'); // 指を離すと虹は消える
console.log(`  押している間の fps=${fpsPress}`);

console.log('■ おもりと支え');
await page.getByRole('button', { name: 'おもり' }).click();
await page.waitForTimeout(1200);
await shot('t09-weight');
// 支え（きょうきゃく）のつまみをドラッグ
const knob = await page.evaluate(() => {
  const g = window.__lab;
  const a = g.specimen.anchors[0];
  const s = g.cam;
  return {
    x: (a.x - s.x) * s.zoom + s.vw / 2,
    y: ((a.y + 720) / 2 - s.y) * s.zoom + (s.insetTop + (s.vh - s.insetTop - s.insetBottom) / 2),
  };
});
await page.mouse.move(knob.x, knob.y);
await page.mouse.down();
await page.mouse.move(knob.x + 70, knob.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
await shot('t10-anchor-moved');

console.log('■ チャレンジ：くまさん');
await page.getByRole('button', { name: 'もどる' }).first().click();
await page.getByRole('button', { name: 'チャレンジ' }).click();
await page.waitForTimeout(600);
await shot('t11-challenge-menu');
await page.getByRole('button', { name: 'くまさん' }).click();
await page.waitForTimeout(2200);
await shot('t12-bear-start');
await hold(195, 380, 3000);
await shot('t13-bear-walking');
await page.waitForTimeout(4000);
await release();
await page.waitForTimeout(2200);
await shot('t14-bear-clear');
const bear = await page.evaluate(() => window.__lab.snapshot());
console.log(`  くまさん: done=${bear.done} progress=${bear.progress}`);

console.log('■ チャレンジ：にじの あし');
await page.getByRole('button', { name: 'つぎ' }).click();
await page.waitForTimeout(2200);
await hold(195, 300, 4000);
await release();
await page.waitForTimeout(2000);
await shot('t15-arch-clear');
const arch = await page.evaluate(() => window.__lab.snapshot());
console.log(`  にじの あし: done=${arch.done} progress=${arch.progress}`);

console.log('■ チャレンジ：にじの おはな');
await page.getByRole('button', { name: 'つぎ' }).click();
await page.waitForTimeout(2200);
await hold(195, 300, 4500);
await release();
await page.waitForTimeout(2200);
await shot('t16-flower-clear');
const flower = await page.evaluate(() => window.__lab.snapshot());
console.log(`  にじの おはな: done=${flower.done} progress=${flower.progress}`);

console.log('■ よこ向きにする');
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(1200);
await shot('t17-landscape');

console.log(`\nコンソールエラー: ${errors.length ? errors.join('\n') : 'なし'}`);
console.log(`ぜんぶで ${at()}`);
await browser.close();
