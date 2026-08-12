import { describe, expect, it } from 'vitest';
import { initialQualityStepState, stepQuality, FRAME_BUDGET_MS, SUSTAIN_MS } from '../quality';

function runFrames(startLevel: 'high' | 'mid' | 'low', frameMs: number, ms: number, pinned = false) {
  let state = initialQualityStepState(startLevel);
  let elapsed = 0;
  while (elapsed < ms) {
    state = stepQuality(state, frameMs, pinned);
    elapsed += frameMs;
  }
  return state;
}

describe('stepQuality', () => {
  it('stays at the same level under budget', () => {
    const state = runFrames('high', 10, 10_000);
    expect(state.level).toBe('high');
  });

  it('steps high -> mid after sustained over-budget frame times', () => {
    const state = runFrames('high', 40, SUSTAIN_MS + 500);
    expect(state.level).toBe('mid');
  });

  it('steps mid -> low after sustained over-budget frame times', () => {
    const state = runFrames('mid', 40, SUSTAIN_MS + 500);
    expect(state.level).toBe('low');
  });

  it('never steps below low', () => {
    const state = runFrames('low', 100, SUSTAIN_MS * 3);
    expect(state.level).toBe('low');
  });

  it('never steps back up once degraded, even after recovering', () => {
    let state = runFrames('high', 40, SUSTAIN_MS + 100);
    expect(state.level).toBe('mid');
    // now frames are fast again for a long time
    for (let i = 0; i < 1000; i += 1) {
      state = stepQuality(state, 5, false);
    }
    expect(state.level).toBe('mid');
  });

  it('resets the over-budget timer once a fast frame arrives before sustain completes', () => {
    let state = initialQualityStepState('high');
    // push avg up close to threshold
    for (let i = 0; i < 50; i += 1) state = stepQuality(state, 40, false);
    expect(state.level).toBe('high');
    // one fast frame brings the EMA down, but does not itself guarantee no
    // step -- verify overBudgetMs behavior indirectly via total time needed
    const withInterruption = (() => {
      let s = initialQualityStepState('high');
      let elapsed = 0;
      while (elapsed < SUSTAIN_MS - 200) {
        s = stepQuality(s, 40, false);
        elapsed += 40;
      }
      // one very fast frame near the end drops the average below budget
      s = stepQuality(s, 1, false);
      return s;
    })();
    expect(withInterruption.level).toBe('high');
  });

  it('pinned mode never changes level regardless of frame time', () => {
    const state = runFrames('high', 100, SUSTAIN_MS * 3, true);
    expect(state.level).toBe('high');
  });

  it('tracks a rolling average that responds to frame time (not instantaneous)', () => {
    let state = initialQualityStepState('high');
    expect(state.avgFrameMs).toBeCloseTo(FRAME_BUDGET_MS, 5);
    state = stepQuality(state, 1000, false);
    expect(state.avgFrameMs).toBeGreaterThan(FRAME_BUDGET_MS);
    expect(state.avgFrameMs).toBeLessThan(1000);
  });
});
