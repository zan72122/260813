// スモークE2E：長いジッパーを開けると物が落ちる／枝の選択・平行線で結果が分岐する
const { test, expect } = require('@playwright/test');

async function waitReady(page) {
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__game.phase === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(1700); // 登場アニメ待ち
}

// トラックiの取っ手から、ワールド座標の経由点列に沿ってドラッグ
async function dragAlong(page, ti, waypoints, stepsPerLeg = 10) {
  const tr = (await page.evaluate(() => window.__game.tracks()))[ti];
  await page.mouse.move(tr.handle.x, tr.handle.y);
  await page.mouse.down();
  let prev = null;
  for (const [wx, wz] of waypoints) {
    const from = prev || [wx, wz];
    for (let k = 1; k <= stepsPerLeg; k++) {
      const x = from[0] + ((wx - from[0]) * k) / stepsPerLeg;
      const z = from[1] + ((wz - from[1]) * k) / stepsPerLeg;
      const p = await page.evaluate(([x, y, z]) => window.__game.screenAt(x, y, z), [x, tr.slabY + 0.3, z]);
      await page.mouse.move(
        Math.max(2, Math.min(p.x, 9998)),
        Math.max(2, Math.min(p.y, 9998)),
        { steps: 2 }
      );
      await page.waitForTimeout(28);
    }
    prev = [wx, wz];
  }
  await page.waitForTimeout(600); // スライダーが指に追いつくのを待つ
  await page.mouse.up();
}

test('R1: 長いジッパーを開けると物がグラッ→ガタンと床下へ落ちる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?e2e=1');
  await waitReady(page);

  // 取っ手はスライダーの1.4手前にあるぶん、終端より先まで引く
  await dragAlong(page, 0, [[0, 2.0], [0, -4.0]], 14);

  const open = await page.evaluate(() => window.__game.tracks()[0].openLen);
  expect(open).toBeGreaterThan(4);

  await page.waitForFunction(
    () => window.__game.props().some((o) => o.state === 'landed'),
    null, { timeout: 15000 }
  );
  const landed = (await page.evaluate(() => window.__game.props())).filter((o) => o.state === 'landed');
  expect(landed.length).toBeGreaterThan(0);
  expect(landed[0].y).toBeLessThan(-3);
  expect(errors).toEqual([]);
});

test('R2: 分岐で左の枝を選ぶと左の物だけ落ちる', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  await page.evaluate(() => window.__game.gotoRound(1));
  await waitReady(page);

  // 幹線(0,7.6)→(0,1.2)→左枝(-4.6,-6.4)の先までステア（取っ手ぶんの余裕をとる）
  await dragAlong(page, 0, [[0, 3.0], [0, 1.2], [-4.6, -6.4], [-5.6, -8.1]], 12);

  // 左枝中間の物（x<0）はやがて落ち、右枝の物（x>2）は落ちない
  await page.waitForFunction(
    () => window.__game.props().some((o) => o.x < -1 && (o.state === 'fall' || o.state === 'landed')),
    null, { timeout: 15000 }
  );
  await page.waitForTimeout(2500);
  const ps = await page.evaluate(() => window.__game.props());
  const rightMoved = ps.filter((o) => o.x > 1.5 && (o.state === 'fall' || o.state === 'landed'));
  expect(rightMoved.length).toBe(0); // 右の枝はまだ閉じている
});

test('R3: 平行線。片線でベンチは傾くだけ、両線で落ちる', async ({ page }) => {
  test.setTimeout(150000); // 2本の長いドラッグ＋落下待ちで時間がかかる
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 15000 });
  await page.evaluate(() => window.__game.gotoRound(2));
  await waitReady(page);

  // 左線（track 0）を全開
  await dragAlong(page, 0, [[-2.2, 2.0], [-2.2, -11.0]], 16);
  await page.waitForTimeout(3500);

  let ps = await page.evaluate(() => window.__game.props());
  const bench1 = ps.find((o) => o.type === 'bench' && o.z > 0);
  expect(bench1).toBeTruthy();
  // ベンチは片線では落ちない（rest/wobble/criticalのまま）
  expect(['rest', 'wobble', 'critical']).toContain(bench1.state);
  // 左線上のボールは落ちる
  const ball = ps.find((o) => o.type === 'ball');
  expect(['fall', 'landed']).toContain(ball.state);

  // 右線（track 1）も全開 → ベンチが落ちる
  await dragAlong(page, 1, [[2.2, 2.0], [2.2, -11.0]], 16);
  await page.waitForFunction(
    () => {
      const b = window.__game.props().find((o) => o.type === 'bench' && (o.state === 'fall' || o.state === 'landed'));
      return !!b;
    },
    null, { timeout: 25000 }
  );
});

test('逆方向へ引いても壊れない', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?e2e=1');
  await waitReady(page);

  // 始端よりさらに手前（+z）へ引く
  await dragAlong(page, 0, [[0, 9.8]], 8);
  let open = await page.evaluate(() => window.__game.tracks()[0].openLen);
  expect(open).toBeLessThan(0.1);

  // その後は普通に開けられる
  await dragAlong(page, 0, [[0, 1.0]], 12);
  open = await page.evaluate(() => window.__game.tracks()[0].openLen);
  expect(open).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
