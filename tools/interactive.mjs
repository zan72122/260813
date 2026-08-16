// Simulates the real touch flow: start screen -> crowd gathers -> tap the
// signal -> drag a crosswalk handle. Verifies the one-finger controls work.
//   node tools/interactive.mjs [outdir]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const out = process.argv[2] || 'shots';
const server = spawn('python3', ['-m', 'http.server', '8736', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true });
let fail = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fail++; };

await page.goto('http://127.0.0.1:8736/index.html?seed=42&n=150');
await page.waitForFunction(() => window.__game);
ok('start overlay shown', await page.locator('#start').isVisible());
await page.screenshot({ path: `${out}/i-0-title.png` });
await page.tap('#startBtn', { force: true });
ok('overlay hides', await page.locator('#start').isHidden());

// Crowd streams in (real time). Wait a bit and snapshot the gathering.
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/i-1-gathering.png` });
const gathering = await page.evaluate(() => window.__game.state());
ok('gathering in progress', gathering === 'gather' || gathering === 'ready');

// Speed the rest of the gather up through the sim API, then tap the signal.
await page.evaluate(() => window.__game.stepSeconds(40));
ok('everyone waiting', await page.evaluate(() => window.__game.state()) === 'ready');
await page.tap('#goBtn', { force: true });
ok('light turns green', await page.evaluate(() => window.__game.light()) === 'green');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/i-2-tapped-green.png` });

// Finish the run.
await page.evaluate(() => window.__game.stepSeconds(80));
ok('run done', await page.evaluate(() => window.__game.state()) === 'done');
await page.waitForTimeout(1500);

// Drag the south crosswalk handle outward with a single "finger".
const before = await page.evaluate(() => window.__game.sim.cfg.crosswalkWidths.S);
const start = await page.evaluate(() => {
  const g = window.__game;
  return g.__project ? g.__project('S') : null;
});
ok('handle projection available', !!start);
if (start) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(start.x + start.dx * i * 14, start.y + start.dy * i * 14);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}
const after = await page.evaluate(() => window.__game.sim.cfg.crosswalkWidths.S);
console.log('  width S:', before.toFixed(2), '->', after.toFixed(2));
ok('drag widened the crosswalk', after > before + 2);
await page.screenshot({ path: `${out}/i-3-after-drag.png` });

// Reset and replay.
await page.tap('#resetBtn', { force: true });
ok('reset back to ready', await page.evaluate(() => window.__game.state()) === 'ready');
await page.tap('#goBtn', { force: true });
await page.evaluate(() => window.__game.stepSeconds(80));
const m2 = await page.evaluate(() => window.__game.metrics());
ok('second run completes', m2 && m2.complete);
console.log('  second run: left=' + m2.leftBehind, 'jamSum=' + m2.jamSum.toFixed(0));

await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
