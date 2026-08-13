import type { Locator, Page } from '@playwright/test';

import type { CameraCueId } from '../../src/contracts/camera.ts';
import type { SoundCueId } from '../../src/contracts/events.ts';
import type { GameStateId } from '../../src/contracts/states.ts';
import type { EiffelReadouts } from '../../src/contracts/testing.ts';
import type { EiffelTestApiWithSoundLog } from '../../src/app/testApi.ts';

declare global {
  interface Window {
    /** `EiffelTestAPI` plus the integrator's QA-only `soundCueLog` bonus (`src/app/testApiSoundLog.ts`). */
    __eiffel: EiffelTestApiWithSoundLog;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 50;

/**
 * Poll an in-page condition until it is true. Never a fixed `waitForTimeout`
 * — this is a real condition wait (Playwright re-evaluates `predicate` in
 * the browser at `POLL_INTERVAL_MS` and resolves the instant it is true).
 */
export async function waitForCondition(
  page: Page,
  predicate: () => boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.waitForFunction(predicate, undefined, {
    timeout: timeoutMs,
    polling: POLL_INTERVAL_MS,
  });
}

/** Poll until `window.__eiffel.sceneReady` is true. */
export async function waitForSceneReady(page: Page, timeoutMs?: number): Promise<void> {
  await waitForCondition(page, () => Boolean(window.__eiffel?.sceneReady), timeoutMs);
}

/** Poll until `window.__eiffel.state` equals `state`. */
export async function waitForState(page: Page, state: GameStateId, timeoutMs?: number): Promise<void> {
  await page.waitForFunction(
    (expected: string) => window.__eiffel?.state === expected,
    state,
    { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, polling: POLL_INTERVAL_MS },
  );
}

/** Poll until `readouts().cameraCue` equals `cue`. */
export async function waitForCameraCue(page: Page, cue: CameraCueId, timeoutMs?: number): Promise<void> {
  await page.waitForFunction(
    (expected: string) => window.__eiffel?.readouts().cameraCue === expected,
    cue,
    { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, polling: POLL_INTERVAL_MS },
  );
}

/** Poll until `readouts().cameraSettled` is true. */
export async function waitForCameraSettled(page: Page, timeoutMs?: number): Promise<void> {
  await page.waitForFunction(() => window.__eiffel?.readouts().cameraSettled === true, undefined, {
    timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
    polling: POLL_INTERVAL_MS,
  });
}

/**
 * Poll `__eiffel.cameraCueProgress` (QA-only bonus — `CameraDirector.cueProgress`)
 * until it reaches at least `minProgress`, pumping a zero-sim-step render pass
 * (`step(0)`) on every poll so a multi-stage camera cue's wall-clock-timed
 * keyframe walk actually advances even with RAF-driven stepping off
 * (deterministic mode). Used to stage a screenshot mid-cue (e.g. VISUAL_
 * ACCEPTANCE's "cable/pulley mid-journey" shot) rather than at a keyframe
 * endpoint.
 */
export async function waitForCameraCueProgress(
  page: Page,
  minProgress: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await page.waitForFunction(
    (min: number) => {
      window.__eiffel.step(0);
      return window.__eiffel.cameraCueProgress >= min;
    },
    minProgress,
    { timeout: timeoutMs, polling: POLL_INTERVAL_MS },
  );
}

/** Read every readout in one round trip. */
export async function readEiffel(page: Page): Promise<EiffelReadouts> {
  return page.evaluate(() => window.__eiffel.readouts());
}

/** Read the console-captured error log. Should always be `[]` in a healthy run. */
export async function readErrors(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => window.__eiffel.errors);
}

/** Snapshot of the QA-only recent `sound:cue` ring buffer (`__eiffel.soundCueLog`). */
export async function readSoundCueLog(page: Page): Promise<readonly SoundCueId[]> {
  return page.evaluate(() => window.__eiffel.soundCueLog);
}

/** `__eiffel.gotoState(id)` + wait until `state` reflects it. */
export async function gotoState(page: Page, state: GameStateId, timeoutMs?: number): Promise<void> {
  await page.evaluate((id: GameStateId) => {
    window.__eiffel.gotoState(id);
  }, state);
  await waitForState(page, state, timeoutMs);
}

/** `__eiffel.setT(t)` + wait until the readout's `t` reflects it (deterministic mode). */
export async function setT(page: Page, t: number, timeoutMs?: number): Promise<void> {
  await page.evaluate((value: number) => {
    window.__eiffel.setT(value);
  }, t);
  await page.waitForFunction(
    (expected: number) => Math.abs(window.__eiffel.readouts().t - expected) < 1e-6,
    t,
    { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, polling: POLL_INTERVAL_MS },
  );
}

/**
 * `__eiffel.settled()` (camera + interior tweens idle) as a Playwright wait
 * — awaits the in-page promise directly rather than polling, since
 * `settled()` already implements its own bounded poll loop (see
 * `src/app/App.ts`).
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() => window.__eiffel.settled());
}

/**
 * Advance the deterministic-mode sim in `chunk`-step bursts (fast: no
 * rendering required between bursts) until `predicate(readouts)` is true, or
 * throw once `maxSteps` total steps have run without satisfying it. This is
 * the condition-polling equivalent of "hold a control until X happens" that
 * stays fast regardless of the renderer's real frame rate.
 */
export async function stepUntil(
  page: Page,
  predicate: (readouts: EiffelReadouts) => boolean,
  options: { readonly chunk?: number; readonly maxSteps?: number } = {},
): Promise<EiffelReadouts> {
  const chunk = options.chunk ?? 30;
  const maxSteps = options.maxSteps ?? 30_000;
  let total = 0;
  for (;;) {
    const readouts = await readEiffel(page);
    if (predicate(readouts)) return readouts;
    if (total >= maxSteps) {
      throw new Error(`stepUntil: predicate not satisfied within ${maxSteps} steps (last readouts: ${JSON.stringify(readouts)})`);
    }
    await page.evaluate((n: number) => {
      window.__eiffel.step(n);
    }, chunk);
    total += chunk;
  }
}

/**
 * Drag a vertical slide control (master lever) starting from its own
 * center, `deltaYPx` pixels (negative = up = increasing value per
 * `mapVerticalDrag`'s sign convention). Leaves the pointer held down (does
 * NOT release) so the caller can keep advancing sim steps under a live
 * "hold" input, matching the real one-finger interaction — call
 * `page.mouse.up()` (or `releasePointer(page)`) to let go.
 */
export async function dragVerticalHold(page: Page, locator: Locator, deltaYPx: number, steps = 6): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('dragVerticalHold: target has no bounding box (not visible?)');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaYPx, { steps });
}

