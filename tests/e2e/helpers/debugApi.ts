// tests/e2e/helpers/debugApi.ts
// Typed access to window.__versailles (docs/CONTRACTS.md "Debug API"),
// implemented by Worker A in src/game/debug.ts during Wave 3 integration.
// Not present before then — every helper here is defensive about that.

import type { Page } from '@playwright/test';
import type { FountainId, GamePhase } from '../../../src/contracts';

export interface VersaillesHotspot {
  x: number;
  y: number;
  r: number;
}

export interface VersaillesDebug {
  phase: GamePhase;
  fountain: FountainId | null;
  openness: number;
  waterProgress: number;
  flowIntensity: number;
  hotspots: { whistle?: VersaillesHotspot; valve?: VersaillesHotspot };
  rendererInfo: { drawCalls: number; triangles: number };
}

/** True once window.__versailles is present (i.e. Wave 3 integration is wired). */
export async function hasDebugApi(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof (window as { __versailles?: unknown }).__versailles !== 'undefined');
}

/** Reads the current debug snapshot. Caller must have already checked hasDebugApi. */
export async function readDebug(page: Page): Promise<VersaillesDebug> {
  const value = await page.evaluate(
    () => (window as unknown as { __versailles: VersaillesDebug }).__versailles,
  );
  return value;
}

/** Polls until window.__versailles.phase equals one of `phases`, or times out (returns false). */
export async function waitForPhase(
  page: Page,
  phases: readonly GamePhase[],
  timeoutMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const debug = await readDebug(page);
    if (phases.includes(debug.phase)) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
