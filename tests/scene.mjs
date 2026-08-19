import { launch, openPage, DEVICES, shot, tapStart } from './play.mjs';
const dev = DEVICES[process.argv[2] || 'iphone-portrait'];
const scenes = (process.argv[3] || 'reveal').split(',');
const hold = Number(process.argv[4] || 4);
const b = await launch();
for (const s of scenes) {
  const { page, ctx, errors } = await openPage(b, { ...dev, dpr: Math.max(1, Math.min(dev.dpr, Math.round(1400 / Math.max(dev.width, dev.height)))) }, `?scene=${s}`);
  await tapStart(page);
  await page.evaluate((sec) => window.__game.testAdvance(sec), hold);
  await page.waitForTimeout(400);
  await shot(page, `${process.argv[2] || 'iphone-portrait'}-${s}`);
  const info = await page.evaluate(() => ({ st: window.__game.state, calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }));
  console.log(s, info, errors.slice(0, 3));
  await ctx.close();
}
await b.close();
