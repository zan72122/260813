// 実機に近い解像度（dpr2・軽量モードなし）で、見た目だけを確認する。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright')); }
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[3] || '/tmp/claude-0/-home-user-260813/fc2cf620-1c37-5c41-be60-544ce3d96ec2/scratchpad/hi';
const seed = process.argv[2] || '11';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

for (const [tag, viewport] of [['port', { width: 390, height: 844 }], ['land', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8123/index.html?seed=${seed}&q=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, `${tag}-a-intro.png`) });

  const W = viewport.width, H = viewport.height, cy = H * 0.62;
  await page.mouse.move(W * 0.5, cy);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${tag}-b-mist.png`) });

  const sweep = async (a, b, steps, ms) => {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(W * (a + (b - a) * (i / steps)), cy);
      await page.waitForTimeout(ms / steps);
    }
  };
  await sweep(0.5, 0.15, 18, 2000);
  await page.screenshot({ path: path.join(OUT, `${tag}-c-growing.png`) });
  await sweep(0.15, 0.85, 30, 3400);
  await sweep(0.85, 0.2, 26, 2800);
  await sweep(0.2, 0.85, 26, 2800);
  await sweep(0.85, 0.35, 20, 2200);
  await page.mouse.up();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `${tag}-d-done.png`) });
  console.log(tag, JSON.stringify(await page.evaluate(() => window.__game.stats())));
  await ctx.close();
}
await browser.close();
