import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    // iOS 15+ / Safari 15+ - the oldest iPad this is worth shipping to
    target: ['es2020', 'safari15'],
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
