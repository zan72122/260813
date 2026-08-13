import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// 環境指針: プリインストールのchromiumを使用し再ダウンロードしない。
// PLAYWRIGHT_BROWSERS_PATH 配下の既定chromium実行ファイルを使う。
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const executablePath = browsersPath ? path.join(browsersPath, "chromium", "chrome-linux", "chrome") : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "iPhone-portrait",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        launchOptions: executablePath ? { executablePath } : {}
      }
    }
  ]
});
