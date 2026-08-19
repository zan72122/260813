// Golden screenshot driver — walks the whole play loop via the deterministic
// test API (window.__whg) and captures the key beats at 4 device sizes.
// Usage: node tools/screenshots.mjs [--url http://localhost:5173] [--out tests/visual/golden] [--only iphone-portrait]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const URL = opt('url', 'http://localhost:5173/?fast=1');
const OUT = resolve(opt('out', 'tests/visual/golden'));
const ONLY = opt('only', null);

const DEVICES = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 }
];

// The beats of the loop → (label, how to get there from the previous beat).
const BEATS = [
  { name: '01-intro', run: async () => {} },
  {
    name: '02-first-drop',
    run: async (p) => {
      // intro → braid, cross once, then start watching the first drop mid-fall
      await p.evaluate(() => window.__whg.to('braid'));
      await p.evaluate(() => window.__whg.auto()); // cross
      await p.evaluate(() => window.__whg.snapCamera()); // settle on the closeup shot
      await p.evaluate(() => {
        void window.__whg.auto(); // drop — do not await; catch it mid-air
      });
      await p.waitForTimeout(1000);
    }
  },
  {
    name: '03-waterfalls',
    run: async (p) => {
      // Stay in the braid phase: all three falls down, camera on the braid shot.
      await p.evaluate(async () => {
        const w = window.__whg;
        while (w.getPhase() === 'braid' && w.getBraidStep() < 8) await w.auto();
      });
      await p.evaluate(() => window.__whg.snapCamera());
      await p.waitForTimeout(400);
    }
  },
  {
    name: '04-petals',
    run: async (p) => {
      await p.evaluate(() => window.__whg.to('petal'));
      await p.waitForTimeout(1200);
      await p.evaluate(() => window.__whg.snapCamera());
      await p.evaluate(async () => {
        await window.__whg.auto();
        await window.__whg.auto();
        await window.__whg.auto();
      });
      await p.waitForTimeout(1600);
    }
  },
  {
    name: '05-coil',
    run: async (p) => {
      // half-coil moment, camera already on the top view
      await p.waitForTimeout(1200);
      await p.evaluate(() => {
        const g = window.__whg.game;
        g.hair.coil = 0.5;
        g.hair.refreshTail();
      });
      await p.waitForTimeout(400);
    }
  },
  {
    name: '06-gem',
    run: async (p) => {
      await p.evaluate(() => window.__whg.to('gem'));
      await p.waitForTimeout(1500);
      await p.evaluate(() => window.__whg.snapCamera());
      await p.waitForTimeout(400);
    }
  },
  {
    name: '07-reveal',
    run: async (p) => {
      await p.evaluate(() => window.__whg.auto()); // place gem
      await p.evaluate(() => window.__whg.to('reveal'));
      await p.waitForTimeout(2500);
      await p.evaluate(() => window.__whg.snapCamera());
      await p.waitForTimeout(8000); // afterglow + replay fade-in
    }
  }
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.WHG_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--force-color-profile=srgb']
});

for (const device of DEVICES) {
  if (ONLY && device.name !== ONLY) continue;
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${device.name}] pageerror:`, e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__whg?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(900);

  for (const beat of BEATS) {
    await beat.run(page);
    await page.screenshot({ path: `${OUT}/${beat.name}--${device.name}.png` });
    console.log(`shot ${beat.name} @ ${device.name}`);
  }
  await ctx.close();
}
await browser.close();
console.log('done →', OUT);
