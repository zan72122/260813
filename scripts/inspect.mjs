import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const list = await page.evaluate(() => {
  const out = [];
  const w = window.__gameRef;
  w.stage.scene.traverse(o => {
    if (o.isMesh || o.isSprite) {
      const v = new (Object.getPrototypeOf(w.stage.camera.position).constructor)();
      o.getWorldPosition(v);
      // 皿の近く (0.7, *, 0.95) 半径 0.6
      if (Math.hypot(v.x - 0.7, v.z - 0.95) < 0.6 && o.visible) {
        let vis = true, p = o;
        while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
        if (vis) out.push({ type: o.type, name: o.name || o.parent?.name || '?', pos: [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2)], geo: o.geometry?.type });
      }
    }
  });
  return out;
});
console.log(JSON.stringify(list, null, 1));
await browser.close();
