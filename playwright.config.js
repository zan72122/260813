// クラウド実行プロファイル（CLAUDE.md 準拠）: Chromium のみ / workers=1
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 1,
  maxFailures: 1,
  use: {
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    port: 4173,
    reuseExistingServer: true,
  },
});
