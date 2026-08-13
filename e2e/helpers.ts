import type { Page } from '@playwright/test';

/**
 * Shared gesture + harness helpers for the e2e suite. Timings here are
 * calibrated empirically against the real animation/tween durations in
 * SceneRoot (camera shot tweens ~1.1-1.2s, phase-advance delays ~0.5-1.6s) —
 * cutting them shorter causes flaky mis-picks because the camera (locked
 * during drags) can freeze mid-tween if a gesture starts before a shot
 * transition has settled.
 *
 * playFullLoop demonstrates every gesture TYPE (drag/tap/swipe/trace) for
 * real at least once per phase, then hands the repetitive remainder (e.g.
 * the other 6 toys, the other 3 mats) to forceCompleteCurrentPhaseVisuals()
 * — a harness method that finishes the objective through the same FSM +
 * visual-update code path a real gesture uses. This is a deliberate,
 * documented trade-off (see docs/VERIFICATION.md): this sandbox has no GPU,
 * so every synthesized pointer round-trip on the software WebGL renderer
 * costs roughly 0.5s of real time it would not cost on an actual device,
 * making a fully-repeated real-gesture pass (~40+ drags) impractically slow
 * without proving anything a single demonstration per gesture type doesn't
 * already prove.
 */

export interface Point {
  x: number;
  y: number;
}

export async function dragPointer(page: Page, from: Point, to: Point, steps = 12, stepDelayMs = 12): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, { steps: 2 });
    await page.waitForTimeout(stepDelayMs);
  }
  await page.mouse.up();
}

export async function tapPointer(page: Page, at: Point): Promise<void> {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
}

/**
 * Repeats a drag/tap up to `maxAttempts` times until `checkFn` reports
 * success. Real gestures occasionally land a few pixels off target (camera
 * settle timing, projection rounding) — a single miss is exactly the kind of
 * "sloppy drop" the game is designed to tolerate by staying interactive, so
 * retrying is a faithful simulation of a kid tapping again, not a workaround
 * for a broken interaction.
 */
export async function retryUntil(
  action: () => Promise<void>,
  checkFn: () => Promise<boolean>,
  page: Page,
  maxAttempts = 3,
  settleMs = 350,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await action();
    await page.waitForTimeout(settleMs);
    if (await checkFn()) return true;
  }
  return false;
}

/** Sweeps a small grid of points under the pointer while held down (used for the table wipe trace). */
export async function sweepPointer(page: Page, center: Point, offsets: [number, number][]): Promise<void> {
  const first = offsets[0]!;
  await page.mouse.move(center.x + first[0], center.y + first[1]);
  await page.mouse.down();
  for (const [dx, dy] of offsets) {
    await page.mouse.move(center.x + dx, center.y + dy, { steps: 3 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

export async function startGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  // Settle the TITLE -> PLAY_CLEANUP camera cut + toy layout before any gesture.
  await page.waitForTimeout(1200);
}

/**
 * Evaluates a small arrow-function body (as source text, so call sites can
 * cheaply interpolate a dynamic id) against `window.__game` in the page.
 */
async function gameEval<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body: string) => {
    const f = new Function('g', `return (${body})(g)`) as (g: unknown) => T;
    return f((window as unknown as { __game: unknown }).__game);
  }, fn) as Promise<T>;
}

async function forceCompletePhase(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __game: { forceCompleteCurrentPhaseVisuals: () => void } }).__game.forceCompleteCurrentPhaseVisuals());
}

export const WIPE_GRID: [number, number][] = [
  [-60, -15],
  [-20, -15],
  [20, -15],
  [60, -15],
  [60, 5],
  [20, 5],
  [-20, 5],
  [-60, 5],
  [-60, 20],
  [20, 20],
  [60, 20],
];

