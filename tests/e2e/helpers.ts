// tests/e2e/helpers.ts — shared E2E helpers. Owned by Foundation/Integrator.
// No fixed sleeps for *correctness* waits: every wait polls window.__game
// state per ARCHITECTURE_CONTRACT.md's testability contract. The one
// deliberate exception (driveRivetHammerToDone's inter-tap pacing) is
// commented at its call site — it paces a real-finger debounce constant
// that is not tied to any observable game-state change, so there is nothing
// to poll; see src/game/constants.ts's RIVET_HAMMER_DEBOUNCE_MS.

import type { Page } from '@playwright/test';
import type { Anchor, AnchorId, GamePhase, GameState } from '../../src/contracts/types';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Navigate to the game with ?test=1 always set (deterministic fixed-step
 * loop + shortened animation timings), plus any extra query params.
 */
export async function gotoGame(page: Page, params: Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams({ test: '1', ...params });
  await page.goto(`/?${search.toString()}`);
}

/** Wait until window.__game.getState().phase === phase. */
export async function waitForPhase(page: Page, phase: string, timeout = DEFAULT_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__game !== undefined && window.__game.getState().phase === expected,
    phase,
    { timeout },
  );
}

/** Wait until window.__game.getState().phase is no longer `phase`. */
export async function waitForPhaseChange(page: Page, phase: string, timeout = DEFAULT_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    (current) => window.__game !== undefined && window.__game.getState().phase !== current,
    phase,
    { timeout },
  );
}

/** Wait until window.__game.settled() reports true. */
export async function waitForSettled(page: Page, timeout = DEFAULT_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => window.__game !== undefined && window.__game.settled() === true,
    undefined,
    { timeout },
  );
}

/** Wait until window.__game.stats().drawCalls is nonzero (a real frame painted). */
export async function waitForNonzeroDrawCalls(page: Page, timeout = DEFAULT_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(
    () => window.__game !== undefined && window.__game.stats().drawCalls > 0,
    undefined,
    { timeout },
  );
}

export async function getState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__game!.getState());
}

export async function getAnchor(page: Page, id: AnchorId): Promise<Anchor> {
  const anchor = await page.evaluate((id) => window.__game!.anchors().find((a) => a.id === id), id);
  if (!anchor) throw new Error(`anchor "${id}" was never published`);
  return anchor;
}

/** Attach console/pageerror listeners immediately; returns the growing array. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err)}`));
  return errors;
}

// ---- real pointer gestures (page.mouse), driven at REAL anchor coordinates ----

/** down -> move(steps) -> up: a continuous drag, read by "anywhere" phases as move deltas. */
export async function dragGesture(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 10,
): Promise<void> {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.mouse.up();
}

/** A short, small-movement press+release — classifies as 'tap' (src/input/gestures.ts). */
export async function tapGesture(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** A fast, large-movement press+release — classifies as a directional 'swipe'. */
export async function swipeGesture(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

// ---- per-phase drivers: real gestures at REAL published anchor positions ----
// Each polls window.__game.getState() between attempts (never a fixed sleep)
// and gives up after a generous iteration budget so a real regression fails
// fast instead of hanging to the outer test timeout.

export async function driveHookDownToAttached(page: Page, vp: Viewport): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    if ((await getState(page)).hook.attached) return;
    await dragGesture(page, vp.width / 2, vp.height * 0.28, vp.width / 2, vp.height * 0.66, 10);
  }
  if (!(await getState(page)).hook.attached) throw new Error('hookDown: hook never attached');
}

export async function driveHoistToFull(page: Page, vp: Viewport): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    if ((await getState(page)).phase !== 'hoist') return;
    await dragGesture(page, vp.width / 2, vp.height * 0.64, vp.width / 2, vp.height * 0.3, 8);
  }
  if ((await getState(page)).phase === 'hoist') throw new Error('hoist: never reached full height');
}

