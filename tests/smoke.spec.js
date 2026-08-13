import { test, expect } from '@playwright/test';

/**
 * iPhone / iPad 相当の画面で「一周あそべること」と、
 * 「遊びかたを変えると 結果が変わること」を確かめる。
 * CLAUDE.md のクラウドプロファイルに合わせて Chromium・workers=1 で動かす。
 */

const URL = '/?fast=1&seed=1234';

/** 論理時間だけ進める（実時間を待たないので速くて安定する） */
const tick = (page, ms) => page.evaluate((m) => window.__BISMUTH__.tick(m), ms);
// 描画をとばして進行だけ進める（放置テスト用・SwiftShader でも軽い）
const tickLogic = (page, ms) => page.evaluate((m) => window.__BISMUTH__.tick(m, 33, false), ms);
const state = (page) => page.evaluate(() => window.__BISMUTH__.state());

async function boot(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__BISMUTH__?.ready === true);
  await page.evaluate(() => {
    window.__BISMUTH__.mute(true);
    window.__BISMUTH__.clearCodex();
  });
  await tick(page, 300);
  return errors;
}

const tap = async (page, fx, fy) => {
  const v = page.viewportSize();
  await page.mouse.click(v.width * fx, v.height * fy);
  await tick(page, 120);
};

/** 指をつけたまま 左右にこする（あおぐ・傾ける・まわす に使う） */
async function rub(page, y = 0.6, frames = 10) {
  const v = page.viewportSize();
  await page.mouse.move(v.width * 0.3, v.height * y);
  await page.mouse.down();
  for (let i = 0; i < frames; i++) {
    await page.mouse.move(v.width * (0.5 + Math.sin(i * 1.15) * 0.26), v.height * y);
    await tick(page, 33);
  }
  await page.mouse.up();
  await tick(page, 100);
}

async function dragUp(page) {
  const v = page.viewportSize();
  await page.mouse.move(v.width * 0.5, v.height * 0.72);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(v.width * 0.5, v.height * (0.72 - 0.055 * i));
    await tick(page, 33);
  }
  await page.mouse.up();
}

/** stage が変わるまで act を くりかえす */
async function until(page, stage, act, max = 45) {
  for (let i = 0; i < max; i++) {
    const s = await state(page);
    if (s.stage !== stage) return s;
    await act(i, s);
  }
  return await state(page);
}

/**
 * 一周あそぶ。レシピ（かけらの数・たね・冷やしかた・引き上げ温度）を
 * 変えられるので、「遊びかたで結果が変わる」ことを試せる。
 */
async function playThrough(page, opts = {}) {
  const { chunks = 3, seeds = [[0.5, 0.5]], fan = false, pullAt = 0.5 } = opts;
  await page.click('#startBtn', { force: true });
  await tick(page, 500);

  // 1. 金属を入れる（入れた数が 大きさになる）
  for (let i = 0; i < chunks; i++) await tap(page, 0.2 + i * 0.15, 0.62);
  await until(page, 'load', () => tickLogic(page, 500));

  // 2. 加熱（長押し）
  const v = page.viewportSize();
  await page.mouse.move(v.width * 0.5, v.height * 0.5);
  await page.mouse.down();
  await until(page, 'heat', () => tick(page, 300));
  await page.mouse.up();
  await tick(page, 150);

  // 3. たねを置く（置いた場所から 結晶が生える）
  for (const [sx, sy] of seeds) await tap(page, sx, sy);
  await until(page, 'seed', () => tickLogic(page, 500));

  // 4. 冷やす（速いほど 段が細かくなる）
  await until(page, 'cool', () => (fan ? rub(page, 0.6, 14) : tickLogic(page, 700)));

  // 5. 傾けて流す
  await until(page, 'tilt', async (i, s) => {
    if (s.poured < 0.95) await rub(page, 0.6, 8);
    await tick(page, 500);
  });

  // 6. 引き上げる（待つほど 色が変わる。pullAt で ねらう温度を決める）
  await until(page, 'lift', async (i, s) => {
    if (s.crystalTemp <= pullAt || i > 34) await dragUp(page);
    else await tickLogic(page, 400);
  });
  await tick(page, 1100);

  // 7. まわす
  for (let i = 0; i < 30 && !(await state(page)).finished; i++) {
    await rub(page, 0.6, 8);
    await tick(page, 250);
  }
  await tick(page, 600);
  return await state(page);
}

test('立ち上がって、るつぼの画面が出る', async ({ page }) => {
  const errors = await boot(page);
  const s = await state(page);
  expect(s.stage).toBe('title');
  expect(await page.locator('#startBtn').isVisible()).toBe(true);
  expect(errors).toEqual([]);
});

