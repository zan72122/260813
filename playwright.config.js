import { defineConfig, devices } from '@playwright/test';

// CLAUDE.md のクラウドプロファイル：Chromium のみ・workers=1・軽い設定
const CLOUD = !!process.env.CLAUDE_CODE_REMOTE || !!process.env.E2E_FAST;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: CLOUD ? 1 : 0,
  maxFailures: CLOUD ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // クラウドの実行機には GPU がないので、Chromium + SwiftShader で動かす。
    // ここでは「動くこと」だけを見る。FPS や見た目の最終確認はしない。
    browserName: 'chromium',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    },
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'iphone-portrait',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
