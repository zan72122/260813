// tests/e2e/leak.spec.ts — replay-leak coverage, two complementary passes.
//
// (1) 20 consecutive replays via the window.__game.dispatch() fast path
//     (explicitly acceptable for bulk-cycle coverage per the integration
//     brief — the real-gesture path is already proven end-to-end in
//     full-loop.spec.ts). Cheap enough to run deep (20 loops).
// (2) A smaller (3-loop) pass driven entirely by REAL pointer gestures at
//     REAL published anchors (tests/e2e/helpers.ts's driveFullLoopToComplete
//     — the same driver full-loop.spec.ts uses), interleaved with a
//     sound-toggle on/off cycle and a pause/resume cycle every loop. This is
//     the pass that actually exercises the DOM/hint-layer/particle/audio
//     code paths a dispatch()-only loop skips entirely (dispatch() jumps
//     phases directly and never drives input, hints, success-flash DOM
//     churn, or the audio graph), which is where most real leaks live.
//
// Both assert: EventBus listener count and outstanding timer count never
// grow across loops, and the JS heap does not grow monotonically beyond a
// generous tolerance. Pass (1) additionally asserts renderer draw-call/
// triangle stats return to a stable per-loop baseline (deep enough — 20
// loops — to run past towerLevel's growth cap, so the comparison window is
// clean of legitimate content growth; see the comment at its assertion).
// Pass (2) additionally asserts the #ui DOM node count returns to the same
// per-loop resting value every time (draw-call/triangle stats are
// deliberately NOT asserted there — see the comment near its assertions).

import { expect, test } from '@playwright/test';
import {
  bootToOpening,
  driveFullLoopToComplete,
  FULL_LOOP_CHAIN,
  getState,
  waitForPhase,
  waitForSettled,
} from './helpers';
import { MAX_TOWER_LEVEL } from '../../src/contracts/machine';

const REPLAY_COUNT = 20;
const REAL_GESTURE_LOOP_COUNT = 3;
// Chromium's performance.memory.usedJSHeapSize is intentionally coarse-
// grained (bucketed) for anti-fingerprinting reasons, so this only needs to
// catch a *real* runaway leak, not noise between two nearly-identical
// samples. 4 MB of genuine monotonic growth over 20 replays would indicate
// a real per-loop retention bug; normal GC noise is far smaller.
const HEAP_GROWTH_TOLERANCE_BYTES = 4 * 1024 * 1024;
// The real-gesture pass does more per loop (DOM hint churn, success-flash
// elements, audio graph nodes, sound/pause toggling) over far fewer
// iterations, so GC-timing noise is proportionally larger; stay generous
// while still catching sustained per-loop growth.
const REAL_GESTURE_HEAP_GROWTH_TOLERANCE_BYTES = 6 * 1024 * 1024;

interface LoopSample {
  listenerCount: number;
  timerCount: number;
  drawCalls: number;
  triangles: number;
  heap: number | null;
}

interface RealLoopSample {
  listenerCount: number;
  timerCount: number;
  heap: number | null;
  domCount: number;
}

