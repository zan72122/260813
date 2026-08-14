/** Small play-testing kit: drive the game the way a finger would. */

export async function boot(page, query = '') {
  await page.goto('/' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.frames > 5, null, { timeout: 30000 });
  await frames(page, 20);
}

export async function frames(page, n = 10) {
  const start = await page.evaluate(() => window.__game.frames);
  await page.waitForFunction((s) => window.__game.frames > s, start + n, { timeout: 20000 });
}

export const state = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const s = g.debugState();
    return {
      index: s.index,
      verb: s.verb,
      trayVisible: s.trayVisible,
      heroVisible: s.heroVisible,
      fill: s.fill,
      broken: g.world.broken,
      halfGap: s.halfGap,
      printed: s.printed,
      hint: g.hud.kind,
      progress: g.hud.progress,
      anchor: { ...g.hud.anchor },
      drum: g.world.printDrum.rotation.z,
      cutter: g.world.cutDrum.rotation.z,
      lineCount: g.world.line.count,
      pixelsPerBiscuit: g.biscuitPixels(),
    };
  });

export async function waitForStage(page, index, timeout = 30000) {
  await page.waitForFunction((i) => window.__game.index >= i, index, { timeout });
  await frames(page, 4);
}

/** Circular drag around a screen point — how a child spins a roller. */
export async function turn(page, cx, cy, r, turns = 1, steps = 48) {
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const a = -(i / steps) * turns * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  await page.mouse.up();
}

export async function swipe(page, x, y, dx, dy = 0, steps = 24) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  }
  await page.mouse.up();
}

export async function press(page, x, y, ms) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export async function tap(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Repeat a gesture at the current hint anchor until the stage moves on. */
export async function playStage(page, index, gesture, tries = 8) {
  await waitForStage(page, index);
  for (let i = 0; i < tries; i++) {
    const s = await state(page);
    if (s.index > index) return;
    await gesture(s.anchor, i);
    await frames(page, 3);
  }
}
