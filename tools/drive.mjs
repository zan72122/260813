// 手作業の代わりに実際に触ってみるための小さなドライバ。
//   node tools/drive.mjs [--landscape] [--out dir] [--url ...]
// 起動 → 長押し → 左右スワイプ → 虹が育つか を数値とスクリーンショットで確認する。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// グローバル導入の playwright でも動くようにする
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright'));
}
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const OUT = val('--out', '/tmp/claude-0/-home-user-260813/fc2cf620-1c37-5c41-be60-544ce3d96ec2/scratchpad/shots');
const BASE = val('--url', 'http://127.0.0.1:8123/index.html');
const landscape = has('--landscape');
const seed = val('--seed', '4242');
fs.mkdirSync(OUT, { recursive: true });

const viewport = landscape ? { width: 844, height: 390 } : { width: 390, height: 844 };
const tag = landscape ? 'land' : 'port';

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--disable-dev-shm-usage',
  ],
});
const ctx = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') errors.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const url = `${BASE}?debug=1&seed=${seed}&e2e=1`;
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
await page.waitForTimeout(1200);

const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
};
const stats = async () => page.evaluate(() => window.__game.stats());

const log = [];
const note = async (name) => {
  const s = await stats();
  log.push(`${tag}/${name}: stage=${s.stage} best=${s.bestStage} arcMax=${s.arcMax.toFixed(3)} cov=${s.coverage.toFixed(2)} band=${s.banded.toFixed(1)} p=${JSON.stringify(s.particles)} shot=${s.shot} fps=${s.fps.toFixed(1)} again=${s.againVisible}`);
  await shot(name);
};

await note('00-start');

const W = viewport.width, H = viewport.height;
const cy = H * 0.62;

// 1) 長押しだけ（まっすぐ噴く）
await page.mouse.move(W * 0.5, cy);
await page.mouse.down();
await page.waitForTimeout(700);
await note('01-hold-early');
await page.waitForTimeout(1600);
await note('02-hold');

// 2) 左右にゆっくりスワイプして弧を育てる
const sweep = async (from, to, steps, ms) => {
  for (let i = 0; i <= steps; i++) {
    const x = W * (from + (to - from) * (i / steps));
    await page.mouse.move(x, cy);
    await page.waitForTimeout(ms / steps);
  }
};
await sweep(0.5, 0.12, 22, 2400);
await note('03-sweep-left');
await sweep(0.12, 0.88, 34, 3600);
await note('04-sweep-right');
await sweep(0.88, 0.5, 20, 2200);
await sweep(0.5, 0.15, 20, 2200);
await sweep(0.15, 0.85, 26, 2800);
await sweep(0.85, 0.2, 24, 2600);
await sweep(0.2, 0.8, 24, 2600);
await note('05-grown');
await page.mouse.up();
await page.waitForTimeout(1800);
await note('06-after-release');

// 3) もういちど
const againVisible = (await stats()).againVisible;
if (againVisible) {
  await page.click('#again');
  await page.waitForTimeout(1400);
  await note('07-after-again');
}

await browser.close();

console.log(log.join('\n'));
if (errors.length) {
  console.log('\n--- console ---\n' + errors.slice(0, 40).join('\n'));
}
