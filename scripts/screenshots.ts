/**
 * ACCEPTANCE screenshot capture helper (docs/ACCEPTANCE.md states S1-S6).
 * Invoked from tests/e2e/screenshots.spec.ts so it reuses Playwright's
 * already-configured browser/viewport matrix (4 projects x 6 states) instead
 * of needing a separate script runtime — see playwright.config.ts.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'scripts/screenshots');

export const SCREENSHOT_STATES = [
  'S1_beforeEstablish',
  'S2_understageUnlock',
  'S3_split50',
  'S4_forestAfter',
  'S5_rusticAfter',
  'S6_lowQuality'
] as const;

export type ScreenshotState = (typeof SCREENSHOT_STATES)[number];

export interface ViewportSize {
  width: number;
  height: number;
}

/** Screenshots `page` to scripts/screenshots/<state>_<w>x<h>.png (ACCEPTANCE.md naming: state + viewport). */
export async function captureState(page: Page, state: ScreenshotState, viewport: ViewportSize): Promise<string> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOTS_DIR, `${state}_${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: filePath });
  return filePath;
}
