// Renders the same beat across several seeds so we can see that the piece,
// its pattern and its hero colour actually change — and never turn ugly.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
mkdirSync('shots/variety', { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 340, height: 500 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
for (const seed of [1, 7, 23, 91, 404, 777, 2024, 31337]) {
  await page.goto(`http://localhost:4173/?e2e=1&seed=${seed}`);
  await page.waitForFunction(() => window.__ui && window.__ui.ready);
  await page.evaluate(() => {
    // exactly what a child does: spin it, let go, watch where it lands
    const g = window.__game;
    g.tap(0, 0);
    g.dragging = true;
    for (let i = 0; i < 300; i++) { g.turn(0.06, 1 / 60); g.update(1 / 60); }
    g.dragging = false;
    for (let i = 0; i < 60 * 6; i++) g.update(1 / 60);
  });
  await page.evaluate(() => window.__ui.settle(3));
  await page.screenshot({ path: `shots/variety/seed-${seed}.png` });
}
await browser.close();
console.log('variety done');
