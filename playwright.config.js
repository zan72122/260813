// Cloud-runner profile: Chromium only, one worker, tiny artefacts.
// GPU-dependent judgements (fps, visual regression) belong on real hardware.
import { defineConfig, devices } from '@playwright/test';

import fs from 'node:fs';

const FAST = process.env.E2E_FAST === '1';

// The cloud runner ships a pinned Chromium that may not match this
// Playwright build's expected revision; point at it directly rather than
// downloading a second copy.
const PRESET = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync(PRESET) ? PRESET : undefined);

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  maxFailures: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text'],
    },
  },
  // Chromium only on the cloud runner. Real Safari checks happen on a
  // device; here we emulate iPhone/iPad viewports + touch input.
  projects: [
    {
      name: 'iphone-portrait',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        deviceScaleFactor: FAST ? 1 : 2,
      },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'chromium',
        deviceScaleFactor: FAST ? 1 : 2,
      },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
