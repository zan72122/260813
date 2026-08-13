import { expect, test } from '@playwright/test';

import {
  BLEND_START_S,
  STATION_BOTTOM_S,
  STATION_TOP_S,
  THETA_LOWER_DEG,
} from '../../src/contracts/constants.ts';
import { DATA_TESTID } from '../../src/contracts/testing.ts';

import { gotoState, pressHold, readEiffel, readErrors, releasePointer, stepUntil, waitForSceneReady } from './helpers.ts';

test.describe('replay menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?det=1&seed=42');
    await waitForSceneReady(page);
  });

  test('all four replay tiles land on their documented target state and canonical position', async ({ page }) => {
    const cases: { readonly testid: string; readonly state: string; readonly cableTravel: number }[] = [
      { testid: DATA_TESTID.replayAgain, state: 'ascendLower', cableTravel: STATION_BOTTOM_S },
      { testid: DATA_TESTID.replayDescend, state: 'descend', cableTravel: STATION_TOP_S },
      { testid: DATA_TESTID.replayMachine, state: 'machineRoom', cableTravel: STATION_BOTTOM_S },
      { testid: DATA_TESTID.replayTransition, state: 'transition', cableTravel: BLEND_START_S },
    ];
    for (const { testid, state, cableTravel } of cases) {
      await gotoState(page, 'replayMenu');
      await page.getByTestId(testid).click();
      // gotoState() below just polls state; here we're clicking the DOM tile directly.
      await page.waitForFunction((expected: string) => window.__eiffel.state === expected, state);
      const r = await readEiffel(page);
      expect(r.state).toBe(state);
      expect(r.cableTravel).toBeCloseTo(cableTravel, 6);
    }
  });

  test('slope-change replay (replay-transition) is one tap from replayMenu and repeats cleanly on a second visit', async ({
    page,
  }) => {
    // PRODUCT_SPEC: "Slope-change replay must be reachable within 2 taps
    // from celebrate/replayMenu." celebrate -> replayMenu is automatic (0
    // taps); the tile itself is the other tap — 1 total, well inside the
    // budget. This test also proves it is safely repeatable: visiting the
    // tile a second time (a fresh replayMenu visit, as the real UI would
    // require since the tile is only shown in replayMenu) resets to the
    // exact same BLEND_START_S anchor rather than carrying forward drift
    // from the first ride (stateMachine.ts "transition-only-loop ... allow
    // instant repeat").
    await gotoState(page, 'replayMenu');
    await page.getByTestId(DATA_TESTID.replayTransition).click();
    await page.waitForFunction(() => window.__eiffel.state === 'transition');
    let r = await readEiffel(page);
    expect(r.cableTravel).toBeCloseTo(BLEND_START_S, 6);

    // Let the ride drift forward a bit so a stale position would be detectable.
    await page.evaluate((n: number) => window.__eiffel.step(n), 60);
    r = await readEiffel(page);
    expect(r.cableTravel).toBeGreaterThan(BLEND_START_S);

    // INTEGRATOR FIX (Wave 4): a real, reproducible race, not flakiness —
    // `EiffelUiLayer.wireReplayMenu` builds each tile's `TapGuard` ONCE at
    // construction (`createGuardedTrigger`, `TAP_GUARD_MIN_INTERVAL_MS` =
    // 350ms), so it tracks a single rolling `Date.now()` cooldown for the
    // tile's entire lifetime — never reset by leaving/re-entering
    // replayMenu (correct: that's what stops a bouncing sensor or an
    // over-eager double-tap on the SAME visit from double-firing). Every
    // step above this comment is pure JS/page.evaluate round-trips with no
    // real waiting, so on a fast/lightly-loaded run this whole sequence can
    // complete in under 350ms of WALL-CLOCK time — meaning the click just
    // below could land inside the first click's cooldown purely by
    // incidental test speed, get silently swallowed by the guard (exactly
    // as it should for a genuine same-visit double-tap), and then hang
    // forever on the `waitForFunction` below since `state` never reaches
    // 'transition'. A real player can never trigger this: reaching a
    // "second visit" means actually leaving replayMenu, riding, and coming
    // back, which takes far longer than 350ms. Waiting out the cooldown
    // here (there is no in-page condition to poll for it — the guard's
    // timer isn't exposed on `__eiffel`) makes this click a genuine
    // "second, distinct visit" tap instead of a race against the product's
    // own anti-bounce guard.
    await page.waitForTimeout(400);

    // Second visit: back to replayMenu, tap the tile again.
    await gotoState(page, 'replayMenu');
    await page.getByTestId(DATA_TESTID.replayTransition).click();
    await page.waitForFunction(() => window.__eiffel.state === 'transition');
    r = await readEiffel(page);
    expect(r.cableTravel).toBeCloseTo(BLEND_START_S, 6); // reset, not carried forward
    expect(Math.abs(r.cabinWorldTiltDeg)).toBeLessThanOrEqual(1e-6); // fresh, level start
  });

  test('replayAgain ("ride again") resets every readout to fresh start-of-ride values', async ({ page }) => {
    // Get the sim into a visibly non-fresh state first (mid machine-room drive).
    await gotoState(page, 'machineRoom');
    await page.evaluate(() => {
      window.__eiffel.gotoState('ascendUpper'); // any non-zero-position state
    });
    await page.waitForFunction(() => window.__eiffel.state === 'ascendUpper');
    const midRide = await readEiffel(page);
    expect(midRide.cableTravel).toBeGreaterThan(0);

    await gotoState(page, 'replayMenu');
    await page.getByTestId(DATA_TESTID.replayAgain).click();
    await page.waitForFunction(() => window.__eiffel.state === 'ascendLower');

    const fresh = await readEiffel(page);
    expect(fresh.state).toBe('ascendLower');
    expect(fresh.valveOpen).toBe(0);
    expect(fresh.speed).toBe(0);
    expect(fresh.pistonDisplacement).toBe(0);
    expect(fresh.cableTravel).toBe(0);
    expect(fresh.pulleyAngle).toBe(0);
    expect(fresh.cabinWorldTiltDeg).toBe(0);
    expect(fresh.trackTangentDeg).toBeCloseTo(THETA_LOWER_DEG, 9);
    expect(fresh.paused).toBe(false);
  });

  test('replayDescend rides all the way down to the bottom station', async ({ page }) => {
    await gotoState(page, 'replayMenu');
    await page.getByTestId(DATA_TESTID.replayDescend).click();
    await page.waitForFunction(() => window.__eiffel.state === 'descend');

    const start = await readEiffel(page);
    expect(start.cableTravel).toBeCloseTo(STATION_TOP_S, 6);

    const throttleDown = page.getByTestId('throttle-down');
    await pressHold(page, throttleDown);
    const arrived = await stepUntil(page, (ro) => ro.state === 'replayMenu', { chunk: 20, maxSteps: 3600 });
    await releasePointer(page);

    expect(arrived.cableTravel).toBeCloseTo(STATION_BOTTOM_S, 6);

    const errors = await readErrors(page);
    expect(errors).toEqual([]);
  });
});
