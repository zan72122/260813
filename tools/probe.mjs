import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto('http://localhost:5173/?fast=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready);
await page.evaluate(() => window.__whg.to('gem'));
await page.evaluate(() => window.__whg.auto());
for (let i = 0; i < 5; i++) {
  const info = await page.evaluate(() => {
    const g = window.__whg.game;
    return {
      phase: g.phase,
      shot: g.rig.shot,
      camPos: g.rig.camera.position.toArray().map((v) => v.toFixed(2)),
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
    };
  });
  console.log(i, JSON.stringify(info));
  await page.waitForTimeout(1500);
}
await browser.close();