test('入れる→とかす→たね→冷やす→流す→引き上げる→まわす、が一周できる', async ({ page }) => {
  const errors = await boot(page);
  const s = await playThrough(page, { chunks: 3, seeds: [[0.5, 0.5]] });

  expect(s.stage).toBe('shine');
  expect(s.finished).toBe(true);
  expect(s.poured).toBeGreaterThan(0.29);
  expect(s.lift).toBeGreaterThan(0.99);
  expect(s.rainbow).toBeGreaterThan(0.95); // 最後がいちばん虹色
  expect(s.grow).toBeGreaterThanOrEqual(s.layers);
  expect(s.result.stars).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('操作した内容が レシピとして 記録されている', async ({ page }) => {
  await boot(page);
  const s = await playThrough(page, {
    chunks: 4,
    seeds: [
      [0.42, 0.46],
      [0.6, 0.55],
    ],
  });
  expect(s.recipe.amount).toBe(4);
  expect(s.recipe.seeds).toBe(2);
  expect(s.recipe.pour).toBeGreaterThan(0.29);
  expect(s.result.crystals).toBe(2);
});

test('遊びかたを変えると、ちがう結晶ができる', async ({ page }) => {
  await boot(page);

  // すこし・急いで冷やす・さめてから引き上げる
  const a = await playThrough(page, {
    chunks: 1,
    seeds: [[0.5, 0.5]],
    fan: true,
    pullAt: 0.15,
  });
  await page.click('#againBtn', { force: true });
  await tick(page, 400);

  // たっぷり・ゆっくり冷やす・熱いうちに引き上げる
  const b = await playThrough(page, {
    chunks: 5,
    seeds: [[0.5, 0.5]],
    fan: false,
    pullAt: 0.9,
  });

  // 色がちがう（引き上げ温度）
  expect(a.result.color).not.toBe(b.result.color);
  // 大きさがちがう（かけらの数）
  expect(b.result.height).toBeGreaterThan(a.result.height * 1.2);
  // ずかんの マスもちがう
  expect(a.result.key).not.toBe(b.result.key);
});

test('たねを置いた数だけ 結晶ができる', async ({ page }) => {
  await boot(page);
  const s = await playThrough(page, {
    chunks: 5,
    seeds: [
      [0.5, 0.34],
      [0.68, 0.45],
      [0.62, 0.62],
      [0.38, 0.62],
      [0.32, 0.45],
    ],
  });
  expect(s.recipe.seeds).toBe(5);
  expect(s.result.crystals).toBe(5);
  expect(s.result.shape).toBe('takusan');
});

test('できた結晶が ずかんに 記録される', async ({ page }) => {
  await boot(page);
  await playThrough(page);
  const codex = await page.evaluate(() => window.__BISMUTH__.codex());
  const keys = Object.keys(codex.cells);
  expect(keys.length).toBe(1);
  expect(codex.cells[keys[0]].thumb.startsWith('data:image/')).toBe(true);

  await page.click('#codexBtn', { force: true });
  await expect(page.locator('#codex')).not.toHaveClass(/hidden/);
  expect(await page.locator('.codex-cell').count()).toBe(28);
  expect(await page.locator('.codex-cell.got').count()).toBe(1);

  // 集めた石は もういちど ライトの下で まわせる
  await page.locator('.codex-cell.got').first().click();
  await tick(page, 600);
  expect((await state(page)).stage).toBe('shine');
});

test('なにも触らなくても、ひとりでに さいごまで進む（しっぱいなし）', async ({ page }) => {
  await boot(page);
  await page.click('#startBtn', { force: true });
  for (let i = 0; i < 40; i++) {
    await tickLogic(page, 3000);
    if ((await state(page)).finished) break;
  }
  const s = await state(page);
  expect(s.stage).toBe('shine');
  expect(s.finished).toBe(true);
  expect(s.result.stars).toBeGreaterThanOrEqual(1); // ほうっておいても ちゃんとした石になる
});

test('ヒントのゆびが、まよったときに 画面の中に 出る', async ({ page }) => {
  await boot(page);
  await page.click('#startBtn', { force: true });
  await tick(page, 2500);
  const hint = page.locator('#hint');
  await expect(hint).toHaveClass(/on/);

  const box = await hint.boundingBox();
  const v = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(v.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(v.height + 1);
});

test('もういちど、で最初からやり直せる', async ({ page }) => {
  await boot(page);
  await playThrough(page);
  await page.click('#againBtn', { force: true });
  await tick(page, 400);
  const s = await state(page);
  expect(s.stage).toBe('load');
  expect(s.recipe.amount).toBe(0);
  expect(s.recipe.seeds).toBe(0);
  expect(s.heat).toBe(0);
  expect(s.finished).toBe(false);
});

test('画面の向きが変わっても、はみ出さずに収まる', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__BISMUTH__.setStage('shine'));
  await tick(page, 600);
  const before = await state(page);

  const v = page.viewportSize();
  await page.setViewportSize({ width: v.height, height: v.width });
  await tick(page, 900);
  const after = await state(page);

  expect(after.aspect).toBeCloseTo(v.height / v.width, 2);
  expect(after.fov).not.toBe(before.fov);
  const size = await page.evaluate(() => ({
    cw: document.getElementById('scene').clientWidth,
    ch: document.getElementById('scene').clientHeight,
    iw: window.innerWidth,
    ih: window.innerHeight,
    scroll: document.documentElement.scrollWidth > window.innerWidth,
  }));
  expect(size.cw).toBe(size.iw);
  expect(size.ch).toBe(size.ih);
  expect(size.scroll).toBe(false);
});

test('ボタンは 4さいの指でも押せる大きさ（44px 以上）', async ({ page }) => {
  await boot(page);
  for (const sel of ['#startBtn', '#codexBtn', '#soundBtn']) {
    const b = await page.locator(sel).boundingBox();
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
});

test('E2E_FAST では devicePixelRatio 1 で描いている', async ({ page }) => {
  await boot(page);
  const size = await page.evaluate(() => window.__BISMUTH__.size());
  expect(size.dpr).toBe(1);
  expect(await page.evaluate(() => window.__BISMUTH__.fast)).toBe(true);
});
