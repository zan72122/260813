import { expect, test } from '@playwright/test';

import {
  BLEND_END_S,
  BLEND_START_S,
  CABIN_MAX_WORLD_TILT_DEG,
  MECH_ADVANTAGE,
  PULLEY_RADIUS,
} from '../../src/contracts/constants.ts';

import {
  dragVerticalHold,
  pressHold,
  readEiffel,
  readErrors,
  readSoundCueLog,
  releasePointer,
  spinWheel,
  stepUntil,
  waitForCameraCue,
  waitForSceneReady,
  waitForState,
} from './helpers.ts';

/**
 * THE canonical run: boot -> attract -> machineRoom -> cableFollow ->
 * ascendLower -> transition -> ascendUpper -> arrival -> celebrate ->
 * replayMenu, driven through the REAL DOM controls (drag/press/spin), in
 * deterministic mode so it stays fast and reproducible regardless of the
 * renderer's real frame rate (headless SwiftShader can run at just a few
 * fps — see `src/core/clock.ts`).
 *
 * `readouts().cableTravel` doubles as the carrier arc length `s` throughout
 * (MATH_CONTRACT §2: `cableTravel c = s` exactly; `EiffelReadouts` has no
 * separate `arcLength` field), matching the drive-identity assertions below.
 */
test.describe('complete loop (canonical run)', () => {
  test('load -> attract -> machineRoom -> cableFollow -> ascendLower -> transition -> ascendUpper -> arrival -> celebrate -> replayMenu', async ({
    page,
  }) => {
    // Generous: this environment's headless SwiftShader renderer can spike
    // individual render passes by seconds (see src/core/clock.ts's doc),
    // and this is the single heaviest spec — the full ride, twice through a
    // long throttle-held climb.
    test.setTimeout(280_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/?det=1&seed=42');
    await waitForSceneReady(page);

    // -- boot -> attract ----------------------------------------------------
    const r = await readEiffel(page);
    expect(r.state).toBe('attract');
    expect(r.cameraCue).toBe('establish');
    expect(r.paused).toBe(false);

    // -- attract -> machineRoom: tap anywhere to begin ----------------------
    await page.getByTestId('tap-start').click();
    await waitForState(page, 'machineRoom');
    await waitForCameraCue(page, 'underground');

    // -- machineRoom: drag the master lever open (real pointer drag) --------
    const lever = page.getByTestId('master-lever');
    await dragVerticalHold(page, lever, -400); // up = increasing value (mapVerticalDrag sign convention)
    await stepUntil(page, (ro) => ro.valveOpen >= 1, { chunk: 30, maxSteps: 600 });
    await releasePointer(page);

    // -- machineRoom -> cableFollow (VALVE_OPENED, auto) --------------------
    await waitForState(page, 'cableFollow');
    await waitForCameraCue(page, 'cableFollow');

    // -- cableFollow -> ascendLower (fixed-duration causal-chain ride) ------
    await stepUntil(page, (ro) => ro.state === 'ascendLower', { chunk: 30, maxSteps: 600 });
    await waitForCameraCue(page, 'carrierSide');

    // -- ascendLower: hold the up-throttle (real pointer hold) --------------
    const throttleUp = page.getByTestId('throttle-up');
    await pressHold(page, throttleUp);

    // s > 30 -> firstSlope camera cue (stateMachine.ts FIRST_SLOPE_ARC_LENGTH_M)
    await stepUntil(page, (ro) => ro.cableTravel > 30, { chunk: 40, maxSteps: 1200 });
    await waitForCameraCue(page, 'firstSlope');

    // Drive-identity assertions (MATH_CONTRACT §2), mid-ascent.
    const mid = await readEiffel(page);
    expect(mid.cableTravel).toBeCloseTo(MECH_ADVANTAGE * mid.pistonDisplacement, 6);
    expect(mid.pulleyAngle).toBeCloseTo(mid.cableTravel / PULLEY_RADIUS, 6);

    // s >= BLEND_START_S -> SLOPE_REACHED -> transition (auto).
    await stepUntil(page, (ro) => ro.cableTravel >= BLEND_START_S, { chunk: 40, maxSteps: 2000 });
    await releasePointer(page); // stale hold is safely ignored once transition's auto-drive takes over
    await waitForState(page, 'transition');
    await waitForCameraCue(page, 'transitionClose');

    // -- transition: THE moment — turn the level wheel ----------------------
    // One real pointer gesture (proves the control's wiring end to end); the
    // leveling assist itself GUARANTEES the peak/bound/settle behavior
    // asserted below even with zero further input (MATH_CONTRACT §3
    // "guaranteed success"), so the sampling loop only needs cheap
    // step()+readouts round trips from here — a real pointer gesture costs
    // orders of magnitude more wall-clock time than one of those under this
    // project's headless software renderer (see src/core/clock.ts), and
    // isn't needed again to prove the product guarantee.
    const wheel = page.getByTestId('level-wheel');
    await spinWheel(page, wheel, { turns: 0.6, waypoints: 6 });

    let peakAbsTiltDeg = 0;
    let sawMeaningfulPeak = false;
    let steppedTotal = 0;
    const TRANSITION_STEP_BUDGET = 3600; // 60 sim seconds — generous vs. the ~9s worst case
    const TRANSITION_SAMPLE_CHUNK = 40;
    for (;;) {
      await page.evaluate((n: number) => window.__eiffel.step(n), TRANSITION_SAMPLE_CHUNK);
      steppedTotal += TRANSITION_SAMPLE_CHUNK;
      const ro = await readEiffel(page);
      const absTilt = Math.abs(ro.cabinWorldTiltDeg);
      peakAbsTiltDeg = Math.max(peakAbsTiltDeg, absTilt);
      if (absTilt > 0.5) sawMeaningfulPeak = true;
      // Product invariant, every sample, no exceptions (PRODUCT_SPEC "Cabin
      // floor tilt never exceeds 8deg world tilt at any time").
      expect(absTilt).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG + 1e-6);
      if (ro.state === 'ascendUpper') break;
      if (steppedTotal >= TRANSITION_STEP_BUDGET) {
        throw new Error(`transition never reached ascendUpper within ${TRANSITION_STEP_BUDGET} steps`);
      }
    }

    // "Peaks >0.5deg then settles <0.25deg" (MATH_CONTRACT §3: the carrier
    // visibly re-tilts the cabin briefly, then the assist relaxes it back).
    expect(sawMeaningfulPeak).toBe(true);
    expect(peakAbsTiltDeg).toBeGreaterThan(0.5);
    // LEVELED only fires once `leveling.settled` is true (|error| < 0.25deg),
    // so the tilt the instant ascendUpper begins is already inside that band.
    const atAscendUpper = await readEiffel(page);
    expect(Math.abs(atAscendUpper.cabinWorldTiltDeg)).toBeLessThan(0.25);
    expect(atAscendUpper.cableTravel).toBeGreaterThanOrEqual(BLEND_END_S);

    // -- ascendUpper: hold the up-throttle again -----------------------------
    await pressHold(page, throttleUp);
    await stepUntil(page, (ro) => ro.state === 'arrival', { chunk: 40, maxSteps: 3600 });
    await releasePointer(page);
    await waitForCameraCue(page, 'arrivalReveal');

    // -- arrival: brakeLock immediately, doorOpen after the delay ------------
    let soundLog = await readSoundCueLog(page);
    expect(soundLog).toContain('brakeLock');
    await page.evaluate((n: number) => window.__eiffel.step(n), 90); // 1.5 sim seconds
    soundLog = await readSoundCueLog(page);
    expect(soundLog).toContain('doorOpen');

    // -- arrival -> celebrate -> replayMenu (fixed-duration beats) ----------
    await stepUntil(page, (ro) => ro.state === 'celebrate', { chunk: 30, maxSteps: 400 });
    soundLog = await readSoundCueLog(page);
    expect(soundLog).toContain('sparkle');
    await stepUntil(page, (ro) => ro.state === 'replayMenu', { chunk: 30, maxSteps: 400 });
    await waitForCameraCue(page, 'menu');

    // -- final invariants -----------------------------------------------------
    const apiErrors = await readErrors(page);
    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
