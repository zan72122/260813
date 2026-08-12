// src/app/viewport.ts
// Viewport profile computation + resize/orientation-change handling.
// Owned by Integrator (src/app/**).

import type { ViewportProfile } from '../contracts';

export const MAX_DPR = 2;

export function computeViewportProfile(): ViewportProfile {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const orientation = width >= height ? 'landscape' : 'portrait';
  return { width, height, dpr, orientation };
}

/**
 * Subscribes to resize + orientation change and invokes `onChange` with a fresh
 * ViewportProfile. Never destroys any scene state — callers are responsible for
 * preserving GamePhase/openness/etc across calls.
 * Returns an unsubscribe function.
 */
export function watchViewport(onChange: (v: ViewportProfile) => void): () => void {
  let raf = 0;
  const handler = (): void => {
    // Coalesce bursts of resize/orientation events into one update per frame.
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      onChange(computeViewportProfile());
    });
  };
  window.addEventListener('resize', handler, { passive: true });
  window.addEventListener('orientationchange', handler, { passive: true });
  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener('resize', handler, { passive: true });

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
    visualViewport?.removeEventListener('resize', handler);
  };
}
