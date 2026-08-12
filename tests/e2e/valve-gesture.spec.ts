// tests/e2e/valve-gesture.spec.ts
// A2 (clockwise circular pointer trajectory increases openness) and
// A3 (stopping the finger freezes openness/water) — MASTER_SPEC "指を止める
// → レンチ停止、水圧上昇も停止".
//
// Integration-dependent: requires window.__versailles (Wave 3). Skips
// gracefully with a clear reason until then.

import { test, expect } from '@playwright/test';
import { hasDebugApi, readDebug, type VersaillesDebug } from './helpers/debugApi';
import { synthesizeCircularDrag, synthesizeTap, releasePointer } from './helpers/gestures';

const SKIP_REASON =
  'window.__versailles debug API not present yet — this spec requires Wave 3 integration ' +
  '(Worker A src/game/debug.ts wired into main.ts). Pre-integration this is expected, not a failure.';

/** Taps through title/garden-idle/whistle-cue/valve-approach until valve-turn, or throws. */
async function reachValveTurn(page: import('@playwright/test').Page): Promise<VersaillesDebug> {
  await synthesizeTap(page, 0.5, 0.5); // title -> garden-idle (also unlocks audio)
  for (let i = 0; i < 80; i++) {
    const debug = await readDebug(page);
    if (debug.phase === 'valve-turn') return debug;
    if (debug.phase === 'whistle-cue') {
      const w = debug.hotspots.whistle ?? { x: 0.5, y: 0.16, r: 0.2 };
      await synthesizeTap(page, w.x, w.y);
    } else {
      await page.waitForTimeout(150);
    }
  }
  throw new Error('did not reach valve-turn phase within the retry budget');
}

test.describe('valve gesture (A2 / A3)', () => {
  test('A2: a clockwise circular drag increases openness', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    if (!(await hasDebugApi(page))) {
      test.skip(true, SKIP_REASON);
      return;
    }

    const before = await reachValveTurn(page);
    expect(before.phase).toBe('valve-turn');
    const opennessBefore = before.openness;

    const valve = before.hotspots.valve ?? { x: 0.5, y: 0.5, r: 0.2 };
    await synthesizeCircularDrag(page, {
      centerXNorm: valve.x,
      centerYNorm: valve.y,
      turns: 1,
      clockwise: true,
      stepDelayMs: 10,
    });

    const after = await readDebug(page);
    expect(
      after.openness,
      `expected openness to increase from ${opennessBefore} after a clockwise circular drag`,
    ).toBeGreaterThan(opennessBefore);
  });

  test('A3: openness (and downstream water state) freeze while the finger is held still', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    if (!(await hasDebugApi(page))) {
      test.skip(true, SKIP_REASON);
      return;
    }

    const start = await reachValveTurn(page);
    const valve = start.hotspots.valve ?? { x: 0.5, y: 0.5, r: 0.2 };

    // Partial rotation, then stop moving without releasing the pointer.
    await synthesizeCircularDrag(page, {
      centerXNorm: valve.x,
      centerYNorm: valve.y,
      turns: 0.4,
      clockwise: true,
      stepDelayMs: 10,
      release: false,
    });

    const mid = await readDebug(page);
    expect(mid.openness, 'partial rotation should have increased openness').toBeGreaterThan(
      start.openness,
    );

    // Hold still (no further pointermove) — MASTER_SPEC: wrench and water
    // pressure must stop; openness itself must not decrease either.
    await page.waitForTimeout(900);
    const afterHold = await readDebug(page);

    expect(afterHold.openness).toBeCloseTo(mid.openness, 5);
    expect(afterHold.waterProgress).toBeCloseTo(mid.waterProgress, 5);
    expect(afterHold.flowIntensity).toBeCloseTo(mid.flowIntensity, 5);

    await releasePointer(page);
  });
});
