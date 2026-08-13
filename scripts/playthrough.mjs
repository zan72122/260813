// A genuine playthrough: nothing but pointer events, the way a child gives
// them — sloppy swipes, pokes, and pauses. Captures frames as it goes.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
mkdirSync('shots/play', { recursive: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/?e2e=1&seed=8801');
await page.waitForFunction(() => window.__ui && window.__ui.ready);

const settle = (n = 3) => page.evaluate((k) => window.__ui.settle(k), n);
let shotN = 0;
const shot = async (tag) => {
  await settle(2);
  await page.screenshot({ path: `shots/play/${String(++shotN).padStart(2, '0')}-${tag}.png` });
};
const state = () => page.evaluate(() => {
  const g = window.__game;
  return { stage: g.stage, ang: +g.ringAngle.toFixed(2), rot: +g.totalRot.toFixed(2),
           charge: +g.charge.toFixed(2), placed: g.placedParts, presses: g.pressCount };
});

/** a child's swipe: never a clean arc */
async function swipe(pts, steps = 10) {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let s = 1; s <= steps; s++) {
      await page.mouse.move(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
    }
  }
  await page.mouse.up();
  await settle(2);
}

await shot('arrives');
await page.mouse.click(195, 400);                 // poke it onto the stage
await shot('placed');
console.log('after tap  ', await state());

// scruffy circles around the ring
const C = { x: 195, y: 422 }, R = 150;
for (let round = 0; round < 6; round++) {
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI * 2 + round;
    const jitter = 0.85 + 0.3 * ((k * 7 + round * 3) % 5) / 5;   // wobbly radius
    pts.push({ x: C.x + Math.cos(a) * R * jitter, y: C.y + Math.sin(a) * R * jitter });
  }
  await swipe(pts, 4);
  if (round === 0) await shot('first-turns');
  if (round === 2) await shot('colour-coming');
}
await shot('rainbow');
console.log('after spin ', await state());

// let the game move on to pressing, then poke the part with a finger
for (let i = 0; i < 12; i++) await settle(6);
console.log('after wait ', await state());
for (const p of [{ x: 195, y: 400 }, { x: 230, y: 450 }, { x: 160, y: 470 }]) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await settle(4);
  await page.mouse.move(p.x + 30, p.y - 20);      // drag the fingertip through it
  await settle(4);
  await page.mouse.up();
}
await shot('pressed');
console.log('after press', await state());

// keep playing until the chain finishes on its own terms
for (let round = 0; round < 40; round++) {
  await swipe([{ x: 60, y: 300 }, { x: 330, y: 380 }, { x: 300, y: 640 }, { x: 80, y: 500 }], 5);
  await page.mouse.click(195, 430);
  const s = await state();
  if (s.stage === 4 && shotN < 7) await shot('parts');
  if (s.stage === 5 && shotN < 8) await shot('window');
  if (s.stage === 6) { await shot('finale'); console.log('finished ', s); break; }
}

const done = await page.locator('#choices').evaluate((n) => n.classList.contains('on'));
console.log('choices shown:', done);
await page.locator('#btn-again').click();
await settle(4);
console.log('after again', await state());
await shot('again');

await ctx.close();
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('playthrough clean');
