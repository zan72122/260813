import { defineConfig } from '@playwright/test';

/**
 * Owner C (mobile-qa) — full docs/ACCEPTANCE.md viewport matrix, chromium
 * only (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers preinstalled — no
 * `playwright install`, no webkit, no `devices` presets: viewport/touch
 * options are set manually per project instead).
 */
const MOBILE_TOUCH_USE = {
  browserName: 'chromium' as const,
  hasTouch: true,
  isMobile: true
};

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    ...MOBILE_TOUCH_USE
  },
  projects: [
    {
      name: 'mobile-portrait-390x844',
      use: { ...MOBILE_TOUCH_USE, viewport: { width: 390, height: 844 } }
    },
    {
      name: 'mobile-landscape-844x390',
      use: { ...MOBILE_TOUCH_USE, viewport: { width: 844, height: 390 } }
    },
    {
      name: 'tablet-portrait-820x1180',
      use: { ...MOBILE_TOUCH_USE, viewport: { width: 820, height: 1180 } }
    },
    {
      name: 'tablet-landscape-1180x820',
      use: { ...MOBILE_TOUCH_USE, viewport: { width: 1180, height: 820 } }
    }
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
