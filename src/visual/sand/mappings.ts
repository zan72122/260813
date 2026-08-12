/**
 * Pure parameter mappings from game state (sandLevel, `sandFlow` rate) to
 * every sand visual's tunable — no Three.js, no geometry, fully
 * unit-testable. PERFORMANCE_BUDGET.md: "全てparameter駆動" (zero physics).
 */
import { SAND_MAX_RATE } from '../../contracts/constants';

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export const STREAM_MIN_WIDTH = 0.05;
export const STREAM_MAX_WIDTH = 0.55;
export const STREAM_MAX_OPACITY = 0.9;

/** Scrolling-UV stream mesh width (world units), 0 rate → hairline, SAND_MAX_RATE → full width. Matches VISUAL_ACCEPTANCE "砂の流量がgate開度に見て取れる". */
export function streamWidthForRate(rate: number, maxRate = SAND_MAX_RATE): number {
  const t = clamp01(rate / maxRate);
  return STREAM_MIN_WIDTH + (STREAM_MAX_WIDTH - STREAM_MIN_WIDTH) * t;
}

/** Stream opacity — invisible at rate=0 (PERFORMANCE_BUDGET keeps transparent draws minimal by fully hiding when not flowing). */
export function streamOpacityForRate(rate: number, maxRate = SAND_MAX_RATE): number {
  return clamp01(rate / maxRate) * STREAM_MAX_OPACITY;
}

/** Scroll speed (UV units/s) of the stream texture — faster flow reads as faster-moving sand. */
export function streamScrollSpeedForRate(rate: number, maxRate = SAND_MAX_RATE): number {
  return 0.3 + clamp01(rate / maxRate) * 2.4;
}

/** Instanced grain count for the current sandLevel, capped at `particleMax` (QualityState.particleMax — PERFORMANCE_BUDGET's per-tier PARTICLE_BUDGET). Monotonic in sandLevel: more remaining sand → more grains drawn. */
export function grainCountForLevel(sandLevel: number, particleMax: number): number {
  return Math.round(clamp01(sandLevel) * Math.max(0, particleMax));
}

/** Sand-surface world Y inside the cutaway box, between `floorY` (empty) and `fullY` (full) — the heightfield's overall level. */
export function surfaceYForLevel(sandLevel: number, floorY: number, fullY: number): number {
  return floorY + clamp01(sandLevel) * (fullY - floorY);
}

/** Pile height (world units) growing below the sandbox as sand drains out — inverse of sandLevel, 0 while full, `maxPileHeight` once fully depleted. */
export function pileHeightForLevel(sandLevel: number, maxPileHeight: number): number {
  return (1 - clamp01(sandLevel)) * maxPileHeight;
}

/** Pile radius (world units) growing alongside its height, so it reads as a spreading heap rather than a thin column. */
export function pileRadiusForLevel(sandLevel: number, maxPileRadius: number): number {
  return (1 - clamp01(sandLevel)) * maxPileRadius;
}
