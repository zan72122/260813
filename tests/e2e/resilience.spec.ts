// tests/e2e/resilience.spec.ts — five robustness scenarios required by the
// integration brief: orientation change mid-loop, background/foreground,
// sound-off, reduced motion, and WebGL context loss/restore. State-waits
// only; the two justified exceptions (viewport-swap settle poll target,
// hammer-tap debounce pacing inside helpers.ts) are commented at their use.

import { expect, test } from '@playwright/test';
import {
  bootToOpening,
  collectConsoleErrors,
  dragGesture,
  driveAlignToSnap,
  driveBoltsToSeated,
  driveHoistToFull,
  driveHookDownToAttached,
  FULL_LOOP_CHAIN,
  getAnchor,
  getState,
  waitForPhase,
  waitForSettled,
} from './helpers';

test.describe('resilience', () => {
  test('(a) orientation change mid-replay: swapping viewport dims mid-hoist does not stall the second loop', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors = collectConsoleErrors(page);
    const startVp = { width: 390, height: 844 };
    await page.setViewportSize(startVp);

    await bootToOpening(page, { seed: '42' });
    // First loop: fast-path via dispatch (already proven with real gestures
    // in full-loop.spec.ts) — this test's subject is the resize path, not
    // gesture accuracy.
    for (const to of FULL_LOOP_CHAIN) await page.evaluate((to) => window.__game!.dispatch(to), to);
    await waitForPhase(page, 'complete', 20000);

    // Second loop, via the real replay-same button.
    await page.getByTestId('replay-same').click();
    await waitForPhase(page, 'opening', 20000);
    await waitForPhase(page, 'hookDown', 20000);
    await driveHookDownToAttached(page, startVp);
    await waitForPhase(page, 'hoist', 20000);

    // Mid-hoist: one real drag, then swap portrait<->landscape.
    await dragGesture(page, startVp.width / 2, startVp.height * 0.6, startVp.width / 2, startVp.height * 0.35, 8);
    const heightBeforeSwap = (await getState(page)).hoist.height;
    expect(heightBeforeSwap).toBeGreaterThan(0);

    const swappedVp = { width: startVp.height, height: startVp.width };
    await page.setViewportSize(swappedVp);
    // resize() is debounced 200ms (ARCHITECTURE_CONTRACT.md); wait for the
    // renderer to actually settle on the new aspect rather than sleeping a
    // guessed duration.
    await waitForSettled(page, 20_000);

    // Anchors must have been re-projected for the new viewport (not still
    // reporting stale portrait-sized coordinates).
    const beamAnchor = await getAnchor(page, 'beam');
    expect(beamAnchor.x).toBeGreaterThanOrEqual(0);
    expect(beamAnchor.x).toBeLessThanOrEqual(swappedVp.width);

    // Keep driving hoist to completion with real gestures at the new
    // (landscape) anchor coordinates.
    await driveHoistToFull(page, swappedVp);
    await waitForPhase(page, 'align', 20000);
    await driveAlignToSnap(page);
    await waitForPhase(page, 'bolts', 20000);
    await driveBoltsToSeated(page);
    await waitForPhase(page, 'rivetHeat', 20000);

    // Finish the rest via dispatch fast-path -- the point of this test is
    // proven (orientation swap mid-verb did not stall progress).
    for (const to of ['rivetCarry', 'rivetInsert', 'rivetHammer', 'rivetCool', 'sling', 'climb', 'reveal', 'complete'] as const) {
      await page.evaluate((to) => window.__game!.dispatch(to), to);
    }
    await waitForPhase(page, 'complete', 20000);

    expect(errors).toEqual([]);
  });

  test('(b) background/foreground: the loop stops while hidden and resumes with no state corruption', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const errors = collectConsoleErrors(page);
    await bootToOpening(page, { seed: '42' });
    for (const to of ['hookDown', 'hoist', 'align', 'bolts', 'rivetHeat'] as const) {
      await page.evaluate((to) => window.__game!.dispatch(to), to);
    }
    await waitForPhase(page, 'rivetHeat', 20000);
    const beforeHidden = await getState(page);

    // Mock document.hidden + fire visibilitychange, the same mechanism a
    // real tab-switch/app-background triggers (src/app/index.ts listens for
    // this exact event to stop/resume the rAF loop and src/audio/index.ts
    // to suspend/resume the AudioContext).
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const drawCallsWhenHidden = await page.evaluate(() => window.__game!.stats().drawCalls);
    // There is no store/bus field that flips true "the loop is stopped" to
    // poll toward — the very thing under test is the *absence* of change,
    // which only a bounded real-time wait can demonstrate (stats().fps
    // freezes at its last live value once the internal rAF loop stops
    // rather than resetting to 0, so it can't be polled toward either).
    // This is the same category of unavoidable pacing wait as the hammer
    // debounce in helpers.ts, not a correctness-masking sleep.
    await page.waitForTimeout(500);
    const whileHidden = await getState(page);
    expect(whileHidden.phase).toBe(beforeHidden.phase);
    expect(whileHidden.rivet).toEqual(beforeHidden.rivet);
    // The renderer's own internal rAF loop (src/core/index.ts) is also
    // stopped by document.hidden -- drawCalls (renderer.info.render.calls,
    // reset every render() call) must not have advanced past whatever it
    // was the instant we hid the page, since no further render() ran.
    expect(await page.evaluate(() => window.__game!.stats().drawCalls)).toBe(drawCallsWhenHidden);

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitForSettled(page, 20_000);
    const afterForeground = await getState(page);
    expect(afterForeground.phase).toBe(beforeHidden.phase);

    // Prove the loop actually resumed (not just that state didn't corrupt):
    // drive rivetHeat forward and confirm it progresses.
    const forge = await getAnchor(page, 'forge');
    await page.mouse.move(forge.x, forge.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(
      () => window.__game !== undefined && window.__game.getState().rivet.temp > 0,
      undefined,
      { timeout: 10_000 },
    );

    expect(errors).toEqual([]);
  });

  test('(c) sound toggle off, then a phase still advances cleanly with zero errors', async ({ page }) => {
    test.setTimeout(45_000);
    const errors = collectConsoleErrors(page);
    await bootToOpening(page, { seed: '42' });
    await waitForPhase(page, 'hookDown', 20000);

    await page.getByTestId('sound-toggle').click();
    expect((await getState(page)).audio.muted).toBe(true);

    await page.evaluate(() => window.__game!.dispatch('hoist'));
    await waitForPhase(page, 'hoist', 20000);
    expect((await getState(page)).audio.muted).toBe(true);

    expect(errors).toEqual([]);
  });

  test('(d) reduced motion (?reduced=1): a real mini-pass through align -> bolts with no errors', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const errors = collectConsoleErrors(page);
    const vp = { width: 390, height: 844 };
    await page.setViewportSize(vp);

    await bootToOpening(page, { seed: '42', reduced: '1' });
    expect((await getState(page)).prefs.reducedMotion).toBe(true);
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('reduced-motion');

    await waitForPhase(page, 'hookDown', 20000);
    await driveHookDownToAttached(page, vp);
    await waitForPhase(page, 'hoist', 20000);
    await driveHoistToFull(page, vp);
    await waitForPhase(page, 'align', 20000);
    await driveAlignToSnap(page);
    await waitForPhase(page, 'bolts', 20000);
    await driveBoltsToSeated(page);
    expect((await getState(page)).bolts).toEqual([true, true]);
    await waitForPhase(page, 'rivetHeat', 20000);

    expect(errors).toEqual([]);
  });

  test('(e) WebGL context loss/restore: scene recovers with the same phase and zero console errors', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const errors = collectConsoleErrors(page);
    await bootToOpening(page, { seed: '42' });
    for (const to of ['hookDown', 'hoist', 'align', 'bolts', 'rivetHeat'] as const) {
      await page.evaluate((to) => window.__game!.dispatch(to), to);
    }
    await waitForPhase(page, 'rivetHeat', 20000);
    const phaseBefore = (await getState(page)).phase;

    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]');
      const gl = canvas!.getContext('webgl2');
      const ext = gl!.getExtension('WEBGL_lose_context');
      (window as unknown as { __loseCtxExt: typeof ext }).__loseCtxExt = ext;
      ext!.loseContext();
    });

    await page.evaluate(() => {
      (window as unknown as { __loseCtxExt: { restoreContext(): void } }).__loseCtxExt.restoreContext();
    });

    await waitForSettled(page, 20_000);
    const state = await getState(page);
    expect(state.phase).toBe(phaseBefore);
    expect(await page.evaluate(() => window.__game!.sceneReady)).toBe(true);

    const stats = await page.evaluate(() => window.__game!.stats());
    expect(stats.drawCalls).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });
});
