/**
 * Shared helpers for tests/e2e/full-loop.spec.ts and
 * tests/e2e/qa-screenshots.spec.ts. Every gameplay-advancing helper here
 * drives the game exclusively through `window.__eiffel` (contracts/testing.ts)
 * `drive.*` — the same Intent path real gestures use (see that contract's
 * own doc comment) — for every actual game *action*. Condition-waits poll
 * `__eiffel` state in a loop; nothing here uses a bare `page.waitForTimeout`.
 *
 * Two ways time gets advanced, used deliberately for different purposes:
 *
 * - `renderSync()` calls the real, documented `TestApi.step()` — one fixed
 *   logic tick paired with one real render each, exactly as
 *   contracts/testing.ts specifies. Use this whenever a render-owned,
 *   per-frame-integrated animation (camera easing, pulse decay, the
 *   `settled()` signal, anything about to be screenshotted) needs to
 *   actually catch up to the current GameState.
 * - `fastForward()` calls `window.__eiffelFastForward` — a debug-only,
 *   non-contract hook (src/app/debug.ts) that ticks game LOGIC at the
 *   identical real `FIXED_DT` rate with no paired render call. Game-state
 *   correctness never depends on rendering, so this is what every bulk
 *   phase here uses (e.g. draining several hundred fixed steps' worth of
 *   sand — legModel.ts's depletion has no shortcut, it must be ticked at
 *   the real rate) — see that module's doc comment for why this exists:
 *   this sandboxed/software-GL environment measures ~50-170ms per real
 *   draw call, which would make a several-hundred-frame sand-depletion
 *   phase alone take a minute-plus if every tick also rendered.
 *
 * Every helper that finishes a "phase" (deplete sand, pump to snap, wedge +
 * hammer, skip through cinematics) ends with a small `renderSync()` so its
 * returned state's *visuals* are reasonably caught up too, without paying
 * that cost on every intermediate poll.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { GameState, LegId } from '../../src/contracts/types';

/** Functional/correctness tests use `quality=low`: it disables shadows AND
 * antialiasing from the very first frame. `high` (the production default)
 * is fine on real hardware, but in this sandboxed headless/software-GL
 * environment its shadow-map toggle (adaptive quality auto-downgrades away
 * from `high` after ~1s of consistently-slow frames — a correct, intended
 * PERFORMANCE_BUDGET.md behavior) triggers Three.js's lazy shader
 * recompilation for every affected material, costing 10+ real seconds per
 * page load. `low`/`medium` never enable shadows in the first place, so
 * there is nothing to toggle and no stall — this is a pure test-speed
 * choice made entirely inside this test file, no production/contract code
 * is affected. */
export const FAST_QUALITY = 'low';
/** QA screenshots want closer-to-production visual fidelity (antialias on,
 * full particle budget) without paying the `high`-tier shadow-toggle stall
 * described above — `medium` gets there. */
export const SCREENSHOT_QUALITY = 'medium';

export interface BootOptions {
  seed?: number;
  quality?: string;
  extraParams?: Record<string, string>;
}

/** Navigates to the app in `?fixedStep=1` deterministic mode and waits for `__eiffel.ready`. */
export async function bootApp(page: Page, opts: BootOptions = {}): Promise<void> {
  const params = new URLSearchParams({
    seed: String(opts.seed ?? 42),
    fixedStep: '1',
    quality: opts.quality ?? FAST_QUALITY,
    ...opts.extraParams,
  });
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(
    () => {
      try {
        return window.__eiffel.ready;
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 15_000 },
  );
}

export async function getState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__eiffel.state());
}

/** Real, documented `TestApi.step()`: `frames` paired logic+render steps. Use for visual catch-up (camera/pulses/settle) before a `settled()` check or a screenshot. */
export async function renderSync(page: Page, frames = 5): Promise<GameState> {
  return page.evaluate((n) => {
    window.__eiffel.step(n);
    return window.__eiffel.state();
  }, frames);
}

