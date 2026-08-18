/** 看板体験の目視確認: 伸ばし中/折り畳み/袋の形/開き を撮る */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = process.env.SHOT_DIR || 'shots-hero';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const landscape = process.argv.includes('--landscape');
const vp = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };
const sfx = landscape ? '-l' : '';
const page = await (await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true })).newPage();
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const shot = async n => { await page.screenshot({ path: `${OUT}/${n}${sfx}.png` }); console.log('shot:', n + sfx); };
const obj = (e) => page.evaluate((e) => {
  const o = eval(e);
  const cam = window.__gameRef.stage.camera;
  const v = new (Object.getPrototypeOf(cam.position).constructor)();
  if (o.getWorldPosition) o.getWorldPosition(v); else v.copy(o);
  v.project(cam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}, e);

// --- M3 伸ばし中 ---
await page.evaluate(() => window.__gameRef.goto(3));
await page.waitForTimeout(1600);
let h = await obj('window.__gameRef.world.stretch.visHandle');
await page.mouse.move(h.x, h.y);
await page.mouse.down();
const W = vp.width;
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(h.x + (W * 0.55 * i) / 10, h.y - i * 3);
  await page.waitForTimeout(30);
}
await page.waitForTimeout(300);
await shot('stretch-mid');
const len = await page.evaluate(() => window.__gameRef.world.stretch.length.toFixed(2));
console.log('stretch length =', len);
await page.mouse.up();
await page.waitForTimeout(250);
await shot('stretch-folding');
await page.waitForTimeout(1000);

// --- M8 首あり袋 ---
await page.evaluate(() => window.__gameRef.goto(9));
await page.waitForTimeout(1500);
await shot('bag-neck');
// --- M10 結び済み ---
await page.evaluate(() => window.__gameRef.goto(10));
await page.waitForTimeout(1500);
await shot('bag-knot');
// --- M12 開き途中 ---
await page.evaluate(() => window.__gameRef.goto(12));
await page.waitForTimeout(1600);
const g = await obj('window.__gameRef.world.guideLine.position');
await page.mouse.move(g.x - 70, g.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(g.x - 70 + i * 14, g.y + 2);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(200);
await shot('open-mid');
await page.mouse.up();
await page.waitForTimeout(1500);
await shot('open-full');
console.log('open =', await page.evaluate(() => window.__gameRef.world.bag.params.open.toFixed(2)));
await browser.close();
