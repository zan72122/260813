import { describe, expect, it } from 'vitest';

import { mapVerticalDrag, rotationDeltaRadians, TapGuard } from '../../../src/input/gestures.ts';

describe('mapVerticalDrag — master lever / throttle drag (ARCHITECTURE_CONTRACT frozen mini-API)', () => {
  it('returns startValue unchanged when there is no movement', () => {
    expect(mapVerticalDrag(100, 100, 200, 0.3)).toBeCloseTo(0.3, 12);
  });

  it('dragging UP (decreasing Y) increases the value', () => {
    const value = mapVerticalDrag(200, 100, 200, 0); // moved up 100px of a 200px range
    expect(value).toBeCloseTo(0.5, 12);
  });

  it('dragging DOWN (increasing Y) decreases the value', () => {
    const value = mapVerticalDrag(100, 200, 200, 0.5); // moved down 100px of a 200px range
    expect(value).toBeCloseTo(0, 12);
  });

  it('clamps to 1 when dragged past the top of the range', () => {
    expect(mapVerticalDrag(200, -1000, 200, 0)).toBe(1);
  });

  it('clamps to 0 when dragged past the bottom of the range', () => {
    expect(mapVerticalDrag(0, 1000, 200, 1)).toBe(0);
  });

  it('clamps startValue itself to [0, 1] even with no movement', () => {
    expect(mapVerticalDrag(0, 0, 200, 1.5)).toBe(1);
    expect(mapVerticalDrag(0, 0, 200, -0.5)).toBe(0);
  });

  it('degenerate pixelRange (<= 0) returns the clamped startValue rather than dividing by zero', () => {
    expect(mapVerticalDrag(50, 10, 0, 0.4)).toBeCloseTo(0.4, 12);
    expect(mapVerticalDrag(50, 10, -5, 0.4)).toBeCloseTo(0.4, 12);
  });

  it('never returns NaN for non-finite startY/currentY', () => {
    expect(Number.isFinite(mapVerticalDrag(Number.NaN, 10, 200, 0.5))).toBe(true);
    expect(Number.isFinite(mapVerticalDrag(10, Number.POSITIVE_INFINITY, 200, 0.5))).toBe(true);
  });

  it('is linear within the range', () => {
    const quarter = mapVerticalDrag(200, 150, 200, 0); // up 50 of 200 => +0.25
    expect(quarter).toBeCloseTo(0.25, 12);
  });
});

describe('rotationDeltaRadians — level-wheel rotation gesture', () => {
  it('returns 0 for no movement', () => {
    expect(rotationDeltaRadians(0, 0, 10, 0, 10, 0)).toBeCloseTo(0, 12);
  });

  it('a quarter turn from the top to the right of the pivot has magnitude PI/2', () => {
    // Screen coords, y down: (0,-10) is "above" the pivot, (10,0) is "right" of it.
    const delta = rotationDeltaRadians(0, 0, 0, -10, 10, 0);
    expect(Math.abs(delta)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('documented sign convention: moving from "above" to "right" of the pivot (clockwise on screen) is positive', () => {
    const delta = rotationDeltaRadians(0, 0, 0, -10, 10, 0);
    expect(delta).toBeGreaterThan(0);
  });

  it('the reverse sweep (right to above, counterclockwise on screen) is negative and equal in magnitude', () => {
    const clockwise = rotationDeltaRadians(0, 0, 0, -10, 10, 0);
    const counterClockwise = rotationDeltaRadians(0, 0, 10, 0, 0, -10);
    expect(counterClockwise).toBeCloseTo(-clockwise, 9);
  });

  it('takes the shortest arc: a near-full-circle sweep reports the SHORT way around, not the long way', () => {
    // From just past 0 rad to just before 0 rad the "long way" (almost 2*PI)
    // must be reported as a SHORT negative delta instead.
    const delta = rotationDeltaRadians(0, 0, 10 * Math.cos(0.05), 10 * Math.sin(0.05), 10 * Math.cos(-0.05), 10 * Math.sin(-0.05));
    expect(Math.abs(delta)).toBeLessThan(0.2);
    expect(delta).toBeCloseTo(-0.1, 6);
  });

  it('wraps a full-circle-plus-a-bit sweep into the equivalent short delta', () => {
    const almostFullTurn = rotationDeltaRadians(0, 0, 10, 0, 10 * Math.cos(0.1), -10 * Math.sin(0.1));
    expect(Math.abs(almostFullTurn)).toBeLessThanOrEqual(Math.PI);
  });

  it('never returns NaN even when the finger sits exactly on the pivot', () => {
    expect(Number.isFinite(rotationDeltaRadians(5, 5, 5, 5, 10, 5))).toBe(true);
    expect(Number.isFinite(rotationDeltaRadians(5, 5, 10, 5, 5, 5))).toBe(true);
  });

  it('a full 3-oclock -> 6-oclock -> 9-oclock sweep (clockwise on screen) accumulates to +PI, one small step at a time', () => {
    const cx = 0;
    const cy = 0;
    const r = 10;
    let total = 0;
    let prevAngle = 0; // 3 o'clock, screen coords
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const angle = (i / steps) * Math.PI; // sweep through 6 o'clock to 9 o'clock: clockwise on screen
      const prevX = cx + r * Math.cos(prevAngle);
      const prevY = cy + r * Math.sin(prevAngle);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      total += rotationDeltaRadians(cx, cy, prevX, prevY, x, y);
      prevAngle = angle;
    }
    // Positive per the documented sign convention: this sweep is clockwise as seen on screen.
    expect(total).toBeCloseTo(Math.PI, 6);
  });
});

describe('TapGuard — double-tap / button-mash protection', () => {
  it('allows the first tap', () => {
    const guard = new TapGuard();
    expect(guard.canFire(1000)).toBe(true);
  });

  it('blocks a second tap inside the minimum interval', () => {
    const guard = new TapGuard(350);
    expect(guard.canFire(1000)).toBe(true);
    expect(guard.canFire(1200)).toBe(false); // only 200ms later
  });

  it('allows a tap once the minimum interval has elapsed', () => {
    const guard = new TapGuard(350);
    expect(guard.canFire(1000)).toBe(true);
    expect(guard.canFire(1351)).toBe(true); // 351ms later
  });

  it('defaults to a 350ms minimum interval', () => {
    const guard = new TapGuard();
    guard.canFire(0);
    expect(guard.canFire(349)).toBe(false);
    expect(guard.canFire(350)).toBe(true);
  });

  it('respects a custom minimum interval', () => {
    const guard = new TapGuard(1000);
    guard.canFire(0);
    expect(guard.canFire(500)).toBe(false);
    expect(guard.canFire(1000)).toBe(true);
  });

  it('a blocked tap does not reset the guard window (mashing does not extend the block)', () => {
    const guard = new TapGuard(350);
    guard.canFire(0);
    guard.canFire(100); // blocked
    guard.canFire(200); // blocked
    expect(guard.canFire(340)).toBe(false); // still measured from t=0, not t=200
    expect(guard.canFire(351)).toBe(true);
  });
});
