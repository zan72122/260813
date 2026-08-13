import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import type { GameState } from '../../src/contracts/types';
import {
  bootApp,
  getState,
  renderSync,
  renderSyncUntilSettled,
  fastForwardUntil,
  advanceToSand,
  depleteSand,
  pumpToSnap,
  wedgeAndHammer,
  playLeg,
  collectPageErrors,
  probeCanvas,
  captureQaShot,
  FAST_QUALITY,
  SCREENSHOT_QUALITY,
} from './helpers';

const SEED = 42;

/**
 * The complete gameplay loop, driven exclusively through `window.__eiffel`
 * (contracts/testing.ts) under `?seed=42&fixedStep=1` — deterministic,
 * no wall-clock dependency (src/game/controller.ts's cinematic timers run
 * on the `dt` this file feeds via `__eiffel.step`/the debug fast-forward
 * hook, never `performance.now()`). Split into several `test()` blocks
 * inside one `test.describe.serial` so a failure localizes to the specific
 * leg/stage instead of one monolithic test — they share one `page` and one
 * running game session on purpose (later legs need earlier legs' progress).
 * Runs across all 4 Playwright projects (phone/tablet × portrait/landscape)
 * declared in playwright.config.ts, since it is invoked without a
 * `--project` filter by `npm run test:e2e:full` / `npm run verify`.
 */
