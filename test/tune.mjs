// 点灯状態へ直接ジャンプしてルック確認（高速チューニング用）
// node test/tune.mjs [--shape=heart] [--stage=lit|dark|work|heat] [--landscape]
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SHAPE = args.shape || 'star';
const STAGE = args.stage || 'lit';
const LAND = !!args.landscape;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const vp = LAND ? { width: 844, height: 390 } : { width: 390, height: 844 };
const page = await browser.newPage({ viewport: vp });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__neon !== undefined);
await page.evaluate(async (cfg) => {
  const N = window.__neon;
  const { game, world, tube, rig, POSES } = N._refs;
  N.selectShape(cfg.shape); // awaitしない（カメラ演出はスキップ）
  await new Promise((r) => setTimeout(r, 300));
  document.getElementById('title').classList.add('hidden');
  if (cfg.stage === 'work') {
    game.state = 'HEAT';
    rig.trans = null; rig.poseFn = POSES.overview;
    return;
  }
  if (cfg.stage === 'heat') {
    game.state = 'HEAT'; game.heat = 0.7;
    rig.trans = null; rig.poseFn = POSES.heatClose;
    return;
  }
  game.t = 1; tube.setProgress(1); tube.finalize(); tube.showGuide(0);
  if (cfg.stage === 'dark') {
    game.state = 'WAIT_POWER';
    game.darkness = 1; world.setDarkness(1);
    rig.trans = null; rig.poseFn = POSES.completeView;
    document.getElementById('powerBtn').classList.remove('hidden');
  } else {
    game.state = 'ADMIRE';
    game.darkness = 1; world.setDarkness(1);
    game.neon = 1;
    rig.trans = null; rig.poseFn = POSES.admire;
  }
}, { shape: SHAPE, stage: STAGE });
await page.waitForTimeout(2500);
const lum = await page.evaluate(() => window.__neon.luma());
console.log(`stage=${STAGE} shape=${SHAPE} avg=${lum.avg.toFixed(1)} max=${lum.max}`);
const name = `tune-${STAGE}-${SHAPE}${LAND ? '-land' : ''}.png`;
await page.screenshot({ path: join(ROOT, 'shots', name) });
console.log('saved shots/' + name);
await browser.close(); server.close();
