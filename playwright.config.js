import { defineConfig } from '@playwright/test';

// Claude Code on the web のクラウド実行方針に合わせた設定。
// Chromium 1 本、ワーカー 1、動画なし。重い E2E は CI 側で回す前提。
const fast = process.env.E2E_FAST === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: fast ? 0 : 1,
  maxFailures: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE || 'http://127.0.0.1:4173',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    hasTouch: true,
    isMobile: false,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: process.env.BASE
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