/** Real-rendered batches (via `renderSync`) until `window.__eiffel.settled()` is true — polls `__eiffel`, never a bare timeout. Render-owned pulse decays (see src/render/pulse.ts) are half-life based, so this can need a few hundred real frames after a reveal-beat-sized trigger; call sparingly. */
export async function renderSyncUntilSettled(page: Page, opts: { batch?: number; maxFrames?: number } = {}): Promise<void> {
  const batch = opts.batch ?? 60;
  const maxFrames = opts.maxFrames ?? 900;
  let total = 0;
  let settled = await page.evaluate(() => window.__eiffel.settled());
  while (!settled && total < maxFrames) {
    await renderSync(page, batch);
    total += batch;
    settled = await page.evaluate(() => window.__eiffel.settled());
  }
  if (!settled) {
    throw new Error(`renderSyncUntilSettled did not settle within ${String(maxFrames)} frames`);
  }
}

/** Debug-only bulk game-logic tick (no render) — see this module's doc comment. Falls back to a no-op if the hook is ever absent (defensive only; it is always present under `?fixedStep=1`). */
async function fastForward(page: Page, frames: number): Promise<GameState> {
  return page.evaluate((n) => {
    window.__eiffelFastForward?.(n);
    return window.__eiffel.state();
  }, frames);
}

/**
 * Bulk-ticks (fast, no render) in batches until `predicate(state)` holds.
 * Exported (F1, review round 1) for tests/e2e/full-loop.spec.ts's finalReveal
 * step: `game/controller.ts` deliberately makes `finalReveal`'s reveal-beat/
 * settle/pullback chain NOT mash-skippable via `drive.advance()` anymore
 * (PRODUCT_SPEC's biggest reward, protected from a child's rapid taps), so
 * hurrying through it in a test now means advancing real logical time
 * (`__eiffelFastForward`, i.e. this function) instead of `skipUntil`'s
 * repeated `drive.advance()` calls.
 */
export async function fastForwardUntil(
  page: Page,
  predicate: (s: GameState) => boolean,
  opts: { batch?: number; maxFrames?: number; label?: string } = {},
): Promise<GameState> {
  const batch = opts.batch ?? 60;
  const maxFrames = opts.maxFrames ?? 2400;
  let total = 0;
  let state = await getState(page);
  while (!predicate(state) && total < maxFrames) {
    state = await fastForward(page, batch);
    total += batch;
  }
  if (!predicate(state)) {
    throw new Error(
      `fastForwardUntil exceeded ${String(maxFrames)} frames${opts.label ? ` (${opts.label})` : ''}; last state: ${JSON.stringify(state)}`,
    );
  }
  return state;
}

/**
 * Repeats `drive.advance()` (each fast-forwarding whatever controller
 * cinematic is currently pending — see src/game/controller.ts's module doc
 * §3) until `predicate(state)` holds. GameController chains several
 * cinematic holds back to back (e.g. a leg lock cascades through an orbit
 * hold *then* an intro hold before the next leg reaches 'sand'), each
 * requiring its own `advance` on a separate tick — this loop is robust to
 * exactly how many are chained, rather than hardcoding a count. Calling
 * `advance` with nothing pending is always a safe no-op (forwards straight
 * to the pure reducer, itself a no-op outside boot/establish/intro/finalReveal),
 * so overshooting `maxSkips` attempts is harmless right up until the throw.
 */
export async function skipUntil(
  page: Page,
  predicate: (s: GameState) => boolean,
  opts: { maxSkips?: number; label?: string } = {},
): Promise<GameState> {
  const maxSkips = opts.maxSkips ?? 10;
  let state = await getState(page);
  for (let i = 0; i < maxSkips && !predicate(state); i++) {
    state = await page.evaluate(() => {
      window.__eiffel.drive.advance();
      window.__eiffelFastForward?.(2);
      return window.__eiffel.state();
    });
  }
  if (!predicate(state)) {
    throw new Error(
      `skipUntil exceeded ${String(maxSkips)} advance-skips${opts.label ? ` (${opts.label})` : ''}; last state: ${JSON.stringify(state)}`,
    );
  }
  return state;
}

