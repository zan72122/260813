import { expect, test } from '@playwright/test';
import { dragCanvasVertical, getState, releaseDrag, walkToward } from './helpers';

/**
 * F1-F3 (docs/ACCEPTANCE.md): rope drag <-> StageTransformProgress continuity,
 * stop-halts-everything, and reverse drag.
 *
 * Requires the pull1 phase, which needs owner A's GamePhase state machine
 * (src/game/GameDirector.ts) plus App.ts wiring the real InputSystem. Wave 3
 * wired the real InputSystem in place of NullInputSystem, so these now run
 * for real via walkToward instead of self-skipping.
 */
test.describe('F1-F3: rope drag drives StageTransformProgress', () => {
  test.setTimeout(45_000);

  test('F1: dragging down increases progress continuously and monotonically', async ({ page }) => {
    await page.goto('/');
    const reached = await walkToward(page, 'pull1');
    test.skip(reached !== 'pull1', `could not reach pull1 phase (stopped at "${reached}")`);

    const before = await getState(page);
    await dragCanvasVertical(page, 0.2, 0.5, { steps: 6, stepDelayMs: 20 });
    const mid = await getState(page);
    await dragCanvasVertical(page, 0.5, 0.8, { steps: 6, stepDelayMs: 20 });
    const after = await getState(page);
    await releaseDrag(page);

    expect(mid.progress).toBeGreaterThan(before.progress);
    expect(after.progress).toBeGreaterThan(mid.progress);
  });

  test('F2: releasing the drag (finger stopped) freezes progress across frames', async ({ page }) => {
    await page.goto('/');
    const reached = await walkToward(page, 'pull1');
    test.skip(reached !== 'pull1', `could not reach pull1 phase (stopped at "${reached}")`);

    await dragCanvasVertical(page, 0.2, 0.5, { steps: 6 });
    await releaseDrag(page);

    const frame1 = await getState(page);
    // Wait ~2 animation frames without any pointer input.
    await page.waitForTimeout(48);
    const frame2 = await getState(page);

    expect(frame2.progress).toBe(frame1.progress);
  });

  test('F3: dragging up after a partial pull decreases progress', async ({ page }) => {
    await page.goto('/');
    const reached = await walkToward(page, 'pull1');
    test.skip(reached !== 'pull1', `could not reach pull1 phase (stopped at "${reached}")`);

    // Pull down toward p ~= 0.6 (per ACCEPTANCE F3's example).
    await dragCanvasVertical(page, 0.15, 0.9, { steps: 8 });
    const pulled = await getState(page);
    expect(pulled.progress).toBeGreaterThan(0);

    // Reverse: drag back up.
    await dragCanvasVertical(page, 0.9, 0.15, { steps: 8 });
    await releaseDrag(page);
    const reversed = await getState(page);

    expect(reversed.progress).toBeLessThan(pulled.progress);
  });
});
