import { expect, test } from '@playwright/test';

import { BLEND_END_S, BLEND_START_S, TRACK_LENGTH } from '../../src/contracts/constants.ts';

import {
  dismissGhostHand,
  gotoState,
  holdThrottleUntil,
  readErrors,
  releasePointer,
  settled,
  setT,
  spinWheel,
  stepUntil,
  waitForCameraCue,
  waitForCameraCueProgress,
  waitForSceneReady,
} from './helpers.ts';

/**
 * VISUAL_ACCEPTANCE "Screenshot acceptance set": 7 shots × 4 viewports,
 * saved to `artifacts/qa/<project-name>/<shot>.png` (project names are the
 * four viewport names from playwright.config.ts, matching the QA dirs).
 * One test captures all 7 in a single page session per project (cheaper
 * than 7 fresh boots, and the shots build on the same ride naturally).
 *
 * Staging strategy per shot, matched to WHERE that camera cue is actually
 * reachable from (some cues only fire on a real, edge-triggered event —
 * `scrubToT`/direct `gotoState` intentionally bypass those edges, per
 * `EiffelGameLogic.scrubToT`'s own doc: "not for gameplay" — so those shots
 * are captured via real driven motion instead of a scrub):
 *  - 01/02/05: direct `gotoState`/`setT` (their cue fires unconditionally on
 *    state ENTRY, scrub or not).
 *  - 03: real `gotoState('cableFollow')` + waiting for the multi-stage
 *    camera cue to reach ~50% progress (the pulley keyframe), NOT
 *    `settled()` (that would run the cue to completion, past "mid-journey").
 *  - 04/06/07: real throttle-held motion, since `firstSlope`/`interiorProof`/
 *    the `arrival` transition are all edge-triggered inside
 *    `EiffelStateMachine.update()`, which only runs from `step()` — a direct
 *    scrub never crosses those edges.
 */
