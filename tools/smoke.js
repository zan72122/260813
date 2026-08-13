// Chromium smoke test: boot the pool, drive the whole interaction chain from
// the spec, and assert the light net actually reacts. Screenshots land in
// tools/out/ so a human can eyeball composition. (Colour, smoothness and FPS
// are NOT judged here — this runs on SwiftShader.)
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = new URL('./out/', import.meta.url).pathname;

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
];

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844, dpr: 3 },
  { name: 'iphone-landscape', width: 844, height: 390, dpr: 3 },
  { name: 'ipad-portrait', width: 820, height: 1180, dpr: 2 },
];

function launchOpts() {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  return {
    executablePath: exe,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-lcd-text',
      '--no-sandbox',
    ],
  };
}

/** Mean luminance of the floor region, as a proxy for "the light net moved". */
async function sampleStats(page) {
  return page.evaluate(() => {
    const lab = window.__lab;
    const d = lab.caustics.probeData;
    let sum = 0, peak = 0, sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i]; sq += d[i] * d[i];
      if (d[i] > peak) peak = d[i];
    }
    const n = d.length / 4;
    const mean = sum / n;
    return {
      mean, peak,
      variance: sq / n - mean * mean,
      fps: lab.stats.fps,
      quality: lab.stats.quality,
      opened: lab.stats.opened,
      finales: lab.stats.finales,
      frames: lab.stats.frames,
    };
  });
}

