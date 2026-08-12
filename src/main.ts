/**
 * Entry point: parses boot query params, constructs the App, starts it,
 * and exposes the frozen `window.__eiffel` test/inspection API.
 */

import { App } from './app/App.ts';
import type { EiffelTestAPI } from './contracts/testing.ts';

declare global {
  interface Window {
    __eiffel: EiffelTestAPI;
  }
}

function readBootParams(search: string): { readonly deterministic: boolean; readonly seed: number } {
  const params = new URLSearchParams(search);
  const deterministic = params.get('det') === '1';
  const seedParam = params.get('seed');
  const parsedSeed = seedParam === null ? Number.NaN : Number.parseInt(seedParam, 10);
  const seed = Number.isFinite(parsedSeed) ? parsedSeed : Date.now() & 0xffffffff;
  return { deterministic, seed };
}

function boot(): void {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('main: #app root element is missing from index.html');
  }
  const { deterministic, seed } = readBootParams(window.location.search);
  const app = new App({ root, seed, deterministic });
  window.__eiffel = app.testApi;
  app.start();
}

boot();
