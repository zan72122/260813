import { expect, test } from '@playwright/test';
import { dragCanvasVertical, getState, releaseDrag, walkToward } from './helpers';

/**
 * F9 (docs/ACCEPTANCE.md): orientation/viewport changes must not lose
 * phase/progress. App.ts's onResize() only ever calls state.setViewport(),
 * never touches phase/progress/pair, so this is testable (and should pass)
 * even while the app is still stuck at phase 'boot' — the invariant is about
 * preservation, not about which phase we start in.
 */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 }
];

test.describe('F9: resize/orientation preserves phase, pair and progress', () => {
  test('cycling through the ACCEPTANCE viewport matrix leaves phase/pair/progress unchanged', async ({ page }) => {
    await page.goto('/');

    // Best-effort: get past boot and grab a non-zero progress if the phase
    // machine supports it yet, so the check is meaningful beyond "0 stays 0".
    const reached = await walkToward(page, 'pull1', 1500);
    if (reached === 'pull1') {
      await dragCanvasVertical(page, 0.2, 0.6, { steps: 6 });
      await releaseDrag(page);
    }

    const before = await getState(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      // Let the resize/orientationchange handlers in App.ts run.
      await page.waitForTimeout(50);
      const after = await getState(page);
      expect(after.phase).toBe(before.phase);
      expect(after.pair).toEqual(before.pair);
      expect(after.progress).toBe(before.progress);
      expect(after.viewport.width).toBe(viewport.width);
      expect(after.viewport.height).toBe(viewport.height);
    }
  });
});
