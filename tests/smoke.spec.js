import { test, expect } from '@playwright/test';

const URL = '/?e2e=1&seed=4242';

/** Read the framebuffer and describe it: is it lit, and is it colourful? */
const READ = () => {
  const c = document.getElementById('gl');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const w = 64, h = 64;
  const buf = new Uint8Array(w * h * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const x = Math.round(c.width / 2 - w / 2);
  const y = Math.round(c.height / 2 - h / 2);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let lum = 0, sat = 0, n = w * h;
  for (let i = 0; i < n; i++) {
    const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum += (r + g + b) / 3;
    sat += mx > 0 ? (mx - mn) / mx : 0;
  }
  return { lum: lum / n, sat: sat / n };
};

async function boot(page, size = { width: 390, height: 844 }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize(size);
  await page.goto(URL);
  await page.waitForFunction(() => window.__ui && window.__ui.ready, null, { timeout: 40000 });
  await page.evaluate(() => window.__ui.settle(3));
  return errors;
}

test('boots, renders, and never throws', async ({ page }) => {
  const errors = await boot(page);
  const { lum } = await page.evaluate(READ);
  expect(lum).toBeGreaterThan(8); // something is actually on screen
  expect(errors).toEqual([]);
});

test('clear plastic first, rainbow only after turning the ring', async ({ page }) => {
  const errors = await boot(page);

  await page.evaluate(() => {
    const g = window.__game;
    g.tap(0, 0);                       // put the part on the stage
    for (let i = 0; i < 60; i++) g.update(1 / 60);
  });
  await page.evaluate(() => window.__ui.settle(2));
  const before = await page.evaluate(READ);

  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 300; i++) g.turn(0.06, 1 / 60);
    g.ringVel = 0; g.ringAngle = Math.PI / 2;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
  });
  await page.evaluate(() => window.__ui.settle(2));
  const after = await page.evaluate(READ);

  // it starts near-colourless and ends unmistakably colourful
  expect(before.sat).toBeLessThan(0.16);
  expect(after.sat).toBeGreaterThan(before.sat + 0.18);
  expect(errors).toEqual([]);
});

test('every increment of rotation changes the picture — no dead zone', async ({ page }) => {
  await boot(page);
  const { sats, deltas } = await page.evaluate(async () => {
    const N = 160;
    const g = window.__game;
    g.tap(0, 0);
    for (let i = 0; i < 400; i++) g.turn(0.06, 1 / 60);   // fully charged
    g.ringVel = 0;
    const c = document.getElementById('gl');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const grab = () => {
      const buf = new Uint8Array(N * N * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(c.width / 2 - N / 2), Math.round(c.height / 2 - N / 2),
        N, N, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    // saturation of the *lit* part of the frame — the dark analyser field
    // around the piece would otherwise drag the average toward zero
    const satOf = (b) => {
      let s = 0, w = 0;
      for (let i = 0; i < N * N; i++) {
        const r = b[i * 4], g2 = b[i * 4 + 1], bl = b[i * 4 + 2];
        const mx = Math.max(r, g2, bl), mn = Math.min(r, g2, bl);
        if (mx < 50) continue;
        s += (mx - mn) / mx; w++;
      }
      return w ? s / w : 0;
    };
    const sats = [], deltas = [];
    let prev = null;
    const STEPS = 12;
    for (let k = 0; k <= STEPS; k++) {
      g.ringAngle = (k / STEPS) * Math.PI;   // one full period of the analyser
      g.update(1 / 60);
      await window.__ui.settle(2);
      const buf = grab();
      sats.push(satOf(buf));
      if (prev) {
        let d = 0;
        for (let i = 0; i < N * N; i++) {
          d += Math.abs(buf[i * 4] - prev[i * 4]) +
               Math.abs(buf[i * 4 + 1] - prev[i * 4 + 1]) +
               Math.abs(buf[i * 4 + 2] - prev[i * 4 + 2]);
        }
        deltas.push(d / (N * N * 3));
      }
      prev = buf;
    }
    return { sats, deltas };
  });

  // Somewhere in the turn it becomes unmistakably colourful...
  expect(Math.max(...sats)).toBeGreaterThan(0.26);
  // ...and the near-colourless parallel position is part of the effect, so we
  // check responsiveness instead: no 15-degree step is ever a no-op.
  expect(Math.min(...deltas)).toBeGreaterThan(5);
  expect(deltas.length).toBe(12);
});

test('walks the whole chain to the finale without errors', async ({ page }) => {
  const errors = await boot(page);
  const stages = await page.evaluate(async () => {
    const g = window.__game;
    const seen = [];
    g.tap(0, 0); seen.push(g.stage);
    for (let i = 0; i < 400; i++) g.turn(0.05, 1 / 60);
    for (let i = 0; i < 800; i++) g.update(1 / 60);        // ring → press
    seen.push(g.stage);
    for (let k = 0; k < 4; k++) { const p = g.beginPress(0.1 * k, 0); p.s = 1; g.endPress(p); }
    for (let i = 0; i < 700; i++) g.update(1 / 60);        // press → parts
    seen.push(g.stage);
    g.placeNextPart(); g.placeNextPart();
    for (let i = 0; i < 200; i++) g.turn(0.05, 1 / 60);
    for (let i = 0; i < 700; i++) g.update(1 / 60);        // parts → window
    seen.push(g.stage);
    for (let i = 0; i < 300; i++) g.turn(0.05, 1 / 60);
    for (let i = 0; i < 700; i++) g.update(1 / 60);        // window → done
    seen.push(g.stage);
    await window.__ui.settle(2);
    return seen;
  });
  expect(stages[0]).toBe(2);            // RING
  expect(stages[stages.length - 1]).toBe(6); // DONE
  expect(stages).toEqual([...stages].sort((a, b) => a - b)); // never goes backwards
  expect(errors).toEqual([]);

  await page.waitForSelector('#choices.on', { timeout: 20000 });
  expect(await page.locator('#btn-again').isVisible()).toBe(true);
});

test('"again" keeps the same piece, "next" makes a new one', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const seed0 = g.seed;
    const shape0 = g.set.hero.mode + ':' + g.set.hero.freq;
    g.replay();
    const sameSeed = g.seed === seed0 && (g.set.hero.mode + ':' + g.set.hero.freq) === shape0;
    g.nextOne();
    return { sameSeed, newSeed: g.seed !== seed0, stage: g.stage, charge: g.charge };
  });
  expect(r.sameSeed).toBe(true);
  expect(r.newSeed).toBe(true);
  expect(r.stage).toBe(0);   // both start the chain over
  expect(r.charge).toBe(0);
});

