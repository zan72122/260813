// tests/e2e/qa-screens.spec.ts — captures the 5 committed QA deliverable
// screenshots per viewport project, driving REAL gameplay via real pointer
// gestures at real anchor positions (never setPhase/dispatch, so what's on
// screen is exactly what a real playthrough would show). Every capture
// waits for settled() + a nonzero drawCalls so nothing is a blank frame.
// Saved to artifacts/qa/<project-name>/*.png, seed=42, deterministic.

import { expect, test } from '@playwright/test';
import {
  bootToOpening,
  collectConsoleErrors,
  dragGesture,
  driveAlignToSnap,
  driveBoltsToSeated,
  driveHookDownToAttached,
  driveRivetCarryToDone,
  driveRivetHeatToDone,
  driveRivetInsert,
  driveSlingToReleased,
  getAnchor,
  getState,
  tapGesture,
  waitForNonzeroDrawCalls,
  waitForPhase,
  waitForSettled,
} from './helpers';

// page.screenshot()'s own action timeout defaults to playwright.config.ts's
// global `actionTimeout: 10_000` -- fine in isolation, but under heavy
// 2-worker CI contention (this spec now shares the pool with leak.spec.ts's
// heavier real-gesture pass) a screenshot can occasionally need the renderer
// to actually produce a fresh, CPU-starved swiftshader frame in that window,
// which observed failing at exactly the 10s mark on tablet viewports.
// Widen just this action's timeout (not the global config, which is outside
// this file's scope) rather than the test's overall test.setTimeout budget,
// which governs something different (total wall-clock, not one action).
const SCREENSHOT_TIMEOUT_MS = 30_000;

async function captureShot(page: import('@playwright/test').Page, path: string): Promise<void> {
  await waitForSettled(page, 15_000);
  await waitForNonzeroDrawCalls(page, 15_000);
  await page.screenshot({ path, timeout: SCREENSHOT_TIMEOUT_MS });
}

/**
 * Like captureShot, but for moments where the camera is actively tracking a
 * continuously-moving subject (src/render/camera.ts's climb cue follows
 * craneBase/craneTop, which keep moving every frame for as long as
 * climb.progress is climbing) -- in that steady state the exponential-
 * smoothing camera never closes to within isSettled()'s tight epsilon (the
 * lag is proportional to the subject's velocity, not to elapsed time), so
 * waiting for settled() here would wait forever by design, not by bug. This
 * still waits out the *initial* cue-transition-in (the real, unavoidable,
 * ×0.25-scaled camera ease duration -- same category of pacing wait as the
 * hammer-tap debounce in helpers.ts) before capturing, so the shot isn't
 * taken mid-transition from the previous camera cue either.
 */
async function captureShotWhileTracking(page: import('@playwright/test').Page, path: string): Promise<void> {
  await waitForNonzeroDrawCalls(page, 15_000);
  await page.waitForTimeout(500);
  await page.screenshot({ path, timeout: SCREENSHOT_TIMEOUT_MS });
}

