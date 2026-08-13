import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 4歳児が実際にたどる道すじを、そのまま一周する試遊テスト。
 * タイトル → いしをえらぶ → 顕微鏡 → にじスイッチ → くるくる → つぶをタッチ
 */

type GameState = {
  phase: string;
  mode: string;
  slide: string;
  polarOn: boolean;
  polarT: number;
  stageAngle: number;
  autoSpin: boolean;
  sparkles: number;
  questIndex: number;
  questTotal: number;
  grains: number;
  fieldR: number;
  portrait: boolean;
};

declare global {
  interface Window {
    __game: {
      state: () => GameState;
      skipIntro: () => void;
      setStageAngle: (a: number) => void;
      setPolar: (on: boolean) => void;
      solveCurrentTarget: () => boolean;
      tapAnySparkle: () => boolean;
      sampleColors: () => number[];
    };
  }
}

const SHOT_DIR = path.join(process.cwd(), 'screenshots');

async function shot(page: Page, name: string, projectName: string): Promise<void> {
  const dir = path.join(SHOT_DIR, projectName);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__game.state());
}

/**
 * 視野のまん中あたりのピクセルをそのまま持ってくる。
 * 平均色でくらべると「明るくなる粒」と「暗くなる粒」が打ち消しあうので、
 * ピクセルごとの差でくらべる。
 */
async function fieldPixels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const s = window.__game.state();
    const dpr = c.width / c.getBoundingClientRect().width;
    const r = Math.floor(s.fieldR * 0.5 * dpr);
    // 視野の中心は canvas 座標での中心とはかぎらないので、CSS 変数から拾う
    const cs = getComputedStyle(document.documentElement);
    const cx = Math.round(parseFloat(cs.getPropertyValue('--field-cx')) * dpr);
    const cy = Math.round(parseFloat(cs.getPropertyValue('--field-cy')) * dpr);
    const data = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
    // 粗く間引いて返す（転送量をおさえる）
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 4 * 7) {
      out.push(data[i], data[i + 1], data[i + 2]);
    }
    return out;
  });
}

/** ピクセルごとの平均的な色の差 */
function pixelGap(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 3) {
    sum += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
  }
  return sum / (n / 3);
}

async function openSlide(page: Page, slideId: string): Promise<void> {
  await page.getByTestId(`card-${slideId}`).click();
  await expect
    .poll(async () => (await state(page)).phase, { timeout: 10_000 })
    .toMatch(/enter|observe/);
  await page.evaluate(() => window.__game.skipIntro());
  await expect.poll(async () => (await state(page)).phase, { timeout: 10_000 }).toBe('observe');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?fast=1');
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
});

