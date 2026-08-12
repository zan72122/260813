import { describe, expect, it } from 'vitest';
import { classifyGesture } from '../gestures';

describe('classifyGesture', () => {
  it('classifies a short, small-movement touch as a tap', () => {
    expect(classifyGesture({ durationMs: 100, distPx: 5, vx: 0, vy: 0 })).toEqual({ kind: 'tap' });
    // Boundary values are inclusive per the age-4 tuned thresholds.
    expect(classifyGesture({ durationMs: 350, distPx: 14, vx: 0, vy: 0 })).toEqual({ kind: 'tap' });
  });

  it('classifies a fast flick as a swipe with the dominant axis direction', () => {
    expect(classifyGesture({ durationMs: 500, distPx: 200, vx: 0, vy: -0.5 })).toEqual({
      kind: 'swipe',
      dir: 'up',
    });
    expect(classifyGesture({ durationMs: 500, distPx: 200, vx: 0.6, vy: 0 })).toEqual({
      kind: 'swipe',
      dir: 'right',
    });
    expect(classifyGesture({ durationMs: 500, distPx: 200, vx: -0.6, vy: 0.1 })).toEqual({
      kind: 'swipe',
      dir: 'left',
    });
    expect(classifyGesture({ durationMs: 500, distPx: 200, vx: 0, vy: 0.6 })).toEqual({
      kind: 'swipe',
      dir: 'down',
    });
  });

  it('classifies a slow, long movement as a plain drag (neither tap nor swipe)', () => {
    expect(classifyGesture({ durationMs: 2000, distPx: 200, vx: 0.01, vy: 0.01 })).toEqual({ kind: 'drag' });
  });

  it('a long-duration-but-small-movement hold is not a tap and not a swipe', () => {
    expect(classifyGesture({ durationMs: 5000, distPx: 2, vx: 0, vy: 0 })).toEqual({ kind: 'drag' });
  });
});
