import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some runners ship a pre-installed Chromium whose build number does not match
 * the one this @playwright/test expects. Point at whatever is actually there
 * instead of downloading a second copy.
 */
function preinstalledChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root)) {
    if (!dir.startsWith('chromium-')) continue;
    const bin = join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

// Cloud profile: Chromium only, one worker, tiny artefacts. Anything that
// judges FPS, animation smoothness or final visual quality belongs on a
// hardware-accelerated runner, not here.
const FAST = process.env.E2E_FAST === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
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
    // SwiftShader needs the flag; a real device obviously does not.
    launchOptions: {
      executablePath: preinstalledChromium(),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // containers commonly run as root; Chromium refuses to sandbox there
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
  // NOTE: the iPhone/iPad device descriptors default to WebKit. We keep their
  // viewport, DPR and user agent but force Chromium, per the cloud profile.
  projects: [
    // The brief targets phones and tablets, but the thing gets opened on a
    // laptop constantly - a mouse must work too.
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'iphone-portrait',
      use: { ...devices['iPhone 13'], browserName: 'chromium', isMobile: true, hasTouch: true },
    },
    {
      name: 'iphone-landscape',
      use: {
        ...devices['iPhone 13 landscape'],
        browserName: 'chromium',
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ipad-portrait',
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'chromium',
        viewport: { width: 810, height: 1080 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'chromium',
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  metadata: { fast: FAST },
});