test.describe.serial(`full loop (seed=${String(SEED)})`, () => {
  let page: Page;
  let errors: ReturnType<typeof collectPageErrors>;
  let leg0InitialOffset: number;
  let baselineRenderInfo: { geometries: number; textures: number; drawCalls: number };

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    errors = collectPageErrors(page);
  });

  test.afterAll(async () => {
    errors.assertNoErrors();
    await page.close();
  });

  test('loads, becomes ready, first tap leaves boot for establish', async () => {
    await bootApp(page, { seed: SEED });

    const boot = await getState(page);
    expect(boot.phase).toBe('boot');
    expect(boot.seed >>> 0).toBe(SEED);
    leg0InitialOffset = boot.legs[0].legOffsetY;
    expect(leg0InitialOffset).toBeGreaterThan(0); // PRODUCT_SPEC: leg starts above target.
    const bootRenderInfo = await page.evaluate(() => window.__eiffel.renderInfo());
    expect(bootRenderInfo.geometries).toBeGreaterThan(0);

    // The real first-tap gesture (not `drive.*`): exercises src/app/bootstrap.ts's
    // actual `ui.ready()` → `audio.unlock()` → `advance` production wiring,
    // and is what reveals the HUD/completion-menu overlays for the rest of
    // this suite (they sit beneath the opaque loading screen until this tap
    // — see src/ui/loadingScreen.ts).
    await page.locator('.eiffel-loading-art').click();

    // The tap's `advance` Intent is only *queued* (applyIntent never mutates
    // synchronously — src/game/controller.ts doc §1); under `?fixedStep=1`
    // nothing self-ticks, so poll by stepping until it has been drained.
    let state = boot;
    for (let i = 0; i < 20 && state.phase === 'boot'; i++) {
      state = await renderSync(page, 1);
    }
    expect(state.phase).toBe('establish');

    await expect(page.locator('.eiffel-hud-pause')).toBeVisible();
    await expect(page.locator('.eiffel-hud-sound')).toBeVisible();
  });

  test('leg 1 (index 0): gate → sand flow → sandDepleted → pumps → snap → wedge → hammer → locked', async () => {
    await advanceToSand(page, 0);
    const locked = await playLeg(page, 0);
    expect(locked.legs[0].locked).toBe(true);
    expect(locked.legs[0].legOffsetY).toBe(0);
  });

  test('leg 2 (index 1): same pipeline', async () => {
    await advanceToSand(page, 1);
    const locked = await playLeg(page, 1);
    expect(locked.legs[1].locked).toBe(true);
  });

  test('mid-game viewport orientation swap preserves state and resizes the canvas', async () => {
    const before = await getState(page);
    const size = page.viewportSize();
    if (!size) throw new Error('viewport size unavailable');

    await page.setViewportSize({ width: size.height, height: size.width });

    // Debounced (150ms, core/resize.ts) — poll the canvas's own layout box
    // rather than a bare timeout.
    await page.waitForFunction(
      (expected) => {
        const canvas = document.getElementById('scene');
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        return Math.round(rect.width) === expected.width && Math.round(rect.height) === expected.height;
      },
      { width: size.height, height: size.width },
      { timeout: 5000 },
    );

    const after = await getState(page);
    expect(after).toEqual(before);

    // Swap back so the remaining tests in this serial chain run at the
    // project's declared viewport.
    await page.setViewportSize(size);
    await page.waitForFunction(
      (expected) => {
        const canvas = document.getElementById('scene');
        if (!canvas) return false;
        const rect = canvas.getBoundingClientRect();
        return Math.round(rect.width) === expected.width && Math.round(rect.height) === expected.height;
      },
      { width: size.width, height: size.height },
      { timeout: 5000 },
    );
  });

  test('leg 3 (index 2): same pipeline', async () => {
    await advanceToSand(page, 2);
    const locked = await playLeg(page, 2);
    expect(locked.legs[2].locked).toBe(true);
  });

  test('pause freezes progress; resume continues', async () => {
    await page.click('.eiffel-hud-pause');
    await expect(page.locator('.eiffel-resume-badge')).toBeVisible();

    const paused = await getState(page);
    expect(paused.paused).toBe(true);

    // Try to make progress while paused: open the gate and pump — both are
    // safe no-ops while `state.paused` (src/game/controller.ts `tick()`
    // returns immediately), through the exact same fastForward path bulk
    // gameplay uses elsewhere in this file.
    const stillPaused = await page.evaluate(() => {
      window.__eiffel.drive.setGate(1);
      window.__eiffel.drive.pump();
      window.__eiffelFastForward?.(120);
      return window.__eiffel.state();
    });
    expect(stillPaused, 'no field of GameState should change while paused').toEqual(paused);

    await page.click('.eiffel-resume-badge');
    await expect(page.locator('.eiffel-resume-badge')).toBeHidden();
    const resumed = await getState(page);
    expect(resumed.paused).toBe(false);

    // Release the gate we opened mid-pause so leg 3's sand phase below
    // starts from a clean, released lever (matches a real player's finger
    // actually being off the handle).
    await page.evaluate(() => {
      window.__eiffel.drive.setGate(0);
    });
  });

  test('leg 4 (index 3): locks → allLegsLocked → finalReveal beats → settled', async () => {
    // Render-owned pulse decay (src/render/pulse.ts) is half-life based and
    // has no shortcut — `renderSyncUntilSettled` below needs real frames,
    // and this sandboxed/software-GL environment's per-frame draw cost
    // scales with viewport pixel count (tablet viewports measured ~2-3x
    // slower than phone here), so this is the one test in the suite that
    // needs real headroom beyond Playwright's default per-test timeout.
    test.setTimeout(150_000);
    await advanceToSand(page, 3);
    const locked = await playLeg(page, 3);
    expect(locked.legs.every((leg) => leg.locked)).toBe(true);
    expect(locked.phase).toBe('finalReveal');

    // Let the reveal-beat chain run at the *real* rate (never skipped) so
    // every `revealBeat` actually fires in order — this is the "四方向の金属
    // 音が一つへ収束" beat, the moment that most benefits from not being
    // fast-forwarded past. F1 (review round 1) made this NOT skippable via
    // `drive.advance()` on purpose — PRODUCT_SPEC's biggest reward, now
    // protected from a mashing child's rapid taps at the game-logic level
    // (src/game/controller.ts) — so this no longer uses `skipUntil`
    // (repeated `drive.advance()`, which used to shortcut straight through
    // the chain); `fastForwardUntil` bulk-ticks real logical time instead,
    // exactly the mechanism a mash-proof finale requires. src/game/constants.ts:
    // 4×600ms beats + 400ms + 1200ms holds ≈ 3.6s worst-case (reducedMotion
    // off) ≈ 216 real 1/60s ticks; batch through it via the fast
    // (game-logic-only, `__eiffelFastForward`) path with generous headroom.
    const complete = await fastForwardUntil(page, (s: GameState) => s.phase === 'complete', {
      batch: 30,
      maxFrames: 600,
      label: 'finalReveal beats -> complete (real logical time, not mash-skipped)',
    });
    expect(complete.phase).toBe('complete');

    await expect(page.locator('.eiffel-completion')).toBeVisible();
    await renderSyncUntilSettled(page);
    const settled = await page.evaluate(() => window.__eiffel.settled());
    expect(settled).toBe(true);

    // Baseline for the replay-leak assertions below is captured *here* —
    // after a full playthrough has exercised every code path (magnifier,
    // dust puff, all four legs' wedge/hammer geometry, finalReveal) — not
    // at boot. src/render/index.ts's own dispose()-vs-replay doc comment
    // claims resource counts are "naturally stable across any number of
    // replays", which is a claim about the *post-first-playthrough*
    // steady state (some resources are plausibly created lazily on first
    // use), not about matching the boot-time count.
    baselineRenderInfo = await page.evaluate(() => window.__eiffel.renderInfo());
    expect(baselineRenderInfo.geometries).toBeGreaterThan(0);
  });

  test('replay resets to a fresh, deterministic run (same seed)', async () => {
    await page.evaluate(() => {
      window.__eiffel.drive.replay();
    });
    const after = await renderSync(page, 3);

    expect(after.phase).toBe('establish');
    expect(after.paused).toBe(false);
    expect(after.seed >>> 0).toBe(SEED);
    expect(after.legs.every((leg) => !leg.locked)).toBe(true);
    expect(after.legs[0].legOffsetY).toBe(leg0InitialOffset); // deterministic: identical seed -> identical scenario.

    const info = await page.evaluate(() => window.__eiffel.renderInfo());
    expect(info.geometries).toBe(baselineRenderInfo.geometries);
    expect(info.textures).toBe(baselineRenderInfo.textures);
  });

  test('replay ×20 does not leak renderer resources', async () => {
    test.setTimeout(90_000); // larger (tablet) viewports render measurably slower in this sandboxed environment — see the leg-4 test's comment.
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        window.__eiffel.drive.replay();
      });
      await renderSync(page, 3);
      const info = await page.evaluate(() => window.__eiffel.renderInfo());
      expect(info.geometries, `geometries should not grow on replay #${String(i)}`).toBe(baselineRenderInfo.geometries);
      expect(info.textures, `textures should not grow on replay #${String(i)}`).toBe(baselineRenderInfo.textures);
    }
  });

  test('canvas shows real rendered content, not a blank frame', async () => {
    const stats = await probeCanvas(page);
    expect(stats.max - stats.min, `expected visual variance, got ${JSON.stringify(stats)}`).toBeGreaterThan(15);
  });
});

