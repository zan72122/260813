// 実機に近い形での検証。ボタンと画面を「ほんとうにタップ」して、
// 4歳児がたどる道すじがそのまま成立するかを確かめる。
//   node tests/e2e/run.mjs
// 前提: http://127.0.0.1:4173 で index.html が配信されていること
//       （npm run serve、または本スクリプトが自分で立ち上げる）

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const FAST = process.env.E2E_FAST === '1';

const DEVICES = {
  'iPhone 14 (landscape)': { width: 844, height: 390, dpr: 3 },
  'iPhone 14 (portrait)': { width: 390, height: 844, dpr: 3 },
  'iPad (portrait)': { width: 820, height: 1180, dpr: 2 },
};

let passed = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name} ${extra}`); console.log(`  FAIL ${name} ${extra}`); }
}

async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/index.html`);
    if (r.ok) return null;
  } catch { /* 立ち上がっていない */ }
  const p = spawn('npx', ['--no-install', 'http-server', '.', '-p', '4173', '-c-1', '--silent'],
    { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { if ((await fetch(`${BASE}/index.html`)).ok) return p; } catch { /* まだ */ }
  }
  throw new Error('サーバーが立ち上がらない');
}

async function openPage(browser, dev) {
  const page = await browser.newPage({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__test, null, { timeout: 15000 });
  page.__errors = errors;
  return page;
}

// 画面上の座標をほんとうにタップする
async function tapGrid(page, gx, gy) {
  const pt = await page.evaluate(([x, y]) => window.__test.screenOf(x, y), [gx, gy]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(80);
  return pt;
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  console.log('\n▶ 1. さいしょの画面（かわいた街）');
  const page = await openPage(browser, DEVICES['iPhone 14 (landscape)']);
  check('JS エラーが出ない', page.__errors.length === 0, page.__errors[0] || '');
  check('canvas が画面いっぱい', await page.evaluate(() => {
    const c = document.getElementById('view');
    return c.width > 0 && Math.abs(c.getBoundingClientRect().width - window.innerWidth) < 2;
  }));
  check('街はかわいている', (await page.evaluate(() => window.__test.stats())).land < 0.01);
  check('文字は画面に出ていない', await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s/g, '');
    return t.length <= 2;   // 「1」「2」のふだだけ（結果画面が出るまでは 0）
  }));

  // ---------------------------------------------------------------
  console.log('\n▶ 2. PLAY をおすと、おなじ雨がふる（1回目）');
  await page.click('#btn-play', { force: true });
  check('あそんでいる状態になる', (await page.evaluate(() => window.__test.state())) === 'raining');
  await page.waitForTimeout(500);
  const early = await page.evaluate(() => window.__test.stats());
  check('雨がふりはじめている', early.tick > 10);

  await page.evaluate(() => window.__test.run(1400));
  const run1 = await page.evaluate(() => window.__test.stats());
  check('道に細い流れができ、水がひろばへ集まった', run1.plaza > 0.15, `plaza=${run1.plaza.toFixed(3)}`);
  check('水が地下入口へ入ってしまった', run1.under > 40, `under=${run1.under.toFixed(1)}`);
  check('結果くらべが出た', await page.evaluate(() => window.__test.resultVisible()));

  // ---------------------------------------------------------------
  console.log('\n▶ 3. とめて、詰まった排水口をタップしてそうじする');
  await page.click('#btn-again', { force: true });            // 結果をとじて、かわいた街へ
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__test.pause());
  const clog = await page.evaluate(() => window.__test.drain('plaza'));
  check('ひろばの排水口は葉っぱで詰まっている', clog.state === 'clogged' && clog.leaves > 0);
  check('どこをさわればいいか光っている', (await page.evaluate(() => window.__test.ui())).hintDrain === 'plaza');

  await tapGrid(page, clog.x + 0.5, clog.y + 0.5);
  const cleaned = await page.evaluate(() => window.__test.drain('plaza'));
  check('タップで葉っぱが取れて、穴があいた', cleaned.state === 'open' && cleaned.leaves === 0);
  await page.waitForTimeout(2200);
  check('地下のようすが出る（断面カット）', (await page.evaluate(() => window.__test.ui())).crossFade > 0.2);

  // ---------------------------------------------------------------
  console.log('\n▶ 4. RESET → おなじ雨をもういちど（2回目）');
  await page.click('#btn-reset');
  await page.waitForTimeout(300);
  const dry = await page.evaluate(() => window.__test.stats());
  check('街はまたかわいた', dry.land < 0.01 && dry.tick === 0);
  check('そうじした穴はあいたまま', dry.drains.find((d) => d.id === 'plaza').state === 'open');

  await page.click('#btn-play', { force: true });
  await page.evaluate(() => window.__test.run(1400));
  const run2 = await page.evaluate(() => window.__test.stats());
  check('おなじ雨なのに、地下へ入る水がぐんと減った',
    run2.under < run1.under * 0.3, `${run1.under.toFixed(1)} → ${run2.under.toFixed(1)}`);
  check('排水口がたくさん飲みこんだ', run2.drained > 60, `drained=${run2.drained.toFixed(1)}`);
  const maps = await page.evaluate(() => {
    // ふかく水びたしになった所（濃い青）を 2 まいで数える
    const deep = (id) => {
      const d = document.getElementById(id).getContext('2d').getImageData(0, 0, 240, 240).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 55 && d[i + 2] > 130) n++;
      return n;
    };
    return { before: deep('map-before'), after: deep('map-after') };
  });
  check('まえ / いま の 2 まいで、水びたしの所がはっきりちがう',
    maps.before > 400 && maps.after < maps.before * 0.4,
    `before=${maps.before} after=${maps.after}`);

  // ---------------------------------------------------------------
  console.log('\n▶ 5. 壁をドラッグして置くと、水が別の所へ行く');
  await page.click('#btn-again', { force: true });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__test.pause());
  // 排水口の介入はもどして、「壁だけ」で何が変わるかを見る
  await page.evaluate(() => window.__test.restoreCity());
  await page.click('#tool-wall');
  check('壁の道具がえらばれた', (await page.evaluate(() => window.__test.ui())).tool === 'wall');

  // ひろばの入口を横切るように、指で線をひく → その線にそって壁ができる
  const from = await page.evaluate(() => window.__test.screenOf(33, 51));
  const to = await page.evaluate(() => window.__test.screenOf(40, 51));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  check('ドラッグで壁が置けた', (await page.evaluate(() => window.__test.stats())).walls === 1);
  check('壁はなぞった線の向きにできる',
    await page.evaluate(() => window.__game.city.walls[0].horizontal === true));
  check('置いたら手の道具にもどる', (await page.evaluate(() => window.__test.ui())).tool === 'hand');

  await page.click('#btn-reset');
  await page.waitForTimeout(250);
  await page.click('#btn-play', { force: true });
  await page.evaluate(() => window.__test.run(1400));
  const run3 = await page.evaluate(() => window.__test.stats());
  check('壁が水をせき止めて、地下へ行く水が減った',
    run3.under < run1.under * 0.85, `${run1.under.toFixed(1)} → ${run3.under.toFixed(1)}`);
  check('せき止められた水は、べつの所を濡らした',
    run3.wet > run1.wet * 1.15, `${run1.wet} → ${run3.wet}`);

  // ---------------------------------------------------------------
  console.log('\n▶ 6. おなじ操作をすると、おなじ結果になる（実験としてなりたつ）');
  await page.click('#btn-again', { force: true });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__test.restoreCity());   // 1 回目とまったく同じ条件
  await page.click('#btn-play', { force: true });
  await page.evaluate(() => window.__test.run(1400));
  const repeat = await page.evaluate(() => window.__test.stats());
  check('同じ条件 → 同じ数字', Math.abs(repeat.under - run1.under) < 1e-6,
    `${run1.under} vs ${repeat.under}`);

  check('ここまで JS エラーなし', page.__errors.length === 0, page.__errors[0] || '');
  await page.close();

  // ---------------------------------------------------------------
  console.log('\n▶ 7. たてよこ両むき / iPad');
  for (const name of ['iPhone 14 (portrait)', 'iPad (portrait)']) {
    const p2 = await openPage(browser, DEVICES[name]);
    const cam = await p2.evaluate(() => window.__test.camera());
    const fits = await p2.evaluate(() => {
      // 模型の四すみが画面のなかに入っているか
      const pts = [[0, 0], [96, 0], [96, 96], [0, 96]].map(([x, y]) => window.__test.screenOf(x, y));
      const m = 4;
      return pts.every((q) => q.x > -m && q.x < window.innerWidth + m
                           && q.y > -m && q.y < window.innerHeight + m);
    });
    check(`${name}: 街ぜんたいが画面に入る`, fits);
    check(`${name}: ズームが正しく決まる`, cam.fit > 0 && cam.zoom > 0);

    // ボタンが指で押せる大きさ（44pt 以上）かつ画面の中
    const btns = await p2.evaluate(() => ['#btn-play', '#btn-reset', '#tool-wall', '#btn-sound']
      .map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { s, w: r.width, h: r.height, inside: r.left >= 0 && r.top >= 0
          && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 };
      }));
    check(`${name}: ボタンは 44pt 以上で画面内`,
      btns.every((b) => b.w >= 44 && b.h >= 44 && b.inside),
      JSON.stringify(btns.filter((b) => b.w < 44 || !b.inside)));

    // 実機と同じタッチ操作でも動くこと
    const pb = await p2.evaluate(() => {
      const r = document.querySelector('#btn-play').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await p2.touchscreen.tap(pb.x, pb.y);
    await p2.waitForTimeout(300);
    check(`${name}: 指タッチで雨がはじまる`, (await p2.evaluate(() => window.__test.state())) === 'raining');
    check(`${name}: JS エラーなし`, p2.__errors.length === 0, p2.__errors[0] || '');
    await p2.close();
  }

  // ---------------------------------------------------------------
  console.log('\n▶ 8. 動きのなめらかさ（雨がいちばん強いところ）');
  if (!FAST) {
    const p3 = await openPage(browser, DEVICES['iPhone 14 (landscape)']);
    await p3.click('#btn-play', { force: true });
    await p3.evaluate(() => window.__test.run(700));   // 大雨の状態にする
    await p3.waitForTimeout(300);
    const fps = await p3.evaluate(() => new Promise((res) => {
      const t = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        t.push(now - last); last = now;
        if (++n < 90) requestAnimationFrame(tick);
        else { t.sort((a, b) => a - b); res({ median: t[t.length >> 1], p90: t[(t.length * 0.9) | 0] }); }
      };
      requestAnimationFrame(tick);
    }));
    // ヘッドレス CPU 描画なので実機より遅い。ここでは「破綻していない」ことだけ見る。
    check('大雨でも 1 フレームが 60ms 未満（CPU 描画）', fps.p90 < 60,
      `median=${fps.median.toFixed(1)}ms p90=${fps.p90.toFixed(1)}ms`);
    console.log(`       （参考 median=${fps.median.toFixed(1)}ms / p90=${fps.p90.toFixed(1)}ms・SwiftShader 相当の CPU 描画）`);
    await p3.close();
  }

  await browser.close();
  if (server) server.kill();

  console.log(`\n===== ${passed} 件 OK / ${failures.length} 件 NG =====`);
  if (failures.length) {
    for (const f of failures) console.log('  ✗', f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
