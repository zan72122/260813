/**
 * The things that break a mobile game rather than making it ugly:
 * rotating the device mid-play, and going round again from the end menu.
 */
import { launch, openPage, DEVICES, tapStart, shot } from './play.mjs';

const b = await launch();
const { page, ctx, errors } = await openPage(b, { width: 390, height: 844, dpr: 2 }, '?scene=plant');
await tapStart(page);
await page.waitForTimeout(900);

const snap = () => page.evaluate(() => {
  const g = window.__game;
  const c = g.director.camera;
  return {
    state: g.state, planted: g.planted,
    aspect: +(g.layout.aspect.toFixed(3)), wide: +(g.layout.wide.toFixed(2)),
    fov: +c.fov.toFixed(1), camY: +c.position.y.toFixed(2),
    w: g.renderer.domElement.width, h: g.renderer.domElement.height,
  };
});

// plant two bulbs, then rotate mid-play
for (let i = 0; i < 2; i++) {
  const p = await page.evaluate(() => {
    const g = window.__game;
    const proj = (v) => { const q = v.clone().project(g.director.camera);
      return { x: (q.x * 0.5 + 0.5) * g.layout.width, y: (-q.y * 0.5 + 0.5) * g.layout.height }; };
    const h = g.holeAt(g.planted);
    const b = g.plot.bulbs[g.planted].position;
    return { from: proj(b), to: proj(new b.constructor(h.x, 0.06, h.z)) };
  });
  await page.mouse.move(p.from.x, p.from.y); await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(p.from.x + (p.to.x - p.from.x) * k / 12, p.from.y + (p.to.y - p.from.y) * k / 12);
    await page.waitForTimeout(10);
  }
  await page.mouse.up();
  await page.evaluate(() => window.__game.testAdvance(1.2));
}
console.log('before rotate', await snap());

for (const [w, h] of [[844, 390], [390, 844], [1194, 834], [834, 1194], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(450);
  const s = await snap();
  console.log(`viewport ${w}x${h} ->`, s);
  if (s.planted !== 2) throw new Error('progress lost on rotate!');
  if (s.state !== 'plant') throw new Error('state changed on rotate!');
}
await shot(page, 'rotate-back-to-portrait');

// finish the run, then use the end menu
await page.evaluate(() => window.__game.jumpTo('end'));
await page.waitForTimeout(600);
await page.click('#btnColor', { force: true });
await page.waitForTimeout(600);
console.log('after ちがう いろ:', await snap());
await page.evaluate(() => window.__game.testAdvance(1));
await shot(page, 'replay-color');

await page.evaluate(() => window.__game.jumpTo('end'));
await page.waitForTimeout(500);
await page.click('#btnField', { force: true });
await page.waitForTimeout(700);
console.log('after べつの はたけ:', await snap());
await page.evaluate(() => window.__game.testAdvance(1));
await shot(page, 'replay-field');

await page.evaluate(() => window.__game.jumpTo('end'));
await page.waitForTimeout(500);
await page.click('#btnAgain', { force: true });
await page.waitForTimeout(700);
console.log('after もういちど:', await snap());
console.log('errors:', errors.filter((e) => !e.includes('404')));
await ctx.close();
await b.close();
