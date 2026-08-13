// tests/e2e/full-loop.spec.ts
// A1 (full loop title -> finale), A4-adjacent (screenshot evidence of the
// causal chain), A7 (console/pageerror = 0), and the ACCEPTANCE.md
// screenshot matrix (4 viewports x key states).
//
// Integration-dependent: requires window.__versailles (Wave 3). Skips
// gracefully with a clear reason until then — see docs/CONTRACTS.md
// "Debug API" / OWNERSHIP.md.

import { test, expect } from '@playwright/test';
import { hasDebugApi, readDebug } from './helpers/debugApi';
import { collectConsole } from './helpers/console';
import { driveGameLoop } from './helpers/driveLoop';
import { synthesizeCircularDrag, synthesizeTap } from './helpers/gestures';
import { ACCEPTANCE_VIEWPORTS, KEY_STATES, captureState } from './helpers/viewports';

const SKIP_REASON =
  'window.__versailles debug API not present yet — this spec requires Wave 3 integration ' +
  '(Worker A src/game/debug.ts wired into main.ts). Pre-integration this is expected, not a failure.';

test.describe('full loop (A1 / A4 / A7 / screenshot matrix)', () => {
  test('title -> finale over the primary viewport, capturing all 5 key states', async ({ page }) => {
    test.setTimeout(480_000);
    const console_ = collectConsole(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    if (!(await hasDebugApi(page))) {
      test.skip(true, SKIP_REASON);
      return;
    }

    const captured = new Set<string>();
    // Gate B round 2: judge whether the pipe-run water slug (src/vfx/pipeFlow.ts)
    // stays visible near arrival, not just at its single on-entry capture —
    // snapshot explicitly at waterProgress ~0.5 (mid) and ~0.85 (late/near
    // arrival), independent of the once-per-phase KEY_STATES capture below.
    let pipeRunMidCaptured = false;
    let pipeRunLateCaptured = false;
    const visited = await driveGameLoop(page, {
      onTick: async (debug) => {
        if (debug.phase !== 'pipe-run') return;
        if (!pipeRunMidCaptured && debug.waterProgress >= 0.5) {
          pipeRunMidCaptured = true;
          await captureState(page, '390x844', 'pipe-run-t50');
        }
        if (!pipeRunLateCaptured && debug.waterProgress >= 0.85) {
          pipeRunLateCaptured = true;
          await captureState(page, '390x844', 'pipe-run-t85');
        }
      },
      onPhaseEnter: async (phase) => {
        if ((KEY_STATES as readonly string[]).includes(phase) && !captured.has(phase)) {
          captured.add(phase);
          // Let the frame settle before capture: camera beats blend smoothly
          // between phases (POSE_SMOOTH_TAU in src/camera/player.ts) rather
          // than cutting, and fountain-reveal's water intensity itself ramps
          // up over ~1.5s (src/game/timing.ts REVEAL_STAGE1/2_SEC) — a short
          // settle captured a transitional mid-blend frame (camera still
          // mid-swing from the pipe-cutaway pose, water not yet visible).
          // 1.3s clears the camera blend and gets water intensity mostly
          // ramped, while staying safely under pipe-run's own minimum
          // duration (PIPE_RUN_MIN_SEC = 1.8s) so a fast valve-turn doesn't
          // let the phase advance out from under this same capture.
          await page.waitForTimeout(1300);
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

  // Gate B landscape/tablet re-check (Wave 5) + pipe-run at 844x390 (Gate B
  // round 2): garden-idle + valve-turn + pipe-run + fountain-reveal at each
  // non-primary viewport, rather than just one representative state — stops
  // as soon as all four are captured instead of driving the whole loop to
  // replay-choice, since only the first fountain's cycle is needed for this
  // evidence.
  const LANDSCAPE_KEY_STATES = ['garden-idle', 'valve-turn', 'pipe-run', 'fountain-reveal'] as const;

  for (const viewport of ACCEPTANCE_VIEWPORTS.filter((v) => v.label !== '390x844')) {
    test(`key states at ${viewport.label}`, async ({ page }) => {
      test.setTimeout(180_000);
      const console_ = collectConsole(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      if (!(await hasDebugApi(page))) {
        test.skip(true, SKIP_REASON);
        return;
      }

      const captured = new Set<string>();
      let valveAttempts = 0;
      for (let step = 0; step < 200 && captured.size < LANDSCAPE_KEY_STATES.length; step++) {
        const debug = await readDebug(page);
        const phase = debug.phase;

        if ((LANDSCAPE_KEY_STATES as readonly string[]).includes(phase) && !captured.has(phase)) {
          captured.add(phase);
          await page.waitForTimeout(1300); // see the primary test's settle-time comment above
          await captureState(page, viewport.label, phase);
        }

        switch (phase) {
          case 'title':
            await synthesizeTap(page, 0.5, 0.5);
            break;
          case 'whistle-cue': {
            const w = debug.hotspots.whistle ?? { x: 0.5, y: 0.16, r: 0.2 };
            await synthesizeTap(page, w.x, w.y);
            break;
          }
          case 'valve-turn': {
            const v = debug.hotspots.valve ?? { x: 0.5, y: 0.5, r: 0.2 };
            await synthesizeCircularDrag(page, { centerXNorm: v.x, centerYNorm: v.y, turns: 1, clockwise: true });
            valveAttempts += 1;
            if (valveAttempts > 20) throw new Error('valve-turn did not reach openness >= 1 after 20 circular drags');
            break;
          }
          default:
            await page.waitForTimeout(400);
            break;
        }
      }

      for (const state of LANDSCAPE_KEY_STATES) {
        expect(captured.has(state), `expected a screenshot of key state "${state}" at ${viewport.label}`).toBe(true);
      }

      expect(console_.errors, `console errors: ${console_.errors.join('\n')}`).toEqual([]);
      expect(console_.pageErrors, `unhandled page errors: ${console_.pageErrors.join('\n')}`).toEqual([]);
    });
  }
});
