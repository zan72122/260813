import { describe, expect, it } from 'vitest';
import { TRANSFORM_TIMELINE } from '../../src/core/TransformTimeline';
import {
  computeRopeDeltaProgress,
  isLockReleaseGesture,
  normalizePointerPosition
} from '../../src/input/InputSystem';

describe('computeRopeDeltaProgress (stroke conversion, docs/MASTER_SPEC.md)', () => {
  it('a full-height-fraction stroke yields the spec STROKE_PROGRESS_DELTA', () => {
    const viewportHeight = 844;
    const dy = viewportHeight * TRANSFORM_TIMELINE.STROKE_HEIGHT_FRACTION;
    expect(computeRopeDeltaProgress(0, dy, viewportHeight)).toBeCloseTo(TRANSFORM_TIMELINE.STROKE_PROGRESS_DELTA);
  });

  it('down = positive, up = negative, with matching magnitude', () => {
    const down = computeRopeDeltaProgress(0, 120, 800);
    const up = computeRopeDeltaProgress(0, -120, 800);
    expect(down).toBeGreaterThan(0);
    expect(up).toBeLessThan(0);
    expect(up).toBeCloseTo(-down);
  });

  it('diagonal correction: only the Y component contributes, X is ignored', () => {
    const straight = computeRopeDeltaProgress(0, 100, 800);
    const diagonalRight = computeRopeDeltaProgress(500, 100, 800);
    const diagonalLeft = computeRopeDeltaProgress(-500, 100, 800);
    expect(diagonalRight).toBeCloseTo(straight);
    expect(diagonalLeft).toBeCloseTo(straight);
  });

  it('a zero-height viewport yields zero (no division by zero)', () => {
    expect(computeRopeDeltaProgress(0, 100, 0)).toBe(0);
  });

  it('matches the MASTER_SPEC formula literally: dp = dy / (vh*0.6) * 0.35', () => {
    const dy = 133;
    const vh = 900;
    expect(computeRopeDeltaProgress(0, dy, vh)).toBeCloseTo((dy / (vh * 0.6)) * 0.35);
  });
});

describe('normalizePointerPosition (tap coordinate normalization + clamp)', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it('maps a point inside the rect to 0..1', () => {
    expect(normalizePointerPosition(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePointerPosition(500, 250, rect)).toEqual({ x: 1, y: 1 });
    expect(normalizePointerPosition(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps points outside the rect to [0,1] instead of overflowing', () => {
    expect(normalizePointerPosition(-1000, -1000, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizePointerPosition(10000, 10000, rect)).toEqual({ x: 1, y: 1 });
  });

  it('returns 0 for a degenerate zero-size rect rather than NaN/Infinity', () => {
    expect(normalizePointerPosition(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('isLockReleaseGesture (unlock phase: tap OR short downward swipe)', () => {
  it('a stationary tap releases the lock', () => {
    expect(isLockReleaseGesture(0, 120, false)).toBe(true);
  });

  it('a short, fast downward swipe releases the lock', () => {
    expect(isLockReleaseGesture(40, 300, true)).toBe(true);
  });

  it('a slow, long downward swipe does not release the lock', () => {
    expect(isLockReleaseGesture(40, 2000, true)).toBe(false);
  });

  it('an upward or too-short swipe does not release the lock', () => {
    expect(isLockReleaseGesture(-40, 300, true)).toBe(false);
    expect(isLockReleaseGesture(5, 300, true)).toBe(false);
  });
});
