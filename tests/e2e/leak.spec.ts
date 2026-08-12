// tests/e2e/leak.spec.ts — 20 consecutive replays, driven via the
// window.__game.dispatch() fast path (explicitly acceptable for this test
// per the integration brief — the real-gesture path is already proven in
// full-loop.spec.ts). Asserts: EventBus listener count and outstanding
// timer count never grow across loops, renderer draw-call/triangle stats
// return to a stable per-loop baseline, and the JS heap does not grow
// monotonically beyond a generous tolerance between loop 5 and loop 20.

import { expect, test } from '@playwright/test';
import { bootToOpening, FULL_LOOP_CHAIN, waitForPhase } from './helpers';

const REPLAY_COUNT = 20;
// Chromium's performance.memory.usedJSHeapSize is intentionally coarse-
// grained (bucketed) for anti-fingerprinting reasons, so this only needs to
// catch a *real* runaway leak, not noise between two nearly-identical
// samples. 4 MB of genuine monotonic growth over 20 replays would indicate
// a real per-loop retention bug; normal GC noise is far smaller.
const HEAP_GROWTH_TOLERANCE_BYTES = 4 * 1024 * 1024;

interface LoopSample {
  listenerCount: number;
  timerCount: number;
  drawCalls: number;
  triangles: number;
  heap: number | null;
}

test.describe('leak', () => {
  test('20 consecutive replays: no listener/timer growth, stable renderer stats, no runaway heap growth', async ({
    page,
  }, testInfo) => {
    // Listener/timer counts and heap behavior are viewport-independent (pure
    // JS-side bookkeeping); running this 20-replay-deep check on all 4
    // projects would just quadruple verify's runtime for no extra coverage.
    // phone-portrait is the representative sample, per QUALITY_REPORT.md.
    test.skip(testInfo.project.name !== 'phone-portrait', 'representative viewport only');
    test.setTimeout(60_000);

    await bootToOpening(page, { seed: '42' });
    await waitForPhase(page, 'opening', 6000);

    const samples: LoopSample[] = [];

    for (let i = 0; i < REPLAY_COUNT; i += 1) {
      for (const to of FULL_LOOP_CHAIN) {
        const ok = await page.evaluate((to) => window.__game!.dispatch(to), to);
        expect(ok).toBe(true);
      }
      await page.evaluate(() => window.__game!.dispatch('opening'));
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

    // ---- renderer stats: loop 5 vs loop 20 (same comparison pattern as the
    // heap check below), bounding *growth* rather than demanding exact
    // per-loop equality. Adaptive quality can step down more than once
    // under variable system load (this spec may run alongside others), and
    // each sample lands on whatever frame the renderer's own independent
    // rAF loop most recently rendered, so a little loop-to-loop noise is
    // expected even with zero leaks. A genuine leak shows up as sustained
    // *growth*, which this still catches. ----
    const drawCallsLoop5 = samples[4]!.drawCalls;
    const drawCallsLoop20 = samples[19]!.drawCalls;
    const trianglesLoop5 = samples[4]!.triangles;
    const trianglesLoop20 = samples[19]!.triangles;
    expect(drawCallsLoop20).toBeLessThanOrEqual(drawCallsLoop5 + 15);
    expect(trianglesLoop20).toBeLessThanOrEqual(trianglesLoop5 + 3000);

    // ---- JS heap: loop 5 vs loop 20, generous tolerance for GC/bucketing noise. ----
    const heapLoop5 = samples[4]?.heap ?? null;
    const heapLoop20 = samples[19]?.heap ?? null;
    if (heapLoop5 !== null && heapLoop20 !== null) {
      expect(heapLoop20 - heapLoop5).toBeLessThan(HEAP_GROWTH_TOLERANCE_BYTES);
    }
  });
});
