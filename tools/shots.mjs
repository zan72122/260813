// Capture screenshots of key moments for visual inspection.
//   node tools/shots.mjs [outdir]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const out = process.argv[2] || 'shots';
const server = spawn('python3', ['-m', 'http.server', '8735', '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

async function shoot(page, name) {
  await page.waitForTimeout(350); // let a few frames render
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}

for (const [label, vp] of [['portrait', { width: 390, height: 780 }], ['landscape', { width: 844, height: 390 }]]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto('http://127.0.0.1:8735/index.html?e2e=1&seed=42&n=150');
  await page.waitForFunction(() => window.__game && window.__game.frames > 10);
  await shoot(page, `${label}-1-ready`);
  await page.evaluate(() => { window.__game.pressGo(); window.__game.stepSeconds(2.5); });
  await shoot(page, `${label}-2-release`);
  await page.evaluate(() => window.__game.stepSeconds(4));
  await shoot(page, `${label}-3-mixing`);
  await page.evaluate(() => window.__game.stepSeconds(6));
  await shoot(page, `${label}-4-lateflow`);
  await page.evaluate(() => window.__game.stepSeconds(80));
  await page.waitForTimeout(1200); // camera eases to edit angle
  await shoot(page, `${label}-5-edit`);
  await page.evaluate(() => {
    window.__game.setWidthAll(9.5);
    window.__game.reset();
  });
  await shoot(page, `${label}-6-widened`);
  await page.evaluate(() => { window.__game.pressGo(); window.__game.stepSeconds(6); });
  await shoot(page, `${label}-7-wide-mixing`);
  await page.close();
}

await browser.close();
server.kill();
