/** Grab a frame at a precise moment inside one state, for art review. */
import { launch, openPage, DEVICES, tapStart, shot } from './play.mjs';
const [dev, scene, at] = [process.argv[2], process.argv[3], Number(process.argv[4] || 2)];
const b = await launch();
const d = DEVICES[dev];
const { page, ctx, errors } = await openPage(b, { ...d, dpr: Math.max(1, Math.min(d.dpr, Math.round(1400 / Math.max(d.width, d.height)))) }, `?scene=${scene}`);
await tapStart(page);
await page.waitForTimeout(1000);
await page.evaluate((s) => window.__game.testAdvance(s), at);
await page.waitForTimeout(700);
await shot(page, `beat-${dev}-${scene}-${at}`);
console.log(scene, at, await page.evaluate(() => ({ s: window.__game.state, t: +window.__game.stateTime.toFixed(1) })), errors.filter(e => !e.includes('404')));
await ctx.close(); await b.close();
