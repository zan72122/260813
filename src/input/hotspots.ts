// src/input/hotspots.ts
// Reads the whistle hotspot published by the game layer's debug API
// (window.__versailles.hotspots, see docs/CONTRACTS.md "Debug API"), with a
// generous radius scaling and a generous fallback region so a 4-year-old's
// imprecise tap still lands on the whistle before Worker A's real hotspot
// geometry exists / if it is ever momentarily unset.
//
// NOTE: window.__versailles is documented in docs/CONTRACTS.md prose but is
// not part of the frozen src/contracts/** type files, so its shape is
// declared locally here (read-only, defensive optional access throughout).
// See handoff "Open issues" for a request to promote this to a real contract.

export interface Hotspot {
  /** Normalized screen coordinates, 0..1. */
  x: number;
  y: number;
  /** Normalized radius, 0..1 (relative to the shorter viewport dimension). */
  r: number;
}

export interface VersaillesHotspots {
  whistle?: Hotspot;
  valve?: Hotspot;
}

/** Minimal read-only slice of the Debug API this module depends on. */
export interface VersaillesDebugHotspotSlice {
  hotspots?: VersaillesHotspots;
}

declare global {
  interface Window {
    __versailles?: VersaillesDebugHotspotSlice & Record<string, unknown>;
  }
}

/** Multiplies the game-reported hotspot radius for forgiving child taps. */
export const HOTSPOT_RADIUS_SCALE = 1.8;
export const MIN_HOTSPOT_RADIUS = 0.12;
export const MAX_HOTSPOT_RADIUS = 0.5;

/** Generous fallback region (upper-center of screen) if no hotspot is published yet. */
export const FALLBACK_WHISTLE_HOTSPOT: Hotspot = { x: 0.5, y: 0.16, r: 0.24 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Returns the current whistle hotspot, generously scaled, with fallback. */
export function getWhistleHotspot(): Hotspot {
  const raw = typeof window !== 'undefined' ? window.__versailles?.hotspots?.whistle : undefined;
  if (!raw) return FALLBACK_WHISTLE_HOTSPOT;
  const r = clamp(raw.r * HOTSPOT_RADIUS_SCALE, MIN_HOTSPOT_RADIUS, MAX_HOTSPOT_RADIUS);
  return { x: raw.x, y: raw.y, r };
}

/** True if the normalized point (0..1, 0..1) lies within the given hotspot. */
export function isInsideHotspot(nx: number, ny: number, hotspot: Hotspot): boolean {
  const dx = nx - hotspot.x;
  const dy = ny - hotspot.y;
  return dx * dx + dy * dy <= hotspot.r * hotspot.r;
}
