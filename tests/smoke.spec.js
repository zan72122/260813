// Chromium smoke E2E: drives the full toy loop through the deterministic
// window.__game hooks (?e2e=1 pauses RAF; tests advance logical time).
const { test, expect } = require('@playwright/test');

const POOLS = { red: [-3.4, 2.9], blue: [0.0, 3.6], yellow: [3.4, 2.9] };
const FLOWER_MAIN = [0, -2.5];
const FLOWER_LEFT = [-2.8, -1.6];
const WASH = [5.6, 0.2];

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__game && window.__game.e2e === true);
  return errors;
}

const api = (page, expr) => page.evaluate(expr);

async function dragTo(page, [x, z], seconds = 1.6) {
  await page.evaluate(
    ([x, z, s]) => {
      window.__game.press(x, z);
      window.__game.step(s);
    },
    [x, z, seconds]
  );
}

async function soak(page, pool, seconds = 2.2) {
  await dragTo(page, POOLS[pool], 1.2);
  await page.evaluate((s) => window.__game.step(s), seconds);
}

async function squeezeAt(page, [x, z], seconds = 4) {
  // Move there, then hold perfectly still — long-press squeeze.
  await dragTo(page, [x, z], 1.6);
  await page.evaluate((s) => window.__game.step(s), seconds);
}

test('game boots and renders without errors', async ({ page }) => {
  const errors = await boot(page);
  await api(page, () => window.__game.step(1));
  const state = await api(page, () => window.__game.state());
  expect(errors).toEqual([]);
  expect(state.stage).toBe('dip1');
  expect(state.dye.r).toBe(0);
  // Canvas actually drew something (not a black/blank frame). Render and
  // read back in the same task, before the buffer is presented/cleared.
  const px = await page.evaluate(() => {
    window.__game.step(1 / 60);
    const gl = document.querySelector('canvas').getContext('webgl2');
    const buf = new Uint8Array(4);
    gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return Array.from(buf);
  });
  expect(px[0] + px[1] + px[2]).toBeGreaterThan(30);
});

test('core chain: soak red + blue -> purple -> squeeze onto flower', async ({ page }) => {
  const errors = await boot(page);

  // 1. Soak red: dye enters and spreads.
  await soak(page, 'red', 2.5);
  let s = await api(page, () => window.__game.state());
  expect(s.activePool).toBe('red');
  expect(s.dye.r).toBeGreaterThan(0.05);
  expect(s.dye.b).toBeLessThan(0.01);

  // 2. Soak blue: second colour enters; mixing is detected inside.
  await soak(page, 'blue', 2.5);
  s = await api(page, () => window.__game.state());
  expect(s.dye.b).toBeGreaterThan(0.05);
  expect(s.mixEvent).toBeGreaterThan(0.1);

  // Let the boundary blend a moment, then check the liquid is purple:
  // red channel and blue channel both high-ish, green clearly lower.
  await api(page, () => window.__game.step(2));
  s = await api(page, () => window.__game.state());
  const hex = s.liquid.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(g);
  expect(b).toBeGreaterThan(g);

  // 3. Carry to the big white flower and hold still to squeeze.
  await squeezeAt(page, FLOWER_MAIN, 5);
  s = await api(page, () => window.__game.state());
  const flower = s.targets.find((t) => t.id === 'flower-main');
  expect(flower.colored || flower.painting).toBe(true);

  // 4. Colour finishes spreading through the petals.
  await api(page, () => window.__game.step(4));
  s = await api(page, () => window.__game.state());
  const done = s.targets.find((t) => t.id === 'flower-main');
  expect(done.colored).toBe(true);
  const fhex = done.color.slice(1);
  const [fr, fg, fb] = [0, 2, 4].map((i) => parseInt(fhex.slice(i, i + 2), 16));
  expect(fr).toBeGreaterThan(fg); // purple-ish, not white
  expect(fb).toBeGreaterThan(fg);
  expect(errors).toEqual([]);
});

test('yellow+blue makes green, wash resets, bud blooms', async ({ page }) => {
  const errors = await boot(page);

  await soak(page, 'yellow', 2.5);
  await soak(page, 'blue', 2.5);
  await api(page, () => window.__game.step(2));
  let s = await api(page, () => window.__game.state());
  const hex = s.liquid.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  expect(g).toBeGreaterThan(r); // green-ish

  // Squeeze onto the left bud — it should colour and bloom.
  await squeezeAt(page, FLOWER_LEFT, 5);
  await api(page, () => window.__game.step(4));
  s = await api(page, () => window.__game.state());
  const bud = s.targets.find((t) => t.id === 'flower-left');
  expect(bud.colored).toBe(true);

  // Wash: dye drains back toward white.
  const before = s.dye.r + s.dye.b + s.dye.y;
  await dragTo(page, WASH, 1.4);
  await api(page, () => window.__game.step(6));
  s = await api(page, () => window.__game.state());
  const after = s.dye.r + s.dye.b + s.dye.y;
  expect(after).toBeLessThan(Math.max(0.02, before * 0.25));
  expect(errors).toEqual([]);
  void b;
});

