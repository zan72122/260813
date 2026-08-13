import { test, expect } from '@playwright/test';

/**
 * iPhone / iPad 相当の画面で「一周あそべること」を確かめる。
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
    window.__BISMUTH__.clearShelf();
  });
  await tick(page, 300);
  return errors;
}

async function swipeX(page, y = 0.6, from = 0.2, to = 0.8) {
  const v = page.viewportSize();
  await page.mouse.move(v.width * from, v.height * y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(v.width * (from + ((to - from) * i) / 6), v.height * y);
    await tick(page, 33);
  }
  await page.mouse.up();
}

async function swipeUp(page) {
  const v = page.viewportSize();
  await page.mouse.move(v.width * 0.5, v.height * 0.78);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(v.width * 0.5, v.height * (0.78 - 0.06 * i));
    await tick(page, 33);
  }
  await page.mouse.up();
}

/** 最後まで一周する。各ステージには じどう進行があるので、必ず終わる。 */
async function playThrough(page) {
  const v = page.viewportSize();
  await page.click('#startBtn', { force: true });
  await tick(page, 500);

  // 1. 金属を入れる
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(v.width * 0.5, v.height * 0.6);
    await tick(page, 700);
  }
  await tick(page, 600);
  expect((await state(page)).chunksIn).toBe(3);

  // 2. 加熱（長押し）
  await page.mouse.move(v.width * 0.5, v.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 14; i++) await tick(page, 300);
  await page.mouse.up();
  await tick(page, 200);

  // 3. 冷やす（横にこする）
  for (let i = 0; i < 25 && (await state(page)).stage === 'cool'; i++) {
    await swipeX(page);
    await tick(page, 300);
  }

  // 4. 傾けて流す
  for (let i = 0; i < 25 && (await state(page)).stage === 'tilt'; i++) {
    await swipeX(page, 0.6, 0.25, 0.85);
    await tick(page, 400);
  }

  // 5. トングで持ち上げる
  for (let i = 0; i < 25 && (await state(page)).stage === 'lift'; i++) {
    await tick(page, 400);
    await swipeUp(page);
  }
  await tick(page, 1000);

  // 6. ライトの下で回す
  for (let i = 0; i < 40 && !(await state(page)).finished; i++) {
    await swipeX(page, 0.6, 0.25, 0.8);
    await tick(page, 300);
  }
  await tick(page, 600);
}

test('立ち上がって、るつぼの画面が出る', async ({ page }) => {
  const errors = await boot(page);
  const s = await state(page);
  expect(s.stage).toBe('title');
  expect(await page.locator('#startBtn').isVisible()).toBe(true);
  expect(errors).toEqual([]);
});

test('金属を入れる→加熱→冷やす→流す→持ち上げる→回す、が一周できる', async ({ page }) => {
  const errors = await boot(page);
  await playThrough(page);

  const s = await state(page);
  expect(s.stage).toBe('shine');
  expect(s.finished).toBe(true);
  expect(s.poured).toBeGreaterThan(0.99);
  expect(s.lift).toBeGreaterThan(0.99);
  // 最後がいちばん虹色
  expect(s.rainbow).toBeGreaterThan(0.95);
  expect(s.charge).toBe(1);
  // 段がぜんぶ育っている
  expect(s.grow).toBeGreaterThanOrEqual(s.layers);
  expect(errors).toEqual([]);
});

test('できた結晶が かざりだなに 追加される', async ({ page }) => {
  await boot(page);
  await playThrough(page);
  await page.click('#shelfBtn', { force: true });
  await expect(page.locator('#shelf')).not.toHaveClass(/hidden/);
  const items = await page.evaluate(() => window.__BISMUTH__.shelf());
  expect(items.length).toBe(1);
  expect(items[0].thumb.startsWith('data:image/')).toBe(true);
  // たなの結晶をさわると、もういちど回せる
  await page.locator('.shelf-cell').first().click();
  await tick(page, 600);
  expect((await state(page)).stage).toBe('shine');
});

test('なにも触らなくても、ひとりでに さいごまで進む（しっぱいなし）', async ({ page }) => {
  await boot(page);
  await page.click('#startBtn', { force: true });
  // 一切さわらずに 論理時間だけ進める（描画はとばす）
  for (let i = 0; i < 40; i++) {
    await tickLogic(page, 3000);
    if ((await state(page)).finished) break;
  }
  const s = await state(page);
  expect(s.stage).toBe('shine');
  expect(s.finished).toBe(true);
});

test('ヒントのゆびが、まよったときに 画面の中に 出る', async ({ page }) => {
  await boot(page);
  await page.click('#startBtn', { force: true });
  await tick(page, 2500);
  const hint = page.locator('#hint');
  await expect(hint).toHaveClass(/on/);

  // 画面の外に出ていないこと（前に position のバグで見えなくなった）
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
  const first = (await state(page)).seed;
  await page.click('#againBtn', { force: true });
  await tick(page, 400);
  const s = await state(page);
  expect(s.stage).toBe('load');
  expect(s.chunksIn).toBe(0);
  expect(s.heat).toBe(0);
  expect(s.finished).toBe(false);
  expect(s.seed).not.toBe(first); // 形は毎回すこし変わる
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

  // 縦横で画角が切りかわる
  expect(after.aspect).toBeCloseTo(v.height / v.width, 2);
  expect(after.fov).not.toBe(before.fov);
  // どちらでもキャンバスは画面いっぱい
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
  for (const sel of ['#startBtn', '#shelfBtn', '#soundBtn']) {
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
