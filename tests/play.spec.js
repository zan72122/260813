// iPhone 縦横・iPad 縦横の 4 通りで、遊びの一周が最後まで通ることを確かめる。
//
// 確かめるのは次の因果：
//   水門をあける → 水が流れる → 池が満ちる → 色が濃くなる → 全面ピンクの俯瞰 → もういちど
//
// 注意：ここでの描画は SwiftShader（ソフトウェア）なので、
// フレームレート・アニメーションの滑らかさ・最終的な絵の品質は判定しない。
// 判定するのは、進行・状態・水位・塩分濃度といった数値と、画面の描画が成立すること。
import { test, expect } from '@playwright/test';

const SCREENS = {
  'iPhone 縦': { width: 390, height: 844 },
  'iPhone 横': { width: 844, height: 390 },
  'iPad 縦': { width: 820, height: 1180 },
  'iPad 横': { width: 1180, height: 820 },
};

const state = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    return {
      phase: g.phase,
      evap: g.evap,
      reveal: g.reveal,
      gateIndex: g.gateIndex,
      gatesOpen: g.world.gates.map((x) => +x.open.toFixed(2)),
      levels: g.world.ponds.map((p) => +p.level.toFixed(3)),
      floor: g.world.ponds.map((p) => p.def.full),
      salinity: g.world.ponds.map((p) => +p.salinity.toFixed(3)),
      camY: +g.camera.position.y.toFixed(1),
      replayVisible: g.replay.opacity > 0.5,
    };
  });

async function waitPhase(page, want, timeout = 90_000) {
  await page.waitForFunction(
    (w) => (Array.isArray(w) ? w : [w]).includes(window.__game.phase),
    want,
    { timeout }
  );
}

async function tap(page, vp, fx = 0.5, fy = 0.55) {
  await page.mouse.move(vp.width * fx, vp.height * fy);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
}

async function swipe(page, vp) {
  await page.mouse.move(vp.width * 0.2, vp.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(vp.width * (0.2 + 0.07 * i), vp.height * 0.6);
    await page.waitForTimeout(22);
  }
  await page.mouse.up();
}

