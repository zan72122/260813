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

/**
 * Completes a pull1/pull2 rope drag from wherever it currently sits to
 * progress===1, via repeated grab/drag/release stroke cycles rather than one
 * long drag. This matches docs/MASTER_SPEC.md's stroke spec directly: "一回の
 * フルストローク（画面高の約60%）で progress +0.35...手繰り寄せ式に複数スト
 * ロークで満了" — a single stroke only ever contributes a fraction of the
 * total (releasing between strokes does not reset progress; GameDirector's
 * 'ropeRelease' handling is a no-op), so reaching completion requires
 * multiple release/re-grab cycles, exactly like a child hauling in a bell
 * rope hand-over-hand.
 */
export async function pullRopeToCompletion(page: Page, maxStrokes = 5): Promise<void> {
  for (let i = 0; i < maxStrokes; i++) {
    const state = await getState(page);
    if (state.progress >= 1) return;
    await dragCanvasVertical(page, 0.1, 0.9, { steps: 8 });
    await releaseDrag(page);
  }
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
 * Returns the last phase actually reached. Each step is short-timeout, so a
 * regression that breaks a transition stops the walk there rather than
 * hanging for the full test timeout, instead of masking the failure.
 *
 * window.__stageDebug.skipToPhase() (Wave 3) can jump directly to a phase
 * for tests that only need to observe that phase's static state and don't
 * care about exercising the real gesture-driven transition into it; this
 * helper stays gesture-based because most F-series tests specifically want
 * to exercise real ActionIntent-driven transitions, not skip past them.
 */
export async function walkToward(page: Page, target: GamePhase, perStepTimeoutMs = 9500): Promise<GamePhase> {
  // Each entry's `phase` is the phase reached AFTER that entry's `act()` (plus
  // any resulting auto-advance) settles — NOT the phase `act()` is performed
  // in. GameDirector advances boot -> title on its own first tick, well
  // before Playwright can act, so the walk starts by tapping (assumed already
  // in 'title') and waits for the *result* of that tap, 'establish'; it does
  // not separately wait to observe 'title' first (that would race against
  // GameDirector auto-advancing past it before the poll ever samples it).
  const steps: Array<{ phase: GamePhase; act: () => Promise<void> }> = [
    { phase: 'establish', act: () => tapCanvas(page, 0.5, 0.5) }, // title tap starts the show
    { phase: 'cue', act: () => Promise.resolve() }, // establish -> cue is a CinematicBeat auto-advance (6s)
    { phase: 'descend', act: () => tapCanvas(page, 0.5, 0.85) }, // tap near the glowing stage floor
    { phase: 'unlock', act: () => Promise.resolve() }, // descend -> unlock is a CinematicBeat auto-advance (6s)
    {
      phase: 'pull1',
      act: () => tapCanvas(page, 0.5, 0.6) // unlock: tap or short downward swipe releases the lock
    },
    { phase: 'reveal1', act: () => pullRopeToCompletion(page) },
    { phase: 'cue2', act: () => Promise.resolve() }, // reveal1 -> cue2 is a CinematicBeat auto-advance (8s)
    {
      // cue2's InputSystem mode is 'rope' (matches pull1/pull2's own mechanic, not 'tap' — see
      // src/app/App.ts's PHASE_INPUT_MODE), so a bare tap only grabs/releases the rope with zero
      // delta and never fires GameDirector's tap-triggered beginPull. A real (small) drag both
      // starts the cue2 -> pull2 transition and begins contributing progress, same as a child
      // continuing the same pulling motion from the shortened second cue.
      phase: 'pull2',
      act: () => dragCanvasVertical(page, 0.3, 0.42, { steps: 3 }).then(() => releaseDrag(page))
    },
    { phase: 'reveal2', act: () => pullRopeToCompletion(page) },
    { phase: 'finale', act: () => Promise.resolve() }, // reveal2 -> finale is a CinematicBeat auto-advance (8s)
    { phase: 'choice', act: () => Promise.resolve() } // finale -> choice is a timed auto-advance (4s)
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
