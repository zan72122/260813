import { expect, test, type Page } from '@playwright/test';

/**
 * iPhone / iPad 相当の画面で「ひととおり遊べるか」を確かめる煙テスト。
 * ゲーム側の window.__lab（決定論 API）を使い、論理時間を直接すすめる。
 */

const SHOTS = 'test-results/shots';

type Snapshot = {
  mode: string;
  model: string;
  force: number;
  progress: number;
  done: boolean;
  cleared: boolean[];
  weights: number;
  maxOrder: number;
  cells: number;
  zoom: number;
  camPhase: string;
  hint: { x: number; y: number };
};

async function boot(page: Page): Promise<void> {
  await page.goto('/?fast=1&seed=7');
  await page.waitForFunction(() => Boolean(window.__lab));
  await expect(page.locator('#stage')).toBeVisible();
}

const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => window.__lab!.snapshot() as unknown as Snapshot);

/** 論理時間を dt×n だけすすめる（実時間を待たない）。 */
const step = (page: Page, n: number, dt = 1 / 60): Promise<void> =>
  page.evaluate((a: { n: number; dt: number }) => window.__lab!.step(a.dt, a.n), { n, dt });

const holdAtHint = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const g = window.__lab!;
    const h = g.specimen.hint;
    g.pressAt(h.x, h.y);
  });
};