export async function driveAlignToSnap(page: Page): Promise<void> {
  // A fixed, generous step magnitude in the LIVE beam->ghost direction,
  // recomputed every attempt (not a stale step size from the first anchor
  // snapshot, which can be tiny on some aspect ratios/camera cues). align's
  // gain curve (src/game/math.ts::approachGain) only decelerates and clamps
  // — it never diverges — and the moment cumulative drag crosses the
  // (generous, ghost-width-relative) snap radius it snaps immediately
  // regardless of how large the step overshot by, so direction matters far
  // more than magnitude here.
  const STEP_PX = 220;
  for (let i = 0; i < 25; i += 1) {
    if ((await getState(page)).phase !== 'align') return;
    const beam = await getAnchor(page, 'beam');
    const ghost = await getAnchor(page, 'ghost');
    const rawDx = ghost.x - beam.x;
    const rawDy = ghost.y - beam.y;
    const mag = Math.hypot(rawDx, rawDy);
    const [stepDx, stepDy] = mag > 5 ? [(rawDx / mag) * STEP_PX, (rawDy / mag) * STEP_PX] : [0, -STEP_PX];
    await dragGesture(page, beam.x, beam.y, beam.x + stepDx, beam.y + stepDy, 8);
  }
  if ((await getState(page)).phase === 'align') throw new Error('align: never snapped');
}

export async function driveBoltsToSeated(page: Page): Promise<void> {
  for (const index of [0, 1] as const) {
    const boltId: AnchorId = index === 0 ? 'bolt0' : 'bolt1';
    const holeId: AnchorId = index === 0 ? 'hole0' : 'hole1';
    for (let i = 0; i < 8; i += 1) {
      if ((await getState(page)).bolts[index]) break;
      const bolt = await getAnchor(page, boltId);
      const hole = await getAnchor(page, holeId);
      await dragGesture(page, bolt.x, bolt.y, hole.x, hole.y, 10);
    }
  }
  const finalBolts = (await getState(page)).bolts;
  if (!finalBolts[0] || !finalBolts[1]) throw new Error('bolts: not both seated');
}

export async function driveRivetHeatToDone(page: Page): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    if ((await getState(page)).phase !== 'rivetHeat') return;
    const forge = await getAnchor(page, 'forge');
    await tapGesture(page, forge.x, forge.y);
  }
  if ((await getState(page)).phase === 'rivetHeat') throw new Error('rivetHeat: never reached full temp');
}

/**
 * Taps the forge until rivet.temp reaches 1, driven purely by that store
 * field rather than `phase` — usable both for the top-level 'rivetHeat'
 * phase and for 'playRivet' (whose heat/carry/insert/hammer/cool steps are
 * an internal sub-state machine that never changes `state.phase`).
 */
export async function driveForgeTapsUntilHot(page: Page): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    if ((await getState(page)).rivet.temp >= 1) return;
    const forge = await getAnchor(page, 'forge');
    await tapGesture(page, forge.x, forge.y);
  }
  if ((await getState(page)).rivet.temp < 1) throw new Error('forge taps: rivet.temp never reached 1');
}

export async function driveRivetCarryToDone(page: Page): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    if ((await getState(page)).phase !== 'rivetCarry') return;
    const tongs = await getAnchor(page, 'tongs');
    await swipeGesture(page, Math.max(10, tongs.x - 60), tongs.y, 130, 0);
  }
  if ((await getState(page)).phase === 'rivetCarry') throw new Error('rivetCarry: relay never completed');
}

export async function driveRivetInsert(page: Page): Promise<void> {
  // Retries (re-fetching the anchor each attempt) rather than a single shot:
  // entering rivetInsert re-aims the camera (PHASE_CUE_MAP keeps 'rivetMacro'
  // but the anchor can still be mid-transition for a frame or two, worse
  // under CI CPU contention where a "300ms" test-mode transition can take
  // much longer in real wall-clock time), so a single stale-coordinate tap
  // can miss the (still generously padded) hit test.
  for (let i = 0; i < 10; i += 1) {
    if ((await getState(page)).rivet.inserted) return;
    const hole = await getAnchor(page, 'rivetHole');
    await tapGesture(page, hole.x, hole.y);
  }
  if (!(await getState(page)).rivet.inserted) throw new Error('rivetInsert: tap never registered');
}

