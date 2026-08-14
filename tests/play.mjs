// 一周プレイの自動確認（縦 / 横 両方）
// 使い方: NODE_PATH=/opt/node22/lib/node_modules node tests/play.mjs [portrait|landscape]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const MODE = process.argv[2] || 'portrait';
const OUT = process.env.SHOT_DIR || '/tmp/natto-shots';
mkdirSync(OUT, { recursive: true });

const SIZES = {
  portrait: { width: 390, height: 844 },   // iPhone 相当
  landscape: { width: 844, height: 390 },
  ipad: { width: 1024, height: 768 },
};

const problems = [];
const log = (...a) => console.log(...a);

function fail(msg) { problems.push(msg); console.error('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

const run = async () => {
  const size = SIZES[MODE];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const q = process.env.FAST === '0' ? 'seed=7' : 'fast=1&seed=7';
  await page.goto(`${BASE}/index.html?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__natto, null, { timeout: 10000 });

  const state = () => page.evaluate(() => window.__natto.state());
  const advance = (s) => page.evaluate((v) => window.__natto.advance(v), s);
  const settle = async () => { await page.evaluate(() => window.__natto.settle()); await page.waitForTimeout(80); };
  const shot = (name) => page.screenshot({ path: `${OUT}/${MODE}-${name}.png` });
  const tap = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(40); };
  const W = size.width, H = size.height;

  const waitScene = async (name, budget = 12) => {
    for (let i = 0; i < budget * 10; i++) {
      const s = await state();
      if (s.scene === name && !s.transitioning) return s;
      await advance(0.1);
      await page.waitForTimeout(16);
    }
    fail(`シーン ${name} に到達しない（現在: ${(await state()).scene}）`);
    return await state();
  };

  log(`\n=== ${MODE} (${W}x${H}) ===`);

  /* --- タイトル --- */
  let s = await state();
  if (s.scene !== 'title') fail('タイトルで始まらない');
  else ok('タイトル表示');
  await shot('0-title');
  await tap(W / 2, H * 0.78);
  await settle();

  /* --- 1 水にひたす --- */
  s = await waitScene('soak');
  await shot('1-soak-before');
  await tap(W / 2, H * (MODE === 'portrait' ? 0.18 : 0.24));
  let maxFill = 0;
  for (let i = 0; i < 20; i++) {
    await advance(0.2);
    const st = await state();
    if (st.scene !== 'soak') break;
    maxFill = Math.max(maxFill, st.fill ?? 0);
    if (maxFill >= 0.999) { await shot('1-soak-after'); break; }
  }
  if (!(maxFill >= 0.99)) fail(`水がたまらない fill=${maxFill}`); else ok('豆がふくらむ');
  await advance(2);
  await settle();

  /* --- 2 むす --- */
  s = await waitScene('steam');
  await tap(W / 2, H * 0.5);      // 豆が落ちている最中のタップも効くこと
  await advance(1.6);
  s = await state();
  if (s.phase !== 'steam') fail(`蒸しが始まらない phase=${s.phase}`); else ok('もくもく開始');
  await shot('2-steam');
  let maxGauge = 0;
  for (let i = 0; i < 40; i++) {
    await advance(0.25);
    const st = await state();
    if (st.scene !== 'steam') break;
    maxGauge = Math.max(maxGauge, st.gauge ?? 0);
    if (maxGauge >= 0.999) break;
  }
  if (!(maxGauge >= 0.99)) fail(`蒸気ゲージが満ちない gauge=${maxGauge}`); else ok('蒸し上がり');
  await advance(2);
  await settle();

  /* --- 3 しゅっ --- */
  s = await waitScene('spray');
  for (let i = 0; i < 3; i++) { await tap(W * 0.5, H * 0.5); await advance(0.5); }
  s = await state();
  if (!(s.sprays >= 3)) fail(`スプレー回数が足りない sprays=${s.sprays}`); else ok('しゅっ x3');
  await shot('3-spray');
  await advance(2);
  await settle();

  /* --- 4 パック詰め --- */
  s = await waitScene('pack');
  let maxPlaced = 0;
  for (let i = 0; i < 4; i++) {
    await tap(W * 0.5, H * 0.5);
    for (let k = 0; k < 8; k++) {
      await advance(0.15);
      const st = await state();
      if (st.scene !== 'pack') break;
      maxPlaced = Math.max(maxPlaced, st.placed ?? 0);
    }
    if (i === 1) await shot('4-pack');
    if ((await state()).scene !== 'pack') break;
  }
  if (!(maxPlaced >= 12)) fail(`豆がパックに整列しない placed=${maxPlaced}`);
  else ok(`豆が整列 (${maxPlaced} 粒)`);
  await advance(2);
  await settle();

  /* --- 5 発酵室 --- */
  s = await waitScene('ferment');
  await advance(1.4);          // パックが入る
  const dial = await page.evaluate(() => {
    const d = window.__natto.game.scene.dial;
    return { x: d.x, y: d.y, r: d.r };
  });
  await shot('5-ferment-before');
  // ぐるぐる回す
  await page.mouse.move(dial.x + dial.r * 0.7, dial.y);
  await page.mouse.down();
  for (let turn = 0; turn < 6; turn++) {
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      await page.mouse.move(dial.x + Math.cos(a) * dial.r * 0.7, dial.y + Math.sin(a) * dial.r * 0.7);
    }
    const st = await state();
    if (st.prog >= 1) break;
  }
  await page.mouse.up();
  s = await state();
  if (!(s.prog >= 0.99)) fail(`発酵が進まない prog=${s.prog?.toFixed(2)}`); else ok('ぐるぐるで時間が進む');
  await shot('5-ferment-after');
  await advance(2.5);
  await settle();

  /* --- 6 開ける → 混ぜる → びよーん --- */
  s = await waitScene('finale');
  await shot('6-lid');
  let pk = await page.evaluate(() => window.__natto.packScreen());
  // ふたを上へドラッグ
  await page.mouse.move(pk.x, pk.y - pk.h * 0.3);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(pk.x, pk.y - pk.h * 0.3 - i * (H * 0.02));
  await page.mouse.up();
  await advance(1.2);
  s = await state();
  if (s.phase !== 'mix') fail(`ふたが開かない phase=${s.phase} open=${s.openAmt}`); else ok('パックが開く');
  await shot('6-opened');

  pk = await page.evaluate(() => window.__natto.packScreen());   // 接写に寄った後の位置
  await page.evaluate(() => window.__natto.resetPerf());
  // ぐるぐる混ぜる
  await page.mouse.move(pk.x + pk.w * 0.2, pk.y);
  await page.mouse.down();
  let mid = null;
  for (let turn = 0; turn < 10; turn++) {
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      await page.mouse.move(pk.x + Math.cos(a) * pk.w * 0.2, pk.y + Math.sin(a) * pk.h * 0.16);
    }
    const st = await state();
    if (turn === 2) mid = st;
    if (st.sticky >= 1) break;
  }
  s = await state();
  if (!(s.sticky > 0.8)) fail(`混ぜても粘りが増えない sticky=${s.sticky?.toFixed(2)}`);
  else ok(`混ぜるほど粘る sticky=${s.sticky.toFixed(2)}`);
  if (mid && !(s.threads > mid.threads)) fail(`糸が増えない ${mid.threads} → ${s.threads}`);
  else ok(`混ぜるほど糸が増える ${mid?.threads} → ${s.threads} 本`);
  await shot('7-mixed');

  // そのまま持ち上げる（カメラは切らない）
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(pk.x, Math.max(6, pk.y - i * (H * 0.028)));
  }
  await advance(0.4);
  s = await state();
  await shot('8-biyoon');
  if (!(s.lift > 0.5)) fail(`持ち上がらない lift=${s.lift?.toFixed(2)}`); else ok(`びよーん lift=${s.lift.toFixed(2)}`);
  if (!(s.wowCount > 0)) fail('「あっ！」の瞬間が出ない'); else ok('あっ！ 発火');
  if (!(s.threads >= 5)) fail(`持ち上げ時に糸が少なすぎる threads=${s.threads}`); else ok(`糸 ${s.threads} 本`);
  await page.mouse.up();
  await advance(1.2);
  s = await state();
  if (!s.showNext) fail('次へ進むボタンが出ない'); else ok('ごはんボタン出現');

  const nb = await page.evaluate(() => {
    const b = window.__natto.game.scene.nextBtn;
    return b ? { x: b.x, y: b.y } : null;
  });
  if (!nb) fail('nextBtn が未生成');
  else { await tap(nb.x, nb.y); await settle(); }

  /* --- 7 完成 --- */
  s = await waitScene('reveal');
  await shot('9-reveal-0');
  await tap(W * 0.5, H * 0.5); await advance(1.2);
  await tap(W * 0.5, H * 0.5); await advance(1.2);
  await tap(W * 0.5, H * 0.5); await advance(2.0);
  s = await state();
  if (s.phase !== 'done') fail(`完成しない phase=${s.phase}`); else ok('納豆ごはん完成');
  await shot('9-reveal-done');

  /* --- 画面回転 --- */
  await page.setViewportSize(MODE === 'portrait' ? SIZES.landscape : SIZES.portrait);
  await page.waitForTimeout(300);
  await advance(0.3);
  s = await state();
  if (s.scene !== 'reveal') fail('回転でシーンが壊れる');
  else ok(`回転しても継続 (${s.w}x${s.h})`);
  await shot('10-rotated');

  /* --- 因果の検証：混ぜが足りないと、糸は伸びきらずに切れる --- */
  await page.setViewportSize(size);
  await page.waitForTimeout(250);          // 回転の反映を待ってから座標を取る
  await page.evaluate(() => window.__natto.goto('finale'));
  await advance(0.3);
  let p2 = await page.evaluate(() => window.__natto.packScreen());
  await page.mouse.move(p2.x, p2.y - p2.h * 0.3);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(p2.x, p2.y - p2.h * 0.3 - i * (H * 0.02));
  await page.mouse.up();
  await advance(1.2);
  if ((await state()).phase !== 'mix') fail('検証用のパックが開かない');
  p2 = await page.evaluate(() => window.__natto.packScreen());
  await page.mouse.move(p2.x + p2.w * 0.2, p2.y);
  await page.mouse.down();
  for (let turn = 0; turn < 2; turn++) {          // ちょっとだけ混ぜる
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      await page.mouse.move(p2.x + Math.cos(a) * p2.w * 0.2, p2.y + Math.sin(a) * p2.h * 0.16);
    }
  }
  const little = await state();
  for (let i = 1; i <= 24; i++) await page.mouse.move(p2.x, Math.max(6, p2.y - i * (H * 0.028)));
  await advance(0.5);
  const weak = await state();
  await page.mouse.up();
  await shot('11-undermixed');
  if (!(little.sticky < 0.6)) fail(`前提が崩れている（少ししか混ぜていないのに sticky=${little.sticky}）`);
  else if (weak.wowCount > 0) fail(`混ぜ足りないのに「あっ！」が出る sticky=${little.sticky.toFixed(2)}`);
  else ok(`混ぜ足りないと糸は伸びきらない (sticky=${little.sticky.toFixed(2)} → 糸 ${weak.threads} 本)`);
  await advance(1);

  /* --- 全シーン × 向き の総当たり（回転で落ちないこと） --- */
  const scenes = ['title', 'soak', 'steam', 'spray', 'pack', 'ferment', 'finale', 'reveal'];
  for (const name of scenes) {
    for (const v of [SIZES.portrait, SIZES.landscape]) {
      await page.setViewportSize(v);
      await page.evaluate((n) => window.__natto.goto(n), name);
      await advance(1.2);
      await tap(v.width * 0.5, v.height * 0.5);
      await advance(0.6);
    }
  }
  ok('全シーンを縦横で描画（回転含む）');
  await page.setViewportSize(size);

  const perf = await page.evaluate(() => window.__natto.perf());
  log(`  · 描画コスト（参考／ソフトウェア描画）: ${perf.avgMs.toFixed(2)}ms/frame, ${perf.frames} frames`);

  if (errors.length) {
    for (const e of errors) fail('JS エラー: ' + e);
  } else ok('JS エラーなし');

  await browser.close();
};

run().then(() => {
  if (problems.length) {
    console.error(`\n${MODE}: ${problems.length} 件の問題`);
    process.exit(1);
  }
  console.log(`\n${MODE}: すべて OK`);
}).catch((e) => { console.error(e); process.exit(1); });
