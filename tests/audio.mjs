/**
 * We cannot listen, but we can prove the graph exists, that it only starts
 * after a real gesture (Safari's rule), and that every cue fires without error.
 */
import { launch, openPage, DEVICES, tapStart } from './play.mjs';

const b = await launch();
const { page, ctx, errors } = await openPage(b, DEVICES['iphone-portrait']);

console.log('before gesture, ctx exists:', await page.evaluate(() => !!window.__game.audio.ctx));
await tapStart(page);
await page.waitForTimeout(700);

const state = await page.evaluate(() => {
  const a = window.__game.audio;
  const ctx = a.ctx;
  return { has: !!ctx, state: ctx && ctx.state, enabled: a.enabled, rate: ctx && ctx.sampleRate };
});
console.log('after gesture:', state);

const fired = await page.evaluate(() => {
  const a = window.__game.audio;
  const cues = ['plop', 'fluff', 'clack', 'rootGrow', 'pop', 'bloom', 'bloomSwell', 'sparkle', 'hint'];
  const out = {};
  for (const c of cues) {
    try { a[c](); out[c] = 'ok'; } catch (e) { out[c] = 'ERR ' + e.message; }
  }
  try { a.water(1); a.wind(0.6); a.pad(1); a.birds = true; a.tick(9); out.loops = 'ok'; }
  catch (e) { out.loops = 'ERR ' + e.message; }
  return out;
});
console.log(fired);
console.log('errors:', errors.filter((e) => !e.includes('404')));
await ctx.close();
await b.close();