test.describe('reduced motion — quick single-leg sanity', () => {
  test('plays leg 0 through to locked with prefers-reduced-motion: reduce', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootApp(page, { seed: SEED, quality: FAST_QUALITY });

    const boot = await getState(page);
    expect(boot.reducedMotion).toBe(true);

    await page.locator('.eiffel-loading-art').click();
    let state = boot;
    for (let i = 0; i < 20 && state.phase === 'boot'; i++) {
      state = await renderSync(page, 1);
    }
    expect(state.phase).toBe('establish');

    await advanceToSand(page, 0);
    const locked = await playLeg(page, 0);
    expect(locked.legs[0].locked).toBe(true);

    errors.assertNoErrors();
  });
});

test.describe('sound off — quick single-leg sanity', () => {
  test('toggling sound off and playing leg 0 produces no errors', async ({ page }) => {
    const errors = collectPageErrors(page);
    await bootApp(page, { seed: SEED, quality: FAST_QUALITY });

    await page.locator('.eiffel-loading-art').click();
    let state = await getState(page);
    for (let i = 0; i < 20 && state.phase === 'boot'; i++) {
      state = await renderSync(page, 1);
    }

    await page.click('.eiffel-hud-sound');
    const afterToggle = await getState(page);
    expect(afterToggle.soundOn).toBe(false);

    await advanceToSand(page, 0);
    const locked = await playLeg(page, 0);
    expect(locked.legs[0].locked).toBe(true);

    errors.assertNoErrors();
  });
});