/** Release whatever `page.mouse.down()` is currently holding. */
export async function releasePointer(page: Page): Promise<void> {
  await page.mouse.up();
}

/**
 * A press-release on `locator` (exercising `EiffelUiLayer`'s real idle-timer
 * bookkeeping — every control's `pointerdown` handler calls
 * `resetIdleTimer()`, which hides any active ghost-hand demo before
 * re-arming the 5s timer, PRODUCT_SPEC "Feedback rules"), followed by an
 * unconditional, instant, direct style override that guarantees the ghost
 * hand glyph is actually gone from the very next paint. Used right before a
 * QA screenshot to guarantee a clean shot even if the preceding wait
 * happened to run past the idle threshold.
 *
 * INTEGRATOR FIX (Wave 4, visual QA pass — VISUAL_ACCEPTANCE
 * `04-first-slope`): `resetIdleTimer()`'s hide only removes the
 * `eiffel-visible` class, which starts `.eiffel-ghost-hand`'s CSS
 * `opacity 0.3s ease` fade-out (src/styles/base.css) — it does not hide the
 * glyph instantly. A screenshot taken immediately after only the
 * press-release (the original behavior) could therefore still capture the
 * ghost-hand's pointing-finger glyph at or near full opacity, whenever the
 * real-clock wait just before this call (typically `settled()`) happened to
 * run past the 5s idle threshold — confirmed reproducible: an isolated
 * phone-landscape `04-first-slope` capture showed the glyph fully overlaid
 * on the throttle button despite this dismiss call having run right before
 * the shot.
 *
 * Two follow-up attempts at *waiting out* the fade (first via
 * `page.waitForFunction`'s default rAF-cadence polling, then via explicit
 * millisecond polling) both hung for the test's full budget instead —
 * confirmed by trace inspection sitting inside this exact call for ~524s
 * before Playwright's own timeout force-failed it. Root cause not fully
 * pinned down (candidates: this headless SwiftShader software renderer under
 * sustained sequential-suite load starving the page's own style/paint
 * pipeline; the idle timer racing its own re-arm against the poll under that
 * same slowdown) — but EITHER way, waiting on the natural transition to
 * become observable is fragile in this environment. Skips that race
 * entirely: force the glyph's opacity to 0 with `transition: none` so there
 * is no fade to observe or race against — the very next paint (including the
 * one the screenshot call itself forces) already reflects the end state,
 * with no wait of any kind and therefore nothing that can hang.
 */
