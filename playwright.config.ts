import { defineConfig, devices } from '@playwright/test'

// CLAUDE.md のクラウド方針: Chromium のみ / workers=1 / retries=1 / maxFailures=1
const CI_CLOUD = process.env.CLAUDE_CODE_REMOTE === 'true' || !!process.env.CI

// この環境に用意ずみの Chromium を使う (バージョンが違っても取りに行かない)
const CHROMIUM = process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium'

const swiftshader = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-lcd-text',
  '--force-device-scale-factor=1',
]

// 端末プリセットは WebKit を既定にするので、Chromium に固定しなおす
const chromiumMobile = {
  browserName: 'chromium' as const,
  defaultBrowserType: 'chromium' as const,
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
}

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 8_000 },
  workers: 1,
  retries: CI_CLOUD ? 1 : 0,
  maxFailures: CI_CLOUD ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: { args: swiftshader, executablePath: CHROMIUM },
  },
  projects: [
    {
      name: 'iphone-portrait',
      use: { ...devices['iPhone 13'], ...chromiumMobile },
    },
    {
      name: 'iphone-landscape',
      use: { ...devices['iPhone 13 landscape'], ...chromiumMobile },
    },
    {
      name: 'ipad-portrait',
      use: { ...devices['iPad Mini'], ...chromiumMobile },
    },
  ],
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 90_000,
  },
})
