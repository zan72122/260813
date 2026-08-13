// 仕様どおりに動いているかを実際に触って確かめる煙テスト。
//   node tools/check.mjs
// 失敗したら非ゼロ終了する。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright'));
}

const BASE = process.env.GAME_URL || 'http://127.0.0.1:8123/index.html';
const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});

async function session(viewport, label, body) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?seed=99&e2e=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await body(page, label);
  check(`${label}: コンソールエラーが出ない`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

const stats = (page) => page.evaluate(() => window.__game.stats());

async function hold(page, xFrac, viewport, ms) {
  await page.mouse.move(viewport.width * xFrac, viewport.height * 0.62);
  await page.mouse.down();
  await page.waitForTimeout(ms);
}
async function sweepTo(page, from, to, viewport, steps, ms) {
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(viewport.width * (from + (to - from) * (i / steps)), viewport.height * 0.62);
    await page.waitForTimeout(ms / steps);
  }
}

async function fullPlay(page, label, viewport) {
  const s0 = await stats(page);
  check(`${label}: はじめは虹がどこにも無い`, s0.arcMax === 0 && s0.coverage === 0, `arcMax=${s0.arcMax}`);
  check(`${label}: はじめは霧も無い`, s0.particles.near === 0);
  check(`${label}: はじめは引きの構図`, s0.shot === 'wide', s0.shot);

  // 短いタップ = 少しだけ霧
  await page.mouse.move(viewport.width * 0.5, viewport.height * 0.62);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(220);
  const sTap = await stats(page);
  check(`${label}: 短いタップで少量の霧が出る`, sTap.particles.near > 3, `near=${sTap.particles.near}`);
  await page.waitForTimeout(2600);

  // 長押し = 噴霧
  await hold(page, 0.5, viewport, 700);
  const sEarly = await stats(page);
  check(`${label}: 長押しで霧がしっかり出る`, sEarly.particles.near > 20, `near=${sEarly.particles.near}`);
  check(`${label}: 噴きはじめはまだ色が出ない`, sEarly.arcMax < 0.2, `arcMax=${sEarly.arcMax.toFixed(3)}`);

  await page.waitForTimeout(1800);
  const sFaint = await stats(page);
  check(`${label}: 霧の中に淡い虹が生まれる`, sFaint.arcMax > 0.2, `arcMax=${sFaint.arcMax.toFixed(3)}`);
  check(`${label}: 噴霧中は寄りの構図になる`, sFaint.shot === 'spray', sFaint.shot);

  // 左右にふって弧を育てる
  const before = sFaint.coverage;
  await sweepTo(page, 0.5, 0.1, viewport, 20, 2200);
  await sweepTo(page, 0.1, 0.9, viewport, 32, 3400);
  await sweepTo(page, 0.9, 0.15, viewport, 28, 3000);
  await sweepTo(page, 0.15, 0.85, viewport, 28, 3000);
  const sGrown = await stats(page);
  check(`${label}: 左右にふると虹が横に育つ`, sGrown.coverage > before + 0.3,
    `${before.toFixed(2)} → ${sGrown.coverage.toFixed(2)}`);
  check(`${label}: 画面を大きく横切る虹になる`, sGrown.coverage > 0.75, `cov=${sGrown.coverage.toFixed(2)}`);
  check(`${label}: 巨大な虹まで到達する`, sGrown.bestStage === 4, `stage=${sGrown.bestStage}`);
  check(`${label}: 完成したら引きの構図に戻る`, sGrown.shot === 'reveal', sGrown.shot);
  check(`${label}: 虹は画面の大部分に届く大きさ`, sGrown.radius > Math.min(viewport.width, viewport.height) * 0.6,
    `r=${sGrown.radius.toFixed(0)} / min=${Math.min(viewport.width, viewport.height)}`);

  await page.mouse.up();
  await page.waitForTimeout(1500);
  const sAfter = await stats(page);
  check(`${label}: 指をはなしても虹は残る`, sAfter.arcMax > 0.5, `arcMax=${sAfter.arcMax.toFixed(2)}`);
  check(`${label}: 「もういちど」が出る`, sAfter.againVisible);

  // ワンタップでやりなおし
  const seedBefore = sAfter.seed;
  await page.click('#again');
  await page.waitForTimeout(1600);
  const sReset = await stats(page);
  check(`${label}: ワンタップで霧から作りなおせる`, sReset.arcMax === 0 && sReset.particles.near === 0,
    `arcMax=${sReset.arcMax}`);
  check(`${label}: やりなおすと庭も虹も変わる`, sReset.seed !== seedBefore, `${seedBefore} → ${sReset.seed}`);
  check(`${label}: やりなおすと引きの構図に戻る`, sReset.shot === 'wide', sReset.shot);
}

const PORT = { width: 390, height: 844 };
const LAND = { width: 844, height: 390 };

await session(PORT, '縦画面', (page, label) => fullPlay(page, label, PORT));
await session(LAND, '横画面', (page, label) => fullPlay(page, label, LAND));

// 途中で画面を回しても壊れないこと
await session(PORT, '回転', async (page, label) => {
  await hold(page, 0.5, PORT, 1400);
  await sweepTo(page, 0.5, 0.25, PORT, 12, 1400);
  const beforeArc = (await stats(page)).arcMax;
  await page.mouse.up();
  await page.setViewportSize(LAND);
  await page.waitForTimeout(900);
  const s = await stats(page);
  check(`${label}: 回しても画面サイズが追従する`, s.cssW === LAND.width && s.cssH === LAND.height,
    `${s.cssW}x${s.cssH}`);
  check(`${label}: 回しても作った虹が消えない`, s.arcMax > beforeArc * 0.5,
    `${beforeArc.toFixed(2)} → ${s.arcMax.toFixed(2)}`);
  check(`${label}: 回しても弧が画面いっぱいに保たれる`,
    s.radius > Math.min(LAND.width, LAND.height) * 0.6, `r=${s.radius.toFixed(0)}`);
  await hold(page, 0.4, LAND, 1200);
  await page.mouse.up();
  const s2 = await stats(page);
  check(`${label}: 回したあとも噴霧できる`, s2.particles.near > 20, `near=${s2.particles.near}`);
});

await browser.close();

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
