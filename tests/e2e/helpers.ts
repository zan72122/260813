import type { Page } from '@playwright/test';
import type { GamePhase, GameStateSnapshot } from '../../src/core/types';

/** Reads the current GameStateSnapshot via the window.__stageDebug hook (src/app/debugHook.ts). */
export async function getState(page: Page): Promise<GameStateSnapshot> {
  const state = await page.evaluate(() => window.__stageDebug?.getState());
  if (!state) throw new Error('window.__stageDebug.getState() is not installed');
  return state;
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const canvas = page.locator('#app canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('#app canvas has no bounding box (not attached/visible?)');
  return box;
}

/** A stationary tap at normalized (xFrac, yFrac) inside the canvas, via real PointerEvents (mouse). */
export async function tapCanvas(page: Page, xFrac = 0.5, yFrac = 0.5): Promise<void> {
  const box = await canvasBox(page);
  const x = box.x + box.width * xFrac;
  const y = box.y + box.height * yFrac;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

export interface DragOptions {
  xFrac?: number;
  steps?: number;
  /** ms to wait between intermediate move steps, to give rAF frames a chance to observe stop-state. */
  stepDelayMs?: number;
}

/** A vertical drag gesture from startYFrac to endYFrac (both 0..1, normalized to canvas height). */
export async function dragCanvasVertical(
  page: Page,
  startYFrac: number,
  endYFrac: number,
  options: DragOptions = {}
): Promise<void> {
  const { xFrac = 0.5, steps = 8, stepDelayMs = 0 } = options;
  const box = await canvasBox(page);
  const x = box.x + box.width * xFrac;
  const startY = box.y + box.height * startYFrac;
  const endY = box.y + box.height * endYFrac;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps;
    await page.mouse.move(x, y);
    if (stepDelayMs > 0) await page.waitForTimeout(stepDelayMs);
  }
}

export async function releaseDrag(page: Page): Promise<void> {
  await page.mouse.up();
}

/** Polls getState().phase until it matches, or gives up (returns false) after timeoutMs. Never throws. */
export async function waitForPhase(page: Page, phase: GamePhase, timeoutMs = 4000): Promise<boolean> {
  try {
    await page.waitForFunction((p) => window.__stageDebug?.getState().phase === p, phase, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort walk through the documented phase table (docs/MASTER_SPEC.md
 * GamePhase progression) using only ActionIntent-shaped gestures (tap /
 * lock-release swipe / rope drag) — the same inputs a real child would give.
 * Returns the last phase actually reached. Each step is short-timeout
 * (phases that require unimplemented owner-A game logic will simply not
 * advance; the walk stops there rather than hanging for the full test
 * timeout). See the report's "core change requests" for the missing
 * `skipToPhase`-style debug hook that would let this run in one step once
 * available.
 */
export async function walkToward(page: Page, target: GamePhase, perStepTimeoutMs = 3000): Promise<GamePhase> {
  const steps: Array<{ phase: GamePhase; act: () => Promise<void> }> = [
    { phase: 'title', act: () => tapCanvas(page, 0.5, 0.5) },
    { phase: 'cue', act: () => Promise.resolve() }, // establish -> cue is a CinematicBeat auto-advance
    { phase: 'descend', act: () => tapCanvas(page, 0.5, 0.85) }, // tap near the glowing stage floor
    { phase: 'unlock', act: () => Promise.resolve() }, // descend -> unlock is a CinematicBeat auto-advance
    {
      phase: 'pull1',
      act: () => tapCanvas(page, 0.5, 0.6) // unlock: tap or short downward swipe releases the lock
    },
    { phase: 'reveal1', act: () => dragCanvasVertical(page, 0.2, 0.9).then(() => releaseDrag(page)) },
    { phase: 'cue2', act: () => Promise.resolve() },
    { phase: 'pull2', act: () => tapCanvas(page, 0.5, 0.5) },
    { phase: 'reveal2', act: () => dragCanvasVertical(page, 0.2, 0.9).then(() => releaseDrag(page)) },
    { phase: 'finale', act: () => Promise.resolve() },
    { phase: 'choice', act: () => Promise.resolve() }
  ];

  let lastReached: GamePhase = (await getState(page)).phase;
  for (const step of steps) {
    await step.act();
    const reached = await waitForPhase(page, step.phase, perStepTimeoutMs);
    if (reached) lastReached = step.phase;
    if (!reached || step.phase === target) break;
  }
  return lastReached;
}
