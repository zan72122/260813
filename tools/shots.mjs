// Play the game and screenshot each stage. Dev aid, not part of the suite.
//   node tools/shots.mjs [outDir] [portrait|landscape]
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || '/tmp/somen-shots';
const mode = process.argv[3] || 'portrait';
fs.mkdirSync(out, { recursive: true });

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const dev = mode === 'landscape' ? devices['iPad (gen 7) landscape'] : devices['iPhone 13'];
const ctx = await browser.newContext({ ...dev, browserName: undefined, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://127.0.0.1:4173/index.html');
await page.waitForFunction(() => window.__somen?.ready);
await page.evaluate(() => {
  window.__somen.setRenderScale(1);          // full-res captures
  window.__somen.speed(2);
  window.__somen.auto(true);
});

const shot = async (name) => {
  await page.screenshot({ path: path.join(out, `${mode}-${name}.png`) });
  console.log('shot', name);
};

const seen = new Set();
const t0 = Date.now();
let n = 0;
while (Date.now() - t0 < 90_000) {
  const s = await page.evaluate(() => ({
    stage: window.__somen.stage,
    done: window.__somen.done,
    rt: window.__somen.world.reveal.t,
  }));
  if (!seen.has(s.stage)) {
    seen.add(s.stage);
    await page.waitForTimeout(s.stage === 'reveal' ? 100 : 900);
    await shot(`${String(++n).padStart(2, '0')}-${s.stage}`);
  }
  if (s.stage === 'reveal') {
    // sample the reveal beats
    for (const [label, until] of [['b-pot', 2.6], ['c-boil', 3.4], ['d-steam', 4.5], ['e-bowl', 5.6], ['f-final', 7.4]]) {
      await page.waitForFunction((u) => window.__somen.world.reveal.t >= u, until, { timeout: 30_000 });
      await shot(`${String(++n).padStart(2, '0')}-reveal-${label}`);
    }
    break;
  }
  await page.waitForTimeout(120);
}
await browser.close();
console.log('done ->', out);
