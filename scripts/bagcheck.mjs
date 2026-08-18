import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
for (const i of [4, 5, 8, 10, 12]) {
  const r = await page.evaluate((i) => {
    window.__gameRef.goto(i);
    const bag = window.__gameRef.world.bag;
    bag.rebuild(0);
    bag.mesh.geometry.computeBoundingBox();
    const bb = bag.mesh.geometry.boundingBox;
    return {
      i,
      params: JSON.parse(JSON.stringify({ ...bag.params, wobble: undefined })),
      fill: bag.fill,
      bbox: { min: bb.min.toArray().map(v => +v.toFixed(3)), max: bb.max.toArray().map(v => +v.toFixed(3)) },
      pos: bag.group.position.toArray().map(v => +v.toFixed(2)),
    };
  }, i);
  console.log(JSON.stringify(r));
}
await browser.close();
