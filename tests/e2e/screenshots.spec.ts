import { test } from '@playwright/test';
import { captureState } from '../../scripts/screenshots';
import { dragCanvasVertical, releaseDrag, walkToward } from './helpers';

/**
 * ACCEPTANCE.md screenshot evidence: S1-S6 at each of the 4 viewports.
 * playwright.config.ts runs this spec once per viewport project, so the
 * full 6 x 4 = 24-file matrix is produced by `npm run test:e2e` alone.
 *
 * This is evidence capture, not a correctness gate: it does not assert on
 * which phase was actually reached (walkToward is best-effort against the
 * current build — see tests/e2e/helpers.ts and the report's core change
 * requests), so it always produces a file per state even before the full
 * phase machine / real Input+UiSystem wiring lands. Fable 5 reviews the
 * images directly per ACCEPTANCE.md's Gate B.
 */
test.describe('ACCEPTANCE screenshots (S1-S6)', () => {
  test.setTimeout(60_000);

  test('captures S1-S6 for this project viewport', async ({ page }, testInfo) => {
    const viewport = testInfo.project.use.viewport ?? { width: 390, height: 844 };
    await page.goto('/');
    await page.waitForSelector('#app canvas');

    // S1: Salon before, establish angle.
    await walkToward(page, 'establish', 1500);
    await captureState(page, 'S1_beforeEstablish', viewport);

    // S2: understage, unlock phase.
    await walkToward(page, 'unlock', 1500);
    await captureState(page, 'S2_understageUnlock', viewport);

    // S3: ~50% transform split/cutaway (old + new wings simultaneously visible).
    const reachedPull = await walkToward(page, 'pull1', 1500);
    if (reachedPull === 'pull1') {
      // One stroke over 80% of viewport height at STROKE_HEIGHT_FRACTION=0.6,
      // STROKE_PROGRESS_DELTA=0.35 lands close to p=0.5: (0.8/0.6)*0.35 ~= 0.47.
      await dragCanvasVertical(page, 0.1, 0.9, { steps: 10 });
    }
    await captureState(page, 'S3_split50', viewport);
    await releaseDrag(page);

    // S4: Forest after (scene 1 complete), same angle as S1.
    await walkToward(page, 'reveal1', 1500);
    await captureState(page, 'S4_forestAfter', viewport);

    // S5: Rustic after (scene 2 complete).
    await walkToward(page, 'reveal2', 1500);
    await captureState(page, 'S5_rusticAfter', viewport);

    // S6: QualityTier=low appearance, via the mute/quality corner UI.
    const qualityButton = page.locator('.sus-quality');
    if ((await qualityButton.count()) > 0) {
      // Cycle up to 3x: order is low -> medium -> high -> low.
      for (let i = 0; i < 3; i++) {
        await qualityButton.click();
        const tier = await page.evaluate(() => window.__stageDebug?.getState().quality);
        if (tier === 'low') break;
      }
    }
    await captureState(page, 'S6_lowQuality', viewport);
  });
});
