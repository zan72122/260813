import { defineConfig } from "@playwright/test";

// 環境指針: プリインストールのchromiumを再ダウンロードせず使う(/opt/pw-browsers/chromiumのシンボリックリンク)。
// ヘッドレスSwiftShaderは重いため、テストは基本 ?qa=1&quality=low&timeScale=8&seed=42&nosw=1 で起動し、
// 固定sleepではなくdebug API(ready/getState/screenshotReady)とイベント待ちで進行する(e2e/helpers.ts)。
const EXECUTABLE_PATH = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  timeout: 75_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      executablePath: EXECUTABLE_PATH
    }
  },
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "iphone-portrait",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      }
    },
    {
      name: "iphone-landscape",
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      }
    },
    {
      name: "ipad-portrait",
      use: {
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      }
    },
    {
      name: "ipad-landscape",
      use: {
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      }
    }
  ]
});
