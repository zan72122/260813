/* Sets oxide thickness directly and captures the submerged piece at each
 * value, to calibrate the colour journey (gold -> purple -> blue -> cyan -> green). */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('test/shots/sweep', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8734/', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 20000 });
await page.evaluate('window.__game.timeScale = 4');
const p1 = await page.evaluate('window.__game.screenPos("piece1")');
await page.touchscreen.tap(p1.x, p1.y);
await page.waitForFunction('window.__game.state === "anodize"', { timeout: 90000 });
await page.waitForTimeout(600);

for (const t of [0, 15, 30, 45, 60, 75, 90, 105, 120, 140, 170, 210, 270]) {
  await page.evaluate(`window.__game.thickness = ${t}`);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `test/shots/sweep/t${String(t).padStart(3, '0')}.png`, clip: { x: 60, y: 240, width: 270, height: 220 } });
  console.log('t =', t);
}
await browser.close();
