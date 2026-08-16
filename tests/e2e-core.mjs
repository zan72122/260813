import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
const INDEX = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

const shots = process.argv.includes('--shots');
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(INDEX + '?fast=1');
await page.waitForFunction(() => window.game);
await page.evaluate(() => { game.manual = true; game.play(); });

const m0 = await page.evaluate(() => game.metrics());
console.log('init:', JSON.stringify(m0));

// ---- baseline run: 90s, sample every 5s ----
let maxBlocked = 0, baseSamples = [];
for (let i = 0; i < 18; i++) {
  await page.evaluate(() => game.step(5));
  const m = await page.evaluate(() => game.metrics());
  baseSamples.push(m);
  maxBlocked = Math.max(maxBlocked, m.blocked);
  if (shots && (m.t === 25 || m.t === 60)) {
    await page.evaluate(() => game.draw());
    await page.screenshot({ path: `shot-base-${m.t}.png` });
  }
}
const base = baseSamples[baseSamples.length - 1];
console.log('baseline t=90:', JSON.stringify(base), 'maxBlocked:', maxBlocked);
console.log('baseline timeline:', baseSamples.map(m => `${m.t.toFixed(0)}s d=${m.delivered} b=${m.blocked}`).join(' | '));

// ---- determinism check ----
await page.evaluate(() => { game.reset(); game.play(); });
await page.evaluate(() => game.step(90));
const base2 = await page.evaluate(() => game.metrics());
console.log('determinism:', base.delivered === base2.delivered && base.blocked === base2.blocked ? 'OK' : `FAIL (${base2.delivered} vs ${base.delivered})`);

// ---- intervention: one-way arrow on center row, then reset+replay ----
await page.evaluate(() => { game.stop(); game.swipe(6, 7, 10, 7); });
const arrows = await page.evaluate(() => game.arrows());
console.log('arrows placed:', arrows.length, 'sample:', JSON.stringify(arrows.slice(0, 3)));
await page.evaluate(() => { game.reset(); game.play(); });

let fixedSamples = [], fixedMaxBlocked = 0, doneAt = null;
for (let i = 0; i < 18; i++) {
  await page.evaluate(() => game.step(5));
  const m = await page.evaluate(() => game.metrics());
  fixedSamples.push(m);
  fixedMaxBlocked = Math.max(fixedMaxBlocked, m.blocked);
  if (m.completed && doneAt === null) doneAt = m.t;
  if (shots && m.t === 25) {
    await page.evaluate(() => game.draw());
    await page.screenshot({ path: 'shot-fixed-25.png' });
  }
}
const fixed = fixedSamples[fixedSamples.length - 1];
console.log('fixed t=90:', JSON.stringify(fixed), 'maxBlocked:', fixedMaxBlocked, 'completedAt:', doneAt);
console.log('fixed timeline:', fixedSamples.map(m => `${m.t.toFixed(0)}s d=${m.delivered} b=${m.blocked}`).join(' | '));

// ---- verdicts ----
const v = [];
v.push(['48 AGVs', m0.agvs === 48]);
v.push(['baseline jams (maxBlocked>=10)', maxBlocked >= 10]);
v.push(['baseline stalls (delivered<total)', base.delivered < base.total]);
v.push(['fix completes all orders', fixed.completed]);
v.push(['fix much better', fixed.delivered >= base.delivered * 1.5]);
v.push(['no page errors', errors.length === 0]);
for (const [name, ok] of v) console.log(ok ? 'PASS' : 'FAIL', '-', name);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(v.every(x => x[1]) ? 0 : 1);
