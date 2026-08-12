import { describe, expect, it } from 'vitest';
import {
  createCircularGestureTracker,
  type GestureDelta,
  type GestureSample,
} from '../../src/input/circularGesture';

/** Deterministic pseudo-random in [0,1), so jitter tests are reproducible. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface CircleOptions {
  steps: number;
  radius: number;
  centerX: number;
  centerY: number;
  clockwise: boolean;
  dt: number;
  startT?: number;
  jitter?: number;
}

/**
 * Generates samples around a circle in screen-space coordinates (y-down),
 * matching the convention documented in src/input/circularGesture.ts:
 * increasing theta = visually clockwise.
 */
function generateCircleSamples(opts: CircleOptions): GestureSample[] {
  const dir = opts.clockwise ? 1 : -1;
  const samples: GestureSample[] = [];
  for (let i = 0; i <= opts.steps; i++) {
    const theta = dir * (i / opts.steps) * Math.PI * 2;
    const jitterX = opts.jitter ? (pseudoRandom(i) - 0.5) * 2 * opts.jitter : 0;
    const jitterY = opts.jitter ? (pseudoRandom(i + 1000) - 0.5) * 2 * opts.jitter : 0;
    samples.push({
      x: opts.centerX + opts.radius * Math.cos(theta) + jitterX,
      y: opts.centerY + opts.radius * Math.sin(theta) + jitterY,
      t: (opts.startT ?? 0) + i * opts.dt,
    });
  }
  return samples;
}

function sumDeltas(samples: GestureSample[], tracker = createCircularGestureTracker()) {
  let total = 0;
  const deltas: number[] = [];
  for (const s of samples) {
    const r = tracker.addSample(s);
    if (r) {
      total += r.deltaAngleRad;
      deltas.push(r.deltaAngleRad);
    }
  }
  return { total, deltas };
}

describe('createCircularGestureTracker', () => {
  it('returns null until there are at least two usable samples', () => {
    const tracker = createCircularGestureTracker();
    expect(tracker.addSample({ x: 10, y: 0, t: 0 })).toBeNull();
    // second sample coincident with the rolling centroid (only one point so
    // far averages to itself) also yields no defined angle change yet.
  });

  it('perfect clockwise circle: accumulates roughly +2π of signed rotation', () => {
    const samples = generateCircleSamples({
      steps: 90,
      radius: 100,
      centerX: 0,
      centerY: 0,
      clockwise: true,
      dt: 1 / 60,
    });
    const { total, deltas } = sumDeltas(samples);

    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.every((d) => d >= 0)).toBe(true); // a clean CW circle should never look CCW
    expect(total).toBeGreaterThan(Math.PI * 1.6);
    expect(total).toBeLessThan(Math.PI * 2.4);
  });

  it('wobbly, off-center clockwise circle still nets a substantial positive rotation', () => {
    const samples = generateCircleSamples({
      steps: 120,
      radius: 60,
      centerX: 400, // far from the origin — "off-center" relative to any fixed frame
      centerY: 250,
      clockwise: true,
      dt: 1 / 60,
      jitter: 6, // ~10% of radius positional noise per sample
    });
    const { total } = sumDeltas(samples);

    expect(total).toBeGreaterThan(Math.PI); // at least half a turn's worth of net signal
  });

  it('counter-clockwise motion is damped to small negative/zero deltas, never a big failure signal', () => {
    const samples = generateCircleSamples({
      steps: 90,
      radius: 100,
      centerX: 0,
      centerY: 0,
      clockwise: false,
      dt: 1 / 60,
    });
    const tracker = createCircularGestureTracker({ ccwMaxMagnitudeRad: 0.035 });
    const { total, deltas } = sumDeltas(samples, tracker);

    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) {
      expect(d).toBeLessThanOrEqual(0);
      expect(d).toBeGreaterThanOrEqual(-0.035 - 1e-9);
    }
    // Damped total should be nowhere near a full negative revolution.
    expect(total).toBeGreaterThan(-Math.PI);
  });

  it('an idle gap resets angle tracking so deltas stop instead of jumping when resumed', () => {
    const tracker = createCircularGestureTracker({ idleResetSec: 0.3 });
    const quarter = generateCircleSamples({
      steps: 20,
      radius: 100,
      centerX: 0,
      centerY: 0,
      clockwise: true,
      dt: 1 / 60,
    }).slice(0, 15);

    let lastResult: GestureDelta | null = null;
    let lastSample: GestureSample | undefined;
    for (const s of quarter) {
      lastResult = tracker.addSample(s);
      lastSample = s;
    }
    expect(lastResult).not.toBeNull();
    if (!lastSample) throw new Error('test setup: quarter must be non-empty');

    // Finger stops moving for a while (well beyond idleResetSec).
    const resumeSample: GestureSample = { x: 120, y: 5, t: lastSample.t + 2.0 };
    const afterGap = tracker.addSample(resumeSample);
    expect(afterGap, 'the first sample after a long idle gap must not produce a delta').toBeNull();

    // The next sample close in time should resume with an ordinary small
    // delta, not a giant jump representing the elapsed idle time.
    const resumeSample2: GestureSample = { x: 118, y: 15, t: resumeSample.t + 1 / 60 };
    const afterResume = tracker.addSample(resumeSample2);
    if (afterResume) {
      expect(Math.abs(afterResume.deltaAngleRad)).toBeLessThan(0.5);
    }
  });

  it('reset() clears history so the tracker behaves like a fresh instance', () => {
    const tracker = createCircularGestureTracker();
    const samples = generateCircleSamples({
      steps: 20,
      radius: 100,
      centerX: 0,
      centerY: 0,
      clockwise: true,
      dt: 1 / 60,
    });
    for (const s of samples) tracker.addSample(s);

    tracker.reset();
    // First sample seeds the (degenerate, single-point) centroid: no angle yet.
    expect(tracker.addSample({ x: 10, y: 0, t: 100 })).toBeNull();
    // Second sample establishes a baseline angle: still no delta yet.
    expect(tracker.addSample({ x: 10, y: 1, t: 100.05 })).toBeNull();
    // Third sample can finally produce a signed delta relative to the baseline.
    expect(tracker.addSample({ x: 11, y: 1, t: 100.1 })).not.toBeNull();
  });
});
