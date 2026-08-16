// Cloud/CI profile per CLAUDE.md: chromium only, 1 worker, minimal artifacts.
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const localChromium = process.env.PW_CHROMIUM_PATH ||
  (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 1,
  maxFailures: 1,
  timeout: 90_000,
  use: {
    browserName: 'chromium',
    // Use the environment's preinstalled Chromium instead of downloading one.
    launchOptions: localChromium ? { executablePath: localChromium } : {},
    viewport: { width: 420, height: 760 },
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 8734 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8734/index.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
