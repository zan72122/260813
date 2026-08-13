/// <reference types="vite/client" />

// vite-plugin-pwaの仮想モジュール型宣言(main.tsのSW手動登録用)。フレームワーク別のclient.d.ts
// (vue/react/svelte等)は未使用ライブラリの型を引き込んでしまうため、ここで最小限だけ宣言する。
declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