test.describe('leak', () => {
  test('20 consecutive replays (dispatch fast path): no listener/timer growth, stable renderer stats, no runaway heap growth', async ({
    page,
  }, testInfo) => {
    // Listener/timer counts and heap behavior are viewport-independent (pure
    // JS-side bookkeeping); running this 20-replay-deep check on all 4
    // projects would just quadruple verify's runtime for no extra coverage.
    // phone-portrait is the representative sample, per QUALITY_REPORT.md.
    test.skip(testInfo.project.name !== 'phone-portrait', 'representative viewport only');
    // Waiting for the camera to settle every loop (see the comment at the
    // sampling call below) makes this measurably slower than a bare dispatch
    // loop (~60s observed in isolation, ~2min observed under 2-worker CI
    // contention); budget generously above that so a real regression fails
    // on its own merits rather than the outer timeout.
    test.setTimeout(180_000);

    await bootToOpening(page, { seed: '42' });
    await waitForPhase(page, 'opening', 6000);

    const samples: LoopSample[] = [];

    for (let i = 0; i < REPLAY_COUNT; i += 1) {
      for (const to of FULL_LOOP_CHAIN) {
        const ok = await page.evaluate((to) => window.__game!.dispatch(to), to);
        expect(ok).toBe(true);
      }
      await page.evaluate(() => window.__game!.dispatch('opening'));
      // A phase change hard-resets the camera's interpolation target
      // (src/render/camera.ts): the very first frame after dispatch('opening')
      // fires with dtMs=0 (see src/core/index.ts's synchronous 'phase:enter'
      // handler), so the camera hasn't actually eased toward 'opening's
      // framing yet — it's still sitting wherever 'complete's very different
      // establishing shot left it. Sampling stats() at that instant means
      // three.js's per-object frustum culling is evaluated against a
      // transitional camera pose, not the settled one, which swings
      // drawCalls/triangles by thousands of triangles for reasons that have
      // nothing to do with leaks. Waiting for settled() first removes that
      // noise source entirely.
      await waitForSettled(page, 10_000);
      const sample = await page.evaluate(() => {
        const stats = window.__game!.stats();
        const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
        return {
          listenerCount: window.__game!.listenerCount(),
          timerCount: window.__game!.timerCount(),
          drawCalls: stats.drawCalls,
          triangles: stats.triangles,
          heap: perf.memory ? perf.memory.usedJSHeapSize : null,
        };
      });
      samples.push(sample);
    }

    // ---- bus listener count: every owner subscribes once at construction,
    // never per phase-entry, so this must be perfectly flat. ----
    const listenerCounts = samples.map((s) => s.listenerCount);
    expect(Math.max(...listenerCounts)).toBe(Math.min(...listenerCounts));

    // ---- timer count: UI's flash/hint timers are all self-clearing;
    // outstanding count must stay bounded, not creep upward loop over loop. ----
    const timerCounts = samples.map((s) => s.timerCount);
    expect(Math.max(...timerCounts)).toBeLessThanOrEqual(Math.min(...timerCounts) + 2);

    // ---- renderer stats: a post-cap loop vs loop 20, bounding *growth*
    // rather than demanding exact per-loop equality. `reveal` bumps
    // towerLevel every loop (contracts/machine.ts), and the tower's own
    // procedural geometry legitimately gains real triangles as it grows —
    // that's content, not a leak — but it stops at MAX_TOWER_LEVEL, so by
    // the loop where towerLevel first saturates, every later loop is
    // comparing the *same* built geometry. Anchoring the comparison there
    // (rather than an early loop still mid-growth) keeps the tolerance
    // meaningfully tight instead of needing to absorb legitimate growth.
    // Remaining loop-to-loop noise (a few triangles from steam/spark particle
    // counts at the instant of sampling) is covered by a small margin. A
    // genuine leak shows up as sustained *growth past the cap*, which this
    // still catches. ----
    const postCapLoopIndex = Math.min(MAX_TOWER_LEVEL + 1, REPLAY_COUNT - 1);
    const drawCallsPostCap = samples[postCapLoopIndex]!.drawCalls;
    const drawCallsLoop20 = samples[19]!.drawCalls;
    const trianglesPostCap = samples[postCapLoopIndex]!.triangles;
    const trianglesLoop20 = samples[19]!.triangles;
    expect(drawCallsLoop20).toBeLessThanOrEqual(drawCallsPostCap + 15);
    expect(trianglesLoop20).toBeLessThanOrEqual(trianglesPostCap + 3000);

    // ---- JS heap: loop 5 vs loop 20, generous tolerance for GC/bucketing noise. ----
    const heapLoop5 = samples[4]?.heap ?? null;
    const heapLoop20 = samples[19]?.heap ?? null;
    if (heapLoop5 !== null && heapLoop20 !== null) {
      expect(heapLoop20 - heapLoop5).toBeLessThan(HEAP_GROWTH_TOLERANCE_BYTES);
    }
  });

  test('3 real-gesture replays + sound/pause cycles: DOM/listener/timer/heap stay bounded', async ({
    page,
  }, testInfo) => {
    // Same representative-viewport rationale as the fast-path test above —
    // this is pure JS/DOM bookkeeping, not a visual/layout check.
    test.skip(testInfo.project.name !== 'phone-portrait', 'representative viewport only');
    // Single-loop real-gesture timing (full-loop.spec.ts, isolated run) is
    // ~30s; 3 back-to-back loops plus toggling stays within the <3min target
    // even under 2-worker CI contention (~1.5min isolated, ~2.8min observed
    // under contention alongside full-loop/qa-screens/resilience). Budget
    // the enforced timeout generously above that so a real regression fails
    // on its own merits rather than the outer timeout, without needing to
    // keep re-tuning this constant to the last few seconds of headroom.
    test.setTimeout(240_000);

    const vp = testInfo.project.use.viewport ?? { width: 390, height: 844 };

    await bootToOpening(page, { seed: '42' });
    await waitForPhase(page, 'opening', 6000);

    /** Success-flash wash/ring elements (src/ui/index.ts's triggerFlash) are
     * appended to the DOM and self-remove on a (test-mode-scaled) timer —
     * poll for them to be gone rather than guessing a fixed delay, so the
     * #ui node count below never races a still-pending removal. */
    async function waitForFlashesToClear(): Promise<void> {
      await page.waitForFunction(
        () => document.querySelectorAll('.success-wash, .success-ring').length === 0,
        undefined,
        { timeout: 5000 },
      );
    }

    async function sample(): Promise<RealLoopSample> {
      return page.evaluate(() => {
        const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
        return {
          listenerCount: window.__game!.listenerCount(),
          timerCount: window.__game!.timerCount(),
          heap: perf.memory ? perf.memory.usedJSHeapSize : null,
          domCount: document.getElementById('ui')?.querySelectorAll('*').length ?? -1,
        };
      });
    }

    // listenerCount is safe to compare against a pre-loop baseline (every
    // owner subscribes exactly once, at construction — see the fast-path
    // test above), unlike domCount below.
    const preLoopListenerCount = (await sample()).listenerCount;

    const samples: RealLoopSample[] = [];

    for (let i = 0; i < REAL_GESTURE_LOOP_COUNT; i += 1) {
      // ---- sound-toggle on/off cycle -----------------------------------
      const mutedBefore = (await getState(page)).audio.muted;
      await page.getByTestId('sound-toggle').click();
      expect((await getState(page)).audio.muted).toBe(!mutedBefore);
      // sound-toggle's own tap-guard cooldown is 250ms (src/ui/index.ts;
      // shorter than the default 500ms elsewhere), not tied to any store
      // field a state-wait could poll for — an immediate second click lands
      // inside that window and is deliberately swallowed as a guarded
      // duplicate-tap (see src/ui/interaction.ts's guardedHandler), not a
      // dead button. Same category of unavoidable real-time pacing wait as
      // driveRivetHammerToDone's inter-tap delay in helpers.ts.
      await page.waitForTimeout(300);
      await page.getByTestId('sound-toggle').click();
      expect((await getState(page)).audio.muted).toBe(mutedBefore);

      // ---- pause/resume cycle -------------------------------------------
      // pause-toggle is visible in every phase except loading/title/complete
      // (src/ui/index.ts's HIDE_PAUSE_ON) and we're at 'opening' here, so it
      // is reachable.
      await page.getByTestId('pause-toggle').click();
      await page.waitForFunction(
        () => (window as unknown as { __uiPaused?: boolean }).__uiPaused === true,
        undefined,
        { timeout: 5000 },
      );
      // The pause overlay shares the corner buttons' z-index and paints
      // after them in DOM order (src/styles/components.css), so it is what
      // actually receives the tap at pause-toggle's screen position while
      // paused — resuming goes through the overlay's own big resume control
      // instead (no data-testid on it; `.pause-resume` is its stable class).
      await page.locator('.pause-resume').click();
      await page.waitForFunction(
        () => (window as unknown as { __uiPaused?: boolean }).__uiPaused === false,
        undefined,
        { timeout: 5000 },
      );

      // ---- a full real-gesture loop, exercising every anchor-driven verb,
      // the hint layer's per-phase pictogram swaps, and the success-flash
      // DOM churn between them. ----
      await driveFullLoopToComplete(page, vp);
      await waitForPhase(page, 'complete', 20_000);

      await page.getByTestId('replay-same').click();
      await waitForPhase(page, 'opening', 20_000);
      await waitForFlashesToClear();

      samples.push(await sample());
    }

    // ---- bus listener count: flat across the whole run. ----
    const listenerCounts = [preLoopListenerCount, ...samples.map((s) => s.listenerCount)];
    expect(Math.max(...listenerCounts)).toBe(Math.min(...listenerCounts));

    // ---- #ui DOM node count: the *very first* 'opening' (before any phase
    // has ever set a hint) legitimately has fewer nodes than every
    // *post-loop* 'opening' (hint-layer content persists, hidden-but-not-
    // removed, once a phase has set one — src/ui/index.ts's setHintTarget)
    // — see hintForPhase's phase table, src/ui/hints.ts. Every loop here
    // passes through the identical phase sequence, so the 3 post-loop
    // samples must match each other exactly; comparing against the
    // structurally-different pre-loop point would be a false positive, not
    // a real leak signal. ----
    const domCounts = samples.map((s) => s.domCount);
    expect(Math.max(...domCounts)).toBe(Math.min(...domCounts));

    // ---- timer count: bounded, small tolerance for in-flight timers. ----
    const timerCounts = samples.map((s) => s.timerCount);
    expect(Math.max(...timerCounts)).toBeLessThanOrEqual(Math.min(...timerCounts) + 2);

    // ---- renderer draw-call/triangle stats are deliberately NOT asserted
    // bounded here (unlike the fast-path test above): towerLevel keeps
    // incrementing every loop via 'reveal' (contracts/machine.ts) until it
    // saturates at MAX_TOWER_LEVEL, and this pass only runs
    // REAL_GESTURE_LOOP_COUNT (3) loops — nowhere near enough to reach that
    // saturation point, so any comparison here would still be measuring
    // legitimate tower-geometry growth, not a leak. The deep 20-loop
    // fast-path test above owns renderer-stat leak detection instead, at a
    // loop depth past MAX_TOWER_LEVEL where the comparison window is clean
    // of that growth (see its own comment for the full explanation).

    // ---- JS heap: first vs last real-gesture loop, generous tolerance. ----
    const heapFirst = samples[0]?.heap ?? null;
    const heapLast = samples[REAL_GESTURE_LOOP_COUNT - 1]?.heap ?? null;
    if (heapFirst !== null && heapLast !== null) {
      expect(heapLast - heapFirst).toBeLessThan(REAL_GESTURE_HEAP_GROWTH_TOLERANCE_BYTES);
    }
  });
});
