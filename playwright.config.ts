import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Chromium is pre-installed at PLAYWRIGHT_BROWSERS_PATH. If the pinned
// Playwright version can't resolve it by itself, fall back to the known path.
const fallbackChromiumPath = '/opt/pw-browsers/chromium';
const executablePath = existsSync(fallbackChromiumPath) ? fallbackChromiumPath : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  // Each spec drives a full, heavy WebGL scene (shadow maps, PMREM env,
  // shader-driven VFX). Running multiple Chromium pages concurrently causes
  // severe GPU/compositor contention in this sandboxed environment (observed:
  // simple phase transitions that take <1s standalone timing out at 60-150s
  // under 2 parallel workers). Serialize to keep runs deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // 'retain-on-failure' buffers a full action trace continuously for the
    // whole test even when it eventually passes; with retries:0 that buffer
    // is only ever useful for a small minority of runs, and its overhead is
    // measurable in this environment's already-high per-action CDP latency.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      // Deliberately not using devices['Desktop Chrome'] (which may pin a
      // 'chrome' channel); we target the pre-installed chromium build directly.
      name: 'chromium',
      use: {
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        hasTouch: true,
        isMobile: true,
        // 1x rather than a real device's 2-3x: the app's own renderer already
        // clamps DPR internally (src/app/renderer.ts), and halving/quartering
        // the rasterized pixel count materially reduces GPU load for this
        // sandbox's software-rendered Chromium — CSS-px viewport size (what
        // ACCEPTANCE.md's matrix specifies) is unaffected.
        deviceScaleFactor: 1,
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],
});
