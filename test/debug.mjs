import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.stack || String(e)));
await page.goto('http://127.0.0.1:8734/', { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 20000 });
await page.waitForTimeout(400);
await page.evaluate('window.__game.timeScale = 3');
const p1 = await page.evaluate('window.__game.screenPos("piece1")');
console.log('piece1 at', p1);
await page.touchscreen.tap(p1.x, p1.y);
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1000);
  console.log(i + 1, 's state=', await page.evaluate('window.__game.state'),
    'carX=', await page.evaluate('JSON.stringify(window.__game.debug())'));
}
await browser.close();
