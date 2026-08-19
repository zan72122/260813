import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.goto('http://localhost:5173/?fast=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready);
await page.evaluate(() => {
  const g = window.__whg.game;
  let idx = 0;
  g.character.group.traverse((o) => {
    if (o.name === 'strand' && o.isMesh) {
      const m = o.material.clone();
      m.onBeforeCompile = () => {};
      m.color.setHSL((idx * 0.11) % 1, 0.85, 0.55);
      m.sheen = 0; m.clearcoat = 0; m.emissiveIntensity = 0;
      o.material = m;
      idx++;
    }
    if (o.name === 'underCap' && o.isMesh) {
      const m = o.material.clone();
      m.color.set('#111111');
      o.material = m;
    }
  });
});
await page.waitForTimeout(400);
await page.screenshot({ path: process.argv[2], clip: { x: 110, y: 230, width: 190, height: 220 } });
await browser.close();
console.log('colorcoded');
