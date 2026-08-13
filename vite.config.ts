import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA: 完全オフライン(実行時の外部通信ゼロ)。アイコンはscripts/gen-icons.mjsでローカル生成した
// public/icons/*.pngをコミット済みのものを使う。registerType: autoUpdateで新SWが即有効化される
// (main.tsのvirtual:pwa-register経由での手動登録、?nosw=1で登録自体をスキップできる)。
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: {
        name: "ゾウのかくれごはん",
        short_name: "ぞうのかくれごはん",
        description: "ごはんをかくして、ぞうさんをよぶ非公式の教育的タッチゲーム",
        lang: "ja",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#fff8ef",
        theme_color: "#fff8ef",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,json}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
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
