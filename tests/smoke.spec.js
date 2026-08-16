// スモークE2E: 固有動作鎖ぜんぶ —
// 重ねる → 潰す → 厚いと通れない → ぺちゃんこなら通る → 離すとポン → お届け → ステージ進行
import { test, expect } from '@playwright/test';

const tick = (page, ms) => page.evaluate(m => window.__PF.tick(m), ms);
const state = page => page.evaluate(() => window.__PF.state());

async function setup(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__PF && window.__PF.ready);
  await tick(page, 800); // ポップイン完了
  return errors;
}

test('固有動作鎖: 潰す→運ぶ→通す→ポン→お届け', async ({ page }) => {
  const errors = await setup(page);
  let s = await state(page);
  expect(s.stage).toBe(0);
  expect(s.things.filter(t => t.isTarget).length).toBeGreaterThanOrEqual(3);

  const cushion = s.things.find(t => t.kind === 'cushion');
  expect(cushion.height).toBeGreaterThan(0.4); // まだ立体

  // 1) フィールドを重ねて押さえる → ギューッと潰れはじめる
  await page.evaluate(c => window.__PF.down(c.x, c.z), cushion);
  await tick(page, 700);
  s = await state(page);
  expect(s.captured).toBe(cushion.id);
  const midSquash = s.things.find(t => t.id === cushion.id).squash;
  expect(midSquash).toBeGreaterThan(0.1);
  expect(midSquash).toBeLessThan(0.95);

  // 2) まだ厚いうちに壁へ押し込む → 通れない（因果の前半）
  await page.evaluate(() => window.__PF.move(0, -2.5));
  await tick(page, 600);
  s = await state(page);
  const blocked = s.things.find(t => t.id === cushion.id);
  expect(blocked.z).toBeGreaterThan(0.2); // 壁の手前で止まる

  // 3) 押さえ続ける → 完全にぺちゃんこ（動かすと潰れが進みにくいので静止させる）
  await page.evaluate(b => window.__PF.move(b.x, b.z + 0.01), blocked);
  await tick(page, 2600);
  s = await state(page);
  const flat = s.things.find(t => t.id === cushion.id);
  expect(flat.squash).toBeGreaterThanOrEqual(0.97);
  expect(flat.height).toBeLessThanOrEqual(0.15); // 紙のように薄い

  // 4) 隙間へ → スルッと通る（低い横視点カメラになる）
  await page.evaluate(() => window.__PF.move(0, -0.5));
  await tick(page, 900);
  s = await state(page);
  expect(s.camMode).toBe('gap');
  await page.evaluate(() => window.__PF.move(0, -3.6));
  await tick(page, 1600);
  s = await state(page);
  expect(s.things.find(t => t.id === cushion.id).z).toBeLessThan(-1.0); // 向こう側

  // 5) 指を離す → ポン！と復元 → お届け完了
  await page.evaluate(() => window.__PF.up());
  await tick(page, 1800);
  s = await state(page);
  const done = s.things.find(t => t.id === cushion.id);
  expect(done.squash).toBe(0);
  expect(done.height).toBeGreaterThan(0.4); // 元の立体に戻った
  expect(done.delivered).toBe(true);

  expect(errors).toEqual([]);
});

test('ステージ進行: 全ターゲットお届けでフィールドが成長する', async ({ page }) => {
  const errors = await setup(page);
  let s = await state(page);
  const r0 = s.fieldRadius;

  for (const target of s.things.filter(t => t.isTarget)) {
    await page.evaluate(c => window.__PF.down(c.x, c.z), target);
    await tick(page, 3200); // その場でぺちゃんこまで
    // 隙間位置(x=0)へ寄せてから向こう側へ
    await page.evaluate(() => window.__PF.move(0, 1.2));
    await tick(page, 900);
    await page.evaluate(() => window.__PF.move(0, -3.8));
    await tick(page, 1800);
    await page.evaluate(() => window.__PF.up());
    await tick(page, 1600);
  }
  s = await state(page);
  expect(s.things.filter(t => t.isTarget).every(t => t.delivered)).toBe(true);
  expect(s.mode).toBe('clear');

  await tick(page, 3000); // クリア演出 → 次ステージ
  s = await state(page);
  expect(s.stage).toBe(1);
  expect(s.fieldRadius).toBeGreaterThan(r0); // フィールドが成長

  expect(errors).toEqual([]);
});

test('縦横どちらでもクラッシュしない', async ({ page }) => {
  const errors = await setup(page);
  await page.setViewportSize({ width: 844, height: 390 }); // 横向き
  await tick(page, 500);
  await page.setViewportSize({ width: 390, height: 844 }); // 縦向き
  await tick(page, 500);
  const s = await state(page);
  expect(s.stage).toBe(0);
  expect(errors).toEqual([]);
});
