// Drives the game through its whole chain and saves stills so we can actually
// look at what a player sees. Software WebGL here is fine for composition and
// colour checks — never for judging FPS or smoothness. Because SwiftShader runs
// far slower than wall time, every step waits on *rendered frames*, not timers.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = process.env.OUT || 'shots';
const SEED = process.env.SEED || '12345';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  'iphone-portrait': { width: 390, height: 844, dpr: 2 },
  'iphone-landscape': { width: 844, height: 390, dpr: 2 },
  'ipad-portrait': { width: 820, height: 1180, dpr: 1.5 },
  'ipad-landscape': { width: 1180, height: 820, dpr: 1.5 },
};

const args = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-lcd-text',
];

const only = process.argv[2];
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ args, headless: true, executablePath: EXEC });
const errors = [];

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  if (only && !name.includes(only)) continue;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.goto(`${BASE}/?e2e=1&seed=${SEED}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ui && window.__ui.ready, null, { timeout: 30000 });

  // step(fn, frames): mutate state, then let that many real frames render
  const step = async (fn, frames = 4) => {
    if (fn) await page.evaluate(fn);
    await page.evaluate((n) => window.__ui.settle(n), frames);
  };
  const shot = (tag) => page.screenshot({ path: path.join(OUT, `${name}--${tag}.png`) });

  // 1 — delivery, wide 3/4 look at the workshop
  await step(null, 6);
  await shot('1-intro');

  // 2 — placed on the light stage, still just clear plastic
  await step(() => {
    const g = window.__game;
    g.tap(0, 0);
    for (let i = 0; i < 40; i++) g.update(1 / 60);
  }, 3);
  await shot('2-clear');

  // 3 — a small turn: the very first hint of colour
  await step(() => {
    const g = window.__game;
    for (let i = 0; i < 12; i++) g.turn(0.045, 1 / 60);
    g.ringVel = 0; g.ringAngle = 0.55;
    for (let i = 0; i < 10; i++) g.update(1 / 60);
  }, 3);
  await shot('3-first-colour');

  // 4 — charged and crossed: the reveal
  await step(() => {
    const g = window.__game;
    for (let i = 0; i < 300; i++) g.turn(0.06, 1 / 60);
    g.ringVel = 0; g.ringAngle = Math.PI / 2;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
  }, 3);
  await shot('4-rainbow');

  // 5 — a finger pressed into it
  await step(() => {
    const g = window.__game;
    g.setStage(3);
    const p = g.beginPress(0.16, 0.12); p.s = 1;
    for (let i = 0; i < 70; i++) g.update(1 / 60);
  }, 3);
  await shot('5-press');

  // 6 — three parts side by side
  await step(() => {
    const g = window.__game;
    g.presses.length = 0;
    g.setStage(4);
    g.placeNextPart(); g.placeNextPart();
    g.ringAngle = Math.PI / 2 + 0.30;
    for (let i = 0; i < 150; i++) g.update(1 / 60);
  }, 3);
  await shot('6-parts');

  // 7 — the whole workshop as stained glass
  await step(() => {
    const g = window.__game;
    g.setStage(5);
    g.ringAngle = Math.PI / 2 - 0.35;
    for (let i = 0; i < 220; i++) g.update(1 / 60);
  }, 3);
  await shot('7-window');

  // 8 — finale, with "again / next" offered
  await step(() => {
    const g = window.__game;
    g.setStage(6);
    g.burst = 0.55;
    for (let i = 0; i < 110; i++) g.update(1 / 60);
    document.getElementById('choices').classList.add('on');
  }, 3);
  await shot('8-done');

  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`shots written to ${OUT}/`);
