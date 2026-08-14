// Frame-time budget check.
//
//   node tools/perf.mjs [outJson]
//
// The oldest target device (iPhone SE2 / iPad 6th gen) is roughly 4-6x slower
// than this runner, so every profile is measured again with the CPU throttled
// to stand in for it. Absolute numbers here are NOT device fps — this runner
// rasterises in software — but they are a fair *relative* budget: a change
// that raises these numbers will raise them on a phone too.

import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const outFile = process.argv[2];
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// The heaviest scenes, by stage index.
const SCENES = [
  { name: 'gather', idx: 0 },
  { name: 'stretch2', idx: 3 },
  { name: 'align', idx: 4 },
  { name: 'dry', idx: 5 },
  { name: 'bundle', idx: 7 },
  { name: 'reveal', idx: 8 },
];

const PROFILES = [
  { name: 'iphone', dev: devices['iPhone 13'], throttle: 1, frames: 70 },
  { name: 'iphone-slow', dev: devices['iPhone 13'], throttle: 5, frames: 26 },
  { name: 'ipad', dev: devices['iPad (gen 7) landscape'], throttle: 1, frames: 45 },
];

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const report = {};
for (const prof of PROFILES) {
  const ctx = await browser.newContext({ ...prof.dev, browserName: undefined, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('http://127.0.0.1:4173/index.html');
  await page.waitForFunction(() => window.__somen?.ready);
  // Pin the resolution so adaptive scaling cannot flatter the numbers.
  await page.evaluate(() => window.__somen.setRenderScale(1));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });

  report[prof.name] = {};
  for (const scene of SCENES) {
    await page.evaluate((i) => window.__somen.jump(i), scene.idx);
    await page.waitForTimeout(1100);           // let the camera and fades settle
    await page.evaluate(() => window.__somen.setRenderScale(1));
    const r = await page.evaluate((frames) => new Promise((res) => {
      const ts = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        if (n > 5) ts.push(now - last);        // discard warm-up frames
        last = now;
        if (++n < frames) requestAnimationFrame(tick);
        else {
          ts.sort((a, b) => a - b);
          res({
            median: +ts[Math.floor(ts.length / 2)].toFixed(1),
            p95: +ts[Math.floor(ts.length * 0.95)].toFixed(1),
          });
        }
      };
      requestAnimationFrame(tick);
    }), prof.frames);
    report[prof.name][scene.name] = r;
  }
  await ctx.close();
}
await browser.close();

const rows = [];
const scenes = SCENES.map((s) => s.name);
rows.push(['profile', ...scenes].join('\t'));
for (const p of Object.keys(report)) {
  rows.push([p, ...scenes.map((s) => `${report[p][s].median}/${report[p][s].p95}`)].join('\t'));
}
console.log('median/p95 ms per frame\n');
console.log(rows.join('\n'));

if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log('\nwrote', outFile);
}
