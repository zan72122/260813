import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * CLAUDE.md の Playwright クラウドプロファイルに合わせた設定。
 * Chromium のみ / workers=1 / retries=1 / maxFailures=1。
 */
const isCloud = process.env.CLAUDE_CODE_REMOTE === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  maxFailures: isCloud ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // 環境に用意ずみの Chromium を使う（playwright install はしない）
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ||
        (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    },
  },
  projects: [
    {
      name: 'iphone-portrait',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // 古い dist を配ってしまわないように、毎回ビルドしてから配信する
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
