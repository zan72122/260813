import { defineConfig } from 'vite';

// Fixed dev/preview port so playwright.config.ts webServer can target it
// deterministically across CI/local/e2e runs.
export const APP_PORT = 4173;

export default defineConfig({
  server: { port: APP_PORT, strictPort: true },
  preview: { port: APP_PORT, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
