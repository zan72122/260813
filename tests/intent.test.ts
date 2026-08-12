import { describe, expect, it } from 'vitest';
import { attentionStrength, findCaptureTarget, isWithinCaptureRadius } from '../src/game/intent.ts';
import { CAPTURE_RADIUS_MULTIPLIER } from '../src/game/types.ts';

describe('isWithinCaptureRadius', () => {
  it('accepts a sloppy drop within the generous multiplied radius', () => {
    const basket = { x: 0, z: 0 };
    const radius = 0.16;
    // Distance = 0.3, radius * 2.2 = 0.352 -> should succeed.
    expect(isWithinCaptureRadius({ x: 0.3, z: 0 }, basket, radius)).toBe(true);
  });

  it('rejects a drop clearly outside the capture radius', () => {
    const basket = { x: 0, z: 0 };
    const radius = 0.16;
    expect(isWithinCaptureRadius({ x: 1, z: 1 }, basket, radius)).toBe(false);
  });

  it('the boundary matches exactly radius * CAPTURE_RADIUS_MULTIPLIER', () => {
    const basket = { x: 0, z: 0 };
    const radius = 0.1;
    const boundary = radius * CAPTURE_RADIUS_MULTIPLIER;
    expect(isWithinCaptureRadius({ x: boundary - 0.0001, z: 0 }, basket, radius)).toBe(true);
    expect(isWithinCaptureRadius({ x: boundary + 0.01, z: 0 }, basket, radius)).toBe(false);
  });
});

describe('findCaptureTarget', () => {
  const candidates = [
    { target: 'left', position: { x: -0.6, z: 0.5 }, radius: 0.16 },
    { target: 'center', position: { x: 0, z: 0.6 }, radius: 0.16 },
    { target: 'right', position: { x: 0.6, z: 0.5 }, radius: 0.16 },
  ];

  it('returns null for an empty candidate list', () => {
    expect(findCaptureTarget({ x: 0, z: 0 }, [])).toBeNull();
  });

  it('picks the nearest candidate regardless of hit/miss', () => {
    const result = findCaptureTarget({ x: 0.55, z: 0.5 }, candidates);
    expect(result?.target).toBe('right');
  });

  it('reports withinRadius correctly for the nearest candidate', () => {
    const near = findCaptureTarget({ x: 0, z: 0.65 }, candidates);
    expect(near?.target).toBe('center');
    expect(near?.withinRadius).toBe(true);

    const far = findCaptureTarget({ x: -0.05, z: -0.9 }, candidates);
    expect(far?.withinRadius).toBe(false);
  });
});

describe('attentionStrength', () => {
  it('is 1 at the target center and 0 at/after the attention radius edge', () => {
    const target = { x: 0, z: 0 };
    expect(attentionStrength(target, target, 0.2)).toBeCloseTo(1, 5);
    const attentionRadius = 0.2 * CAPTURE_RADIUS_MULTIPLIER * 1.6;
    expect(attentionStrength({ x: attentionRadius + 1, z: 0 }, target, 0.2)).toBe(0);
  });

  it('decreases monotonically with distance', () => {
    const target = { x: 0, z: 0 };
    const near = attentionStrength({ x: 0.05, z: 0 }, target, 0.2);
    const far = attentionStrength({ x: 0.3, z: 0 }, target, 0.2);
    expect(near).toBeGreaterThan(far);
  });
});