/** Skips through boot/establish/intro/orbit cinematics until `leg` is the active leg and in 'sand' phase, ready for gate input. */
export async function advanceToSand(page: Page, leg: LegId): Promise<GameState> {
  return skipUntil(page, (s) => s.activeLeg === leg && s.legs[leg].phase === 'sand', {
    maxSkips: 12,
    label: `advanceToSand(leg ${String(leg)})`,
  });
}

/** Opens the sand gate fully and bulk-ticks until this leg's sand is depleted (phase leaves 'sand'). */
export async function depleteSand(page: Page, leg: LegId, opts: { maxFrames?: number } = {}): Promise<GameState> {
  await page.evaluate(() => {
    window.__eiffel.drive.setGate(1);
  });
  return fastForwardUntil(page, (s) => s.legs[leg].phase !== 'sand', {
    batch: 60,
    maxFrames: opts.maxFrames ?? 2000,
    label: `depleteSand(leg ${String(leg)})`,
  });
}

/** Pumps the jack until this leg snaps (phase leaves 'jack') or a pump budget is exhausted. */
export async function pumpToSnap(page: Page, leg: LegId, opts: { maxPumps?: number } = {}): Promise<GameState> {
  const maxPumps = opts.maxPumps ?? 20;
  let state = await getState(page);
  for (let i = 0; i < maxPumps && state.legs[leg].phase === 'jack'; i++) {
    state = await page.evaluate(() => {
      window.__eiffel.drive.pump();
      window.__eiffelFastForward?.(1);
      return window.__eiffel.state();
    });
  }
  if (state.legs[leg].phase === 'jack') {
    throw new Error(`pumpToSnap(leg ${String(leg)}) did not snap within ${String(maxPumps)} pumps`);
  }
  return state;
}

/** Drags the wedge fully in, releases, and hammers — locking the leg (assumes it is already in 'wedge' phase). */
export async function wedgeAndHammer(page: Page, _leg: LegId): Promise<GameState> {
  return page.evaluate(() => {
    const api = window.__eiffel;
    api.drive.dragWedge(1);
    window.__eiffelFastForward?.(1);
    api.drive.releaseWedge();
    window.__eiffelFastForward?.(1);
    api.drive.hammer();
    window.__eiffelFastForward?.(1);
    return api.state();
  });
}

/**
 * Full pipeline for one leg, from 'sand' phase through to `legLocked`
 * (leaves the state machine wherever the lock cascades to — the next leg's
 * fresh 'intro', or `finalReveal` for the last leg). Assumes the leg is
 * already the active leg and already in 'sand' phase.
 */
export async function playLeg(page: Page, leg: LegId): Promise<GameState> {
  let state = await depleteSand(page, leg);
  expect(state.legs[leg].sandLevel, `leg ${String(leg)} sand should be fully depleted`).toBe(0);
  expect(state.legs[leg].legOffsetY, `leg ${String(leg)} should overshoot below target after sand alone`).toBeLessThan(0);
  expect(state.legs[leg].phase).toBe('jack');

  state = await pumpToSnap(page, leg);
  expect(state.legs[leg].alignmentError).toBeLessThanOrEqual(1.0);
  expect(state.legs[leg].phase).toBe('wedge');

  state = await wedgeAndHammer(page, leg);
  expect(state.legs[leg].locked, `leg ${String(leg)} should be locked after hammer`).toBe(true);
  return state;
}

