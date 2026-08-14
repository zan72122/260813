// 見た目の確認用。ブラウザを立ち上げて、決まった tick で画面を撮る。
//   node tools/shot.mjs <outdir> [device]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const DEVICES = {
  'iphone-portrait': { width: 390, height: 844, dpr: 3 },
  'iphone-landscape': { width: 844, height: 390, dpr: 3 },
  'ipad-portrait': { width: 820, height: 1180, dpr: 2 },
  'ipad-landscape': { width: 1180, height: 820, dpr: 2 },
};

const out = process.argv[2] || 'shots';
const devName = process.argv[3] || 'iphone-landscape';
const dev = DEVICES[devName];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: dev.width, height: dev.height },
  deviceScaleFactor: dev.dpr,
  isMobile: true,
  hasTouch: true,
});
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__test);

const shot = async (name) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};

// 1. かわいた街
await shot('01-dry');

// 2〜5. 雨 → 流れ → たまる → あふれる
for (const [tick, name] of [[150, '02a-first-drops'], [250, '02-first-streams'], [430, '03-confluence'], [640, '04-plaza-pool'], [900, '05-overflow']]) {
  await page.evaluate((n) => window.__test.run(n), tick - (await page.evaluate(() => window.__test.tick())));
  await page.waitForTimeout(700);   // カメラが寄りきるのを待つ
  await shot(name);
}

// 6. 排水口そうじ → うず
await page.evaluate(() => window.__test.openDrain('plaza'));
await page.waitForTimeout(400);
await page.evaluate(() => window.__test.run(60));
await shot('06-vortex');
await page.waitForTimeout(1200);
await shot('07-cross-section');

// 7. リセット → 同じ雨をもういちど
await page.evaluate(() => window.__test.reset());
await page.waitForTimeout(300);
await shot('08-reset-dry');
await page.evaluate(() => window.__test.run(620));
await shot('09-second-run');

// 8. 壁
await page.evaluate(() => window.__test.reset());
await page.evaluate(() => window.__test.wall(40, 51));
await page.waitForTimeout(200);
await page.evaluate(() => window.__test.run(700));
await shot('10-wall-split');

// 9. 結果くらべ
await page.evaluate(() => window.__test.run(900));
await page.waitForTimeout(900);
await shot('11-result');

console.log('stats', JSON.stringify(await page.evaluate(() => window.__test.stats()), null, 1));
console.log('runs', JSON.stringify(await page.evaluate(() => window.__test.runs())));
await browser.close();
