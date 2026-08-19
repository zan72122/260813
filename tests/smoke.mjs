import { launch, openPage, DEVICES, shot, tapStart, state } from './play.mjs';

const b = await launch();
const { page, errors } = await openPage(b, DEVICES['iphone-portrait']);
await shot(page, 'smoke-boot');
await tapStart(page);
await page.waitForTimeout(2500);
console.log('state:', await state(page));
await shot(page, 'smoke-intro');
await page.waitForTimeout(3000);
console.log('state:', await state(page));
await shot(page, 'smoke-plant');
const info = await page.evaluate(() => {
  const g = window.__game;
  return {
    tier: g.quality.settings.tier,
    dpr: g.renderer.getPixelRatio(),
    calls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    programs: g.renderer.info.programs?.length,
  };
});
console.log(info);
console.log('errors:', errors.slice(0, 10));
await b.close();
