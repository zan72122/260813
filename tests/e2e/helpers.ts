import type { Page } from '@playwright/test';

import type { EiffelTestAPI } from '../../src/contracts/testing.ts';

declare global {
  interface Window {
    __eiffel: EiffelTestAPI;
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
export async function waitForState(page: Page, state: string, timeoutMs?: number): Promise<void> {
  await page.waitForFunction(
    (expected: string) => window.__eiffel?.state === expected,
    state,
    { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, polling: POLL_INTERVAL_MS },
  );
}

/** Read every readout in one round trip. */
export async function readEiffel(page: Page): Promise<ReturnType<EiffelTestAPI['readouts']>> {
  return page.evaluate(() => window.__eiffel.readouts());
}
