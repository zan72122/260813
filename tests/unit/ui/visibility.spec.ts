import { describe, expect, it } from 'vitest';

import { GAME_STATE_IDS } from '../../../src/contracts/states.ts';
import { controlsForState } from '../../../src/ui/visibility.ts';

describe('controlsForState', () => {
  it('covers every GameStateId with no throw', () => {
    for (const state of GAME_STATE_IDS) {
      expect(() => controlsForState(state)).not.toThrow();
    }
  });

  it('shows only the master lever verb control in machineRoom', () => {
    const vis = controlsForState('machineRoom');
    expect(vis.masterLever).toBe(true);
    expect(vis.throttleUp).toBe(false);
    expect(vis.throttleDown).toBe(false);
    expect(vis.levelWheel).toBe(false);
    expect(vis.replayMenu).toBe(false);
    expect(vis.tapStart).toBe(false);
    expect(vis.ghostHandEligible).toBe(true);
  });

  it('shows only the up-throttle in ascendLower and ascendUpper', () => {
    for (const state of ['ascendLower', 'ascendUpper'] as const) {
      const vis = controlsForState(state);
      expect(vis.throttleUp).toBe(true);
      expect(vis.throttleDown).toBe(false);
      expect(vis.masterLever).toBe(false);
      expect(vis.levelWheel).toBe(false);
      expect(vis.ghostHandEligible).toBe(true);
    }
  });

  it('shows only the down-throttle in descend, and is not ghost-hand eligible', () => {
    const vis = controlsForState('descend');
    expect(vis.throttleDown).toBe(true);
    expect(vis.throttleUp).toBe(false);
    expect(vis.ghostHandEligible).toBe(false);
  });

  it('shows only the level wheel in transition', () => {
    const vis = controlsForState('transition');
    expect(vis.levelWheel).toBe(true);
    expect(vis.masterLever).toBe(false);
    expect(vis.throttleUp).toBe(false);
    expect(vis.ghostHandEligible).toBe(true);
  });

  it('shows only the whole-screen tap target in attract', () => {
    const vis = controlsForState('attract');
    expect(vis.tapStart).toBe(true);
    expect(vis.masterLever).toBe(false);
    expect(vis.replayMenu).toBe(false);
  });

  it('shows only the four replay tiles in replayMenu', () => {
    const vis = controlsForState('replayMenu');
    expect(vis.replayMenu).toBe(true);
    expect(vis.tapStart).toBe(false);
    expect(vis.masterLever).toBe(false);
  });

  it('hides every verb control during boot', () => {
    const vis = controlsForState('boot');
    expect(vis.masterLever).toBe(false);
    expect(vis.throttleUp).toBe(false);
    expect(vis.throttleDown).toBe(false);
    expect(vis.levelWheel).toBe(false);
    expect(vis.tapStart).toBe(false);
    expect(vis.replayMenu).toBe(false);
    expect(vis.pauseButton).toBe(false);
    expect(vis.soundToggle).toBe(false);
  });

  it('keeps only the pause button (not sound) visible while paused, so resume is always reachable', () => {
    const vis = controlsForState('pause');
    expect(vis.pauseButton).toBe(true);
  });

  it('never shows two conflicting verb controls at once for any state', () => {
    for (const state of GAME_STATE_IDS) {
      const vis = controlsForState(state);
      const verbFlags = [vis.masterLever, vis.throttleUp, vis.throttleDown, vis.levelWheel];
      const activeCount = verbFlags.filter(Boolean).length;
      expect(activeCount).toBeLessThanOrEqual(1);
    }
  });
});
