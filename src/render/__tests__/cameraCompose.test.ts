import { describe, expect, it } from 'vitest';
import {
  aspectClassFor,
  shotFor,
  easeProgress,
  transitionDurationMs,
  BASE_TRANSITION_MS,
  TEST_TIME_SCALE,
  REDUCED_MOTION_TRANSITION_MS,
  CAMERA_COMPOSITIONS,
} from '../cameraCompose';
import type { CameraCueName } from '../../contracts/types';

const ALL_CUES: CameraCueName[] = [
  'establish',
  'approach',
  'hoist',
  'align',
  'rivetMacro',
  'climb',
  'reveal',
  'complete',
];

describe('aspectClassFor', () => {
  it('classifies wide viewports as landscape', () => {
    expect(aspectClassFor(844, 390)).toBe('landscape');
  });
  it('classifies tall viewports as portrait', () => {
    expect(aspectClassFor(390, 844)).toBe('portrait');
  });
  it('classifies a square viewport as landscape (width >= height)', () => {
    expect(aspectClassFor(800, 800)).toBe('landscape');
  });
});

describe('CAMERA_COMPOSITIONS coverage', () => {
  it('defines every camera cue for both aspect classes', () => {
    for (const cue of ALL_CUES) {
      expect(CAMERA_COMPOSITIONS.portrait[cue]).toBeDefined();
      expect(CAMERA_COMPOSITIONS.landscape[cue]).toBeDefined();
    }
  });

  it('every shot has a positive distance and fov, and blend within [0,1]', () => {
    for (const aspect of ['portrait', 'landscape'] as const) {
      for (const cue of ALL_CUES) {
        const shot = CAMERA_COMPOSITIONS[aspect][cue];
        expect(shot.distance).toBeGreaterThan(0);
        expect(shot.fov).toBeGreaterThan(0);
        expect(shot.blend).toBeGreaterThanOrEqual(0);
        expect(shot.blend).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rivetMacro is the closest shot (macro close-up) in both aspects', () => {
    for (const aspect of ['portrait', 'landscape'] as const) {
      const macroDist = CAMERA_COMPOSITIONS[aspect].rivetMacro.distance;
      for (const cue of ALL_CUES) {
        if (cue === 'rivetMacro') continue;
        expect(macroDist).toBeLessThanOrEqual(CAMERA_COMPOSITIONS[aspect][cue].distance);
      }
    }
  });

  it('climb uses a low camera (small elevation angle) relative to establish/reveal — the signature low side shot', () => {
    for (const aspect of ['portrait', 'landscape'] as const) {
      expect(CAMERA_COMPOSITIONS[aspect].climb.elevation).toBeLessThan(CAMERA_COMPOSITIONS[aspect].establish.elevation);
      expect(CAMERA_COMPOSITIONS[aspect].climb.elevation).toBeLessThan(CAMERA_COMPOSITIONS[aspect].reveal.elevation);
    }
  });

  it('establish/reveal/complete are wide shots (larger distance than interactive close-ups)', () => {
    for (const aspect of ['portrait', 'landscape'] as const) {
      const wide = ['establish', 'reveal', 'complete'] as const;
      const close = ['align', 'rivetMacro'] as const;
      for (const w of wide) {
        for (const c of close) {
          expect(CAMERA_COMPOSITIONS[aspect][w].distance).toBeGreaterThan(CAMERA_COMPOSITIONS[aspect][c].distance);
        }
      }
    }
  });
});

describe('shotFor', () => {
  it('returns the portrait shot for a tall viewport', () => {
    const shot = shotFor('establish', 390, 844);
    expect(shot).toBe(CAMERA_COMPOSITIONS.portrait.establish);
  });
  it('returns the landscape shot for a wide viewport', () => {
    const shot = shotFor('establish', 844, 390);
    expect(shot).toBe(CAMERA_COMPOSITIONS.landscape.establish);
  });
});

describe('easeProgress', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeProgress(0, 1000)).toBe(0);
    expect(easeProgress(1000, 1000)).toBe(1);
  });
  it('clamps beyond the duration', () => {
    expect(easeProgress(5000, 1000)).toBe(1);
  });
  it('is monotonically increasing', () => {
    let prev = -1;
    for (let t = 0; t <= 1000; t += 50) {
      const v = easeProgress(t, 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('returns 1 immediately for a zero/negative duration', () => {
    expect(easeProgress(0, 0)).toBe(1);
  });
});

describe('transitionDurationMs', () => {
  it('uses the base duration normally', () => {
    expect(transitionDurationMs(false, false)).toBe(BASE_TRANSITION_MS);
  });
  it('scales by 0.25 under ?test=1', () => {
    expect(transitionDurationMs(true, false)).toBe(BASE_TRANSITION_MS * TEST_TIME_SCALE);
  });
  it('near-cuts under reducedMotion regardless of test mode', () => {
    expect(transitionDurationMs(false, true)).toBe(REDUCED_MOTION_TRANSITION_MS);
    expect(transitionDurationMs(true, true)).toBe(REDUCED_MOTION_TRANSITION_MS);
  });
});
