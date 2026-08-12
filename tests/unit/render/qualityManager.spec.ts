import { describe, expect, it } from 'vitest';

import {
  DOWNGRADE_STREAK_FRAMES,
  OVER_BUDGET_FRAME_MS,
  QualityManager,
  UPGRADE_HYSTERESIS_MS,
} from '../../../src/core/qualityManager.ts';

const UNDER_BUDGET_MS = OVER_BUDGET_FRAME_MS / 2;
const OVER_BUDGET_MS = OVER_BUDGET_FRAME_MS * 2;

describe('QualityManager tier transitions (PERFORMANCE_BUDGET)', () => {
  it('starts at the requested initial tier', () => {
    const manager = new QualityManager({}, 'high');
    expect(manager.tier).toBe('high');
  });

  it('stays on tier under sustained good frame times', () => {
    const manager = new QualityManager();
    for (let i = 0; i < 1000; i += 1) {
      manager.reportFrame(UNDER_BUDGET_MS);
    }
    expect(manager.tier).toBe('high');
  });

  it('downgrades exactly after DOWNGRADE_STREAK_FRAMES consecutive over-budget frames', () => {
    const manager = new QualityManager();
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES - 1; i += 1) {
      manager.reportFrame(OVER_BUDGET_MS);
    }
    expect(manager.tier).toBe('high');
    manager.reportFrame(OVER_BUDGET_MS);
    expect(manager.tier).toBe('medium');
  });

  it('a single good frame resets the over-budget streak (no premature downgrade)', () => {
    const manager = new QualityManager();
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES - 1; i += 1) {
      manager.reportFrame(OVER_BUDGET_MS);
    }
    manager.reportFrame(UNDER_BUDGET_MS); // resets the streak
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES - 1; i += 1) {
      manager.reportFrame(OVER_BUDGET_MS);
    }
    expect(manager.tier).toBe('high'); // streak never reached the threshold uninterrupted
  });

  it('downgrades all the way to low under sustained pressure', () => {
    const manager = new QualityManager();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let i = 0; i < DOWNGRADE_STREAK_FRAMES; i += 1) {
        manager.reportFrame(OVER_BUDGET_MS);
      }
    }
    expect(manager.tier).toBe('low');
  });

  it('never downgrades past low', () => {
    const manager = new QualityManager();
    for (let cycle = 0; cycle < 6; cycle += 1) {
      for (let i = 0; i < DOWNGRADE_STREAK_FRAMES; i += 1) {
        manager.reportFrame(OVER_BUDGET_MS);
      }
    }
    expect(manager.tier).toBe('low');
  });

  it('upgrades after UPGRADE_HYSTERESIS_MS of sustained good frames, not sooner', () => {
    const manager = new QualityManager();
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES; i += 1) manager.reportFrame(OVER_BUDGET_MS);
    expect(manager.tier).toBe('medium');

    const frameMs = 15;
    const framesForHysteresis = Math.ceil(UPGRADE_HYSTERESIS_MS / frameMs);
    for (let i = 0; i < framesForHysteresis - 2; i += 1) {
      manager.reportFrame(frameMs);
    }
    expect(manager.tier).toBe('medium'); // not yet accumulated enough good time

    manager.reportFrame(frameMs);
    manager.reportFrame(frameMs);
    expect(manager.tier).toBe('high');
  });

  it('never upgrades past the tier the manager started at', () => {
    const manager = new QualityManager({}, 'high');
    for (let i = 0; i < 10_000; i += 1) manager.reportFrame(1);
    expect(manager.tier).toBe('high');
  });

  it('fires onTierChange exactly once per actual transition', () => {
    const seen: string[] = [];
    const manager = new QualityManager({ onTierChange: (tier) => seen.push(tier) });
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES; i += 1) manager.reportFrame(OVER_BUDGET_MS);
    for (let i = 0; i < DOWNGRADE_STREAK_FRAMES; i += 1) manager.reportFrame(OVER_BUDGET_MS);
    expect(seen).toEqual(['medium', 'low']);
  });

  it('exposes tier-appropriate settings (low tier has no shadows, DPR capped lower)', () => {
    const manager = new QualityManager({}, 'low');
    expect(manager.settings.shadowsEnabled).toBe(false);
    expect(manager.settings.particleBudget).toBe(0);
    const high = new QualityManager({}, 'high');
    expect(high.settings.dpr).toBeGreaterThanOrEqual(manager.settings.dpr);
  });
});
