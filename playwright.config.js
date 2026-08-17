// Cloud profile per CLAUDE.md: Chromium only, workers=1, retries=1,
// maxFailures=1, video off, small viewport, screenshot on failure.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 1,
  maxFailures: 1,
  timeout: 120000,
  use: {
    browserName: 'chromium',
    viewport: { width: 640, height: 400 },
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: {
      // pre-installed Chromium (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD environments)
      executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
      // software WebGL for headless CI runners (SwiftShader)
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
});