test.describe('qa-screens', () => {
  test('capture opening / hoist / rivet-macro / crane-climb / completion', async ({ page }, testInfo) => {
    // 150s was tight on tablet viewports under 2-worker CI contention (a
    // full real-gesture playthrough plus 5 screenshots) even before
    // leak.spec.ts grew a second, heavier real-gesture pass (see its own
    // comments) that adds to the shared CPU load during a full `verify`
    // run; observed hitting this ceiling on tablet-portrait. Widen for
    // headroom -- the work itself hasn't gotten slower, the contention has.
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);
    const vp = testInfo.project.use.viewport ?? { width: 390, height: 844 };
    const outDir = `artifacts/qa/${testInfo.project.name}`;

    await bootToOpening(page, { seed: '42' });

    // ---- opening.png: the establish shot ----
    await waitForPhase(page, 'opening', 20000);
    await captureShot(page, `${outDir}/opening.png`);

    await waitForPhase(page, 'hookDown', 20000);
    await driveHookDownToAttached(page, vp);
    await waitForPhase(page, 'hoist', 20000);

    // ---- hoist.png: load mid-air with sway -- a few quick upward flicks to
    // build pendulum amplitude, captured before height reaches 1 so the
    // load is still clearly mid-hoist, not yet at the top. ----
    for (let i = 0; i < 3; i += 1) {
      const s = await getState(page);
      if (s.phase !== 'hoist' || s.hoist.height >= 0.85) break;
      await dragGesture(page, vp.width / 2, vp.height * 0.62, vp.width / 2, vp.height * 0.3, 4);
    }
    await captureShot(page, `${outDir}/hoist.png`);

    // Finish hoisting, then continue the loop through align/bolts/rivetHeat.
    for (let i = 0; i < 25; i += 1) {
      if ((await getState(page)).phase !== 'hoist') break;
      await dragGesture(page, vp.width / 2, vp.height * 0.64, vp.width / 2, vp.height * 0.3, 8);
    }
    await waitForPhase(page, 'align', 20000);
    await driveAlignToSnap(page);
    await waitForPhase(page, 'bolts', 20000);
    await driveBoltsToSeated(page);
    await waitForPhase(page, 'rivetHeat', 20000);
    await driveRivetHeatToDone(page);
    await waitForPhase(page, 'rivetCarry', 20000);
    await driveRivetCarryToDone(page);
    await waitForPhase(page, 'rivetInsert', 20000);
    await driveRivetInsert(page);
    await waitForPhase(page, 'rivetHammer', 20000);

    // ---- rivet-macro.png: glowing rivet mid-hammer (1 hit landed, not yet
    // cooled/formed) -- the hot color transition is most visible here. ----
    {
      const hammerSpot = await getAnchor(page, 'hammerSpot');
      await tapGesture(page, hammerSpot.x, hammerSpot.y);
      await page.waitForFunction(
        () => window.__game !== undefined && window.__game.getState().rivet.hits >= 1,
        undefined,
        { timeout: 10_000 },
      );
    }
    await captureShot(page, `${outDir}/rivet-macro.png`);

    // Finish hammering (debounce-paced -- see helpers.ts's comment on this).
    for (let i = 0; i < 5; i += 1) {
      if ((await getState(page)).phase !== 'rivetHammer') break;
      const hammerSpot = await getAnchor(page, 'hammerSpot');
      await tapGesture(page, hammerSpot.x, hammerSpot.y);
      await page.waitForTimeout(260);
    }
    await waitForPhase(page, 'rivetCool', 20000);
    await waitForPhase(page, 'sling', 20000);
    await driveSlingToReleased(page);
    await waitForPhase(page, 'climb', 20000);

    // ---- crane-climb.png: mid-climb, low side camera, steam visible. One
    // partial lever drag (not full-range) so we land mid-progress rather
    // than immediately locking. ----
    {
      const lever = await getAnchor(page, 'climbLever');
      const y0 = Math.min(vp.height - 5, lever.y + 90);
      const y1 = Math.max(5, lever.y - 40);
      await dragGesture(page, lever.x, y0, lever.x, y1, 8);
      await page.waitForFunction(
        () => window.__game !== undefined && window.__game.getState().climb.progress > 0.15,
        undefined,
        { timeout: 15_000 },
      );
    }
    await captureShotWhileTracking(page, `${outDir}/crane-climb.png`);

    // Finish the climb (full-range drag, then let it autonomously lock).
    {
      const lever = await getAnchor(page, 'climbLever');
      const y0 = Math.min(vp.height - 5, lever.y + 140);
      const y1 = Math.max(5, lever.y - 140);
      await dragGesture(page, lever.x, y0, lever.x, y1, 10);
      await page.waitForFunction(
        () => window.__game !== undefined && window.__game.getState().phase !== 'climb',
        undefined,
        { timeout: 60_000 },
      );
    }
    await waitForPhase(page, 'reveal', 20000);

    // ---- completion.png: reveal's camera pull-back with the taller tower,
    // no DOM menu covering the shot. ----
    await captureShot(page, `${outDir}/completion.png`);

    await waitForPhase(page, 'complete', 20000);

    expect(errors).toEqual([]);
  });
});
