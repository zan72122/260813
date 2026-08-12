// tests/e2e/orientation.spec.ts
// A6: rotating the device (resize) must not lose GamePhase / openness.
//
// Integration-dependent: requires window.__versailles (Wave 3). Skips
// gracefully with a clear reason until then.

import { test, expect } from '@playwright/test';
import { hasDebugApi, readDebug } from './helpers/debugApi';
import { synthesizeCircularDrag, synthesizeTap } from './helpers/gestures';

const SKIP_REASON =
  'window.__versailles debug API not present yet — this spec requires Wave 3 integration ' +
  '(Worker A src/game/debug.ts wired into main.ts). Pre-integration this is expected, not a failure.';

test('A6: phase and openness survive a portrait <-> landscape resize', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  if (!(await hasDebugApi(page))) {
    test.skip(true, SKIP_REASON);
    return;
  }

  await synthesizeTap(page, 0.5, 0.5); // title -> garden-idle
  for (let i = 0; i < 80; i++) {
    const debug = await readDebug(page);
    if (debug.phase === 'valve-turn') break;
    if (debug.phase === 'whistle-cue') {
      const w = debug.hotspots.whistle ?? { x: 0.5, y: 0.16, r: 0.2 };
      await synthesizeTap(page, w.x, w.y);
    } else {
      await page.waitForTimeout(150);
    }
  }

  const beforeRotate = await readDebug(page);
  expect(beforeRotate.phase, 'test setup expected to reach valve-turn').toBe('valve-turn');

  const valve = beforeRotate.hotspots.valve ?? { x: 0.5, y: 0.5, r: 0.2 };
  await synthesizeCircularDrag(page, {
    centerXNorm: valve.x,
    centerYNorm: valve.y,
    turns: 0.3,
    clockwise: true,
    stepDelayMs: 10,
  });

  const beforeResize = await readDebug(page);
  expect(beforeResize.openness).toBeGreaterThan(0);

  // Rotate: portrait -> landscape (swap dimensions), let the resize/orientation
  // handlers settle, then verify nothing was reset.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);

  const afterResize = await readDebug(page);
  expect(afterResize.phase, 'phase must survive orientation change').toBe(beforeResize.phase);
  expect(afterResize.openness, 'openness must survive orientation change').toBeCloseTo(
    beforeResize.openness,
    5,
  );
  expect(afterResize.fountain, 'active fountain must survive orientation change').toBe(
    beforeResize.fountain,
  );

  // Rotate back, same expectation.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const afterSecondResize = await readDebug(page);
  expect(afterSecondResize.phase).toBe(beforeResize.phase);
  expect(afterSecondResize.openness).toBeCloseTo(beforeResize.openness, 5);
});
