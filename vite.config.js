import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 900,
  },
});
