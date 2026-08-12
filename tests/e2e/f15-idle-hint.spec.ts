import { expect, test } from '@playwright/test';

/**
 * F15 (docs/ACCEPTANCE.md): 3-5s of no input during an interactive phase
 * fires a `hintShown` GameEvent.
 *
 * Wave 3: window.__stageDebug now exposes getRecentEvents(), a capped ring
 * buffer of every GameEvent emission (src/app/debugHook.ts, fed by
 * EventBus.onAny in src/app/App.ts) — including hintShown — plus
 * skipToPhase(), which jumps straight to an interactive phase without
 * exercising the multi-beat (12s+) gesture walk to reach it. This test only
 * cares about the idle-hint timer, so it uses skipToPhase; f01-f03/f11
 * already cover the real gesture-driven walk into these phases.
 */
test.describe('F15: idle hint after 3-5s of no input', () => {
  test.setTimeout(15_000);

  test('an idle interactive phase emits hintShown within ~5s', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app canvas');

    await page.evaluate(() => window.__stageDebug?.skipToPhase('unlock'));

    // Poll rather than a single fixed sleep: the hint delay is itself
    // randomized 3-5s (docs/MASTER_SPEC.md), and under parallel-worker CPU
    // contention a bare `waitForTimeout(5200)` can land right on that edge.
    await page.waitForFunction(
      () => window.__stageDebug?.getRecentEvents().some((e) => e.type === 'hintShown') ?? false,
      { timeout: 9000 }
    );
    const events = await page.evaluate(() => window.__stageDebug?.getRecentEvents() ?? []);
    expect(events.some((e) => e.type === 'hintShown')).toBe(true);
  });
});
