// スモークE2E：ポケットを開けると中身が飛び出す、という中心動作鎖の検証
const { test, expect } = require('@playwright/test');

async function waitReady(page) {
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__game.phase === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

// i番のポケットのスライダーを t0→t1 へドラッグ
async function dragPocket(page, i, t0, t1, steps = 14) {
  const tab = await page.evaluate((i) => window.__game.pocketTabScreen(i), i);
  await page.mouse.move(tab.x, tab.y);
  await page.mouse.down();
  for (let k = 0; k <= steps; k++) {
    const t = t0 + ((t1 - t0) * k) / steps;
    const p = await page.evaluate(([i, t]) => window.__game.pocketTrackScreen(i, t), [i, t]);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

// 出しやすい中身（クマ以外）が入ったおなかポケットを選ぶ
async function easyPocketIndex(page) {
  return page.evaluate(() => {
    const ps = window.__game.pockets();
    const p = ps.find((q) => !q.isMouth && q.content && q.need < 0.8);
    return p ? p.i : -1;
  });
}

test('ポケットを開けると中身が飛び出して床に落ちる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?e2e=1');
  await waitReady(page);

  const i = await easyPocketIndex(page);
  expect(i).toBeGreaterThanOrEqual(0);

  await dragPocket(page, i, 0.05, 1.0);

  // ムギュムギュ…からのポンッ！（少し待つ）
  await page.waitForFunction(
    () => window.__game.items().length > 0,
    null, { timeout: 8000 }
  );
  // 床に着地する
  await page.waitForFunction(
    () => window.__game.items().some((o) => o.state === 'floor'),
    null, { timeout: 12000 }
  );
  const items = await page.evaluate(() => window.__game.items());
  const onFloor = items.filter((o) => o.state === 'floor');
  expect(onFloor.length).toBeGreaterThan(0);
  expect(onFloor[0].y).toBeLessThan(1);

  expect(errors).toEqual([]);
});

test('少しだけ開けると のぞくだけで飛び出さない', async ({ page }) => {
  await page.goto('/?e2e=1');
  await waitReady(page);

  const i = await easyPocketIndex(page);
  await dragPocket(page, i, 0.05, 0.22, 8);
  await page.waitForTimeout(1500);

  const st = await page.evaluate((i) => {
    const p = window.__game.pockets()[i];
    return { state: p.state, content: p.content, items: window.__game.items().length };
  }, i);
  expect(st.content).not.toBeNull(); // まだ中にいる
  expect(st.items).toBe(0);          // 飛び出していない
});

test('逆方向へ引いても壊れない（閉じ側で止まる）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?e2e=1');
  await waitReady(page);

  const i = await easyPocketIndex(page);
  // t=0 からさらに閉じ方向へ引っぱる
  await dragPocket(page, i, 0.0, -0.5, 8);
  let t = await page.evaluate((i) => window.__game.pockets()[i].sliderT, i);
  expect(t).toBeLessThan(0.05);

  // その後は普通に開けられる
  await dragPocket(page, i, 0.05, 0.9);
  t = await page.evaluate((i) => window.__game.pockets()[i].sliderT, i);
  expect(t).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('口を開けると床の物を吸い込んで食べる', async ({ page }) => {
  await page.goto('/?e2e=1');
  await waitReady(page);
  await page.evaluate(() => window.__game.setTimeScale(2));

  // まず1つ飛び出させる
  const i = await easyPocketIndex(page);
  await dragPocket(page, i, 0.05, 1.0);
  await page.waitForFunction(
    () => window.__game.items().some((o) => o.state === 'floor' || o.state === 'air'),
    null, { timeout: 12000 }
  );

  // 口（メインジッパー）を全開に
  const mouthI = await page.evaluate(
    () => window.__game.pockets().findIndex((p) => p.isMouth)
  );
  await dragPocket(page, mouthI, 0.05, 1.0);

  // 吸い込まれて食べられる
  await page.waitForFunction(
    () => window.__game.eaten > 0,
    null, { timeout: 15000 }
  );
  const eaten = await page.evaluate(() => window.__game.eaten);
  expect(eaten).toBeGreaterThan(0);
});
