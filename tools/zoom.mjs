import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto('http://localhost:5173/?fast=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: process.argv[2], clip: { x: 110, y: 230, width: 190, height: 220 } });
await browser.close();
console.log('zoomed');
