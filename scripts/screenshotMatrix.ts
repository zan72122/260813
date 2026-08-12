// scripts/screenshotMatrix.ts
// Shared constants + capture helper for the ACCEPTANCE.md screenshot matrix
// (4 viewport sizes x 5 key states). Imported by tests/e2e specs; not run
// standalone (no Node runtime deps beyond @playwright/test's Page type).
// See docs/ACCEPTANCE.md "スクリーンショット必須マトリクス".

import type { Page } from '@playwright/test';

export interface AcceptanceViewport {
  label: string;
  width: number;
  height: number;
}

/** The four CSS-px viewport sizes ACCEPTANCE.md requires at least one shot for. */
export const ACCEPTANCE_VIEWPORTS: readonly AcceptanceViewport[] = [
  { label: '390x844', width: 390, height: 844 }, // iPhone portrait
  { label: '844x390', width: 844, height: 390 }, // iPhone landscape
  { label: '820x1180', width: 820, height: 1180 }, // iPad portrait
  { label: '1180x820', width: 1180, height: 820 }, // iPad landscape
];

/** The five key states ACCEPTANCE.md requires captured for at least one viewport. */
export const KEY_STATES = [
  'garden-idle',
  'valve-turn',
  'pipe-run',
  'fountain-reveal',
  'finale',
] as const;

export type KeyState = (typeof KEY_STATES)[number];

/** Writes screenshots/<viewportLabel>/<state>.png. */
export async function captureState(page: Page, viewportLabel: string, state: string): Promise<void> {
  await page.screenshot({ path: `screenshots/${viewportLabel}/${state}.png` });
}