for (const [name, vp] of Object.entries(SCREENS)) {
  test(`${name}：水門から全面ピンクの俯瞰、そして再プレイまで一周できる`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
    });

    await page.setViewportSize(vp);
    await page.goto('/');
    await page.waitForFunction(() => window.__game && window.__game.world, null, {
      timeout: 90_000,
    });

    // 読み込み画面が外れて、3D が出ている
    await expect(page.locator('#boot')).toHaveClass(/gone/, { timeout: 60_000 });
    await expect(page.locator('#fallback')).toBeHidden();

    // --- 空の池から始まる -------------------------------------------------
    const start = await state(page);
    expect(start.phase).toBe('intro');
    for (const lv of start.levels) expect(lv).toBeLessThan(-0.6);

    // --- 3 つの水門をあけて、池を順に満たす -------------------------------
    for (let i = 0; i < 3; i++) {
      await waitPhase(page, 'gate');
      const before = await state(page);
      expect(before.gateIndex).toBe(i);

      await tap(page, vp);

      // 板が上がる
      await page.waitForFunction((n) => window.__game.world.gates[n].open > 0.5, i, {
        timeout: 30_000,
      });
      // 水が入って池が満ちる
      await page.waitForFunction(
        (n) => {
          const g = window.__game;
          const p = g.world.pondById[g.world.gates[n].def.dest];
          return p.level > p.def.full - 0.02;
        },
        i,
        { timeout: 60_000 }
      );
    }

    // 3 つとも満ちていて、うっすら色がついている
    const filled = await state(page);
    for (let i = 0; i < 3; i++) {
      expect(filled.levels[i]).toBeGreaterThan(filled.floor[i] - 0.05);
      expect(filled.salinity[i]).toBeGreaterThan(0.12);
      expect(filled.salinity[i]).toBeLessThan(0.62); // まだ「うっすらピンク」
    }

    // --- 太陽：触るほど水が減り、色が濃くなる -----------------------------
    await waitPhase(page, 'sun');
    const beforeSun = await state(page);
    for (let i = 0; i < 3; i++) await tap(page, vp, 0.5, 0.3);
    await page.waitForFunction((e) => window.__game.evap > e + 0.4, beforeSun.evap, {
      timeout: 40_000,
    });

    // --- 風：なぞるとさらに濃くなる ---------------------------------------
    await waitPhase(page, 'wind', 60_000);
    for (let i = 0; i < 2; i++) {
      await swipe(page, vp);
      await page.waitForTimeout(400);
    }

    // --- クライマックス：高い俯瞰へ上がり、ピンクが広がる ------------------
    await waitPhase(page, ['climax', 'finale'], 90_000);
    await page.waitForFunction(() => window.__game.reveal > 0.8, null, { timeout: 90_000 });
    await waitPhase(page, 'finale', 90_000);

    const climax = await state(page);
    // 水は減り、塩分は濃くなっている（＝ピンクになる理由が成立している）
    expect(climax.evap).toBeGreaterThan(0.9);
    for (let i = 0; i < 3; i++) {
      expect(climax.levels[i]).toBeLessThan(beforeSun.levels[i] - 0.05);
      expect(climax.salinity[i]).toBeGreaterThan(0.8);
    }
    // ぐっと高い視点に切り替わっている
    expect(climax.camY).toBeGreaterThan(20);
    // 遠景の塩田までピンクが行き渡っている
    expect(climax.reveal).toBeGreaterThan(0.8);

    // --- もういちど遊ぶ ----------------------------------------------------
    await page.waitForFunction(() => window.__game.replay.opacity > 0.7, null, {
      timeout: 40_000,
    });
    await tap(page, vp, 0.5, 0.86);
    await waitPhase(page, 'intro', 30_000);

    const again = await state(page);
    expect(again.gateIndex).toBe(0);
    expect(again.evap).toBe(0);
    for (const lv of again.levels) expect(lv).toBeLessThan(-0.6);
    for (const o of again.gatesOpen) expect(o).toBeLessThan(0.05);

    expect(errors).toEqual([]);
  });
}

test('画面が回転しても構図が壊れない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90_000 });

  const readFrame = () =>
    page.evaluate(() => {
      const g = window.__game;
      return {
        aspect: +g.camera.aspect.toFixed(3),
        w: g.renderer.domElement.width,
        h: g.renderer.domElement.height,
        camY: +g.camera.position.y.toFixed(2),
      };
    });

  const portrait = await readFrame();
  expect(portrait.aspect).toBeLessThan(1);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const landscape = await readFrame();

  expect(landscape.aspect).toBeGreaterThan(1);
  // 横向きでは横が入りやすいので、カメラは近づく（＝高さが下がる）
  expect(landscape.camY).toBeLessThan(portrait.camY);
  expect(landscape.w).toBeGreaterThan(landscape.h);
});

test('二本目の指は無視される（一指だけで遊ぶ）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__game.phase === 'gate', null, { timeout: 60_000 });

  // 2 本の指を同時に置いても、扱われるのは最初の 1 本だけ
  const tracked = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const mk = (type, id, x, y) =>
      c.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        })
      );
    mk('pointerdown', 1, 100, 400);
    const first = window.__game.touch.id;
    mk('pointerdown', 2, 300, 500);
    const afterSecond = window.__game.touch.id;
    mk('pointerup', 2, 300, 500);
    const afterSecondUp = window.__game.touch.id;
    mk('pointerup', 1, 100, 400);
    return { first, afterSecond, afterSecondUp, final: window.__game.touch.id };
  });

  expect(tracked.first).toBe(1);
  expect(tracked.afterSecond).toBe(1);
  expect(tracked.afterSecondUp).toBe(1);
  expect(tracked.final).toBeNull();
});
