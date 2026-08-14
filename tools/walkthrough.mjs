// 4歳児がたどる道すじを、そのまま画面で追って撮る。
//   node tools/walkthrough.mjs <outdir> [device]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const DEVICES = {
  'iphone-landscape': { width: 844, height: 390, dpr: 3 },
  'iphone-portrait': { width: 390, height: 844, dpr: 3 },
  'ipad-landscape': { width: 1180, height: 820, dpr: 2 },
};

const out = process.argv[2] || 'shots';
const dev = DEVICES[process.argv[3] || 'iphone-landscape'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: dev.width, height: dev.height },
  deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true,
});
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__test);

const shot = async (n) => { await page.waitForTimeout(220); await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const say = async (label) => console.log(' ', label,
  JSON.stringify({
    state: await page.evaluate(() => window.__test.state()),
    hint: await page.evaluate(() => window.__test.hintTarget()),
    見えている: await page.evaluate(() => window.__test.hintVisible()),
  }));

await page.waitForTimeout(700);
await say('さいしょ'); await shot('A-start');

await page.click('#btn-play', { force: true });
await page.evaluate(() => window.__test.run(520));
await page.waitForTimeout(700); await shot('B-rain');

await page.evaluate(() => window.__test.run(400));
await page.waitForTimeout(3400);
await say('自動でとまった'); await shot('C-autostop');

// みぞをほる
await page.evaluate(() => window.__test.setTool('dig'));
await page.evaluate(() => window.__test.digLine(44, 51, 16, 49));
await page.evaluate(() => window.__test.setTool('hand'));
await shot('D-dig');

await page.evaluate(() => window.__test.reset());
await page.waitForTimeout(400);
await page.click('#btn-play', { force: true });
await page.evaluate(() => window.__test.run(760));
await page.waitForTimeout(700); await shot('E-dig-flow');

await page.evaluate(() => window.__test.run(700));
await page.waitForTimeout(1300); await shot('F-result');

console.log('runs:', JSON.stringify(await page.evaluate(() => window.__test.runs())));
await browser.close();