export async function dismissGhostHand(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.eiffel-ghost-hand');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '0';
  });
}

/** Press-and-hold the center of `locator` (e.g. a throttle button) without releasing. */
export async function pressHold(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('pressHold: target has no bounding box (not visible?)');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

/**
 * Hold `locator` (a throttle button) and advance the sim in `chunk`-step
 * bursts until `predicate(readouts)` is true, defensively RE-PRESSING if a
 * step ever reports `valveOpen === 0 && speed === 0` while the predicate is
 * still unsatisfied (a held pointer unexpectedly reading as released — this
 * project's headless environment occasionally drops long-held synthetic
 * pointer state under sustained load). Leaves the pointer held on return;
 * call `releasePointer` when done. Throws if `maxSteps` is exhausted.
 */
export async function holdThrottleUntil(
  page: Page,
  locator: Locator,
  predicate: (readouts: EiffelReadouts) => boolean,
  options: { readonly chunk?: number; readonly maxSteps?: number } = {},
): Promise<EiffelReadouts> {
  const chunk = options.chunk ?? 30;
  const maxSteps = options.maxSteps ?? 30_000;
  await pressHold(page, locator);
  let total = 0;
  for (;;) {
    const readouts = await readEiffel(page);
    if (predicate(readouts)) return readouts;
    if (readouts.valveOpen === 0 && readouts.speed === 0) {
      await releasePointer(page);
      await pressHold(page, locator);
    }
    if (total >= maxSteps) {
      throw new Error(
        `holdThrottleUntil: predicate not satisfied within ${maxSteps} steps (last readouts: ${JSON.stringify(readouts)})`,
      );
    }
    await page.evaluate((n: number) => {
      window.__eiffel.step(n);
    }, chunk);
    total += chunk;
  }
}

/**
 * Sweep the pointer around `locator`'s center in a circular arc, generating
 * a sequence of `pointermove` events the level wheel's `rotationDeltaRadians`
 * gesture math turns into signed rotation deltas — the touch/pointer
 * equivalent of "turn the big level wheel" (PRODUCT_SPEC verb 3). Presses
 * down, sweeps, and releases in one call (the leveling assist only cares
 * about *some* wheel input having happened, not a held gesture).
 */
export async function spinWheel(
  page: Page,
  locator: Locator,
  options: { readonly turns?: number; readonly waypoints?: number; readonly clockwise?: boolean } = {},
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('spinWheel: target has no bounding box (not visible?)');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) * 0.42;
  const turns = options.turns ?? 1.5;
  const waypoints = options.waypoints ?? 8;
  const direction = options.clockwise === false ? -1 : 1;

  const pointAt = (fraction: number): { x: number; y: number } => {
    const angle = direction * fraction * turns * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  };

  const first = pointAt(0);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i <= waypoints; i += 1) {
    const p = pointAt(i / waypoints);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
}
