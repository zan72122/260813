// tests/e2e/full-loop.spec.ts
// A1 (full loop title -> finale), A4-adjacent (screenshot evidence of the
// causal chain), A7 (console/pageerror = 0), and the ACCEPTANCE.md
// screenshot matrix (4 viewports x key states).
//
// Integration-dependent: requires window.__versailles (Wave 3). Skips
// gracefully with a clear reason until then — see docs/CONTRACTS.md
// "Debug API" / OWNERSHIP.md.

import { test, expect } from '@playwright/test';
import { hasDebugApi, readDebug, waitForPhase } from './helpers/debugApi';
import { collectConsole } from './helpers/console';
import { driveGameLoop } from './helpers/driveLoop';
import { synthesizeTap } from './helpers/gestures';
import { ACCEPTANCE_VIEWPORTS, KEY_STATES, captureState } from './helpers/viewports';

const SKIP_REASON =
  'window.__versailles debug API not present yet — this spec requires Wave 3 integration ' +
  '(Worker A src/game/debug.ts wired into main.ts). Pre-integration this is expected, not a failure.';

test.describe('full loop (A1 / A4 / A7 / screenshot matrix)', () => {
  test('title -> finale over the primary viewport, capturing all 5 key states', async ({ page }) => {
    test.setTimeout(120_000);
    const console_ = collectConsole(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    if (!(await hasDebugApi(page))) {
      test.skip(true, SKIP_REASON);
      return;
    }

    const captured = new Set<string>();
    const visited = await driveGameLoop(page, {
      onPhaseEnter: async (phase) => {
        if ((KEY_STATES as readonly string[]).includes(phase) && !captured.has(phase)) {
          captured.add(phase);
          await page.waitForTimeout(200); // let the frame settle before capture
          await captureState(page, '390x844', phase);
        }
      },
    });

    expect(visited.has('finale'), 'loop must reach finale (A1)').toBe(true);
    expect(visited.has('replay-choice'), 'loop must reach replay-choice (A1)').toBe(true);
    for (const state of KEY_STATES) {
      expect(captured.has(state), `expected a screenshot of key state "${state}"`).toBe(true);
    }

    expect(console_.errors, `console errors: ${console_.errors.join('\n')}`).toEqual([]);
    expect(console_.pageErrors, `unhandled page errors: ${console_.pageErrors.join('\n')}`).toEqual([]);
  });

  for (const viewport of ACCEPTANCE_VIEWPORTS.filter((v) => v.label !== '390x844')) {
    test(`representative-state screenshot at ${viewport.label}`, async ({ page }) => {
      test.setTimeout(60_000);
      const console_ = collectConsole(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      if (!(await hasDebugApi(page))) {
        test.skip(true, SKIP_REASON);
        return;
      }

      await synthesizeTap(page, 0.5, 0.5); // title -> garden-idle
      const reached = await waitForPhase(page, ['garden-idle'], 10_000);
      expect(reached, 'expected to reach garden-idle after the title tap').toBe(true);

      const debug = await readDebug(page);
      await page.waitForTimeout(150);
      await captureState(page, viewport.label, debug.phase);

      expect(console_.errors, `console errors: ${console_.errors.join('\n')}`).toEqual([]);
      expect(console_.pageErrors, `unhandled page errors: ${console_.pageErrors.join('\n')}`).toEqual([]);
    });
  }
});
