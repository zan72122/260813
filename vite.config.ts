import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA設定はS5で詳細化する。ここでは導入のみ（最小構成）。
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html}"]
      }
    })
  ],
  server: {
    host: true
  },
  preview: {
    host: true
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});