test.describe('WebGL context loss and recovery', () => {
  test('rendering resumes after a simulated context loss', async ({ page }) => {
    const errors = collectPageErrors(page);
    await bootApp(page, { seed: SEED, quality: FAST_QUALITY });
    await advanceToSand(page, 0);
    await renderSync(page, 10);

    const before = await probeCanvas(page);
    expect(before.max - before.min).toBeGreaterThan(15);

    // Grab the WEBGL_lose_context extension ONCE and keep using that same
    // reference for both lose/restore calls (stashed on `window` so it
    // survives across separate `evaluate` round trips) — re-fetching it via
    // a fresh `canvas.getContext('webgl2')` call while the context is
    // already lost is unreliable (empirically: `restoreContext()` silently
    // never fired `webglcontextrestored` when the extension was re-looked-up
    // that way).
    await page.evaluate(() => {
      const canvas = document.getElementById('scene') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      (window as typeof window & { __loseCtxExt?: { loseContext(): void; restoreContext(): void } }).__loseCtxExt = ext ?? undefined;
      ext?.loseContext();
    });

    await page.waitForFunction(() => window.__eiffelContextLost?.() === true, undefined, { timeout: 5000 });

    await page.evaluate(() => {
      (window as typeof window & { __loseCtxExt?: { restoreContext(): void } }).__loseCtxExt?.restoreContext();
    });

    await page.waitForFunction(() => window.__eiffelContextLost?.() === false, undefined, { timeout: 5000 });

    await renderSync(page, 10);
    const after = await probeCanvas(page);
    expect(after.max - after.min, `expected the scene to render again after recovery, got ${JSON.stringify(after)}`).toBeGreaterThan(15);

    // The driver logs non-fatal `console.warn` noise while disposing
    // pre-loss GPU objects against the newly-restored context (WebGL
    // legitimately rejects deleting an object that belonged to a context
    // that no longer exists) — collectPageErrors only tracks `console.error`
    // / uncaught exceptions, so that warning noise is intentionally not
    // asserted against here.
    errors.assertNoErrors();
  });
});

/**
 * QA screenshot captures — docs/VISUAL_ACCEPTANCE.md's shot list, one PNG
 * per shot per Playwright project, written to `artifacts/qa/<project-name>/`
 * (docs/FILE_OWNERSHIP.md: Integrator-generated artifact). Runs across all 4
 * viewport projects the same way the rest of this file does (no `--project`
 * filter from `npm run test:e2e:full` / `npm run verify`), so this alone is
 * enough to (re)generate the full 4-project × 5-image QA set — no separate
 * `npm run qa` script or `scripts/verify.mjs` change was needed (both are
 * frozen; see docs/FILE_OWNERSHIP.md's freeze rule), and package.json's
 * `test:e2e:full` script already targets this exact file by path.
 *
 * Deliberately its OWN `test.describe.serial` block with its own fresh
 * `page`/boot, rather than reusing the `full loop (seed=...)` suite above:
 *
 *  - Quality: screenshots want `SCREENSHOT_QUALITY` ('medium' — antialias +
 *    full particle budget) per helpers.ts's own doc comment, while the
 *    functional suite above deliberately stays on `FAST_QUALITY` ('low') to
 *    protect its already-tight leg-4 / replay×20 timeouts. Sharing one
 *    session would force one quality choice on both; splitting lets each
 *    suite use the one that fits its purpose without touching the other's
 *    (already green) timing assumptions.
 *  - Isolation: a screenshot-capture bug here can never flake or slow down
 *    the correctness assertions above, and vice versa.
 *
 * Camera framing detail every capture point below accounts for
 * (src/render/camera/cameraDirector.ts): `CameraDirector.setCue` overwrites
 * `toPose`/`elapsedS` immediately on each `cameraCue` event, and only
 * *rendered* frames (`TestApi.step()` / `renderSync()`) ever call its
 * `update()` — the bulk `__eiffelFastForward` path this file's helpers use
 * to skip cinematics/deplete sand/pump ticks GAME logic only and never
 * advances the camera lerp. So after any fast-forwarded stretch, only the
 * LAST `cameraCue` fired during it is still live as `toPose`, and a real
 * `renderSync()` covering at least that cue's own transition duration
 * (`CAMERA_CUE_DURATION_MS`, ≤1000ms here) is required before a screenshot
 * — every capture point below does this explicitly rather than assuming the
 * camera is already where the game state implies it should be.
 */
