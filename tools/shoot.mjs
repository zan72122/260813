// 開発用の確認スクリプト。
// 端末サイズと進行段階を指定して、実際の描画をそのまま画像に落とす。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const OUT = process.env.OUT || 'shots';
mkdirSync(OUT, { recursive: true });

const DEVICES = {
  'iphone-portrait': { width: 390, height: 844 },
  'iphone-landscape': { width: 844, height: 390 },
  'ipad-portrait': { width: 820, height: 1180 },
  'ipad-landscape': { width: 1180, height: 820 },
};

const args = process.argv.slice(2);
const deviceKey = args[0] || 'iphone-portrait';
const viewport = DEVICES[deviceKey];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: true });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text());
});
page.on('pageerror', (e) => console.log('[page error]', e.message));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 60000 });

const tap = async (x = 0.5, y = 0.55) => {
  await page.mouse.move(viewport.width * x, viewport.height * y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
};
const swipe = async () => {
  await page.mouse.move(viewport.width * 0.2, viewport.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(viewport.width * (0.2 + 0.07 * i), viewport.height * 0.6);
    await page.waitForTimeout(24);
  }
  await page.mouse.up();
};
const phase = () => page.evaluate(() => window.__game.phase);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${deviceKey}-${name}.png` });
  console.log(`  ${name}  phase=${await phase()}`);
};
const waitPhase = async (p, timeout = 45000) => {
  await page.waitForFunction(
    (want) => (Array.isArray(want) ? want : [want]).includes(window.__game.phase),
    p,
    { timeout }
  );
};

await page.waitForTimeout(1200);
await shot('01-intro');

await waitPhase('gate');
await page.waitForTimeout(700);
await shot('02-gate0');

await tap();
await page.waitForTimeout(2600);
await shot('03-flow0');
await waitPhase('gate');
await page.waitForTimeout(900);
await shot('04-gate1');

await tap();
await page.waitForTimeout(3200);
await shot('05-flow1');
await waitPhase('gate');
await page.waitForTimeout(900);
await shot('06-gate2');

await tap();
await page.waitForTimeout(3200);
await shot('07-flow2');

await waitPhase('sun');
await page.waitForTimeout(900);
await shot('08-sun-before');
for (let i = 0; i < 3; i++) {
  await tap(0.5, 0.35);
  await page.waitForTimeout(900);
}
await shot('09-sun-after');

await waitPhase('wind');
await page.waitForTimeout(900);
await shot('10-wind');
for (let i = 0; i < 2; i++) {
  await swipe();
  await page.waitForTimeout(900);
}

await waitPhase('climax');
await page.waitForTimeout(4000);
await shot('11-climax-mid');
await waitPhase('finale');
await page.waitForTimeout(3000);
await shot('12-finale');

await tap(0.5, 0.85);
await page.waitForTimeout(1500);
await shot('13-replay');

await browser.close();
console.log('done');