test('tutorial stages advance into free mode', async ({ page }) => {
  const errors = await boot(page);
  await soak(page, 'red', 2.5);
  let s = await api(page, () => window.__game.state());
  expect(s.stage).toBe('paint1');

  await squeezeAt(page, FLOWER_MAIN, 5);
  await api(page, () => window.__game.step(4));
  s = await api(page, () => window.__game.state());
  expect(s.stage).toBe('dip2');

  await soak(page, 'red', 2);
  await soak(page, 'blue', 2.5);
  await api(page, () => window.__game.step(2));
  s = await api(page, () => window.__game.state());
  expect(['mixwatch', 'paint2']).toContain(s.stage);

  await squeezeAt(page, FLOWER_LEFT, 5);
  await api(page, () => window.__game.step(4));
  s = await api(page, () => window.__game.state());
  expect(s.stage).toBe('free');
  expect(errors).toEqual([]);
});

test('colour spirits are born from newly created colours', async ({ page }) => {
  const errors = await boot(page);

  // Squeeze red onto empty grass -> first spirit (red) is born.
  await soak(page, 'red', 2.4);
  await squeezeAt(page, [1.8, 0.8], 3.5);
  let s = await api(page, () => window.__game.state());
  expect(s.spirits.count).toBe(1);
  expect(Object.keys(s.spirits.discovered)).toContain('red');

  // Top up red, mix in blue -> squeezing the purple mixture births a
  // second spirit of a purple-family species.
  await soak(page, 'red', 2.0);
  await soak(page, 'blue', 2.0);
  await api(page, () => window.__game.step(1.5));
  await squeezeAt(page, [-1.8, 0.8], 3.5);
  s = await api(page, () => window.__game.state());
  expect(s.spirits.count).toBe(2);
  const species = Object.keys(s.spirits.discovered);
  expect(species.some((k) => k.startsWith('purple') || k.startsWith('magenta'))).toBe(true);

  // A colour (hue + shade) already discovered -> no duplicate spirit.
  await dragTo(page, WASH, 1.4);
  await api(page, () => window.__game.step(8));
  await soak(page, 'red', 2.4);
  await squeezeAt(page, [1.0, 1.6], 2.5);
  s = await api(page, () => window.__game.state());
  expect(s.spirits.count).toBe(2);
  expect(errors).toEqual([]);
});

test('shade system: quick dip paints pastel, long soak paints deep', async ({ page }) => {
  const errors = await boot(page);

  // Quick touch of red -> low concentration -> pastel.
  await dragTo(page, POOLS.red, 1.0);
  let s = await api(page, () => window.__game.state());
  const concQuick = s.concentration;
  await squeezeAt(page, [-2.2, 2.1], 3.5); // white stone prop
  await api(page, () => window.__game.step(3));
  s = await api(page, () => window.__game.state());
  const pastelStone = s.targets.find((t) => t.id === 'stone-4');
  expect(pastelStone.colored).toBe(true);
  expect(Object.keys(s.spirits.discovered)).toContain('red-pastel');

  // Rinse fully, then a long deep soak -> deep shade.
  await dragTo(page, WASH, 1.4);
  await api(page, () => window.__game.step(8));
  await soak(page, 'red', 8);
  s = await api(page, () => window.__game.state());
  expect(s.concentration).toBeGreaterThan(concQuick + 0.3);
  await squeezeAt(page, [1.95, 1.9], 3.5); // another stone
  await api(page, () => window.__game.step(3));
  s = await api(page, () => window.__game.state());
  const deepStone = s.targets.find((t) => t.id === 'stone-5');
  expect(deepStone.colored).toBe(true);
  expect(Object.keys(s.spirits.discovered)).toContain('red-deep');

  // Same hue, different shades: the pastel stone is clearly lighter.
  const lum = (hex) =>
    [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  expect(lum(pastelStone.color)).toBeGreaterThan(lum(deepStone.color) + 60);
  expect(errors).toEqual([]);
});

test('animals can be painted alive and the garden grows in stages', async ({ page }) => {
  const errors = await boot(page);

  // Paint the white rabbit yellow -> it comes alive; the paint + the
  // yellow spirit birth push the garden to level 1 (butterflies).
  await soak(page, 'yellow', 2.4);
  await squeezeAt(page, [2.3, -3.7], 4);
  await api(page, () => window.__game.step(4));
  let s = await api(page, () => window.__game.state());
  const rabbit = s.targets.find((t) => t.id === 'rabbit');
  expect(rabbit.colored).toBe(true);
  expect(s.garden.level).toBeGreaterThanOrEqual(1);
  expect(s.garden.butterflies).toBeGreaterThan(0);

  // Fast-forward growth via the debug hook: rainbow -> tree -> blossoms.
  await api(page, () => { window.__game.grow(6); window.__game.step(1); });
  s = await api(page, () => window.__game.state());
  expect(s.garden.level).toBe(3);
  await api(page, () => { window.__game.grow(4); window.__game.step(6); });
  s = await api(page, () => window.__game.state());
  expect(s.garden.level).toBe(4);
  expect(errors).toEqual([]);
});

test('real pointer input drags the sponge', async ({ page }) => {
  const errors = await boot(page);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  // Touch low-left (roughly toward the red pool side) and hold.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.72);
  await page.mouse.down();
  await api(page, () => window.__game.step(1.5));
  const s = await api(page, () => window.__game.state());
  await page.mouse.up();
  expect(s.sponge.x).toBeLessThan(-0.5); // moved left from start x=0
  expect(errors).toEqual([]);
});
