import { expect, test } from '@playwright/test';

// Expensive test (9 full play-loop passes) — trace recording's CDP overhead
// compounds badly on this sandbox's software-rendered/CPU-only WebGL (see
// full-loop.spec.ts, which does the same for the same reason).
test.use({ trace: 'off' });

/**
 * T1 (fix-round-1, addresses B6/B7): loops replayShuffle() x8 — each
 * shuffle rebuilds ToySystem/BasketSystem/MatSystem for the new seed via
 * SceneRoot.onSeedChanged(). Before the B6/B7 fixes this leaked a blob-
 * shadow pool slot per toy per shuffle (BlobShadowManager.allocate() had no
 * matching free()) and regenerated-but-never-disposed geometries/materials/
 * textures on every reshuffle. Asserts both symptoms are gone:
 *   - shadowSlotsUsed (harness counter, see SceneRoot.shadowSlotsUsed) stays
 *     flat across shuffles instead of growing 7/14/21/...
 *   - JS heap usage (CDP Runtime.getHeapUsage, forced GC before each sample)
 *     does not grow unbounded after a warmup pass.
 */
test('replayShuffle x8 does not leak blob-shadow slots or JS heap', async ({ page }) => {
  // Generous: 9 full play-loop passes (warmup + 8 shuffles), each driven
  // through 5 phase transitions with settle waits — slow on this sandbox's
  // software-rendered WebGL (see e2e/helpers.ts header comment).
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  const client = await page.context().newCDPSession(page);
  const getHeapUsed = async (): Promise<number> => {
    await client.send('HeapProfiler.collectGarbage');
    const { usedSize } = await client.send('Runtime.getHeapUsage');
    return usedSize;
  };

  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));

  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(500);

  const waitForPhase = async (target: string): Promise<void> => {
    await page.waitForFunction((p) => (window as unknown as { __game: { phase: string } }).__game.phase === p, target, { timeout: 20_000 });
  };

  // NOTE on why LUNCH_CLEANUP/WAKE_RESTORE don't get a manual advancePhase()
  // nudge like LUNCH_SETUP/NAP_SETUP do: those two auto-advance on their own
  // via a SHORT internal timer (checkLunchCleanupComplete: 500ms;
  // checkWakeRestoreComplete: 1400ms) once forceCompleteCurrentPhaseVisuals()
  // satisfies their completion condition. LUNCH_SETUP/NAP_SETUP's vignettes
  // are long (8000ms, or 4800ms reduced-motion) precisely so a player can see
  // them, so racing a manual advance past those is safe and intentional. But
  // racing a manual advance against LUNCH_CLEANUP/WAKE_RESTORE's already-short
  // auto-timer is NOT safe: on this sandbox's slow rendering, the manual call
  // sometimes lands AFTER the auto-timer has already fired, so advancePhase()
  // (unconditional — it does not check current phase before moving to
  // DEFAULT_NEXT) skips straight past the phase this loop is trying to reach.
  // Confirmed via harness debug logging during authoring (a manual advance
  // 200ms after LUNCH_CLEANUP's forceCompleteCurrentPhaseVisuals() landed on
  // an already-NAP_SETUP page and jumped it to WAKE_RESTORE instead).
  const runToReplay = async (): Promise<void> => {
    await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
    await waitForPhase('LUNCH_SETUP');
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as unknown as { __game: { advancePhase: () => void } }).__game.advancePhase());
    await waitForPhase('LUNCH_CLEANUP');
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
    await waitForPhase('NAP_SETUP');
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as unknown as { __game: { advancePhase: () => void } }).__game.advancePhase());
    await waitForPhase('WAKE_RESTORE');
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
    await waitForPhase('REPLAY');
  };

  await runToReplay();

  const initialShadowSlots = await page.evaluate(() => (window as unknown as { __game: { shadowSlotsUsed: number } }).__game.shadowSlotsUsed);
  expect(initialShadowSlots).toBeGreaterThan(0);

  // Warmup shuffle so the very first reshuffle's one-time allocations don't
  // skew the heap-growth comparison.
  await page.evaluate(() => (window as unknown as { __game: { replayShuffle: () => number } }).__game.replayShuffle());
  await waitForPhase('PLAY_CLEANUP');
  await page.waitForTimeout(400);
  await runToReplay();
  const heapAfterWarmup = await getHeapUsed();

  const shadowSlotSamples: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => (window as unknown as { __game: { replayShuffle: () => number } }).__game.replayShuffle());
    await waitForPhase('PLAY_CLEANUP');
    await page.waitForTimeout(400);
    const slots = await page.evaluate(() => (window as unknown as { __game: { shadowSlotsUsed: number } }).__game.shadowSlotsUsed);
    shadowSlotSamples.push(slots);
    if (i < 7) await runToReplay();
  }

  const heapAfterShuffles = await getHeapUsed();

  // eslint-disable-next-line no-console
  console.log('shadowSlotSamples:', shadowSlotSamples, 'heapAfterWarmup:', heapAfterWarmup, 'heapAfterShuffles:', heapAfterShuffles);

  // B6: the pool must not grow shuffle-over-shuffle (it did, unbounded,
  // before free() existed — 7/14/21/... until the fixed 48-slot InstancedMesh
  // overflowed around the 7th shuffle).
  const uniqueSlotCounts = new Set(shadowSlotSamples);
  expect(uniqueSlotCounts.size, 'shadowSlotsUsed should be the same constant value every shuffle, not growing').toBe(1);

  // B7: heap should not grow unbounded across 8 more reshuffles after warmup.
  // Generous threshold — this is about catching a real leak (which was
  // unbounded: every reshuffle regenerated canvas textures + geometries with
  // nothing disposing the old ones), not enforcing a tight budget.
  if (heapAfterWarmup > 0) {
    const growthPct = ((heapAfterShuffles - heapAfterWarmup) / heapAfterWarmup) * 100;
    // eslint-disable-next-line no-console
    console.log('heap growth after warmup:', growthPct.toFixed(1) + '%');
    expect(growthPct).toBeLessThan(15);
  }

  expect(consoleErrors).toEqual([]);
});