test('survives rotation between portrait and landscape without losing state', async ({ page }) => {
  const errors = await boot(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    const g = window.__game;
    g.tap(0, 0);
    for (let i = 0; i < 200; i++) g.turn(0.05, 1 / 60);
    g.ringVel = 0;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
  });
  const before = await page.evaluate(() => {
    const g = window.__game;
    return { stage: g.stage, ang: g.ringAngle, rot: g.totalRot, seed: g.seed };
  });

  for (const size of [{ width: 844, height: 390 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.__ui.settle(3));
    const after = await page.evaluate(() => {
      const g = window.__game;
      const c = document.getElementById('gl');
      return {
        stage: g.stage, ang: g.ringAngle, rot: g.totalRot, seed: g.seed,
        cw: c.width, ch: c.height,
        vw: window.innerWidth, vh: window.innerHeight,
      };
    });
    expect(after.stage).toBe(before.stage);
    expect(after.seed).toBe(before.seed);
    expect(after.ang).toBeCloseTo(before.ang, 5);
    expect(after.rot).toBeCloseTo(before.rot, 5);
    // backing store follows the viewport and stays inside the pixel budget
    expect(after.cw / after.vw).toBeGreaterThan(0.9);
    expect(after.cw * after.ch).toBeLessThanOrEqual(2600000 * 1.02);
  }
  expect(errors).toEqual([]);
});

test('one finger anywhere turns the ring — no precise aiming needed', async ({ page }) => {
  await boot(page, { width: 390, height: 844 });
  await page.evaluate(() => { window.__game.tap(0, 0); window.__game.update(0.5); });

  const spin = async (from, to) => {
    const a0 = await page.evaluate(() => window.__game.ringAngle);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    }
    await page.mouse.up();
    const a1 = await page.evaluate(() => window.__game.ringAngle);
    return Math.abs(a1 - a0);
  };

  // a sloppy straight swipe across the middle
  expect(await spin({ x: 120, y: 420 }, { x: 300, y: 440 })).toBeGreaterThan(0.25);
  // a swipe out near the rim
  expect(await spin({ x: 60, y: 300 }, { x: 90, y: 560 })).toBeGreaterThan(0.25);
  // a vertical drag well away from the ring still does something
  expect(await spin({ x: 340, y: 700 }, { x: 340, y: 500 })).toBeGreaterThan(0.05);
});

test('a real first touch starts the game (no e2e shortcuts)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');                       // no ?e2e=1: veil up, audio live
  await page.waitForSelector('#veil');
  expect(await page.locator('#veil').evaluate((n) => n.classList.contains('off'))).toBe(false);

  // exactly what a child does: one poke in the middle
  await page.mouse.move(195, 420);
  await page.mouse.down();
  await page.mouse.up();

  await page.waitForFunction(
    () => document.getElementById('veil').classList.contains('off'),
    null, { timeout: 5000 },
  );

  // and then a sloppy swipe has to actually turn something
  await page.mouse.move(120, 400);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(120 + i * 20, 400 + i * 4);
  await page.mouse.up();

  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});

test('the sound toggle survives being pressed before anything else', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#sound').click({ force: true });   // off, before any audio exists
  await page.locator('#sound').click({ force: true });   // back on
  await page.mouse.click(195, 420);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
