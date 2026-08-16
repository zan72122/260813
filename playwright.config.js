// Cloud-runner profile per CLAUDE.md: Chromium only, 1 worker, small
// viewport, no video, screenshots only on failure.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  retries: 1,
  maxFailures: 1,
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
    viewport: { width: 390, height: 700 }, // iPhone-ish portrait
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    baseURL: 'http://localhost:8137',
  },
  webServer: {
    command: 'node server.js',
    port: 8137,
    reuseExistingServer: true,
  },
});
