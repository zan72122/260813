import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const b = await chromium.launch({ headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
mkdirSync('shots/arc', { recursive: true });
const ctx = await b.newContext({ viewport: { width: 340, height: 500 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
for (const seed of [4242, 12345, 404]) {
  await page.goto(`http://localhost:4173/?e2e=1&seed=${seed}`);
  await page.waitForFunction(() => window.__ui && window.__ui.ready);
  const steps = [['a-clear', 0], ['b-little', 6], ['c-more', 40], ['d-full', 300]];
  for (const [tag, turns] of steps) {
    await page.evaluate(({ turns, first }) => {
      const g = window.__game;
      if (first) { g.tap(0, 0); for (let i = 0; i < 70; i++) g.update(1/60); }
      for (let i = 0; i < turns; i++) g.turn(0.06, 1/60);
      g.ringVel = 0;
      g.ringAngle = Math.min(Math.PI/2, g.totalRot * 0.12);
      for (let i = 0; i < 30; i++) g.update(1/60);
    }, { turns, first: tag === 'a-clear' });
    await page.evaluate(() => window.__ui.settle(3));
    await page.screenshot({ path: `shots/arc/${seed}-${tag}.png` });
  }
}
await b.close(); console.log('arc done');
