import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const INDEX = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(INDEX + '?fast=1');
await page.waitForFunction(() => window.game);
await page.evaluate(() => { game.manual = true; });

const v = [];

// --- scenario: LEFT arrow on center row (child picks "wrong" direction) ---
await page.evaluate(() => { game.play(); game.stop(); game.swipe(10, 7, 6, 7); game.reset(); game.play(); game.step(120); });
let m = await page.evaluate(() => game.metrics());
console.log('left-arrow t=120:', JSON.stringify(m));
v.push(['left arrow also completes', m.completed]);

// --- scenario: bypass carve through a shelf (vertical swipe through shelf block) ---
await page.evaluate(() => {
  game.stop(); game.reset();
  // clear arrows by tapping? use fresh page state instead: remove user arrows via API swipe opposite… simplest: reload
});
await page.goto(INDEX + '?fast=1');
await page.waitForFunction(() => window.game);
await page.evaluate(() => { game.manual = true; });
await page.evaluate(() => { game.play(); game.stop(); game.swipe(12, 5, 4, 5); game.swipe(6, 7, 10, 7); game.reset(); game.play(); game.step(120); });
m = await page.evaluate(() => game.metrics());
const arrowsN = await page.evaluate(() => game.arrows().length);
console.log('bypass+arrow t=120:', JSON.stringify(m), 'arrows:', arrowsN);
v.push(['bypass carved and arrowed', arrowsN > 25]);
v.push(['bypass + arrow completes', m.completed]);

// --- determinism across RESET with edits: run fixed twice ---
await page.goto(INDEX + '?fast=1');
await page.waitForFunction(() => window.game);
await page.evaluate(() => { game.manual = true; game.play(); game.stop(); game.swipe(6, 7, 10, 7); });
await page.evaluate(() => { game.reset(); game.play(); game.step(40); });
const d1 = await page.evaluate(() => game.metrics().delivered);
await page.evaluate(() => { game.reset(); game.play(); game.step(40); });
const d2 = await page.evaluate(() => game.metrics().delivered);
console.log('reset determinism:', d1, d2);
v.push(['reset determinism', d1 === d2]);

// --- UI: real pointer swipe places arrows; tap clears them ---
await page.goto(INDEX + '?fast=1');
await page.waitForFunction(() => window.game);
// world(6..10, 7) → screen coords
const pts = await page.evaluate(() => {
  const a = game.worldToScreen(6.5, 7.5), b = game.worldToScreen(10.5, 7.5);
  return { a, b };
});
await page.mouse.move(pts.a.x, pts.a.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(pts.a.x + (pts.b.x - pts.a.x) * i / 10, pts.a.y + (pts.b.y - pts.a.y) * i / 10);
}
await page.mouse.up();
let arrows = await page.evaluate(() => game.arrows().length);
console.log('pointer swipe arrows:', arrows);
v.push(['pointer swipe places arrows', arrows >= 15]);
// tap to clear
await page.mouse.click((pts.a.x + pts.b.x) / 2, pts.a.y);
arrows = await page.evaluate(() => game.arrows().length);
console.log('after tap-clear arrows:', arrows);
v.push(['tap clears arrows', arrows === 0]);

// --- portrait: pointer swipe maps correctly through rotation ---
const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
await p3.goto(INDEX + '?fast=1');
await p3.waitForFunction(() => window.game);
const ppts = await p3.evaluate(() => ({ a: game.worldToScreen(6.5, 7.5), b: game.worldToScreen(10.5, 7.5) }));
await p3.mouse.move(ppts.a.x, ppts.a.y);
await p3.mouse.down();
for (let i = 1; i <= 10; i++) {
  await p3.mouse.move(ppts.a.x + (ppts.b.x - ppts.a.x) * i / 10, ppts.a.y + (ppts.b.y - ppts.a.y) * i / 10);
}
await p3.mouse.up();
const pArrows = await p3.evaluate(() => game.arrows());
console.log('portrait swipe arrows:', pArrows.length, 'dirs:', [...new Set(pArrows.map(a => a[2]))]);
v.push(['portrait swipe places rightward arrows', pArrows.length >= 15 && pArrows.every(a => a[2] === 0)]);
await p3.close();

// --- UI buttons ---
await page.click('#playBtn');
let playing = await page.evaluate(() => game.metrics().playing);
v.push(['play button starts', playing === true]);
await page.click('#playBtn');
playing = await page.evaluate(() => game.metrics().playing);
v.push(['play button stops', playing === false]);
await page.click('#resetBtn');
m = await page.evaluate(() => game.metrics());
v.push(['reset button resets', m.t === 0 && m.delivered === 0]);

// --- performance: sim + draw timing at 1x ---
const perf = await page.evaluate(() => {
  game.manual = true; game.play(); game.step(20);   // mid-run state
  let t0 = performance.now();
  for (let i = 0; i < 300; i++) game.step(1 / 60);  // 5 sim-seconds
  const simMs = (performance.now() - t0) / 300;
  t0 = performance.now();
  for (let i = 0; i < 60; i++) game.draw();
  const drawMs = (performance.now() - t0) / 60;
  return { simMs: simMs.toFixed(3), drawMs: drawMs.toFixed(2) };
});
console.log('perf per frame: sim', perf.simMs, 'ms, draw', perf.drawMs, 'ms');
v.push(['perf ok (<6ms combined)', parseFloat(perf.simMs) + parseFloat(perf.drawMs) < 6]);

for (const [name, ok] of v) console.log(ok ? 'PASS' : 'FAIL', '-', name);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(v.every(x => x[1]) && errors.length === 0 ? 0 : 1);
