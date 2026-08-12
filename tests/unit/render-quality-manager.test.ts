import { describe, expect, it } from 'vitest';
import {
  createQualityManager,
  evaluateWindow,
  nextDowngradeTier,
  parseQualityOverride,
  qualityStateForTier,
  QUALITY_DOWNGRADE_THRESHOLD_MS,
  QUALITY_TIER_ORDER,
  QUALITY_WINDOW_FRAMES,
} from '../../src/core/qualityManager';
import { DPR_CAP, PARTICLE_BUDGET, PARTICLE_BUDGET_LOW } from '../../src/contracts/constants';

describe('qualityStateForTier', () => {
  it('derives dprCap/particleMax/shadows exactly from the frozen contracts constants', () => {
    expect(qualityStateForTier('high')).toEqual({ tier: 'high', dprCap: DPR_CAP.high, particleMax: PARTICLE_BUDGET, shadows: true });
    expect(qualityStateForTier('medium')).toEqual({
      tier: 'medium',
      dprCap: DPR_CAP.medium,
      particleMax: PARTICLE_BUDGET,
      shadows: false,
    });
    expect(qualityStateForTier('low')).toEqual({ tier: 'low', dprCap: DPR_CAP.low, particleMax: PARTICLE_BUDGET_LOW, shadows: false });
  });
});

describe('nextDowngradeTier', () => {
  it('walks high -> medium -> low -> null, never upward', () => {
    expect(nextDowngradeTier('high')).toBe('medium');
    expect(nextDowngradeTier('medium')).toBe('low');
    expect(nextDowngradeTier('low')).toBeNull();
  });

  it('QUALITY_TIER_ORDER is exactly [high, medium, low]', () => {
    expect(QUALITY_TIER_ORDER).toEqual(['high', 'medium', 'low']);
  });
});

describe('parseQualityOverride', () => {
  it('accepts exactly the 3 tier strings, rejects everything else', () => {
    expect(parseQualityOverride('high')).toBe('high');
    expect(parseQualityOverride('medium')).toBe('medium');
    expect(parseQualityOverride('low')).toBe('low');
    expect(parseQualityOverride('ultra')).toBeNull();
    expect(parseQualityOverride('')).toBeNull();
    expect(parseQualityOverride(null)).toBeNull();
    expect(parseQualityOverride(undefined)).toBeNull();
  });
});

describe('evaluateWindow (pure downgrade decision)', () => {
  it('stays put when the moving average is at/under the 25ms threshold', () => {
    const samples = Array<number>(QUALITY_WINDOW_FRAMES).fill(QUALITY_DOWNGRADE_THRESHOLD_MS);
    expect(evaluateWindow('high', samples)).toBe('high');
    const under = Array<number>(QUALITY_WINDOW_FRAMES).fill(10);
    expect(evaluateWindow('medium', under)).toBe('medium');
  });

  it('downgrades exactly one tier when the average exceeds 25ms', () => {
    const bad = Array<number>(QUALITY_WINDOW_FRAMES).fill(40);
    expect(evaluateWindow('high', bad)).toBe('medium');
    expect(evaluateWindow('medium', bad)).toBe('low');
  });

  it('never upgrades: already-low stays low even under a fast window', () => {
    const fast = Array<number>(QUALITY_WINDOW_FRAMES).fill(2);
    expect(evaluateWindow('low', fast)).toBe('low');
  });

  it('empty sample set is a no-op', () => {
    expect(evaluateWindow('high', [])).toBe('high');
  });
});

describe('createQualityManager (stateful wrapper)', () => {
  it('starts at the given initial tier (default high) and exposes its QualityState', () => {
    const qm = createQualityManager();
    expect(qm.state.tier).toBe('high');
    const qmLow = createQualityManager({ initialTier: 'low' });
    expect(qmLow.state.tier).toBe('low');
  });

  it('only evaluates once a FULL window has been sampled, then resets the window', () => {
    const qm = createQualityManager({ windowFrames: 4 });
    qm.sample(1000); // wildly over threshold
    qm.sample(1000);
    qm.sample(1000);
    expect(qm.state.tier).toBe('high'); // window not full yet — no evaluation
    const stateAfterFull = qm.sample(1000); // 4th sample completes the window
    expect(stateAfterFull.tier).toBe('medium');
  });

  it('downgrades exactly one tier per full bad window, requiring a fresh full window to downgrade again', () => {
    const qm = createQualityManager({ windowFrames: 2 });
    qm.sample(100);
    qm.sample(100); // window 1 complete -> medium
    expect(qm.state.tier).toBe('medium');
    qm.sample(100); // window 2, only 1 sample so far
    expect(qm.state.tier).toBe('medium');
    qm.sample(100); // window 2 complete -> low
    expect(qm.state.tier).toBe('low');
    qm.sample(100);
    qm.sample(100); // another full bad window at low — stays low (no lower tier)
    expect(qm.state.tier).toBe('low');
  });

  it('never upgrades even after a long run of fast frames following a downgrade', () => {
    const qm = createQualityManager({ windowFrames: 2, initialTier: 'medium' });
    qm.sample(2);
    qm.sample(2);
    expect(qm.state.tier).toBe('medium'); // fast frames never downgrade
    for (let i = 0; i < 20; i++) qm.sample(1);
    expect(qm.state.tier).toBe('medium'); // and never upgrade back toward high, either
  });

  it('resetWindow clears in-progress samples without changing tier', () => {
    const qm = createQualityManager({ windowFrames: 3 });
    qm.sample(1000);
    qm.sample(1000);
    qm.resetWindow();
    qm.sample(1000); // would have completed the original window; now only 1/3 of a fresh one
    expect(qm.state.tier).toBe('high');
  });
});