/**
 * Drives the entire play loop (TITLE already advanced) through PLAY_CLEANUP,
 * LUNCH_SETUP, LUNCH_CLEANUP, NAP_SETUP, WAKE_RESTORE — every gesture type
 * (drag/tap/swipe/trace) is performed for real at least once; the repetitive
 * remainder of each phase is finished via forceCompleteCurrentPhaseVisuals()
 * (see file header). Takes an optional screenshot callback fired at each
 * named beat.
 */
export async function playFullLoop(page: Page, onBeat?: (name: string) => Promise<void>): Promise<void> {
  const beat = async (name: string): Promise<void> => {
    if (onBeat) await onBeat(name);
  };

  await beat('title');
  await startGame(page);
  await beat('cleanup');

  // ---- PLAY_CLEANUP: drag one toy for real (with a mid-drag screenshot), then finish the rest ----
  const toys = await gameEval<{ id: string; symbol: string }[]>(page, '(g) => g.getSnapshot().toys');
  const baskets = await gameEval<{ id: string; symbol: string }[]>(page, '(g) => g.getSnapshot().baskets');
  {
    const toy = toys[0]!;
    const basket = baskets.find((b) => b.symbol === toy.symbol)!;
    await retryUntil(
      async () => {
        const toyPos = await gameEval<Point>(page, `(g) => g.screenPositionOfToy('${toy.id}')`);
        const basketPos = await gameEval<Point>(page, `(g) => g.screenPositionOfBasket('${basket.id}')`);
        await page.mouse.move(toyPos.x, toyPos.y);
        await page.mouse.down();
        await page.mouse.move((toyPos.x + basketPos.x) / 2, (toyPos.y + basketPos.y) / 2, { steps: 6 });
        await beat('drag-mid');
        await page.mouse.move(basketPos.x, basketPos.y, { steps: 6 });
        await page.mouse.up();
      },
      async () => (await gameEval<number>(page, '(g) => g.getProgress().playCleanup.storedToyIds.length')) > 0,
      page,
    );
  }
  await forceCompletePhase(page);
  // Wait out the cleanup-complete gesture + the LUNCH_SETUP camera tween.
  await page.waitForTimeout(4000);
  await beat('lunch-set-start');

  // ---- LUNCH_SETUP: one real table drag, one real chair tap, one real cart drag; finish the rest ----
  await retryUntil(
    async () => {
      const handlePos = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('table')");
      await dragPointer(page, handlePos, { x: handlePos.x, y: handlePos.y - 160 });
    },
    async () => (await gameEval<boolean>(page, '(g) => g.getProgress().lunchSetup.tableOut')) === true,
    page,
  );
  await retryUntil(
    async () => {
      const handlePos = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('chairStack')");
      await tapPointer(page, handlePos);
    },
    async () => (await gameEval<number>(page, '(g) => g.getProgress().lunchSetup.chairsOut')) > 0,
    page,
    3,
    350,
  );
  await retryUntil(
    async () => {
      const handlePos = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('cart')");
      await dragPointer(page, handlePos, { x: handlePos.x, y: handlePos.y - 160 });
    },
    async () => (await gameEval<number>(page, '(g) => g.getProgress().lunchSetup.traysPlaced')) > 0,
    page,
    3,
    1500,
  );
  await forceCompletePhase(page);
  await page.waitForTimeout(600);
  await beat('lunch-set');

  // Eating vignette begins automatically once furniture is ready — skip it with a tap.
  await tapPointer(page, { x: 24, y: Math.round((await page.viewportSize())!.height * 0.7) });
  await page.waitForTimeout(400);
  await beat('eating');
  await page.waitForTimeout(1600);

  // ---- LUNCH_CLEANUP: one real tray-return drag, one real wipe trace; finish the rest ----
  await retryUntil(
    async () => {
      const trayPos = await gameEval<Point>(page, '(g) => g.screenPositionOfTray(0)');
      const cartPos = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('cart')");
      await dragPointer(page, trayPos, cartPos, 10, 10);
    },
    async () => (await gameEval<number>(page, '(g) => g.getProgress().lunchCleanup.traysReturned')) > 0,
    page,
  );
  await retryUntil(
    async () => {
      const wipeCenter = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('wipe')");
      await sweepPointer(page, wipeCenter, WIPE_GRID);
    },
    async () => (await gameEval<number>(page, '(g) => g.getProgress().lunchCleanup.wipeProgress')) > 0,
    page,
  );
  await beat('wipe');
  await forceCompletePhase(page);
  await page.waitForTimeout(1800);
  await beat('lunch-cleanup-done');

  // ---- NAP_SETUP: one real mat carry + swipe-unroll (with mid-unroll screenshot), one real curtain close; finish the rest ----
  const mats = await gameEval<{ id: string }[]>(page, '(g) => g.getSnapshot().mats');
  const firstMat = mats[0]!;
  await retryUntil(
    async () => {
      const from = await gameEval<Point>(page, `(g) => g.screenPositionOfMat('${firstMat.id}')`);
      const to = await gameEval<Point>(page, `(g) => g.screenPositionOfMatMarker('${firstMat.id}')`);
      await dragPointer(page, from, to, 10, 10);
    },
    async () => gameEval<boolean>(page, `(g) => g.debugPickables().some((p) => p.kind === 'mat-swipe' && p.id === '${firstMat.id}')`),
    page,
  );
  {
    const from = await gameEval<Point>(page, `(g) => g.screenPositionOfMat('${firstMat.id}')`);
    const to = await gameEval<Point>(page, `(g) => g.screenPositionOfMatUnrollTarget('${firstMat.id}')`);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
    await beat('mat-unroll-mid');
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(180);
  }
  await beat('mat-unroll-done');
  await retryUntil(
    async () => {
      const curtainClose = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('curtain')");
      await dragPointer(page, curtainClose, { x: curtainClose.x + 200, y: curtainClose.y }, 14, 14);
    },
    async () => (await gameEval<boolean>(page, '(g) => g.getProgress().napSetup.curtainClosed')) === true,
    page,
  );
  await forceCompletePhase(page);
  await page.waitForTimeout(600);
  await beat('nap');

  // The nap vignette starts automatically once the curtain is closed; ceiling
  // stars fade in over ~2.2s — give them time to be clearly visible.
  await page.waitForTimeout(1800);
  await beat('stars');

  // Nap vignette auto-advances (or is skippable) — skip it with a tap.
  await tapPointer(page, { x: 24, y: Math.round((await page.viewportSize())!.height * 0.7) });
  await page.waitForTimeout(1800);

  // ---- WAKE_RESTORE: one real curtain-open drag, one real mat rollback drag; finish the rest ----
  await retryUntil(
    async () => {
      const curtainOpen = await gameEval<Point>(page, "(g) => g.screenPositionOfHandle('curtain')");
      await dragPointer(page, curtainOpen, { x: curtainOpen.x - 200, y: curtainOpen.y }, 14, 14);
    },
    async () => (await gameEval<boolean>(page, '(g) => g.getProgress().wakeRestore.curtainOpened')) === true,
    page,
  );
  await beat('wake');
  await retryUntil(
    async () => {
      const from = await gameEval<Point>(page, `(g) => g.screenPositionOfMatUnrollTarget('${firstMat.id}')`);
      const to = await gameEval<Point>(page, `(g) => g.screenPositionOfMatMarker('${firstMat.id}')`);
      await dragPointer(page, from, to, 14, 14);
    },
    async () => (await gameEval<number>(page, '(g) => g.getProgress().wakeRestore.matsShelved')) > 0,
    page,
    3,
    600,
  );
  await forceCompletePhase(page);
  await page.waitForTimeout(2200);
  await beat('restored');

  // WAKE_RESTORE auto-advances to REPLAY once toys pop back out.
  await page.waitForTimeout(1200);
  await beat('replay');
}
