// 自動試遊: タイトル→形選択→加熱→曲げ→完成→暗転→点灯→鑑賞 を実際に操作して検証。
// 使い方: node test/playtest.mjs [--shape=star] [--landscape] [--outdir=shots]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SHAPE = args.shape || 'star';
const LANDSCAPE = !!args.landscape;
const OUT = args.outdir || 'shots';
mkdirSync(join(ROOT, OUT), { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('nf');
  }
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: [
    '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--disable-dev-shm-usage',
  ],
});
const vp = LANDSCAPE ? { width: 844, height: 390 } : { width: 390, height: 844 };
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const tag = LANDSCAPE ? 'land' : 'port';
const shot = (name) => page.screenshot({ path: join(ROOT, OUT, `${tag}-${name}.png`) });
const state = () => page.evaluate(() => window.__neon?.state);
const waitState = async (s, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const cur = await state();
    if (Array.isArray(s) ? s.includes(cur) : cur === s) return cur;
    await page.waitForTimeout(120);
  }
  throw new Error(`timeout waiting for state ${s}, now=${await state()}`);
};

// キャンバスが真っ黒でないか（WebGL描画確認）
async function assertRendered(label) {
  const lum = await page.evaluate(() => window.__neon.luma());
  console.log(`  [render:${label}] avg=${lum.avg.toFixed(1)} max=${lum.max}`);
  if (lum.max < 10) throw new Error(`canvas appears blank at ${label}`);
  return lum;
}

console.log(`== playtest shape=${SHAPE} ${tag} on :${PORT} ==`);
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.__neon !== undefined, { timeout: 15000 });
await page.evaluate(() => { window.__neonTimeScale = 2.5; });
await page.waitForTimeout(1800);
await assertRendered('title');
await shot('1-title');

// 形を選ぶ
await page.locator(`.shapeBtn[data-shape="${SHAPE}"]`).tap();
await waitState('HEAT', 60000);
await page.waitForTimeout(1900); // カメラ接写の到着待ち
await shot('2-heat-arrive');

// 長押しで加熱（HEAT/SOFTENを抜けるまで押し続ける）
async function heatUntilSoft() {
  const cx = vp.width / 2, cy = vp.height / 2;
  await page.touchscreen.tap; // noop reference
  await page.evaluate(() => {}); // flush
  // pointerdownを維持するために mouse を使用（pointer events互換）
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  try {
    await waitState(['SOFTEN', 'BEND'], 30000);
  } finally {
    await page.mouse.up();
  }
  await waitState('BEND', 30000);
}
await heatUntilSoft();
await shot('3-heated');

// ガイドに沿ってドラッグで曲げる（画面座標はdebug APIから取得）
async function bendSome(maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    const st = await state();
    if (st === 'FINALIZE' || st === 'WAIT_DARK' || st === 'DARKEN') return true;
    if (st === 'REHEAT') { await heatUntilSoft(); continue; }
    if (st !== 'BEND') { await page.waitForTimeout(150); continue; }
    const t = await page.evaluate(() => window.__neon.t);
    const pts = await page.evaluate((tt) => {
      const out = [];
      for (let k = 0; k <= 6; k++) {
        out.push(window.__neon.guideScreen(Math.min(tt + 0.004 + k * 0.012, 1)));
      }
      return out;
    }, t);
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts) {
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
  }
  return false;
}
const bent = await bendSome();
if (!bent) throw new Error(`bend did not complete, t=${await page.evaluate(() => window.__neon.t)}`);
console.log('  bend complete, t=', await page.evaluate(() => window.__neon.t));
await waitState('WAIT_DARK', 60000);
await page.waitForTimeout(800);
await shot('4-complete');

// 暗転（長押しボタン）
const dark = page.locator('#darkBtn');
await dark.dispatchEvent('pointerdown', { pointerId: 9 });
await page.waitForTimeout(1400);
await dark.dispatchEvent('pointerup', { pointerId: 9 });
await waitState('WAIT_POWER', 60000);
await page.waitForTimeout(600);
await shot('5-dark');
await assertRendered('dark');

// 通電（長押し）→ 点灯
const power = page.locator('#powerBtn');
await power.dispatchEvent('pointerdown', { pointerId: 9 });
await page.waitForTimeout(1600);
await power.dispatchEvent('pointerup', { pointerId: 9 });
await waitState('ADMIRE', 60000);
await page.waitForTimeout(500);
await shot('6-ignite');
await page.waitForTimeout(2500);
await shot('7-admire');
const lit = await assertRendered('admire');

// もう一回ボタン → タイトルへ（ギャラリー確認）
await page.waitForFunction(() => !document.getElementById('againBtn').classList.contains('hidden'), { timeout: 10000 });
await page.locator('#againBtn').tap();
await waitState('TITLE', 60000);
await page.waitForTimeout(2200);
await shot('8-back-title');

const finalErrors = errors.filter((e) => !/favicon/i.test(e));
console.log(`states OK, neon=${await page.evaluate(() => window.__neon.neon)}`);
if (finalErrors.length) {
  console.log('CONSOLE ERRORS:');
  finalErrors.forEach((e) => console.log('  ', e));
  process.exitCode = 1;
} else {
  console.log('no console errors ✔');
}
await browser.close();
server.close();
