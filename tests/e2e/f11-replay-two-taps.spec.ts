import { expect, test } from '@playwright/test';
import { getState, walkToward } from './helpers';

/**
 * F11 (docs/ACCEPTANCE.md): finale -> choice -> tap -> replay, in <= 2 taps.
 *
 * Requires: owner A's phase machine reaching 'finale'/'choice', AND App.ts
 * wiring the real UiSystem (src/ui/UiSystem.ts) in place of NullUiSystem so
 * the `.sus-choice-replay` picture button actually exists in the DOM (see
 * report). Written fully against the ACCEPTANCE contract; expected to fail
 * until both land.
 */
test.describe('F11: replay reachable within two taps from choice', () => {
  test.setTimeout(45_000);

  test('tapping the replay picture button from the choice screen restarts the same transform', async ({ page }) => {
    await page.goto('/');
    const reached = await walkToward(page, 'choice');
    test.skip(reached !== 'choice', `could not reach choice phase (stopped at "${reached}")`);

    const beforePair = (await getState(page)).pair;

    const replayButton = page.locator('.sus-choice-replay');
    await expect(replayButton, 'UiSystem choice screen replay button (needs real UiSystem wired in App.ts)').toBeVisible({
      timeout: 3000
    });

    // Tap 1: this is the single tap required once 'choice' is reached (the
    // walk above already counts as reaching choice non-interactively via the
    // phase machine's own auto-advance from finale).
    await replayButton.click();

    await page.waitForFunction(() => window.__stageDebug?.getState().phase !== 'choice', { timeout: 4000 });
    const after = await getState(page);

    expect(after.phase).not.toBe('choice');
    expect(after.pair).toEqual(beforePair); // "same-transform replay" keeps the same scene pair
    expect(after.progress).toBe(0); // replay restarts the pull from 0
  });
});
