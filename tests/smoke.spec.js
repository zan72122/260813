// スモークE2E：ジッパーを開くと物が落ちる、という中心動作鎖の検証
const { test, expect } = require('@playwright/test');

async function dragZipper(page, distance, steps = 22) {
  const hp = await page.evaluate(() => window.__game.handleScreen());
  await page.mouse.move(hp.x, hp.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const p = await page.evaluate(
      ([d, i, steps]) => {
        const g = window.__game;
        // 取っ手（スライダーの少し手前）を目標 z へ段階的に動かす
        const z = g.zStart + 1.7 - (d * i) / steps;
        const s = g.seamScreen(z);
        // わざと線から少し外す（自動補正の検証）
        return { x: s.x + (i % 2 ? 18 : -14), y: s.y };
      },
      [distance, i, steps]
    );
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

test('ジッパーを開くと最初の物が落ちる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  // 登場アニメが終わるまで少し待つ
  await page.waitForTimeout(1600);

  await dragZipper(page, 6.0);

  const openLen = await page.evaluate(() => window.__game.openLen());
  expect(openLen).toBeGreaterThan(3.5);

  // グラグラ→ガタン：しばらく待つと最初の物が床下に着地する
  await page.waitForFunction(
    () => window.__game.objects().some((o) => o.state === 'landed'),
    null,
    { timeout: 15000 }
  );

  const objs = await page.evaluate(() => window.__game.objects());
  const landed = objs.filter((o) => o.state === 'landed');
  expect(landed.length).toBeGreaterThan(0);
  expect(landed[0].y).toBeLessThan(-3);

  expect(errors).toEqual([]);
});

test('間違った方向へ引いても壊れない（閉じ方向は始端で止まる）', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  await page.waitForTimeout(1600);

  // 閉じ方向（手前）へ強く引く
  const hp = await page.evaluate(() => window.__game.handleScreen());
  await page.mouse.move(hp.x, hp.y);
  await page.mouse.down();
  await page.mouse.move(hp.x, Math.min(hp.y + 400, 830), { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();

  const openLen = await page.evaluate(() => window.__game.openLen());
  expect(openLen).toBeLessThan(0.1);

  // その後は普通に開けられる
  await dragZipper(page, 4.0);
  const openLen2 = await page.evaluate(() => window.__game.openLen());
  expect(openLen2).toBeGreaterThan(2.0);
});
