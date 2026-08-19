/**
 * One full game, driven the way a child would: drag each bulb from the basket
 * to the bed, swipe the lever, then watch. Runs at every device shape and
 * screenshots each beat.
 */
import { launch, openPage, DEVICES, drag, tapStart } from './play.mjs';
import fs from 'node:fs';

const OUT = 'shots';
const name = process.argv[2] || 'iphone-portrait';
const dev = { ...DEVICES[name], dpr: Math.max(1, Math.min(DEVICES[name].dpr, Math.round(1400 / Math.max(DEVICES[name].width, DEVICES[name].height)))) };
const b = await launch();
const { page, ctx, errors } = await openPage(b, dev);
const log = [];
const note = (s) => { log.push(s); console.log(s); };

await tapStart(page);
await page.waitForTimeout(900);

// let the intro play out
await page.evaluate(() => window.__game.testAdvance(4.2));
await page.waitForTimeout(300);
note('state after intro: ' + await page.evaluate(() => window.__game.state));
await page.screenshot({ path: `${OUT}/pt-${name}-1-plant.png` });

// --- plant every bulb ------------------------------------------------------
for (let i = 0; i < 4; i++) {
  const pts = await page.evaluate(() => {
    const g = window.__game;
    const THREE = g.director.camera.constructor;
    const i = g.planted;
    const proj = (v) => {
      const p = v.clone().project(g.director.camera);
      return { x: (p.x * 0.5 + 0.5) * g.layout.width, y: (-p.y * 0.5 + 0.5) * g.layout.height };
    };
    const bulb = g.plot.bulbs[i].position;
    const holes = g.constructor.HOLES;
    return { from: proj(bulb), to: proj(new bulb.constructor(g.holeAt(i).x, 0.06, g.holeAt(i).z)), i };
  });
  await drag(page, pts.from, pts.to, 16);
  await page.waitForTimeout(200);
  await page.evaluate((k) => window.__game.testAdvance(k === 3 ? 0.6 : 1.3), i);
  const planted = await page.evaluate(() => window.__game.planted);
  note(`bulb ${i}: planted=${planted}`);
}
await page.screenshot({ path: `${OUT}/pt-${name}-2-planted.png` });

// --- dive ------------------------------------------------------------------
await page.evaluate(() => window.__game.testAdvance(5.0));
await page.waitForTimeout(300);
note('state: ' + await page.evaluate(() => window.__game.state));
await page.screenshot({ path: `${OUT}/pt-${name}-3-section.png` });

// --- swipe the lever -------------------------------------------------------
const lever = await page.evaluate(() => {
  const g = window.__game;
  const v = g.water.handleWorld(new (g.director.camera.position.constructor)());
  const p = v.project(g.director.camera);
  return { x: (p.x * 0.5 + 0.5) * g.layout.width, y: (-p.y * 0.5 + 0.5) * g.layout.height };
});
await drag(page, lever, { x: lever.x + 20, y: lever.y - dev.height * 0.22 }, 16);
await page.waitForTimeout(200);
note('gate open: ' + await page.evaluate(() => window.__game.water.openAmount));
await page.evaluate(() => window.__game.testAdvance(2.2));
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/pt-${name}-4-water.png` });
note('state: ' + await page.evaluate(() => window.__game.state));

// From here it plays itself. Step in small slices and grab a frame the moment
// each beat is at its most representative.
const want = new Map([
  ['seep', 1.4], ['grow', 2.6], ['surface', 2.0], ['firstBloom', 4.4],
  ['wave', 3.0], ['reveal', 4.5], ['end', 1.0],
]);
const got = new Set();
let n = 5;
for (let i = 0; i < 160; i++) {
  await page.evaluate(() => window.__game.testAdvance(0.5));
  const st = await page.evaluate(() => ({ s: window.__game.state, t: window.__game.stateTime }));
  if (want.has(st.s) && !got.has(st.s) && st.t >= want.get(st.s)) {
    got.add(st.s);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/pt-${name}-${n++}-${st.s}.png` });
    note(`${st.s} @${st.t.toFixed(1)}s`);
  }
  if (st.s === 'end' && got.has('end')) break;
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/pt-${name}-${n++}-final.png` });
note('final: ' + await page.evaluate(() => window.__game.state));
note('endMenuVisible: ' + await page.evaluate(() => document.getElementById('end').classList.contains('on')));
note('errors: ' + JSON.stringify(errors.filter((e) => !e.includes('404'))));
fs.writeFileSync(`${OUT}/pt-${name}.log`, log.join('\n'));
await ctx.close();
await b.close();
