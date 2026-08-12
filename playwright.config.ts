import { defineConfig } from '@playwright/test';

/**
 * Wave 1 stub config. Owner C (mobile-qa) will expand this with the
 * full viewport matrix from docs/ACCEPTANCE.md. Kept trivial here so
 * `npm run test:e2e` passes against a `vite preview` server.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    // Mobile-shaped viewport (iPhone-class) on the preinstalled chromium
    // browser only. Owner C expands this into the full docs/ACCEPTANCE.md
    // viewport x device matrix (which may add webkit) in a later wave.
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  },
  projects: [
    {
      name: 'chromium'
    }
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000
  }
});