test.describe('visual acceptance screenshots', () => {
  test('captures all 7 VISUAL_ACCEPTANCE shots', async ({ page }, testInfo) => {
    // Generous: this environment's headless SwiftShader renderer can spike
    // individual render passes by seconds (see src/core/clock.ts's doc),
    // and this test drives real throttle-held motion across two long
    // stretches of the track.
    //
    // INTEGRATOR FIX (Wave 4): raised from 240s to 480s, then to 600s —
    // 240s was tuned against phone-scale canvases only (comfortably passed
    // there, ~180s) and measured actually timing out on tablet-portrait
    // (820x1180, ~3x phone-portrait's pixel count): every render pass this
    // test waits on (settled() polls, camera-cue-progress polls,
    // holdThrottleUntil's step+readout loop) costs measurably more
    // wall-clock time on the larger canvas under this headless SwiftShader
    // (software) renderer, independent of anything this test is actually
    // checking — and a full sequential `npm run verify` run keeps ONE
    // browser process's GPU (SwiftShader) process under sustained load for
    // 30+ minutes (measured 250-320% CPU), compounding that per-pass cost
    // further than a short isolated repro shows. 600s keeps real margin
    // above the largest tested viewport's measured cost under that
    // sustained load.
    test.setTimeout(600_000);
    const dir = `artifacts/qa/${testInfo.project.name}`;

    await page.goto('/?det=1&seed=42');
    await waitForSceneReady(page);

    // -- 01-opening-cutaway: attract / establish -----------------------------
    await gotoState(page, 'attract');
    await waitForCameraCue(page, 'establish');
    await settled(page);
    await page.screenshot({ path: `${dir}/01-opening-cutaway.png` });

    // -- 02-underground-pistons: machineRoom / underground -------------------
    await gotoState(page, 'machineRoom');
    await waitForCameraCue(page, 'underground');
    await settled(page);
    // PRODUCT_SPEC "Feedback rules": idle >=5s on a verb screen shows a
    // ghost-hand demo. `settled()` can itself take a few seconds, so
    // dismiss it right before the shot rather than risk it landing mid-shot.
    await dismissGhostHand(page, page.getByTestId('master-lever'));
    await page.screenshot({ path: `${dir}/02-underground-pistons.png` });

    // -- 03-cable-follow: mid cableFollow (pulley keyframe, ~50% progress) ---
    await gotoState(page, 'cableFollow');
    await waitForCameraCue(page, 'cableFollow');
    await waitForCameraCueProgress(page, 0.5);
    await page.screenshot({ path: `${dir}/03-cable-follow.png` });

    // -- 04-first-slope: ascendLower, s~40, real throttle-driven ------------
    await gotoState(page, 'ascendLower');
    const throttleUp = page.getByTestId('throttle-up');
    await holdThrottleUntil(page, throttleUp, (ro) => ro.cableTravel >= 40, { chunk: 40, maxSteps: 1500 });
    await releasePointer(page);
    await waitForCameraCue(page, 'firstSlope');
    await settled(page);
    await dismissGhostHand(page, throttleUp);
    await page.screenshot({ path: `${dir}/04-first-slope.png` });

    // -- 05-slope-transition: mid-blend, tilted carrier + LEVEL cabin -------
    // `setT` (-> scrubToT) forces the leveling error to exactly 0, which is
    // precisely the "level cabin floor" half of this shot's proof, paired
    // with the carrier's real (steeper) theta-driven tilt — no transient
    // dynamics needed to make this legible.
    const midBlendT = (BLEND_START_S + BLEND_END_S) / 2 / TRACK_LENGTH;
    await setT(page, midBlendT);
    await waitForCameraCue(page, 'transitionClose');
    await settled(page);
    const wheel = page.getByTestId('level-wheel');
    await dismissGhostHand(page, wheel);
    await page.screenshot({ path: `${dir}/05-slope-transition.png` });

    // -- 06-horizontal-cabin-proof: interiorProof, real drive to settle -----
    await gotoState(page, 'transition');
    // A couple of real wheel turns (proves the gesture path), then let the
    // guaranteed-success auto-assist (MATH_CONTRACT §3) finish the job —
    // cheap step()+readouts polling for the rest, no further mouse gestures
    // needed to satisfy the guarantee. `interiorProof` is edge-triggered
    // inside `EiffelStateMachine.update()` (fires the instant leveling
    // settles), which only runs from `step()` — deterministic mode has no
    // ambient stepping, so this MUST actively step the sim while polling
    // (a passive `waitForCameraCue` alone would hang forever here).
    await spinWheel(page, wheel, { turns: 0.5, waypoints: 6 });
    await stepUntil(page, (ro) => ro.cameraCue === 'interiorProof', { chunk: 20, maxSteps: 1200 });
    await settled(page);
    await dismissGhostHand(page, wheel);
    await page.screenshot({ path: `${dir}/06-horizontal-cabin-proof.png` });

    // -- 07-arrival: arrivalReveal, real drive through to the top -----------
    // Captured EARLY in the multi-stage cue (not `settled()`, which would
    // run all the way to the END keyframe — the "look back down the track"
    // confirmation beat, CAMERA_CONTRACT — past the wide Paris/platform
    // reveal this shot actually wants: "second floor platform, Paris, the
    // climbed track below").
    //
    // INTEGRATOR FIX (Wave 4, visual QA pass): 0.12 (the original threshold)
    // caught the shot too early — the camera's own chase toward the "pan"
    // keyframe (TAU_POSITION_NORMAL = 0.9s, cameraDirector.ts) hasn't
    // reliably caught up that soon after `arrivalReveal` starts (confirmed
    // visually: the Paris skyline silhouette, clearly present at 0.25, was
    // absent from the actual committed 0.12 capture). 0.25 (2s into the 8s
    // `ARRIVAL_REVEAL_DURATION_S` walk) gives the chase enough real time to
    // land on the pan framing while the multi-stage blend is still safely
    // pan-dominated (75% pan / 25% toward the look-back keyframe).
    await gotoState(page, 'ascendUpper');
    await holdThrottleUntil(page, throttleUp, (ro) => ro.state === 'arrival', { chunk: 40, maxSteps: 2000 });
    await releasePointer(page);
    await waitForCameraCue(page, 'arrivalReveal');
    await waitForCameraCueProgress(page, 0.25);
    await page.screenshot({ path: `${dir}/07-arrival.png` });

    const errors = await readErrors(page);
    expect(errors).toEqual([]);
  });
});
