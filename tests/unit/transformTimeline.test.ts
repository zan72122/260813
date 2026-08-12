import { describe, expect, it } from 'vitest';
import {
  TRANSFORM_TIMELINE,
  clamp01,
  deriveTransformState,
  dragDeltaToProgressDelta,
  localProgress,
  smoothstep
} from '../../src/core/TransformTimeline';

describe('clamp01', () => {
  it('clamps below 0 to 0', () => {
    expect(clamp01(-0.5)).toBe(0);
  });

  it('clamps above 1 to 1', () => {
    expect(clamp01(1.5)).toBe(1);
  });

  it('passes through in-range values', () => {
    expect(clamp01(0.42)).toBeCloseTo(0.42);
  });

  it('treats NaN as 0', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('smoothstep', () => {
  it('is 0 at/below edge0 and 1 at/above edge1', () => {
    expect(smoothstep(0.35, 0.9, 0)).toBe(0);
    expect(smoothstep(0.35, 0.9, 0.35)).toBe(0);
    expect(smoothstep(0.35, 0.9, 0.9)).toBe(1);
    expect(smoothstep(0.35, 0.9, 1)).toBe(1);
  });

  it('is monotonically non-decreasing across the range', () => {
    let previous = -Infinity;
    for (let x = 0; x <= 1; x += 0.05) {
      const value = smoothstep(0.35, 0.9, x);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('localProgress', () => {
  it('maps global p linearly within a range', () => {
    const range = { start: 0.2, end: 0.6 };
    expect(localProgress(0.2, range)).toBe(0);
    expect(localProgress(0.4, range)).toBeCloseTo(0.5);
    expect(localProgress(0.6, range)).toBe(1);
  });

  it('clamps outside the range', () => {
    const range = { start: 0.2, end: 0.6 };
    expect(localProgress(0, range)).toBe(0);
    expect(localProgress(1, range)).toBe(1);
  });
});

describe('deriveTransformState — determinism (CONTRACTS invariant #1)', () => {
  it('produces identical output for the same p, called twice', () => {
    const a = deriveTransformState(0.42);
    const b = deriveTransformState(0.42);
    expect(a).toEqual(b);
  });

  it('is deterministic across the whole [0,1] domain', () => {
    for (let p = 0; p <= 1; p += 0.037) {
      expect(deriveTransformState(p)).toEqual(deriveTransformState(p));
    }
  });

  it('clamps out-of-range p before deriving', () => {
    expect(deriveTransformState(-1).p).toBe(0);
    expect(deriveTransformState(2).p).toBe(1);
  });

  it('rope/pulley/drum are pure functions of p only', () => {
    const state = deriveTransformState(0.5);
    expect(state.ropeOffset).toBeCloseTo(0.5 * TRANSFORM_TIMELINE.ROPE_TOTAL_TRAVEL);
    expect(state.pulleyAngle).toBeCloseTo(state.ropeOffset / TRANSFORM_TIMELINE.PULLEY_RADIUS);
    expect(state.drumAngle).toBeCloseTo(state.ropeOffset / TRANSFORM_TIMELINE.DRUM_RADIUS);
  });

  it('at p=0.5 old and new wing pairs are simultaneously visible (CONTRACTS invariant #3)', () => {
    const state = deriveTransformState(0.5);
    const oldVisible = state.oldWingPairs.some((pair) => pair.localProgress > 0 && pair.localProgress < 1);
    const newVisible = state.newWingPairs.some((pair) => pair.localProgress > 0 && pair.localProgress < 1);
    expect(oldVisible).toBe(true);
    expect(newVisible).toBe(true);
  });

  it('at p=0 every element is fully at its start state', () => {
    const state = deriveTransformState(0);
    expect(state.chariotOldProgress).toBe(0);
    expect(state.backdropProgress).toBe(0);
    expect(state.lightingBlend).toBe(0);
    for (const pair of state.oldWingPairs) expect(pair.localProgress).toBe(0);
  });

  it('at p=1 every element is fully at its end state (F7: scene-end snap to definite positions)', () => {
    const state = deriveTransformState(1);
    expect(state.chariotOldProgress).toBe(1);
    expect(state.chariotNewProgress).toBe(1);
    expect(state.backdropProgress).toBe(1);
    expect(state.foregroundOldProgress).toBe(1);
    expect(state.foregroundNewProgress).toBe(1);
    expect(state.lightingBlend).toBe(1);
    for (const pair of state.oldWingPairs) expect(pair.localProgress).toBe(1);
    for (const pair of state.newWingPairs) expect(pair.localProgress).toBe(1);
  });

  it('wing pairs animate far-to-near for old (retreat) and near-to-far entry order for new', () => {
    // Far pair (index 0) must finish retreating before the nearest pair (index 2) starts,
    // matching STAGE_MECHANISM_ABSTRACTION.md's "奥の対から順に退場".
    expect(TRANSFORM_TIMELINE.OLD_WING_PAIRS[0]!.end).toBeLessThanOrEqual(TRANSFORM_TIMELINE.OLD_WING_PAIRS[2]!.end);
    expect(TRANSFORM_TIMELINE.NEW_WING_PAIRS[0]!.start).toBeLessThanOrEqual(TRANSFORM_TIMELINE.NEW_WING_PAIRS[2]!.start);
  });

  it('assigns increasing z-offsets per wing pair index to avoid z-fighting', () => {
    const state = deriveTransformState(0.5);
    expect(state.oldWingPairs[1]!.zOffset).toBeGreaterThan(state.oldWingPairs[0]!.zOffset);
    expect(state.oldWingPairs[2]!.zOffset).toBeGreaterThan(state.oldWingPairs[1]!.zOffset);
  });
});

describe('dragDeltaToProgressDelta', () => {
  it('a full-height stroke at STROKE_HEIGHT_FRACTION yields STROKE_PROGRESS_DELTA', () => {
    const viewportHeight = 800;
    const dy = viewportHeight * TRANSFORM_TIMELINE.STROKE_HEIGHT_FRACTION;
    expect(dragDeltaToProgressDelta(dy, viewportHeight)).toBeCloseTo(TRANSFORM_TIMELINE.STROKE_PROGRESS_DELTA);
  });

  it('upward drag (negative dy) yields negative progress delta', () => {
    expect(dragDeltaToProgressDelta(-100, 800)).toBeLessThan(0);
  });

  it('returns 0 for a non-positive viewport height', () => {
    expect(dragDeltaToProgressDelta(100, 0)).toBe(0);
  });
});
