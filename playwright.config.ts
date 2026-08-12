import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'mobile-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true },
    },
  ],
});
