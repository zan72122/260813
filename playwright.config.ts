import { defineConfig, devices } from '@playwright/test';
import { APP_PORT } from './vite.config';

/**
 * Chromium is pre-installed at a fixed on-disk revision in this environment
 * (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, download disabled). The pinned
 * @playwright/test version (1.56.1) was chosen specifically because it
 * bundles/expects that exact chromium-1194 revision, so the default
 * channel resolution works — `executablePath` is set explicitly anyway as
 * a defensive fallback matching the environment's documented executable
 * path, verified to exist on disk.
 */
const CHROMIUM_EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const baseURL = `http://127.0.0.1:${APP_PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: CHROMIUM_EXECUTABLE,
    },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'phone-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'phone-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true },
    },
  ],
});
