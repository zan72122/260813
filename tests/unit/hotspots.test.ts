import { describe, expect, it } from 'vitest';
import {
  FALLBACK_WHISTLE_HOTSPOT,
  MAX_HOTSPOT_RADIUS,
  MIN_HOTSPOT_RADIUS,
  HOTSPOT_RADIUS_SCALE,
  getWhistleHotspot,
  isInsideHotspot,
} from '../../src/input/hotspots';

describe('isInsideHotspot', () => {
  it('is true at the exact center', () => {
    expect(isInsideHotspot(0.5, 0.5, { x: 0.5, y: 0.5, r: 0.1 })).toBe(true);
  });

  it('is true on the boundary (inclusive)', () => {
    expect(isInsideHotspot(0.6, 0.5, { x: 0.5, y: 0.5, r: 0.1 })).toBe(true);
  });

  it('is false outside the radius', () => {
    expect(isInsideHotspot(0.7, 0.5, { x: 0.5, y: 0.5, r: 0.1 })).toBe(false);
  });
});

describe('getWhistleHotspot (no window.__versailles present)', () => {
  it('falls back to the generous default region', () => {
    expect(getWhistleHotspot()).toEqual(FALLBACK_WHISTLE_HOTSPOT);
  });

  it('the fallback radius is within the configured scaling bounds', () => {
    const fallback = getWhistleHotspot();
    expect(fallback.r).toBeGreaterThanOrEqual(MIN_HOTSPOT_RADIUS);
    expect(fallback.r).toBeLessThanOrEqual(MAX_HOTSPOT_RADIUS);
  });

  it('sanity: the configured radius scale is generous (> 1x)', () => {
    expect(HOTSPOT_RADIUS_SCALE).toBeGreaterThan(1);
  });
});
