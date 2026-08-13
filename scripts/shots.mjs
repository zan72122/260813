/**
 * 実機サイズでの見ためチェック用スクリーンショット。
 * 使いかた: npm run build && npm run preview & node scripts/shots.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.SHOT_URL || 'http://127.0.0.1:4173/';
const OUT = path.join(process.cwd(), 'screenshots', 'look');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone', width: 390, height: 844, dpr: 3 },
  { name: 'ipad-land', width: 1024, height: 768, dpr: 2 },
];

const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined,
});

for (const dev of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${dev.name}-${n}.png`) });

  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
  await page.waitForTimeout(600);
  await shot('01-title');

  await page.getByTestId('btn-free').click();
  await page.waitForTimeout(500);
  await shot('02-select');

  // 顕微鏡の外観 → 自動でレンズへ寄る（とちゅうも撮る）
  await page.getByTestId('card-niji').click();
  await page.waitForTimeout(900);
  await shot('03-microscope');
  await page.waitForTimeout(900);
  await shot('04-zooming');
  await page.waitForTimeout(1400);
  await shot('05-plain');

  // にじスイッチ
  await page.getByTestId('btn-polar').click();
  await page.waitForTimeout(260);
  await shot('06-sweep');
  await page.waitForTimeout(900);
  await shot('07-polarized');

  // くるくる回して色が変わるところ
  for (const [i, a] of [0.35, 0.75, 1.2].entries()) {
    await page.evaluate((v) => window.__game.setStageAngle(v), a);
    await page.waitForTimeout(320);
    await shot(`08-rot${i + 1}`);
  }

  // さがしものモード
  await page.getByTestId('btn-home').click();
  await page.waitForTimeout(900);
  await page.getByTestId('btn-select-back').click();
  await page.waitForTimeout(600);
  await page.getByTestId('btn-quest').click();
  await page.waitForTimeout(500);
  await page.getByTestId('card-tamago').click();
  await page.waitForTimeout(3200);
  await page.getByTestId('btn-polar').click();
  await page.waitForTimeout(900);
  await shot('09-quest');

  await page.evaluate(() => window.__game.solveCurrentTarget());
  await page.waitForTimeout(400);
  await shot('10-quest-found');

  await page.evaluate(() => window.__game.solveCurrentTarget());
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__game.solveCurrentTarget());
  await page.waitForTimeout(1600);
  await shot('11-clear');

  await ctx.close();
  console.log(`captured ${dev.name}`);
}

await browser.close();
console.log(`-> ${OUT}`);