test.describe.serial('QA screenshots (VISUAL_ACCEPTANCE.md shot list)', () => {
  let page: Page;
  let errors: ReturnType<typeof collectPageErrors>;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    errors = collectPageErrors(page);
  });

  test.afterAll(async () => {
    errors.assertNoErrors();
    await page.close();
  });

  // Playwright requires the first arg to be an object-destructuring pattern;
  // this test drives the shared `page` from the describe block above, not
  // the per-test `page` fixture.
  // eslint-disable-next-line no-empty-pattern
  test('opening.png — establish: 4 legs + first-level ring + sandboxes', async ({}, testInfo) => {
    test.setTimeout(60_000);
    await bootApp(page, { seed: SEED, quality: SCREENSHOT_QUALITY });

    let state = await getState(page);
    expect(state.phase).toBe('boot');
    await page.locator('.eiffel-loading-art').click();
    for (let i = 0; i < 20 && state.phase === 'boot'; i++) {
      state = await renderSync(page, 1);
    }
    expect(state.phase).toBe('establish');

    // The `establish` CameraDirector pose is what the scene is constructed
    // showing from frame 1 (CameraDirectorImpl's constructor already seeds
    // `pose`/`toPose` with `cueToPose({kind:'establish'}, seed)`), so the
    // `establish` cue re-fired on entering this GamePhase is a same-pose,
    // effectively-instant "transition" — this only needs a modest settle
    // for dust/sand/quality-manager first-frame state, not a real camera
    // pan.
    await renderSync(page, 20);
    await captureQaShot(page, testInfo.project.name, 'opening.png');
  });

  // eslint-disable-next-line no-empty-pattern -- see the opening.png test above.
  test('sand-flow.png, magnifier.png, jack.png — leg 0 sand/jack pipeline', async ({}, testInfo) => {
    // 90s was enough in isolation (~1.4-1.5m observed worst-case on tablet
    // viewports at SCREENSHOT_QUALITY), but `npm run test:e2e:full`/`verify`
    // runs all 4 projects with 2 Playwright workers in parallel — CPU
    // contention with another project's simultaneously-running heavy test
    // (this test itself, or `final-reveal.png`'s settle wait) pushed a real
    // run past 90s (observed: tablet-landscape timed out at exactly 90000ms
    // mid-`captureQaShot`). Matches the `final-reveal.png` test's budget
    // below for the same reason.
    test.setTimeout(180_000);
    await advanceToSand(page, 0);
    // Camera must travel from wherever fast-forwarding through
    // establish->intro->sand left it, all the way to `sandboxCutaway`'s
    // pose (700ms) — see this describe block's doc comment.
    await renderSync(page, 50);

    await page.evaluate(() => {
      window.__eiffel.drive.setGate(1);
    });
    // A short burst of REAL steps (not fastForward): sand stream + falling
    // leg must animate visibly in the same cut (VISUAL_ACCEPTANCE "sand
    // flow" shot), without draining anywhere close to depletion (~2 units
    // of a >=20-unit drop at SAND_MAX_RATE over these 20 fixed ticks).
    await renderSync(page, 20);
    await captureQaShot(page, testInfo.project.name, 'sand-flow.png');

    await depleteSand(page, 0);
    const afterSand = await getState(page);
    expect(afterSand.legs[0].phase).toBe('jack');
    // magnifierShown fires the instant `jack` phase is entered (undershoot
    // is always < ASSIST_RADIUS — see contracts/constants.ts), simultaneous
    // with the `jackCloseup` cue. 60 real frames = 1s covers both the 700ms
    // camera transition and several magnifier fade half-lives (0.12s each,
    // src/render/magnifier.ts) — opacity is >99% by then.
    await renderSync(page, 60);
    await captureQaShot(page, testInfo.project.name, 'magnifier.png');

    // One real pump: the jackPumped pulse (0.15s half-life,
    // src/render/index.ts's `pumpPulses`) drives the piston/leg kinematic
    // motion — capture while it's still clearly elevated, not fully decayed.
    await page.evaluate(() => {
      window.__eiffel.drive.pump();
    });
    await renderSync(page, 10);
    await captureQaShot(page, testInfo.project.name, 'jack.png');

    // Finish leg 0 normally so state stays consistent for the next test in
    // this serial chain (same pipeline the functional suite above uses).
    const snapped = await pumpToSnap(page, 0);
    expect(snapped.legs[0].phase).toBe('wedge');
    const locked = await wedgeAndHammer(page, 0);
    expect(locked.legs[0].locked).toBe(true);
  });

  // eslint-disable-next-line no-empty-pattern -- see the opening.png test above.
  test('final-reveal.png — legs 1-3, allLegsLocked, topReveal, settled', async ({}, testInfo) => {
    // Mirrors the main suite's leg-4 budget (tests/e2e/full-loop.spec.ts's
    // own "leg 4" test needs up to 150s on this sandboxed/software-GL
    // environment's slower tablet viewports for the real, half-life-based
    // pulse decays `renderSyncUntilSettled` waits out) plus three more full
    // leg pipelines beforehand and `SCREENSHOT_QUALITY` instead of
    // `FAST_QUALITY` — generous headroom over that baseline.
    test.setTimeout(180_000);

    await advanceToSand(page, 1);
    expect((await playLeg(page, 1)).legs[1].locked).toBe(true);

    await advanceToSand(page, 2);
    expect((await playLeg(page, 2)).legs[2].locked).toBe(true);

    await advanceToSand(page, 3);
    const locked = await playLeg(page, 3);
    expect(locked.legs.every((leg) => leg.locked)).toBe(true);
    expect(locked.phase).toBe('finalReveal');

    // R5 (director defect list): capture the topReveal REWARD moment
    // itself — near-top-down, junction glow — BEFORE the completion menu
    // ever appears, instead of skipping straight through to `complete`
    // (the previous behavior here, which only ever screenshotted the menu
    // covering a distant tower).
    //
    // Game-logic timeline from finalReveal entry (game/controller.ts):
    // revealBeat 0..3 fire at 600ms intervals (last at 2400ms) → `settled`
    // event fires 400ms later (2800ms) → `pullback` camera cue starts
    // easing in right then. Crucially, `settled` is ALSO exactly what
    // src/ui/completionMenu.ts un-hides the completion overlay on
    // (`bus.on('settled', () => { container.hidden = false })`) — NOT
    // `phase === 'complete'` (that only arrives later, at 4000ms, after a
    // 1200ms pullback hold). So the menu and the girder/pin "settle" sink
    // both start at the SAME instant (2800ms): there is no frame where the
    // sink is visible AND the menu is hidden. Capturing at 150 REAL frames
    // (2500ms at FIXED_DT=1/60, via `renderSync` — a real, paired
    // logic+render step per frame, unlike the fast-forward-only helpers
    // used above) lands solidly after every beat has fired (last one only
    // 100ms ago — still near-peak glow) and the topReveal camera transition
    // has long since settled (its own 1600ms finished at 1600ms), with a
    // comfortable 300ms margin before `settled`/the menu.
    await renderSync(page, 150);
    const duringReveal = await getState(page);
    expect(duringReveal.phase).toBe('finalReveal');
    await expect(page.locator('.eiffel-completion')).not.toBeVisible();

    await captureQaShot(page, testInfo.project.name, 'final-reveal.png');
  });
});
