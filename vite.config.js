import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
});
