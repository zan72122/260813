import { defineConfig } from '@playwright/test';

/**
 * Cloud/CI profile: Chromium only, one worker, software WebGL. Screenshots are
 * for composition and readability checks — never for judging frame rate or
 * final visual quality, which need a real GPU.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 1,
  maxFailures: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5183',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-lcd-text',
        '--force-device-scale-factor=1',
      ],
    },
  },
  projects: [
    {
      name: 'phone-portrait',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false },
    },
    {
      name: 'phone-landscape',
      use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: false },
    },
  ],
  webServer: {
    command: 'npx vite --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
