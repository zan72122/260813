// Chromium スモーク専用のクラウドプロファイル（CLAUDE.md 準拠）
const { defineConfig } = require('@playwright/test');

const useSystemChromium = !!process.env.PW_SYSTEM_CHROMIUM || require('fs').existsSync('/opt/pw-browsers/chromium');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90 * 1000,
  workers: 1,
  retries: 1,
  maxFailures: 1,
  use: {
    baseURL: 'http://127.0.0.1:8347',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 390, height: 844 },
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: useSystemChromium ? { executablePath: '/opt/pw-browsers/chromium' } : {}
  },
  webServer: {
    command: 'python3 -m http.server 8347',
    url: 'http://127.0.0.1:8347/index.html',
    reuseExistingServer: true,
    timeout: 20 * 1000
  }
});
