// Debug probe: screenshot the intro with selected meshes hidden.
// Usage: node tools/probe.mjs <hideName1,hideName2|none> <outfile>
import { chromium } from 'playwright';

const hide = (process.argv[2] ?? 'none').split(',');
const out = process.argv[3] ?? 'probe.png';

const browser = await chromium.launch({
  executablePath: process.env.WHG_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:5173/?fast=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready);
await page.evaluate((names) => {
  const g = window.__whg.game;
  g.character.group.traverse((o) => {
    if (names.includes(o.name)) o.visible = false;
  });
  if (names.includes('trio')) g.hair.setTrioVisible(false);
}, hide);
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log('probe →', out, 'hidden:', hide.join(','));