test.describe('ぎゅっと！にじちからラボ', () => {
  test('タイトル：さわらなくても「おすと虹が出る」が見えている', async ({ page }, info) => {
    await boot(page);
    // デモが1周してフリンジが立ち上がるまで
    await step(page, 110);
    const s = await snap(page);
    expect(s.mode).toBe('title');
    // 虹（フリンジ次数）が実際に出ている
    expect(s.maxOrder).toBeGreaterThan(1.5);
    await expect(page.getByRole('button', { name: 'ラボ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'チャレンジ' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-01-title.png` });
  });

  test('タイトルでも模型をさわればすぐ虹が出る（はじめの一回を待たせない）', async ({
    page,
  }) => {
    await boot(page);
    await step(page, 30);
    await holdAtHint(page);
    await step(page, 60);
    const s = await snap(page);
    expect(s.mode).toBe('title'); // さわってもいきなり画面は変わらない
    expect(s.force).toBeGreaterThan(0.8);
    expect(s.maxOrder).toBeGreaterThan(1.5);
  });

  test('ラボ：3つの模型すべてで、押すと虹が出る', async ({ page }, info) => {
    await boot(page);
    await page.getByRole('button', { name: 'ラボ' }).click();
    await step(page, 90); // 全景 → 接写

    for (const [i, name] of ['はし', 'アーチ', 'おはな'].entries()) {
      await page.getByRole('button', { name }).click();
      await step(page, 90);

      const before = await page.evaluate(() => {
        const g = window.__lab!;
        return g.orderAt(g.specimen.hint.x, g.specimen.hint.y + 30);
      });
      expect(before).toBeLessThan(0.2); // 押す前はまっ黒

      await holdAtHint(page);
      await step(page, 60);
      const after = await page.evaluate(() => {
        const g = window.__lab!;
        return g.orderAt(g.specimen.hint.x, g.specimen.hint.y + 30);
      });
      expect(after).toBeGreaterThan(1.0); // 押したら虹

      const s = await snap(page);
      expect(s.model).toBe(['bridge', 'arch', 'flower'][i]);
      await page.screenshot({ path: `${SHOTS}/${info.project.name}-02-lab-${s.model}.png` });

      await page.evaluate(() => window.__lab!.release());
      await step(page, 40);
    }
  });

  test('ラボ：おもりを置くと虹がのこる／支えを動かせる', async ({ page }, info) => {
    await boot(page);
    await page.getByRole('button', { name: 'ラボ' }).click();
    await page.getByRole('button', { name: 'はし' }).click();
    await step(page, 90);

    await page.getByRole('button', { name: 'おもり' }).click();
    await step(page, 120);
    let s = await snap(page);
    expect(s.weights).toBe(1);
    // 指を離していても、おもりの下には虹がのこる
    expect(s.maxOrder).toBeGreaterThan(1.0);

    // 支え（きょうきゃく）をドラッグして動かす
    const moved = await page.evaluate(() => {
      const g = window.__lab!;
      const a = g.specimen.anchors[0];
      const before = a.x;
      g.pressAt(a.x, (a.y + 720) / 2);
      g.movePress(before + 120, (a.y + 720) / 2);
      g.release();
      return { before, after: g.specimen.anchors[0].x };
    });
    expect(Math.abs(moved.after - moved.before)).toBeGreaterThan(50);

    await step(page, 60);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-03-lab-weight.png` });

    await page.getByRole('button', { name: 'はじめから' }).click();
    await step(page, 30);
    s = await snap(page);
    expect(s.weights).toBe(0);
  });

  test('チャレンジ1：くまさんが橋をわたる', async ({ page }, info) => {
    await boot(page);
    await page.getByRole('button', { name: 'チャレンジ' }).click();
    await page.getByRole('button', { name: 'くまさん' }).click();
    await step(page, 90);

    let s = await snap(page);
    expect(s.model).toBe('bridge');
    expect(s.progress).toBeLessThan(0.1);

    await holdAtHint(page);
    await step(page, 480); // 8秒ぶん押しつづける
    s = await snap(page);
    expect(s.done).toBe(true);
    expect(s.cleared[0]).toBe(true);
    await expect(page.locator('.overlay')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-04-bear-clear.png` });
  });

  test('チャレンジ2：アーチの足もとまで虹をとどける', async ({ page }, info) => {
    await boot(page);
    await page.getByRole('button', { name: 'チャレンジ' }).click();
    await page.getByRole('button', { name: 'にじの あし' }).click();
    await step(page, 90);

    await holdAtHint(page);
    await step(page, 300);
    const s = await snap(page);
    expect(s.model).toBe('arch');
    expect(s.done).toBe(true);
    expect(s.cleared[1]).toBe(true);
    await expect(page.locator('.overlay')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-05-arch-clear.png` });
  });

  test('チャレンジ3：おはなを大きく咲かせる', async ({ page }, info) => {
    await boot(page);
    await page.getByRole('button', { name: 'チャレンジ' }).click();
    await page.getByRole('button', { name: 'にじの おはな' }).click();
    await step(page, 90);

    await holdAtHint(page);
    await step(page, 300);
    const s = await snap(page);
    expect(s.model).toBe('flower');
    expect(s.done).toBe(true);
    expect(s.cleared[2]).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${info.project.name}-06-flower-clear.png` });

    // 「つぎ」ボタンで次のチャレンジへ進める
    await page.getByRole('button', { name: 'つぎ' }).click();
    await step(page, 60);
    expect((await snap(page)).mode).toBe('challenge');
  });

  test('自動カメラ：全景 → 接写 の順に見せる（自由カメラなし）', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'ラボ' }).click();
    await step(page, 6);
    const wide = await snap(page);
    expect(wide.camPhase).toBe('wide');
    await step(page, 180);
    const close = await snap(page);
    expect(close.camPhase).toBe('closeup');
    expect(close.zoom).toBeGreaterThan(wide.zoom); // ちゃんと寄っている
  });

  test('画面の外にボタンがはみ出さない（たて・よこ両対応）', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'チャレンジ' }).click();
    const vp = page.viewportSize()!;
    for (const btn of await page.locator('#hud button').all()) {
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
      // 4歳の指でも押せる大きさ
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(40);
    }
  });

  test('操作は一本指だけ：2本目の指は無視される', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'ラボ' }).click();
    await step(page, 90);
    const result = await page.evaluate(() => {
      const g = window.__lab!;
      const h = g.specimen.hint;
      g.pressAt(h.x, h.y);
      const first = { x: g.press.x, y: g.press.y };
      // 2本目の指に相当する pointerdown（別 pointerId）
      const c = g.canvas;
      c.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 99, clientX: 5, clientY: 5, bubbles: true }),
      );
      return { first, after: { x: g.press.x, y: g.press.y } };
    });
    expect(result.after).toEqual(result.first);
  });
});