const wait = (page, ms) => page.evaluate((m) => new Promise((r) => setTimeout(r, m)), ms);

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch(launchOpts());
  const failures = [];
  const log = [];
  const note = (s) => { log.push(s); console.log(s); };

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(`${BASE}/?seed=4242`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && window.__lab.stats.frames > 5, null, { timeout: 30000 })
      .catch(async () => {
        const err = await page.evaluate(() => window.__labError || 'no __lab');
        throw new Error(`[${vp.name}] boot failed: ${err}`);
      });

    // 1. quiet water
    await wait(page, 900);
    const quiet = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-1-quiet.png` });

    // 2-4. one tap -> a circular ring of light. Measured locally: a single
    // ring is a small feature next to the whole resting net, so a global peak
    // would not move even though the floor visibly changes where it was tapped.
    const cx = vp.width / 2, cy = vp.height * 0.55;
    const spot = await page.evaluate(([x, y]) => {
      const lab = window.__lab;
      const pk = lab._pick(x, y);
      const cp = lab.caustics.cPool;
      return {
        cu: ((pk.u - 0.5) * lab.pool[0]) / cp[0] + 0.5,
        cv: ((pk.v - 0.5) * lab.pool[1]) / cp[1] + 0.5,
      };
    }, [cx, cy]);
    // Peak light concentration in a small neighbourhood of the tap, sampled
    // across a window of frames — the ring takes a moment to form and travel.
    const localPeak = (frames) => page.evaluate(async ([s, n]) => {
      const lab = window.__lab;
      let m = 0;
      for (let f = 0; f < n; f++) {
        await new Promise((r) => requestAnimationFrame(r));
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            m = Math.max(m, lab.caustics.sampleProbe(s.cu + dx * 0.022, s.cv + dy * 0.022));
          }
        }
      }
      return m;
    }, [spot, frames]);
    const localBefore = await localPeak(28);
    await page.touchscreen.tap(cx, cy);
    const localAfter = await localPeak(28);
    const tapped = await sampleStats(page);
    tapped.touched = await page.evaluate(() => window.__lab.input.hasTouched);
    await page.screenshot({ path: `${OUT}${vp.name}-2-tap.png` });

    // 5-6. two places at once -> interference
    await page.evaluate(() => { window.__lab.poke(0.33, 0.42); window.__lab.poke(0.68, 0.6); });
    await wait(page, 380);
    const two = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-3-two.png` });

    // 7-9. finger draws a circle -> vortex. Peak-over-frames, because the
    // pattern peaks while the finger is moving, not at an arbitrary sample.
    const swirlPeak = await page.evaluate(async () => {
      const lab = window.__lab;
      const spread = () => {
        const d = lab.caustics.probeData;
        let sum = 0, sq = 0;
        for (let i = 0; i < d.length; i += 4) { sum += d[i]; sq += d[i] * d[i]; }
        const n = d.length / 4, mean = sum / n;
        return sq / n - mean * mean;
      };
      let m = 0;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 4;
        const r = 0.17;
        lab.stroke(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r,
          0.5 + Math.cos(a + 0.1) * r, 0.5 + Math.sin(a + 0.1) * r, 1, 1.3);
        await new Promise((res) => requestAnimationFrame(res));
        m = Math.max(m, spread());
      }
      for (let i = 0; i < 20; i++) {
        await new Promise((res) => requestAnimationFrame(res));
        m = Math.max(m, spread());
      }
      return m;
    });
    const swirl = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-4-swirl.png` });

    // rough play: mash it and make sure nothing blows up
    await page.evaluate(async () => {
      const lab = window.__lab;
      for (let i = 0; i < 90; i++) {
        lab.poke(Math.random(), Math.random(), 0.5, 0.05 + Math.random() * 0.05);
        if (i % 3 === 0) await new Promise((r) => setTimeout(r, 16));
      }
    });
    await wait(page, 500);
    const rough = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-5-rough.png` });

    // 10-12. let go -> settle -> the big flower of light
    await page.evaluate(() => {
      const lab = window.__lab;
      lab.sinceFinale = 99;
      lab.sinceRelease = 99;
      lab.input.activityLevel = 0;
      lab.releaseAt = { u: 0.5, v: 0.5 };
    });
    await wait(page, 2600);
    const finale = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-6-finale.png` });

    await wait(page, 2600);
    const after = await sampleStats(page);
    await page.screenshot({ path: `${OUT}${vp.name}-7-calm.png` });

    note(`[${vp.name}] quiet=${quiet.mean.toFixed(1)}/${quiet.peak} tap=${tapped.mean.toFixed(1)}/${tapped.peak} ` +
      `local ${localBefore.toFixed(2)}->${localAfter.toFixed(2)} ` +
      `two=${two.mean.toFixed(1)} swirlVar ${quiet.variance.toFixed(0)}->${swirlPeak.toFixed(0)} rough=${rough.mean.toFixed(1)} ` +
      `finale=${finale.mean.toFixed(1)}/var${finale.variance.toFixed(0)} opened=${after.opened} finales=${after.finales} ` +
      `frames=${after.frames} q=${after.quality}`);

    const check = (cond, msg) => { if (!cond) failures.push(`[${vp.name}] ${msg}`); };
    check(errors.length === 0, `js errors: ${errors.slice(0, 3).join(' | ')}`);
    check(quiet.peak > 0, 'resting pool shows no light at all');
    check(tapped.touched, 'a real touchscreen tap never reached the game');
    check(localAfter > localBefore * 1.10,
      `tap did not brighten the light net where it landed (${localBefore.toFixed(3)} -> ${localAfter.toFixed(3)})`);
    check(swirlPeak > quiet.variance * 1.25,
      `circling did not enrich the pattern (rest ${quiet.variance.toFixed(0)} -> circling ${swirlPeak.toFixed(0)})`);
    check(Number.isFinite(rough.mean) && rough.mean > 0 && rough.mean < 250, `rough play degenerated (mean ${rough.mean})`);
    check(after.finales > 0, 'no finale flower appeared after release');
    check(after.frames > 60, `too few frames rendered (${after.frames}) — note: SwiftShader, not a perf signal`);
    await ctx.close();
  }

  // Playing over a sleeping flower must actually wake it: this is the whole
  // reward loop, and it is easy to break by retuning the light probe.
  {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 820 }, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?seed=4242`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && window.__lab.stats.frames > 10, null, { timeout: 30000 });
    // First: an untouched pool must never open one by itself.
    await wait(page, 3000);
    const idle = await page.evaluate(() => ({
      opened: window.__lab.stats.opened,
      energy: Math.max(...window.__lab.blooms.map((b) => b.energy)),
    }));
    if (idle.opened > 0 || idle.energy > 0.01) {
      failures.push(`[bloom] flowers charged with nobody playing (opened ${idle.opened}, energy ${idle.energy.toFixed(2)})`);
    }

    const res = await page.evaluate(async () => {
      const lab = window.__lab;
      lab.input.hasTouched = true;
      const b = lab.blooms[0];
      const u = b.x * 0.43 + 0.5, v = b.z * 0.43 + 0.5;
      for (let f = 0; f < 420 && !b.opened; f++) {
        const a = f * 0.22;
        const r = 0.05 + 0.03 * Math.sin(f * 0.05);
        lab.stroke(u + Math.cos(a) * r, v + Math.sin(a) * r,
          u + Math.cos(a + 0.3) * r, v + Math.sin(a + 0.3) * r, 1, 1.2);
        await new Promise((rs) => requestAnimationFrame(rs));
      }
      return { opened: b.opened, energy: b.energy, frames: lab.stats.frames, rel: b.rel || 0 };
    });
    await wait(page, 700);
    await page.screenshot({ path: `${OUT}bloom-opened.png` });
    if (!res.opened) failures.push(`[bloom] playing on a flower never opened it (energy ${res.energy.toFixed(2)})`);
    if (errors.length) failures.push(`[bloom] js errors: ${errors.slice(0, 2).join(' | ')}`);
    note(`[bloom] idle opened=${idle.opened} -> played opened=${res.opened} energy=${res.energy.toFixed(2)} rel=${res.rel.toFixed(2)}`);
    await page.close();
  }

  // The adaptive quality path reshapes every simulation buffer at runtime.
  {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`${BASE}/?seed=5`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && window.__lab.stats.frames > 10, null, { timeout: 30000 });
    const before = await page.evaluate(() => window.__lab.stats.frames);
    await page.evaluate(() => {
      const lab = window.__lab;
      lab.qIndex = 1; lab._applyQuality();
      lab.qIndex = 2; lab._applyQuality();
      lab.poke(0.5, 0.5, 0.6);
    });
    await wait(page, 900);
    const after = await page.evaluate(() => ({
      frames: window.__lab.stats.frames,
      quality: window.__lab.stats.quality,
      glError: window.__lab.gl.getError(),
      sim: window.__lab.sim.res,
      caustic: window.__lab.caustics.res,
    }));
    await page.screenshot({ path: `${OUT}quality-low.png` });
    if (after.frames <= before + 3) failures.push(`[quality] rendering stalled after downgrade (${before} -> ${after.frames})`);
    if (after.glError !== 0) failures.push(`[quality] GL error 0x${after.glError.toString(16)} after downgrade`);
    if (errors.length) failures.push(`[quality] js errors: ${errors.slice(0, 2).join(' | ')}`);
    note(`[quality] downgraded to ${after.quality} sim=${after.sim} caustic=${after.caustic} frames=${after.frames}`);
    await page.close();
  }

  // 8-bit fallback path must boot too.
  {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?seed=7&packed=1`, { waitUntil: 'load' });
    const ok = await page.waitForFunction(() => window.__lab && window.__lab.stats.frames > 20, null, { timeout: 30000 })
      .then(() => true).catch(() => false);
    if (ok) {
      await page.evaluate(() => { window.__lab.poke(0.5, 0.5, 0.6); });
      await wait(page, 600);
      await page.screenshot({ path: `${OUT}packed-fallback.png` });
    }
    const err = ok ? null : await page.evaluate(() => window.__labError || 'timeout');
    if (!ok) failures.push(`[packed] fallback failed to run: ${err}`);
    if (errors.length) failures.push(`[packed] js errors: ${errors.slice(0, 2).join(' | ')}`);
    note(`[packed] ${ok ? 'ok' : 'FAILED'}`);
  }

  await browser.close();
  await writeFile(`${OUT}report.txt`, log.concat(failures).join('\n'));

  if (failures.length) {
    console.error('\nFAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nsmoke ok');
}

run().catch((e) => { console.error(e); process.exit(1); });
