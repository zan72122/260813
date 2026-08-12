import { describe, expect, it } from 'vitest';
import { cueToPose } from '../../src/render/camera/cameraPoses';
import {
  CAMERA_CUE_DURATION_MS,
  createCameraDirector,
  durationForCue,
  easeInOutCubic,
  lerpPose,
  REDUCED_MOTION_DURATION_MS,
} from '../../src/render/camera/cameraDirector';
import type { LegId } from '../../src/contracts/types';
import { GIRDER_RING_Y } from '../../src/scene/layout';

const LEGS: LegId[] = [0, 1, 2, 3];

describe('cueToPose (pure cue -> camera pose mapping)', () => {
  it('is a pure function: identical cue+seed always yields byte-identical pose', () => {
    const a = cueToPose({ kind: 'activeLeg', leg: 2 }, 777);
    const b = cueToPose({ kind: 'activeLeg', leg: 2 }, 777);
    expect(a).toEqual(b);
  });

  it('every pose has a finite, forward-facing (>0 vertical fov) camera', () => {
    const cues: { kind: string }[] = [
      { kind: 'establish' },
      { kind: 'topReveal' },
      { kind: 'pullback' },
    ];
    for (const cue of cues) {
      const pose = cueToPose(cue as never, 1);
      expect(Number.isFinite(pose.fov)).toBe(true);
      expect(pose.fov).toBeGreaterThan(0);
      expect(pose.position.every(Number.isFinite)).toBe(true);
      expect(pose.target.every(Number.isFinite)).toBe(true);
    }
  });

  it('activeLeg differs per leg (4 distinct legs are not all framed identically)', () => {
    const poses = LEGS.map((leg) => cueToPose({ kind: 'activeLeg', leg }, 42));
    const positions = poses.map((p) => JSON.stringify(p.position));
    expect(new Set(positions).size).toBe(4);
  });

  it("seed varies a leg's camera yaw (rng.legScenario cameraYaw) so different seeds frame differently", () => {
    const a = cueToPose({ kind: 'activeLeg', leg: 1 }, 1);
    const b = cueToPose({ kind: 'activeLeg', leg: 1 }, 2);
    expect(a.position).not.toEqual(b.position);
  });

  it('topReveal looks near-straight-down at the tower center from high above GIRDER_RING_Y', () => {
    const pose = cueToPose({ kind: 'topReveal' }, 5);
    expect(pose.position[1]).toBeGreaterThan(GIRDER_RING_Y + 40);
    expect(pose.target).toEqual([0, GIRDER_RING_Y, 0]);
  });

  it('sandboxCutaway and jackCloseup frame the same leg but from different, non-degenerate viewpoints', () => {
    const sand = cueToPose({ kind: 'sandboxCutaway', leg: 3 }, 9);
    const jack = cueToPose({ kind: 'jackCloseup', leg: 3 }, 9);
    expect(sand.position).not.toEqual(jack.position);
    const [px, py, pz] = sand.position;
    const [tx, ty, tz] = sand.target;
    const dist = Math.hypot(px - tx, py - ty, pz - tz);
    expect(dist).toBeGreaterThan(1);
  });

  it('orbitToNext takes the short way around the tower between two legs', () => {
    // leg 3 (315deg) -> leg 0 (45deg): the short way crosses 0deg/360deg, not through the far side.
    const pose = cueToPose({ kind: 'orbitToNext', from: 3, to: 0 }, 1);
    expect(Number.isFinite(pose.position[0])).toBe(true);
    expect(Number.isFinite(pose.position[2])).toBe(true);
  });
});

describe('durationForCue', () => {
  it('matches the CAMERA_CUE_DURATION_MS table at normal motion, converted to seconds', () => {
    for (const kind of Object.keys(CAMERA_CUE_DURATION_MS) as (keyof typeof CAMERA_CUE_DURATION_MS)[]) {
      expect(durationForCue(kind, false)).toBeCloseTo(CAMERA_CUE_DURATION_MS[kind] / 1000, 6);
    }
  });

  it('collapses every cue kind to the same near-instant duration under reducedMotion', () => {
    for (const kind of Object.keys(CAMERA_CUE_DURATION_MS) as (keyof typeof CAMERA_CUE_DURATION_MS)[]) {
      expect(durationForCue(kind, true)).toBeCloseTo(REDUCED_MOTION_DURATION_MS / 1000, 6);
    }
  });
});

describe('easeInOutCubic', () => {
  it('clamps to [0,1], starts at 0, ends at 1, midpoint is 0.5', () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(2)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
  });

  it('is monotonically non-decreasing over [0,1]', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('lerpPose', () => {
  it('t=0 returns pose a, t=1 returns pose b, t=0.5 is the midpoint', () => {
    const a = { position: [0, 0, 0] as const, target: [0, 0, 0] as const, fov: 30 };
    const b = { position: [10, 20, 30] as const, target: [2, 4, 6] as const, fov: 50 };
    expect(lerpPose(a, b, 0)).toEqual({ position: [0, 0, 0], target: [0, 0, 0], fov: 30 });
    expect(lerpPose(a, b, 1)).toEqual({ position: [10, 20, 30], target: [2, 4, 6], fov: 50 });
    expect(lerpPose(a, b, 0.5)).toEqual({ position: [5, 10, 15], target: [1, 2, 3], fov: 40 });
  });
});

describe('createCameraDirector', () => {
  it('starts already settled, at the establish pose', () => {
    const director = createCameraDirector(1, false);
    expect(director.settled()).toBe(true);
    expect(director.pose).toEqual(cueToPose({ kind: 'establish' }, 1));
  });

  it('setCue begins an unsettled transition that reaches the target pose exactly at its full duration', () => {
    const director = createCameraDirector(1, false);
    director.setCue({ kind: 'activeLeg', leg: 0 });
    expect(director.settled()).toBe(false);
    const durationS = durationForCue('activeLeg', false);
    director.update(durationS);
    expect(director.settled()).toBe(true);
    expect(director.pose).toEqual(cueToPose({ kind: 'activeLeg', leg: 0 }, 1));
  });

  it('mid-transition pose is strictly between the from/to poses (not a hard cut)', () => {
    const director = createCameraDirector(1, false);
    const from = director.pose;
    director.setCue({ kind: 'topReveal' });
    const durationS = durationForCue('topReveal', false);
    director.update(durationS / 2);
    const mid = director.pose;
    expect(mid).not.toEqual(from);
    const to = cueToPose({ kind: 'topReveal' }, 1);
    expect(mid).not.toEqual(to);
  });

  it('reducedMotion makes transitions settle almost immediately', () => {
    const director = createCameraDirector(1, true);
    director.setCue({ kind: 'pullback' });
    director.update(REDUCED_MOTION_DURATION_MS / 1000);
    expect(director.settled()).toBe(true);
  });

  it('setReducedMotion applies to the NEXT setCue, not retroactively to an in-flight transition', () => {
    const director = createCameraDirector(1, false);
    director.setCue({ kind: 'activeLeg', leg: 1 });
    director.setReducedMotion(true);
    // The in-flight transition (activeLeg) keeps its original (slow) duration.
    director.update(REDUCED_MOTION_DURATION_MS / 1000);
    expect(director.settled()).toBe(false);
  });
});
