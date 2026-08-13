import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * この実行環境には Chromium が焼き込まれている（PLAYWRIGHT_BROWSERS_PATH）。
 * @playwright/test のリビジョンとズレていても動くように実体を直接指す。
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(PREINSTALLED_CHROMIUM)
  ? { executablePath: PREINSTALLED_CHROMIUM }
  : {};

/** iPhone / iPad 相当の画面サイズ（たて・よこ両方をみる）。 */
const SCREENS = [
  { name: 'iphone-portrait', width: 390, height: 844, mobile: true },
  { name: 'iphone-landscape', width: 844, height: 390, mobile: true },
  { name: 'ipad-portrait', width: 768, height: 1024, mobile: true },
  { name: 'ipad-landscape', width: 1024, height: 768, mobile: true },
];

/**
 * クラウド実行（Claude Code on the web）向けの軽い設定。
 * Chromium のみ・1ワーカー・動画なし。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 1,
  maxFailures: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    deviceScaleFactor: 1,
    launchOptions,
  },
  projects: SCREENS.map((s) => ({
    name: s.name,
    use: {
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: 1,
      isMobile: s.mobile,
      hasTouch: true,
    },
  })),
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
