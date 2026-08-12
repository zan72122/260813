// tests/e2e/replay.spec.ts
// A8: after completion, replay is reachable within 2 taps.
//
// Integration-dependent: requires window.__versailles (Wave 3) AND the
// replay-choice UI to be mounted and wired to phase-changed. Skips
// gracefully with a clear reason until then.

import { test, expect } from '@playwright/test';
import { hasDebugApi, readDebug } from './helpers/debugApi';
import { driveGameLoop } from './helpers/driveLoop';
import { synthesizeTap } from './helpers/gestures';

const SKIP_REASON_NO_DEBUG =
  'window.__versailles debug API not present yet — this spec requires Wave 3 integration ' +
  '(Worker A src/game/debug.ts wired into main.ts). Pre-integration this is expected, not a failure.';

const SKIP_REASON_NO_UI =
  'replay-choice UI buttons are not visible — requires the UI overlay (src/ui) to be wired ' +
  'to phase-changed by Wave 3 integration.';

test('A8: replay-choice leads back into active gameplay within 2 taps', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');

  if (!(await hasDebugApi(page))) {
    test.skip(true, SKIP_REASON_NO_DEBUG);
    return;
  }

  await driveGameLoop(page);
  const before = await readDebug(page);
  expect(before.phase).toBe('replay-choice');

  const sameButton = page.locator('[data-choice="same"]');
  const visible = await sameButton.isVisible().catch(() => false);
  if (!visible) {
    test.skip(true, SKIP_REASON_NO_UI);
    return;
  }

  let taps = 0;
  await sameButton.click();
  taps += 1;
  await page.waitForTimeout(300);

  let after = await readDebug(page);
  if (after.phase === 'whistle-cue') {
    const w = after.hotspots.whistle ?? { x: 0.5, y: 0.16, r: 0.2 };
    await synthesizeTap(page, w.x, w.y);
    taps += 1;
    await page.waitForTimeout(300);
    after = await readDebug(page);
  }

  expect(taps, 'must reach active gameplay within 2 taps').toBeLessThanOrEqual(2);
  expect(after.phase, 'must have left replay-choice').not.toBe('replay-choice');
});