test('じゆうに みる: スイッチ → くるくる → きらきら', async ({ page }, info) => {
  const proj = info.project.name;

  // --- タイトル ---
  await expect(page.getByTestId('btn-free')).toBeVisible();
  await expect(page.getByTestId('btn-quest')).toBeVisible();
  await shot(page, '01-title', proj);

  // --- いしをえらぶ ---
  await page.getByTestId('btn-free').click();
  await expect(page.getByTestId('slide-cards')).toBeVisible();
  // 薄片は3種類いじょう
  await expect(page.locator('.card')).toHaveCount(4);
  await shot(page, '02-select', proj);

  // --- 顕微鏡の外観と自動カメラ ---
  await page.getByTestId('card-niji').click();
  await expect.poll(async () => (await state(page)).phase).toBe('enter');
  await page.waitForTimeout(450);
  await shot(page, '03-microscope', proj);
  await page.evaluate(() => window.__game.skipIntro());
  await expect.poll(async () => (await state(page)).phase, { timeout: 10_000 }).toBe('observe');

  const s0 = await state(page);
  expect(s0.grains).toBeGreaterThan(50);
  expect(s0.polarOn).toBe(false);

  // --- 偏光オフ: じみな見た目 ---
  await page.waitForTimeout(200);
  const plain = await fieldPixels(page);
  await shot(page, '04-observe-plain', proj);

  // --- にじスイッチ ---
  await page.getByTestId('btn-polar').click();
  await expect.poll(async () => (await state(page)).polarT, { timeout: 5_000 }).toBe(1);
  await page.waitForTimeout(120);
  const rainbow = await fieldPixels(page);
  await shot(page, '05-observe-polarized', proj);

  // スイッチを入れると見た目ががらっと変わる
  expect(pixelGap(plain, rainbow)).toBeGreaterThan(45);

  // --- ゆびで くるくる まわす ---
  const box = (await page.locator('#stage').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = s0.fieldR * 0.6;
  const before = await state(page);
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.9;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  await page.mouse.up();
  const after = await state(page);
  expect(Math.abs(after.stageAngle - before.stageAngle)).toBeGreaterThan(1.0);

  // 回すと粒の色が変わる
  await page.evaluate(() => window.__game.setStageAngle(0));
  await page.waitForTimeout(80);
  const angleA = await fieldPixels(page);
  await page.evaluate(() => window.__game.setStageAngle(Math.PI / 4));
  await page.waitForTimeout(80);
  const angleB = await fieldPixels(page);
  expect(pixelGap(angleA, angleB)).toBeGreaterThan(25);
  await shot(page, '06-rotated', proj);

  // --- くるくるボタン（じどうで まわる） ---
  await page.getByTestId('btn-spin').click();
  await expect.poll(async () => (await state(page)).autoSpin).toBe(true);
  const spinA = (await state(page)).stageAngle;
  await page.waitForTimeout(600);
  expect((await state(page)).stageAngle).not.toBe(spinA);
  await page.getByTestId('btn-spin').click();

  // --- ひかる つぶを タッチ ---
  expect(await page.evaluate(() => window.__game.tapAnySparkle())).toBe(true);
  await expect(page.getByTestId('free-count')).toHaveText('1');
  await shot(page, '07-sparkle-found', proj);

  // --- おうちボタンで もどれる ---
  await page.getByTestId('btn-home').click();
  await expect.poll(async () => (await state(page)).phase, { timeout: 5_000 }).toBe('select');
});

test('さがしもの: 3つ みつけて クリア', async ({ page }, info) => {
  const proj = info.project.name;

  await page.getByTestId('btn-quest').click();
  await expect(page.getByTestId('slide-cards')).toBeVisible();
  await openSlide(page, 'hoshizora');

  const s = await state(page);
  expect(s.mode).toBe('quest');
  expect(s.questTotal).toBe(3);

  // お題の色が出ている
  await expect(page.getByTestId('quest-swatch')).toBeVisible();
  await expect(page.getByTestId('quest-stars')).toHaveText('☆☆☆');
  await shot(page, '08-quest-start', proj);

  // 偏光オフのままだと、色さがしは はじまらない（スイッチに気づかせる導線）
  await page.evaluate(() => window.__game.solveCurrentTarget());
  expect((await state(page)).questIndex).toBe(0);
  await expect(page.getByTestId('coach')).toBeVisible();

  await page.getByTestId('btn-polar').click();
  await expect.poll(async () => (await state(page)).polarT, { timeout: 5_000 }).toBe(1);

  for (let i = 0; i < 3; i++) {
    expect(await page.evaluate(() => window.__game.solveCurrentTarget())).toBe(true);
    await expect
      .poll(async () => (await state(page)).questIndex, { timeout: 5_000 })
      .toBe(i + 1);
    await page.waitForTimeout(700);
  }

  await expect(page.getByTestId('clear-title')).toBeVisible({ timeout: 6_000 });
  await shot(page, '09-clear', proj);

  // もういちど / ほかのいし で つづけられる
  await page.getByTestId('btn-other').click();
  await expect(page.getByTestId('slide-cards')).toBeVisible();
  // クリアした いし に ほしが つく
  await expect(page.locator('[data-testid="card-hoshizora"] .card-stars')).toHaveText('⭐⭐⭐');
  await shot(page, '10-select-cleared', proj);
});

test('あそんでいる とちゅうで 画面を まわしても つづけられる', async ({ page }) => {
  await page.getByTestId('btn-free').click();
  await openSlide(page, 'niji');
  await page.getByTestId('btn-polar').click();
  await expect.poll(async () => (await state(page)).polarT, { timeout: 5_000 }).toBe(1);

  const before = await state(page);
  const wasPortrait = before.portrait;

  // たて ⇄ よこ を ひっくりかえす
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(500);

  const after = await state(page);
  expect(after.phase).toBe('observe');
  expect(after.portrait).toBe(!wasPortrait);
  // 視野は つぶれず、じゅうぶんな大きさで のこっている
  expect(after.fieldR).toBeGreaterThan(90);
  // にじいろは ついたまま
  expect(after.polarOn).toBe(true);

  // canvas は 画面いっぱいのまま（すきまが出ない）
  const gap = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return {
      dx: r.x,
      dy: r.y,
      dw: Math.abs(r.width - window.innerWidth),
      dh: Math.abs(r.height - window.innerHeight),
    };
  });
  expect(gap).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });

  // まわしても ちゃんと 色が変わる
  await page.evaluate(() => window.__game.setStageAngle(0));
  await page.waitForTimeout(90);
  const a = await fieldPixels(page);
  await page.evaluate(() => window.__game.setStageAngle(Math.PI / 4));
  await page.waitForTimeout(90);
  expect(pixelGap(a, await fieldPixels(page))).toBeGreaterThan(20);
});

test('どの薄片でも 回すと色が変わる', async ({ page }) => {
  await page.getByTestId('btn-free').click();
  for (const id of ['kori', 'niji', 'hoshizora', 'tamago']) {
    await openSlide(page, id);
    await page.evaluate(() => window.__game.setPolar(true));
    await page.evaluate(() => window.__game.setStageAngle(0));
    await page.waitForTimeout(90);
    const a = await fieldPixels(page);
    await page.evaluate(() => window.__game.setStageAngle(Math.PI / 4));
    await page.waitForTimeout(90);
    const b = await fieldPixels(page);
    expect(pixelGap(a, b), `${id} は回しても色が変わらない`).toBeGreaterThan(20);

    await page.getByTestId('btn-home').click();
    await expect.poll(async () => (await page.evaluate(() => window.__game.state())).phase, {
      timeout: 5_000,
    }).toBe('select');
  }
});
