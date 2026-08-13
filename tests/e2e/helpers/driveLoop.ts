// tests/e2e/helpers/driveLoop.ts
// Drives the full gameplay loop (title -> ... -> finale -> replay-choice)
// using only real synthetic pointer input plus window.__versailles readbacks
// — no direct phase manipulation — per docs/ACCEPTANCE.md A1/A4.

import type { Page } from '@playwright/test';
import type { GamePhase } from '../../../src/contracts';
import { readDebug, type VersaillesDebug } from './debugApi';
import { synthesizeCircularDrag, synthesizeTap } from './gestures';

export interface DriveLoopOptions {
  maxSteps?: number;
  /** Invoked the first time each phase is entered (e.g. to capture a screenshot). */
  onPhaseEnter?: (phase: GamePhase) => Promise<void> | void;
  /** Invoked every iteration with the latest debug snapshot, before the
   * phase's own input dispatch — e.g. to capture screenshots at specific
   * waterProgress thresholds during 'pipe-run' rather than only on entry. */
  onTick?: (debug: VersaillesDebug) => Promise<void> | void;
  /** Stop as soon as 'replay-choice' is reached. Default true. */
  stopAtReplayChoice?: boolean;
}

/** Drives the loop; returns the ordered set of distinct phases visited. */
export async function driveGameLoop(page: Page, options: DriveLoopOptions = {}): Promise<Set<GamePhase>> {
  const maxSteps = options.maxSteps ?? 400;
  const visited = new Set<GamePhase>();
  let lastPhase: GamePhase | null = null;
  let valveAttempts = 0;

  for (let step = 0; step < maxSteps; step++) {
    const debug = await readDebug(page);
    const phase = debug.phase;

    if (phase !== lastPhase) {
      lastPhase = phase;
      valveAttempts = 0;
      if (!visited.has(phase)) {
        visited.add(phase);
        await options.onPhaseEnter?.(phase);
      }
    }

    await options.onTick?.(debug);

    if (phase === 'replay-choice' && (options.stopAtReplayChoice ?? true)) {
      return visited;
    }

    switch (phase) {
      case 'title': {
        await synthesizeTap(page, 0.5, 0.5);
        break;
      }
      case 'whistle-cue': {
        const whistle = debug.hotspots.whistle ?? { x: 0.5, y: 0.16, r: 0.2 };
        await synthesizeTap(page, whistle.x, whistle.y);
        break;
      }
      case 'valve-turn': {
        const valve = debug.hotspots.valve ?? { x: 0.5, y: 0.5, r: 0.2 };
        await synthesizeCircularDrag(page, {
          centerXNorm: valve.x,
          centerYNorm: valve.y,
          turns: 1,
          clockwise: true,
          stepDelayMs: 10,
        });
        valveAttempts += 1;
        if (valveAttempts > 20) {
          throw new Error('valve-turn did not reach openness >= 1 after 20 circular drags');
        }
        break;
      }
      case 'pipe-run': {
        // Finer-grained than the other auto-advancing phases, and finer
        // still once waterProgress is closing in on 1.0: onTick callers
        // (e.g. capturing screenshots at specific waterProgress thresholds)
        // need enough resolution to land a capture before this short phase
        // (PIPE_RUN_MIN_SEC = 1.8s) has already moved on to water-arrived —
        // the t:0.85->1.0 window alone can be under 300ms of real time.
        await page.waitForTimeout(debug.waterProgress > 0.6 ? 50 : 150);
        break;
      }
      case 'garden-idle':
      case 'valve-approach':
      case 'fountain-reveal':
      case 'finale':
      default: {
        // A longer poll interval here trades a little latency for far fewer
        // Playwright/CDP round trips (each carries fixed protocol overhead
        // in this environment) while waiting out these phases' own
        // multi-second automatic timers.
        await page.waitForTimeout(400);
        break;
      }
    }
  }

  throw new Error(
    `driveGameLoop did not reach replay-choice within ${maxSteps} steps (last phase: ${lastPhase ?? 'unknown'})`,
  );
}
