// tests/e2e/helpers/driveLoop.ts
// Drives the full gameplay loop (title -> ... -> finale -> replay-choice)
// using only real synthetic pointer input plus window.__versailles readbacks
// — no direct phase manipulation — per docs/ACCEPTANCE.md A1/A4.

import type { Page } from '@playwright/test';
import type { GamePhase } from '../../../src/contracts';
import { readDebug } from './debugApi';
import { synthesizeCircularDrag, synthesizeTap } from './gestures';

export interface DriveLoopOptions {
  maxSteps?: number;
  /** Invoked the first time each phase is entered (e.g. to capture a screenshot). */
  onPhaseEnter?: (phase: GamePhase) => Promise<void> | void;
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
      case 'garden-idle':
      case 'valve-approach':
      case 'pipe-run':
      case 'fountain-reveal':
      case 'finale':
      default: {
        await page.waitForTimeout(150);
        break;
      }
    }
  }

  throw new Error(
    `driveGameLoop did not reach replay-choice within ${maxSteps} steps (last phase: ${lastPhase ?? 'unknown'})`,
  );
}