/** Collects console.error / uncaught page errors for the lifetime of `page`; call `assertNoErrors()` at the end of a test. */
export function collectPageErrors(page: Page): { assertNoErrors: () => void } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  return {
    assertNoErrors: () => {
      expect(pageErrors, `uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
      expect(consoleErrors, `console.error calls: ${consoleErrors.join('; ')}`).toEqual([]);
    },
  };
}

/**
 * Samples luminance min/max/avg from a real screenshot — a cheap "is this
 * actually a rendered scene, not a blank frame" probe. Deliberately goes
 * through `page.screenshot()` (the browser's own compositor output, always
 * reliable) rather than `drawImage`-ing the live WebGL `<canvas>` directly:
 * without `preserveDrawingBuffer` (the renderer's default), a WebGL
 * canvas's own backing buffer can already be implicitly cleared by the time
 * a *separate* `page.evaluate` call samples it — empirically confirmed
 * against this app (sampling the live canvas read back all-zero even
 * immediately after a real render). A compositor screenshot has no such
 * gotcha and is also exactly what the QA screenshot spec cares about.
 */
export async function probeCanvas(page: Page): Promise<{ min: number; max: number; avg: number }> {
  const png = await page.screenshot();
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const probe = document.createElement('canvas');
    probe.width = img.naturalWidth;
    probe.height = img.naturalHeight;
    const ctx = probe.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable for canvas probe');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
    let min = 255;
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      sum += lum;
      count++;
    }
    return { min, max, avg: sum / count };
  }, png.toString('base64'));
}

/** `artifacts/qa/<project-name>/` — Integrator-owned QA screenshot output (docs/FILE_OWNERSHIP.md). */
const QA_ROOT = path.resolve(process.cwd(), 'artifacts', 'qa');

export interface QaShotStats {
  bytes: number;
  min: number;
  max: number;
  avg: number;
}

/**
 * Saves a real, full-viewport compositor screenshot (DOM overlay + canvas,
 * exactly what a player sees — HUD chrome included, matching
 * VISUAL_ACCEPTANCE's portrait/landscape shots) to
 * `artifacts/qa/<projectName>/<filename>` and verifies it is a genuine,
 * non-blank capture of the scene before returning:
 *
 *  - file size: on-disk PNG must be a "substantial" image (default >20KB —
 *    VISUAL_ACCEPTANCE's shots are full-viewport 3D scenes with materials,
 *    lighting and (for several shots) DOM overlay chrome; a blank/near-blank
 *    frame compresses to a few hundred bytes to a couple KB, nowhere close).
 *  - pixel variance: decodes the SAME bytes just written (reusing
 *    `probeCanvas`'s min/max/avg luminance technique, fed the screenshot
 *    buffer directly rather than re-screenshotting) and requires
 *    `max - min` to clear a threshold — catches a solid-color frame (e.g.
 *    the flat `#ece0c8` boot background) that happens to be large enough to
 *    pass the byte-size check on its own (unlikely for this app's palette,
 *    but checked explicitly rather than assumed).
 *
 * Both assertions run inside this helper (not left to the caller) so every
 * QA screenshot call site gets the same hard verification the task requires
 * — a call site cannot silently skip it.
 */
export async function captureQaShot(
  page: Page,
  projectName: string,
  filename: string,
  opts: { minBytes?: number; minVariance?: number } = {},
): Promise<QaShotStats> {
  const dir = path.join(QA_ROOT, projectName);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);

  const png = await page.screenshot({ path: filePath });

  const pixelStats = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const probe = document.createElement('canvas');
    probe.width = img.naturalWidth;
    probe.height = img.naturalHeight;
    const ctx = probe.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable for QA screenshot probe');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
    let min = 255;
    let max = 0;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      sum += lum;
      count++;
    }
    return { min, max, avg: sum / count };
  }, png.toString('base64'));

  const bytes = (await fs.stat(filePath)).size;
  const minBytes = opts.minBytes ?? 20_000;
  const minVariance = opts.minVariance ?? 15;

  expect(bytes, `${filePath} should be a substantial, real PNG capture, got ${String(bytes)} bytes`).toBeGreaterThan(minBytes);
  expect(
    pixelStats.max - pixelStats.min,
    `${filePath} expected real visual variance (not blank/solid), got ${JSON.stringify(pixelStats)}`,
  ).toBeGreaterThan(minVariance);

  return { bytes, ...pixelStats };
}
