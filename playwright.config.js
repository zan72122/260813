// クラウド実行プロファイル: Chromiumのみ / workers=1 / 最小構成
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// 実行環境にプリインストールされたChromiumがあればそれを使う（再ダウンロード回避）
const chromiumPath = process.env.PW_CHROMIUM_PATH ||
  ['/opt/pw-browsers/chromium'].find(p => existsSync(p));

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
  retries: 1,
  maxFailures: 1,
  use: {
    browserName: 'chromium',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
    viewport: { width: 390, height: 844 }, // iPhone相当の縦画面
    deviceScaleFactor: 1,
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    baseURL: 'http://localhost:8199'
  },
  webServer: {
    command: 'node serve.mjs',
    port: 8199,
    reuseExistingServer: true
  }
});
