// tests/e2e/helpers.ts — shared E2E helpers. Owned by Foundation/Integrator.
// No fixed sleeps: every wait polls window.__game state per
// ARCHITECTURE_CONTRACT.md's testability contract.

import type { Page } from '@playwright/test';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Navigate to the game with ?test=1 always set (deterministic fixed-step
 * loop + shortened animation timings), plus any extra query params.
 */
export async function gotoGame(page: Page, params: Record<string, string> = {}): Promise<void> {
  const search = new URLSearchParams({ test: '1', ...params });
  await page.goto(`/?${search.toString()}`);
}

/** Wait until window.__game.getState().phase === phase. */
export async function waitForPhase(page: Page, phase: string): Promise<void> {
  await page.waitForFunction(
    (expected) => window.__game !== undefined && window.__game.getState().phase === expected,
    phase,
    { timeout: DEFAULT_TIMEOUT_MS },
  );
}

/** Wait until window.__game.settled() reports true. */
export async function waitForSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__game !== undefined && window.__game.settled() === true,
    undefined,
    { timeout: DEFAULT_TIMEOUT_MS },
  );
}
