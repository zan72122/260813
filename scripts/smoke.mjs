/**
 * Chromium スモークテスト:
 *   node scripts/smoke.mjs            … 一周プレイ (iPhone縦) + 回転 + リプレイ
 *   node scripts/smoke.mjs --sizes    … 4画面寸法のロードショットのみ
 * 各モジュールを順に実プレイし、失敗したら goto で回復して続行、最後に集計。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.GAME_URL || 'http://127.0.0.1:4173/';
const OUT = process.env.SHOT_DIR || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const SIZES_ONLY = process.argv.includes('--sizes');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

const errors = [];
const failures = [];

async function newPage(w, h, name) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot:', name); };

async function swipe(page, x1, y1, x2, y2, steps = 14, ms = 240) {
  const W = page.viewportSize().width, H = page.viewportSize().height;
  const cl = (v, m) => Math.max(4, Math.min(m - 4, v));
  await page.mouse.move(cl(x1, W), cl(y1, H));
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cl(x1 + ((x2 - x1) * i) / steps, W), cl(y1 + ((y2 - y1) * i) / steps, H));
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
}

async function hold(page, x, y, ms) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.mouse.move(x + Math.random() * 3, y + Math.random() * 3);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
}

async function circle(page, cx, cy, r, turns = 2) {
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  const steps = Math.round(28 * turns);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 * turns;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

const idx = p => p.evaluate(() => window.__gameRef.index);
/** ワールド座標 → screen css px (ゲームカメラで投影) */
const w2s = (page, x, y, z) => page.evaluate(([x, y, z]) => {
  const cam = window.__gameRef.stage.camera;
  const v = new (Object.getPrototypeOf(cam.position).constructor)(x, y, z);
  v.project(cam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}, [x, y, z]);
const objScreen = (page, expr) => page.evaluate((e) => {
  const o = eval(e);
  const cam = window.__gameRef.stage.camera;
  const v = new (Object.getPrototypeOf(cam.position).constructor)();
  if (o.getWorldPosition) o.getWorldPosition(v); else v.copy(o);
  v.project(cam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}, expr);

async function waitAdvance(page, from, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await idx(page)) !== from) { await page.waitForTimeout(300); return true; }
    await page.waitForTimeout(200);
  }
  return false;
}

// ---------- 各モジュールのドライバ ----------
const drivers = {
  async 0(page) { // intro
    await shot(page, 'm00-intro');
    await page.locator('.playbtn').click();
  },
  async 1(page) { // pour
    for (let k = 0; k < 7; k++) {
      const knob = await objScreen(page, `window.__gameRef.stage.props.lever.getObjectByName('knob')`);
      await page.mouse.move(knob.x, knob.y);
      await page.mouse.down();
      await page.mouse.move(knob.x, knob.y + 150, { steps: 8 });
      await page.waitForTimeout(900);
      await page.mouse.up();
      if (k === 1) await shot(page, 'm01-pouring');
      if ((await idx(page)) !== 1) return;
    }
  },
  async 2(page) { // gather
    const W = page.viewportSize().width, H = page.viewportSize().height;
    for (let k = 0; k < 5; k++) {
      await swipe(page, W * 0.72, H * 0.42, W * 0.5, H * 0.48, 10, 260);
      await page.waitForTimeout(350);
      if ((await idx(page)) !== 2) return;
    }
  },
  async 3(page) { // stretch
    await page.waitForTimeout(1300);
    const W = page.viewportSize().width;
    for (let k = 0; k < 4; k++) {
      const h = await objScreen(page, 'window.__gameRef.world.stretch.visHandle');
      await swipe(page, h.x, h.y, Math.min(W - 8, h.x + W * 0.55), h.y - 40, 16, 550);
      if (k === 0) await shot(page, 'm03-stretched');
      await page.waitForTimeout(1100);
      if ((await idx(page)) !== 3) return;
    }
  },
  async 4(page) { // spread
    for (let k = 0; k < 8; k++) {
      const cs = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      const a = (k / 8) * Math.PI * 2;
      await swipe(page, cs.x, cs.y - 20, cs.x + Math.cos(a) * 120, cs.y - 20 + Math.sin(a) * 80, 10, 220);
      if ((await idx(page)) !== 4) return;
    }
  },
  async 5(page) { // bag form
    for (let k = 0; k < 4; k++) {
      const b = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, b.x, b.y - 40, b.x, b.y + 150, 12, 300);
      const d = await page.evaluate(() => window.__gameRef.world.bag.params.depth);
      if (d >= 0.88) break;
    }
    await shot(page, 'm05-dip');
    for (let k = 0; k < 4; k++) {
      if ((await idx(page)) !== 5) return;
      const b = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, b.x + 60, b.y - 10, b.x + 40, b.y - 190, 12, 300);
    }
  },
  async 6(page) { // strac: tear ×3 → cream → stir
    for (let k = 0; k < 5; k++) {
      const s = await objScreen(page, 'window.__gameRef.world.strip.position');
      await swipe(page, s.x, s.y - 30, s.x + 6, s.y + 140, 10, 260);
      await page.waitForTimeout(650);
      const n = await page.evaluate(() => window.__gameRef.world.sideRibbons.children.length);
      if (n >= 3) break;
    }
    await shot(page, 'm06-torn');
    for (let k = 0; k < 4; k++) {
      const lvl0 = await page.evaluate(() => window.__gameRef.world.sideCreamLevel);
      if (lvl0 >= 0.8) break;
      const pk = await objScreen(page, `window.__gameRef.stage.props.pitcher.getObjectByName('creamKnob')`);
      await hold(page, pk.x, pk.y, 1500);
    }
    await shot(page, 'm06-cream');
    for (let k = 0; k < 3; k++) {
      if ((await idx(page)) !== 6) return;
      const sb = await objScreen(page, 'window.__gameRef.stage.props.sideBowl.position');
      await circle(page, sb.x, sb.y - 60, 85, 2.4);
      await page.waitForTimeout(400);
    }
  },
  async 7(page) { // fill: scoop ×4 → cream
    for (let k = 0; k < 7; k++) {
      const from = await objScreen(page, 'window.__gameRef.stage.props.sideBowl.position');
      const to = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, from.x, from.y - 40, to.x, to.y - 50, 16, 500);
      await page.waitForTimeout(750);
      const sc = await page.evaluate(() => window.__gameRef.ctx.craft.fillScoops);
      if (sc >= 4) break;
    }
    await shot(page, 'm07-scooped');
    for (let k = 0; k < 4; k++) {
      if ((await idx(page)) !== 7) return;
      const pk = await objScreen(page, `window.__gameRef.stage.props.pitcher.getObjectByName('creamKnob')`);
      await hold(page, pk.x, pk.y, 1600);
    }
  },
  async 8(page) { // gather mouth
    for (let k = 0; k < 4; k++) {
      const b = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, b.x + 40, b.y - 20, b.x, b.y - 260, 14, 380);
      if ((await idx(page)) !== 8) return;
    }
  },
  async 9(page) { // pinch → twist
    for (let k = 0; k < 3; k++) {
      const n = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, n.x, n.y - 60, n.x, n.y - 160, 8, 200);
      await page.waitForTimeout(200);
      const kv = await page.evaluate(() => window.__gameRef.world.bag.params.knot);
      if (kv >= 0.5) break;
    }
    for (let k = 0; k < 3; k++) {
      if ((await idx(page)) !== 9) return;
      const n = await objScreen(page, 'window.__gameRef.world.bag.group.position');
      await swipe(page, n.x - 70, n.y - 110, n.x + 80, n.y - 110, 8, 200);
      await page.waitForTimeout(250);
    }
  },
  async 10(page) { // cold water
    const from = await objScreen(page, 'window.__gameRef.world.bag.group.position');
    const to = await objScreen(page, 'window.__gameRef.stage.props.coldBowl.position');
    await swipe(page, from.x, from.y - 30, to.x, to.y - 40, 16, 650);
    await shot(page, 'm10-splash');
  },
  async 11(page) { // to plate
    const from = await objScreen(page, 'window.__gameRef.world.bag.group.position');
    const to = await objScreen(page, 'window.__gameRef.stage.props.plate.position');
    await swipe(page, from.x, from.y - 30, to.x, to.y - 30, 16, 650);
  },
  async 12(page) { // open
    for (let k = 0; k < 5; k++) {
      const g = await objScreen(page, 'window.__gameRef.world.guideLine.position');
      await swipe(page, g.x - 80, g.y, g.x + 120, g.y + 4, 14, 480);
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => window.__gameRef.world.bag.params.open);
      if (k === 1) await shot(page, 'm12-opening');
      if (open >= 1 || (await idx(page)) !== 12) break;
    }
  },
};

