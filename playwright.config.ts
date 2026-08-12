import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Chromium is pre-installed at PLAYWRIGHT_BROWSERS_PATH. If the pinned
// Playwright version can't resolve it by itself, fall back to the known path.
const fallbackChromiumPath = '/opt/pw-browsers/chromium';
const executablePath = existsSync(fallbackChromiumPath) ? fallbackChromiumPath : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
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
        deviceScaleFactor: 2,
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],
});
