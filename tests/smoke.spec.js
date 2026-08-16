// かまくらゲーム：Chromium スモークE2E
// ?fast=1 で必要回数・演出時間を短縮した高速モードを使い、
// 実際のポインタ操作で タイトル → 雪集め → ペタペタ → 掘り → 入る →
// 内部削り → ランタン → 暖色 → リビール → もう一回 の一周を検証する。
const { test, expect } = require('@playwright/test');

const URL = '/index.html?fast=1';

async function phase(page) {
  return page.evaluate(() => window.game && window.game.phase);
}
async function hint(page) {
  return page.evaluate(() => window.game.hint());
}
async function waitPhase(page, name, timeout = 15000) {
  await page.waitForFunction(
    n => window.game && window.game.phase === n,
    name,
    { timeout }
  );
}
async function tapAt(page, p) {
  await page.mouse.click(p.x, p.y);
}
async function dragAt(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function playOneLoop(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(URL);
  await page.waitForFunction(() => window.game && window.game.phase === 'title');

  // タイトル → 雪集め
  await tapAt(page, (await hint(page)).from);
  await waitPhase(page, 'gather');

  // 1) 雪を左右から中央へ（スワイプ）
  for (let i = 0; i < 20 && (await phase(page)) === 'gather'; i++) {
    const h = await hint(page);
    if (!h || h.type !== 'drag') break;
    await dragAt(page, h.from, h.to, 10);
    await page.waitForTimeout(350);
  }
  await waitPhase(page, 'pat');

  // 2) ペタペタ固める
  for (let i = 0; i < 12 && (await phase(page)) === 'pat'; i++) {
    const h = await hint(page);
    await tapAt(page, h.from);
    await page.waitForTimeout(120);
  }
  // 3) 正面へカメラ移動 → 掘り
  await waitPhase(page, 'dig');

  // 4) 入口を掘る
  for (let i = 0; i < 12 && (await phase(page)) === 'dig'; i++) {
    const h = await hint(page);
    await tapAt(page, h.from);
    await page.waitForTimeout(150);
  }
  await waitPhase(page, 'enter');
  const digs = await page.evaluate(() => window.game.digs);
  expect(digs).toBeGreaterThan(0);

  // 5) 穴をタップして中へ
  await tapAt(page, (await hint(page)).from);
  await waitPhase(page, 'goin');
  await waitPhase(page, 'carve');

  // 6) 内側の壁をなぞって広げる
  await page.waitForTimeout(400); // 導入フェードイン待ち
  for (let i = 0; i < 40 && (await phase(page)) === 'carve'; i++) {
    const h = await hint(page);
    if (!h) break;
    await dragAt(page, h.from, h.to, 8);
    await page.waitForTimeout(60);
  }
  await waitPhase(page, 'lantern');
  const carve = await page.evaluate(() => window.game.carve);
  expect(carve).toBeGreaterThan(0.3);

  // 7) ランタンをドラッグして設置
  for (let i = 0; i < 5 && (await phase(page)) === 'lantern'; i++) {
    const h = await hint(page);
    if (!h) break;
    await dragAt(page, h.from, h.to, 14);
    await page.waitForTimeout(200);
  }
  await waitPhase(page, 'glow');

  // 8) 青白 → 暖色チェンジ、外観リビール
  await waitPhase(page, 'reveal', 20000);
  const warm = await page.evaluate(() => window.game.warm);
  expect(warm).toBeGreaterThan(0.9);

  expect(errors).toEqual([]);
  return errors;
}

test('一周プレイ（縦向き iPhone レイアウト）', async ({ page }) => {
  await playOneLoop(page);
  // もう一回 → 雪集めに戻る
  await page.waitForTimeout(800);
  const h = await hint(page);
  await tapAt(page, h.from);
  await waitPhase(page, 'gather');
  const pushes = await page.evaluate(() => window.game.pushes);
  expect(pushes).toBe(0);
});

test('一周プレイ（横向き iPad レイアウト）', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await playOneLoop(page);
});

test('リサイズ後も描画が継続する', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => window.game && window.game.phase === 'title');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  const size = await page.evaluate(() => window.game.size);
  expect(size.w).toBe(844);
  const canvas = page.locator('#c');
  await expect(canvas).toBeVisible();
});