// ---------- 実行 ----------
if (SIZES_ONLY) {
  const sizes = [
    ['iphone-portrait', 390, 844], ['iphone-landscape', 844, 390],
    ['ipad-portrait', 820, 1180], ['ipad-landscape', 1180, 820],
  ];
  for (const [name, w, h] of sizes) {
    const { ctx, page } = await newPage(w, h, name);
    await shot(page, `load-${name}`);
    // 縦横で主対象が見えるか: 各主要モジュールの静的ショット
    for (const m of [3, 5, 7, 12]) {
      await page.evaluate(i => window.__gameRef.goto(i), m);
      await page.waitForTimeout(1600);
      await shot(page, `size-${name}-m${m}`);
    }
    await ctx.close();
  }
} else {
  const { ctx, page } = await newPage(390, 844, 'play');
  for (let m = 0; m <= 12; m++) {
    const cur = await idx(page);
    if (cur !== m) {
      failures.push(`module ${m - 1} did not advance (at ${cur}); goto(${m})`);
      await page.evaluate(i => window.__gameRef.goto(i), m);
      await page.waitForTimeout(1500);
    }
    try {
      await drivers[m](page);
    } catch (e) {
      failures.push(`module ${m} driver error: ${e.message}`);
    }
    const advanced = await waitAdvance(page, m, m === 12 ? 15000 : 8000);
    if (!advanced && m > 0) failures.push(`module ${m} did not complete`);
    if (advanced && m === 0) { /* intro done */ }
    await shot(page, `m${String(m).padStart(2, '0')}-end`);
  }
  // M13 リプレイ: 「びよーんだけ」(2タップ以内)
  if ((await idx(page)) === 13) {
    await shot(page, 'm13-replay');
    await page.locator('.bigbtn').nth(1).click();
    await page.waitForTimeout(900);
    if ((await idx(page)) !== 3) failures.push('replay jump to stretch failed');
    else console.log('replay -> stretch OK');
  } else {
    failures.push('did not reach replay module');
  }
  // 回転: 状態を失わない
  const before = await idx(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  if ((await idx(page)) !== before) failures.push('rotation lost state');
  await shot(page, 'rotated-landscape');
  await ctx.close();
}

console.log('---- failures:', failures.length);
failures.forEach(f => console.log(' FAIL:', f));
console.log('---- console errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log(' ERR:', e));
if (failures.length || errors.length) process.exitCode = 1;
console.log(process.exitCode ? 'SMOKE: FAIL' : 'SMOKE: PASS');
await browser.close();