export async function driveRivetHammerToDone(page: Page): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    if ((await getState(page)).phase !== 'rivetHammer') return;
    const hammerSpot = await getAnchor(page, 'hammerSpot');
    await tapGesture(page, hammerSpot.x, hammerSpot.y);
    // RIVET_HAMMER_DEBOUNCE_MS (src/game/constants.ts) is a real-finger
    // constant deliberately NOT scaled by ?test=1 — it debounces on the
    // pointer event's own wall-clock timestamp, not on any store field, so
    // there is no state to poll here; this pacing IS the thing under test
    // (three genuinely separate taps must each register as one hit).
    await page.waitForTimeout(260);
  }
  if ((await getState(page)).phase === 'rivetHammer') throw new Error('rivetHammer: never reached 3 hits');
}

export async function driveSlingToReleased(page: Page): Promise<void> {
  // See driveRivetInsert's comment -- same retry rationale.
  for (let i = 0; i < 10; i += 1) {
    if ((await getState(page)).sling.released) return;
    const clasp = await getAnchor(page, 'slingClasp');
    await tapGesture(page, clasp.x, clasp.y);
  }
  if (!(await getState(page)).sling.released) throw new Error('sling: clasp tap never registered');
}

/**
 * One full-range lever drag, then release and wait for the phase to leave
 * 'climb' on its own — this is the literal "release mid-way must not stall"
 * requirement (PRODUCT_SPEC.md's climb row): progress must keep advancing
 * autonomously after the finger lifts, with no further gesture.
 */
export async function driveClimbReleaseAndAutoComplete(
  page: Page,
  vp: Viewport,
  timeout = 60_000,
): Promise<void> {
  const lever = await getAnchor(page, 'climbLever');
  const y0 = Math.min(vp.height - 5, lever.y + 140);
  const y1 = Math.max(5, lever.y - 140);
  await dragGesture(page, lever.x, y0, lever.x, y1, 10);
  await waitForPhaseChange(page, 'climb', timeout);
}

/**
 * Drives the entire opening->complete loop once via real gestures at real
 * anchors. Per-phase waits are generous (20s) because swiftshader software
 * rendering under 2-worker CI parallelism can drop real frame rate well
 * below 60fps under contention -- since ?test=1 uses a *fixed* 16.67ms
 * simulated step per rAF callback, a slow real frame rate stretches out how
 * much real wall-clock time a given amount of simulated progress takes,
 * even though the logic itself is deterministic and correct.
 */
export async function driveFullLoopToComplete(page: Page, vp: Viewport): Promise<void> {
  await waitForPhase(page, 'hookDown', 20_000);
  await driveHookDownToAttached(page, vp);
  await waitForPhase(page, 'hoist', 20_000);
  await driveHoistToFull(page, vp);
  await waitForPhase(page, 'align', 20_000);
  await driveAlignToSnap(page);
  await waitForPhase(page, 'bolts', 20_000);
  await driveBoltsToSeated(page);
  await waitForPhase(page, 'rivetHeat', 20_000);
  await driveRivetHeatToDone(page);
  await waitForPhase(page, 'rivetCarry', 20_000);
  await driveRivetCarryToDone(page);
  await waitForPhase(page, 'rivetInsert', 20_000);
  await driveRivetInsert(page);
  await waitForPhase(page, 'rivetHammer', 20_000);
  await driveRivetHammerToDone(page);
  await waitForPhase(page, 'rivetCool', 20_000);
  await waitForPhase(page, 'sling', 20_000);
  await driveSlingToReleased(page);
  await waitForPhase(page, 'climb', 20_000);
  await driveClimbReleaseAndAutoComplete(page, vp, 60_000);
  await waitForPhase(page, 'reveal', 20_000);
  await waitForPhase(page, 'complete', 20_000);
}

/** The canonical phase-by-phase transition chain, for dispatch()-driven fast paths. */
export const FULL_LOOP_CHAIN: readonly GamePhase[] = [
  'hookDown',
  'hoist',
  'align',
  'bolts',
  'rivetHeat',
  'rivetCarry',
  'rivetInsert',
  'rivetHammer',
  'rivetCool',
  'sling',
  'climb',
  'reveal',
  'complete',
];

/** Boots the game, waits for title, taps start, and waits until 'opening' begins. */
export async function bootToOpening(page: Page, params: Record<string, string> = {}): Promise<void> {
  await gotoGame(page, params);
  await waitForPhase(page, 'title');
  await page.getByTestId('title-start').click();
  await waitForPhase(page, 'opening', 15_000);
}
