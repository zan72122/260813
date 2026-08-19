import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto('http://localhost:5173/?fast=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready, null, { timeout: 20000 });
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(2000);
  console.log(i * 2 + 2 + 's:', await page.evaluate(() => window.__whg.getPhase()));
}
await browser.close();
