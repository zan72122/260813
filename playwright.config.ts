import { defineConfig, devices } from '@playwright/test'

// CLAUDE.md のクラウド方針: Chromium のみ / workers=1 / retries=1 / maxFailures=1
const CI_CLOUD = process.env.CLAUDE_CODE_REMOTE === 'true' || !!process.env.CI

const swiftshader = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-lcd-text',
  '--force-device-scale-factor=1',
]

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
    launchOptions: { args: swiftshader },
  },
  projects: [
    {
      name: 'iphone-portrait',
      use: { ...devices['iPhone 13'], deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    },
    {
      name: 'iphone-landscape',
      use: {
        ...devices['iPhone 13 landscape'],
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ipad-portrait',
      use: { ...devices['iPad Mini'], deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 90_000,
  },
})
