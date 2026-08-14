// 実機相当の自動試遊。縦画面・横画面でそれぞれ一周プレイして
// 各工程のスクリーンショットを撮る。
// 使い方: node scripts/playtest.mjs [portrait|landscape|ipad] [--headed] [--url=...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith('-')) || 'portrait';
const headed = args.includes('--headed');
const urlArg = args.find((a) => a.startsWith('--url='));
const URL = urlArg ? urlArg.slice(6) : 'http://127.0.0.1:5173/';

const DEVICES = {
  portrait: { name: 'iphone-portrait', width: 390, height: 844, dpr: 3 },
  landscape: { name: 'iphone-landscape', width: 844, height: 390, dpr: 3 },
  ipad: { name: 'ipad-landscape', width: 1180, height: 820, dpr: 2 },
  ipadp: { name: 'ipad-portrait', width: 820, height: 1180, dpr: 2 },
};

const shotDir = path.join(process.cwd(), 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function state(page) { return page.evaluate(() => window.__nori.state); }
async function target(page) { return page.evaluate(() => window.__nori.target); }
async function frameAt(page, u, v) { return page.evaluate(([u, v]) => window.__nori.frameAt(u, v), [u, v]); }

async function shot(page, dev, name) {
  await page.screenshot({ path: path.join(shotDir, `${dev.name}-${name}.png`) });
}

// なめらかなドラッグ（実際のポインタイベントを流す）
async function drag(page, pts, { steps = 6, pause = 16 } = {}) {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps });
    if (pause) await sleep(pause);
  }
  await page.mouse.up();
}

async function waitStage(page, name, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state(page);
    if (s.stage === name) return true;
    await sleep(60);
  }
  return false;
}

