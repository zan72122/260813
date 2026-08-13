/* Drives the game end-to-end with real pointer events and captures
 * screenshots at every stage, in portrait (iPhone), landscape and iPad. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8734/';
const OUT = process.env.SHOT_DIR || 'test/shots';
fs.mkdirSync(OUT, { recursive: true });

const consoleErrors = [];

async function newPage(browser, w, h, dpr) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 20000 });
  // headless SwiftShader runs at ~5 fps with a 50 ms dt cap -> compensate
  await page.evaluate('window.__game.timeScale = 4');
  await page.waitForTimeout(600);
  return { ctx, page };
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

async function state(page) {
  return page.evaluate('window.__game.state');
}

async function tapAt(page, x, y) {
  await page.touchscreen.tap(x, y);
}

async function holdAt(page, x, y, ms) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function dragAcross(page, x1, y1, x2, y2, steps = 20) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function fullFlow(page, tag, opts = {}) {
  const holdShots = opts.holdShots !== false;

  console.log(`--- flow ${tag}: state=${await state(page)}`);
  await shot(page, `${tag}-1-pick`);

  // tap the middle charm (butterfly)
  const p1 = await page.evaluate('window.__game.screenPos("piece1")');
  if (!p1) throw new Error('no piece1 position');
  await tapAt(page, p1.x, p1.y);
  await page.waitForTimeout(1500);
  await shot(page, `${tag}-2-hooking`);

  // wait for the dip sequence to finish
  await page.waitForFunction('window.__game.state === "anodize"', { timeout: 90000 });
  await page.waitForTimeout(800);
  await shot(page, `${tag}-3-submerged`);

  // hold the lever: colour should grow gold -> purple -> blue -> cyan
  const cx = (await page.viewportSize()).width / 2;
  const cy = (await page.viewportSize()).height / 2;

  if (holdShots) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await page.waitForTimeout(1500);
    await shot(page, `${tag}-4-gold`);
    console.log('thickness@gold', await page.evaluate('window.__game.thickness'));
    await page.waitForTimeout(1400);
    await shot(page, `${tag}-5-purple`);
    await page.waitForTimeout(1500);
    await shot(page, `${tag}-6-blue`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    console.log('thickness@release', await page.evaluate('window.__game.thickness'));
    await page.waitForTimeout(300);
    // verify release stopped growth
    const t1 = await page.evaluate('window.__game.thickness');
    await page.waitForTimeout(700);
    const t2 = await page.evaluate('window.__game.thickness');
    if (Math.abs(t1 - t2) > 0.01) throw new Error(`growth did not stop on release: ${t1} -> ${t2}`);
    console.log('release stops growth: OK');
  } else {
    await holdAt(page, cx, cy, 4200);
  }

  await page.waitForTimeout(700);
  await shot(page, `${tag}-7-released`);

  // raise button visible?
  const visible = await page.evaluate('document.getElementById("btnRaise").classList.contains("show")');
  if (!visible) throw new Error('raise button not visible after release');
  await page.tap('#btnRaise');
  await page.waitForTimeout(2200);
  await shot(page, `${tag}-8-raising`);

  await page.waitForFunction('window.__game.state === "display"', { timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, `${tag}-9-display`);

  // tilt: drag and check iridescent shimmer view
  await dragAcross(page, cx - 130, cy, cx + 130, cy - 40);
  await page.waitForTimeout(400);
  await shot(page, `${tag}-10-tilted`);

  // again button -> back to pick with the piece on the collection shelf
  const againVisible = await page.evaluate('document.getElementById("btnAgain").classList.contains("show")');
  if (!againVisible) throw new Error('again button not visible in display state');
  await page.tap('#btnAgain');
  await page.waitForFunction('window.__game.state === "pick"', { timeout: 90000 });
  await page.waitForTimeout(1400);
  await shot(page, `${tag}-11-back`);
  console.log(`--- flow ${tag} complete`);
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--enable-unsafe-swiftshader', ''],
});

try {
  // iPhone portrait: the full flow
  {
    const { ctx, page } = await newPage(browser, 390, 844, 2);
    await fullFlow(page, 'iphone-portrait');
    await ctx.close();
  }
  // iPhone landscape: full flow
  {
    const { ctx, page } = await newPage(browser, 844, 390, 2);
    await fullFlow(page, 'iphone-landscape', { holdShots: false });
    await ctx.close();
  }
  // iPad portrait: spot checks
  {
    const { ctx, page } = await newPage(browser, 820, 1180, 2);
    await shot(page, 'ipad-portrait-pick');
    const p = await page.evaluate('window.__game.screenPos("piece0")');
    await tapAt(page, p.x, p.y);
    await page.waitForFunction('window.__game.state === "anodize"', { timeout: 90000 });
    await page.waitForTimeout(500);
    const vs = await page.viewportSize();
    await holdAt(page, vs.width / 2, vs.height / 2, 3500);
    await page.waitForTimeout(400);
    await shot(page, 'ipad-portrait-anodize');
    await ctx.close();
  }
  if (consoleErrors.length) {
    console.log('CONSOLE ERRORS:');
    for (const e of consoleErrors) console.log(' ', e);
    process.exitCode = 1;
  } else {
    console.log('no console errors');
  }
} finally {
  await browser.close();
}
