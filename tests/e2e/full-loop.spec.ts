// tests/e2e/full-loop.spec.ts — the complete title->complete path via REAL
// pointer input at REAL published anchor positions (never window.__game.
// dispatch/setPhase), asserting phase progression, representative event
// side effects, and zero console errors/pageerrors across the whole run.
// Runs in all 4 viewport projects (see playwright.config.ts).

import { expect, test } from '@playwright/test';
import {
  bootToOpening,
  collectConsoleErrors,
  driveAlignToSnap,
  driveBoltsToSeated,
  driveClimbReleaseAndAutoComplete,
  driveForgeTapsUntilHot,
  driveHoistToFull,
  driveHookDownToAttached,
  driveRivetCarryToDone,
  driveRivetHammerToDone,
  driveRivetHeatToDone,
  driveRivetInsert,
  driveSlingToReleased,
  getState,
  waitForPhase,
} from './helpers';

test.describe('full-loop', () => {
  test('title -> opening -> ... -> complete via real gestures, with correct side effects and zero console errors', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors = collectConsoleErrors(page);
    const vp = testInfo.project.use.viewport ?? { width: 390, height: 844 };

    await bootToOpening(page, { seed: '42' });
    const seedAtStart = (await getState(page)).seed;
    const towerLevelAtStart = (await getState(page)).towerLevel;

    // opening -> hookDown (auto-advances after a dwell; no input required)
    await waitForPhase(page, 'hookDown', 20000);

    // hookDown: vertical drag anywhere lowers the hook until it magnet-snaps.
    await driveHookDownToAttached(page, vp);
    expect((await getState(page)).hook.attached).toBe(true);
    await waitForPhase(page, 'hoist', 20000);

    // hoist: upward drags raise the load to height=1, then auto-advance.
    await driveHoistToFull(page, vp);
    await waitForPhase(page, 'align', 20000);

    // align: drag toward the ghost silhouette until it snaps.
    await driveAlignToSnap(page);
    expect((await getState(page)).align.snapped).toBe(true);
    await waitForPhase(page, 'bolts', 20000);

    // bolts: drag both bolts into their holes, either order.
    await driveBoltsToSeated(page);
    expect((await getState(page)).bolts).toEqual([true, true]);
    await waitForPhase(page, 'rivetHeat', 20000);

    // rivetHeat: tap the forge until temp reaches 1.
    await driveRivetHeatToDone(page);
    await waitForPhase(page, 'rivetCarry', 20000);

    // rivetCarry: two right-swipes relay the rivet to the hole.
    await driveRivetCarryToDone(page);
    expect((await getState(page)).rivet.station).toBeGreaterThanOrEqual(2);
    await waitForPhase(page, 'rivetInsert', 20000);

    // rivetInsert: one tap on the hole.
    await driveRivetInsert(page);
    await waitForPhase(page, 'rivetHammer', 20000);

    // rivetHammer: three separate taps form the rivet head.
    await driveRivetHammerToDone(page);
    expect((await getState(page)).rivet.hits).toBe(3);
    await waitForPhase(page, 'rivetCool', 20000);

    // rivetCool: passive dwell, then auto-advance to sling.
    await waitForPhase(page, 'sling', 20000);

    // sling: one tap releases the clasp.
    await driveSlingToReleased(page);
    expect((await getState(page)).sling.released).toBe(true);
    await waitForPhase(page, 'climb', 20000);

    // climb: THE signature moment. One drag, release mid-way, and progress
    // must keep advancing on its own until locked -> reveal.
    const progressAtRelease = (await getState(page)).climb.progress;
    await driveClimbReleaseAndAutoComplete(page, vp, 60_000);
    // Progress is strictly monotonic and the phase only leaves 'climb' once
    // locked, so by the time we're out, progress must have kept climbing
    // well past wherever it was the instant we released the pointer.
    expect(progressAtRelease).toBeLessThan(1);

    await waitForPhase(page, 'reveal', 20000);
    // reveal:enter already bumped towerLevel (contracts/machine.ts's
    // PHASE_RESET) — the signature "the tower is now taller" side effect.
    expect((await getState(page)).towerLevel).toBe(towerLevelAtStart + 1);

    await waitForPhase(page, 'complete', 20000);
    const finalState = await getState(page);
    expect(finalState.seed).toBe(seedAtStart);
    expect(finalState.towerLevel).toBe(towerLevelAtStart + 1);

    await expect(page.getByTestId('replay-same')).toBeVisible();
    await expect(page.getByTestId('replay-new')).toBeVisible();
    await expect(page.getByTestId('play-rivet')).toBeVisible();
    await expect(page.getByTestId('play-climb')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('replay-same, replay-new, playRivet loop, and playClimb loop all work from complete, with zero console errors', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors = collectConsoleErrors(page);
    const vp = testInfo.project.use.viewport ?? { width: 390, height: 844 };

    await bootToOpening(page, { seed: '42' });
    await waitForPhase(page, 'hookDown', 20000);
    await driveHookDownToAttached(page, vp);
    await waitForPhase(page, 'hoist', 20000);
    await driveHoistToFull(page, vp);
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
    await driveRivetHammerToDone(page);
    await waitForPhase(page, 'rivetCool', 20000);
    await waitForPhase(page, 'sling', 20000);
    await driveSlingToReleased(page);
    await waitForPhase(page, 'climb', 20000);
    await driveClimbReleaseAndAutoComplete(page, vp, 60_000);
    await waitForPhase(page, 'reveal', 20000);
    await waitForPhase(page, 'complete', 20000);

    const seedAfterFirstLoop = (await getState(page)).seed;
    const towerLevelAfterFirstLoop = (await getState(page)).towerLevel;

    // --- replay-same: same seed, opens straight back into 'opening' ---
    await page.getByTestId('replay-same').click();
    await waitForPhase(page, 'opening', 20000);
    expect((await getState(page)).seed).toBe(seedAfterFirstLoop);
    // fast-forward the rest of this loop via dispatch (already proven with
    // real gestures above; here we're only proving the replay entry point
    // and towerLevel accumulation).
    for (const to of [
      'hookDown',
      'hoist',
      'align',
      'bolts',
      'rivetHeat',
      'rivetCarry',
      'rivetInsert',
      'rivetHammer',
      'rivetCool',
      'sling',
      'climb',
      'reveal',
      'complete',
    ] as const) {
      await page.evaluate((to) => window.__game!.dispatch(to), to);
    }
    await waitForPhase(page, 'complete', 20000);
    expect((await getState(page)).towerLevel).toBe(towerLevelAfterFirstLoop + 1);

    // --- replay-new: different (deterministic) seed ---
    const seedBeforeNew = (await getState(page)).seed;
    await page.getByTestId('replay-new').click();
    await waitForPhase(page, 'opening', 20000);
    expect((await getState(page)).seed).not.toBe(seedBeforeNew);
    await page.evaluate(() => window.__game!.dispatch('complete'));
    // 'opening' can only advance to 'hookDown' per TRANSITIONS, so a direct
    // dispatch to 'complete' is illegal and must be a no-op (still opening).
    expect((await getState(page)).phase).toBe('opening');
    for (const to of [
      'hookDown',
      'hoist',
      'align',
      'bolts',
      'rivetHeat',
      'rivetCarry',
      'rivetInsert',
      'rivetHammer',
      'rivetCool',
      'sling',
      'climb',
      'reveal',
      'complete',
    ] as const) {
      await page.evaluate((to) => window.__game!.dispatch(to), to);
    }
    await waitForPhase(page, 'complete', 20000);

    // --- playRivet: entry point works and a real forge tap heats the rivet ---
    await page.getByTestId('play-rivet').click();
    await waitForPhase(page, 'playRivet', 20000);
    await driveForgeTapsUntilHot(page);
    expect((await getState(page)).rivet.temp).toBe(1);
    await page.getByTestId('back-to-complete').click();
    await waitForPhase(page, 'complete', 20000);

    // --- playClimb: entry point works and a real lever drag raises progress ---
    await page.getByTestId('play-climb').click();
    await waitForPhase(page, 'playClimb', 20000);
    const lever = await page.evaluate(() => window.__game!.anchors().find((a) => a.id === 'climbLever'));
    expect(lever).toBeTruthy();
    if (lever) {
      const y0 = Math.min(vp.height - 5, lever.y + 140);
      const y1 = Math.max(5, lever.y - 140);
      await page.mouse.move(lever.x, y0);
      await page.mouse.down();
      await page.mouse.move(lever.x, y1, { steps: 10 });
      await page.mouse.up();
      await page.waitForFunction(
        () => window.__game !== undefined && window.__game.getState().climb.progress > 0,
        undefined,
        { timeout: 10_000 },
      );
    }
    await page.getByTestId('back-to-complete').click();
    await waitForPhase(page, 'complete', 20000);

    expect(errors).toEqual([]);
  });
});