async function run() {
  const dev = DEVICES[which];
  if (!dev) throw new Error('unknown device: ' + which);
  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const log = [];
  const note = (s) => { log.push(s); console.log('  ' + s); };

  console.log(`\n=== ${dev.name} (${dev.width}x${dev.height}) ===`);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__nori, null, { timeout: 10000 });
  await sleep(1600); // 導入カメラが寄るのを待つ
  await shot(page, dev, '0-intro');

  // ---- 1. まぜる ----
  {
    let t = await target(page);
    for (let round = 0; round < 26; round++) {
      const s = await state(page);
      if (s.stage !== 'mix') break;
      t = await target(page);
      const pts = [];
      const R = Math.max(40, t.r * 0.85);
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2 + round;
        pts.push({ x: t.x + Math.cos(a) * R, y: t.y + Math.sin(a) * R * 0.5 });
      }
      await drag(page, pts, { steps: 2, pause: 0 });
    }
    note(`mix -> ${JSON.stringify(await state(page))}`);
    const audio = await page.evaluate(() => window.__nori.audio);
    note(`audio: ${audio}`);
    if (audio === 'none') throw new Error('タッチしても音が初期化されない');
    await shot(page, dev, '1-mix');
  }
  if (!await waitStage(page, 'pour', 6000)) throw new Error('まぜる工程が終わらない');
  await sleep(900);
  await shot(page, dev, '2-pour-start');

  // ---- 2. 流し込む ----
  {
    for (let round = 0; round < 24; round++) {
      const s = await state(page);
      if (s.stage !== 'pour') break;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = 0.12 + 0.76 * (i / 8);
        const v = round % 2 === 0 ? 0.28 + 0.5 * ((i % 3) / 2) : 0.72 - 0.45 * ((i % 3) / 2);
        pts.push(await frameAt(page, u, v));
      }
      await drag(page, pts, { steps: 4, pause: 40 });
    }
    note(`pour -> ${JSON.stringify(await state(page))}`);
    await shot(page, dev, '2-pour');
  }
  if (!await waitStage(page, 'spread', 6000)) throw new Error('流し込み工程が終わらない');
  await sleep(900);

  // ---- 3. ならす ----
  {
    for (let round = 0; round < 40; round++) {
      const s = await state(page);
      if (s.stage !== 'spread') break;
      const v = 0.1 + 0.8 * ((round * 0.31) % 1);
      const a = await frameAt(page, 0.06, v);
      const b = await frameAt(page, 0.94, v);
      const pts = round % 2 ? [a, b] : [b, a];
      await drag(page, [pts[0], pts[1]], { steps: 10, pause: 10 });
    }
    note(`spread -> ${JSON.stringify(await state(page))}`);
    await shot(page, dev, '3-spread');
  }
  if (!await waitStage(page, 'press', 6000)) throw new Error('ならし工程が終わらない');
  await sleep(900);

  // ---- 回転テスト（工程の途中で向きを変える） ----
  let rotated = null;
  {
    const before = await state(page);
    const w = dev.width, h = dev.height;
    await page.setViewportSize({ width: h, height: w });
    await sleep(700);
    const after = await state(page);
    rotated = { before, after };
    note(`rotate ${before.mode} -> ${after.mode} : evenness ${before.evenness}->${after.evenness}, wet ${before.wet}->${after.wet}, stage ${after.stage}`);
    await shot(page, dev, '4-rotated');
    await page.setViewportSize({ width: w, height: h });
    await sleep(700);
  }

  // ---- 4. 水を抜く ----
  {
    for (let round = 0; round < 40; round++) {
      const s = await state(page);
      if (s.stage !== 'press') break;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const u = 0.15 + 0.7 * (i / 5);
        const v = 0.15 + 0.7 * (((round + i) % 4) / 3);
        pts.push(await frameAt(page, u, v));
      }
      await drag(page, pts, { steps: 4, pause: 90 });
    }
    note(`press -> ${JSON.stringify(await state(page))}`);
    await shot(page, dev, '5-press');
  }
  if (!await waitStage(page, 'dry', 6000)) throw new Error('圧搾工程が終わらない');
  await sleep(900);

  // ---- 5. 乾かす ----
  {
    for (let round = 0; round < 30; round++) {
      const s = await state(page);
      if (s.stage !== 'dry') break;
      const t = await target(page);
      await page.mouse.move(t.x, t.y);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y + Math.min(160, dev.height * 0.2), { steps: 8 });
      await sleep(700);
      await page.mouse.up();
    }
    note(`dry -> ${JSON.stringify(await state(page))}`);
    await shot(page, dev, '6-dry');
  }
  if (!await waitStage(page, 'peel', 6000)) throw new Error('乾燥工程が終わらない');
  await sleep(1000);
  await shot(page, dev, '7-peel-before');

  // ---- 6. ぺりっと剥がす ----
  {
    let shotMid = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      if ((await state(page)).stage !== 'peel') break;
      const grab = await frameAt(page, 0.5, 0.97);
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      const steps = 24;
      const pull = Math.min(dev.height * 0.62, 460);
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const x = grab.x + Math.sin(k * 3) * dev.width * 0.05;
        const y = grab.y + k * pull;
        await page.mouse.move(x, y, { steps: 3 });
        await sleep(30);
        const s = await state(page);
        if (!shotMid && s.peel > 0.35) { shotMid = true; await shot(page, dev, '7-peel-mid'); }
        if (s.stage !== 'peel') break;
      }
      await page.mouse.up();
      await sleep(120);
    }
    note(`peel -> ${JSON.stringify(await state(page))}`);
    await shot(page, dev, '7-peel-end');
  }
  if (!await waitStage(page, 'reveal', 8000)) throw new Error('剥がし工程が終わらない');

  // ---- 7. リビール ----
  await sleep(2600);
  await shot(page, dev, '8-reveal-stack');
  await sleep(2400);
  await shot(page, dev, '8-reveal-onigiri');
  await page.waitForFunction(() => window.__nori.state.revealDone, null, { timeout: 12000 });
  await sleep(600);
  await shot(page, dev, '9-reveal-done');
  note(`reveal -> ${JSON.stringify(await state(page))}`);

  // ---- もう一回 ----
  {
    const b = await page.evaluate(() => {
      const g = window.__nori.game; const r = g.replayButton(); return { x: r.x, y: r.y };
    });
    await page.mouse.click(b.x, b.y);
    await sleep(700);
    const s = await state(page);
    note(`replay -> ${JSON.stringify(s)}`);
    if (s.stage !== 'mix') throw new Error('もう一回ボタンで最初に戻らない');
    if (s.made !== 1) throw new Error('作った枚数が保持されていない');
    await shot(page, dev, '10-replay');
  }

  await browser.close();
  if (errors.length) {
    console.error('\n!! ページエラー:');
    for (const e of errors) console.error('   ' + e);
    process.exitCode = 1;
  } else {
    console.log(`\n  OK: ${dev.name} 一周完了・エラーなし`);
  }
  return { dev: dev.name, log, rotated, errors };
}

run().catch((e) => { console.error('\n!! 失敗:', e.message); process.exit(1); });
