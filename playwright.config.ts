import { defineConfig, devices } from '@playwright/test';

const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

const CHROMIUM_LAUNCH_ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'];

/**
 * Four required acceptance viewports (VISUAL_ACCEPTANCE.md): phone portrait,
 * phone landscape, tablet portrait, tablet landscape. All touch-first, no
 * mouse hover affordances relied upon.
 */
const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
] as const;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  // Generous: the four-viewport suite runs over a headless SwiftShader
  // (software) WebGL2 renderer, which can render at just a few fps —
  // camera/interior tweens are wall-clock-timed (CAMERA_CONTRACT tension
  // documented in src/core/clock.ts), so a handful of `settled()` waits or a
  // full ascent-hold sequence can legitimately take tens of seconds.
  //
  // INTEGRATOR FIX (Wave 4): raised from 120s to 180s — a full sequential
  // `npm run verify` run keeps ONE browser process's GPU (SwiftShader)
  // process under sustained software-rendering load for 30+ minutes across
  // all 72 tests (`workers: 1`), and that measurably compounds per-render-
  // pass cost as the run goes on (individually-generous tests like
  // "pause/resume" and "sound toggle", with no per-test override, measured
  // climbing from ~20-30s early in a run to ~60-66s later in the same run).
  // This default is this global floor other tests fall back to; the
  // heaviest tests (screenshots, prefers-reduced-motion) still carry their
  // own larger explicit `test.setTimeout` on top of it.
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: VIEWPORTS.map((viewport) => ({
    name: viewport.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      launchOptions: {
        args: CHROMIUM_LAUNCH_ARGS,
      },
    },
  })),
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
