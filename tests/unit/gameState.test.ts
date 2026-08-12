import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { GameState, applySnap } from '../../src/core/GameState';
import type { GameEvent } from '../../src/core/types';

describe('applySnap (CONTRACTS.md 0.97 / 0.03 snap rule)', () => {
  it('snaps values above 0.97 to 1.0', () => {
    expect(applySnap(0.971)).toBe(1);
    expect(applySnap(0.999)).toBe(1);
    expect(applySnap(1)).toBe(1);
  });

  it('snaps values below 0.03 to 0.0', () => {
    expect(applySnap(0.029)).toBe(0);
    expect(applySnap(0.001)).toBe(0);
    expect(applySnap(0)).toBe(0);
  });

  it('leaves the interior band untouched', () => {
    expect(applySnap(0.03)).toBeCloseTo(0.03);
    expect(applySnap(0.5)).toBeCloseTo(0.5);
    expect(applySnap(0.97)).toBeCloseTo(0.97);
  });

  it('clamps out-of-range input before snapping', () => {
    expect(applySnap(-5)).toBe(0);
    expect(applySnap(5)).toBe(1);
  });

  describe('direction-aware (previousP) — required for realistic per-frame ropeDrag deltas', () => {
    it('does NOT snap a small value back to 0 while climbing away from 0', () => {
      // A single per-frame ropeDrag increment is typically well under 0.03
      // (docs/STAGE_MECHANISM_ABSTRACTION.md's stroke formula). Climbing
      // *from* 0 must preserve that small positive value, not erase it.
      expect(applySnap(0.029, 0)).toBeCloseTo(0.029);
      expect(applySnap(0.01, 0)).toBeCloseTo(0.01);
    });

    it('DOES snap to 0 when falling toward 0 from above', () => {
      expect(applySnap(0.02, 0.05)).toBe(0);
      expect(applySnap(0.001, 0.03)).toBe(0);
    });

    it('does NOT snap to 1 while falling away from 1 (still above 0.97)', () => {
      expect(applySnap(0.98, 0.999)).toBeCloseTo(0.98);
    });

    it('DOES snap to 1 while climbing toward 1 from below', () => {
      expect(applySnap(0.98, 0.9)).toBe(1);
    });

    it('omitting previousP keeps the original direction-agnostic behavior', () => {
      expect(applySnap(0.029)).toBe(0);
      expect(applySnap(0.98)).toBe(1);
    });
  });
});

describe('GameState.setProgress', () => {
  it('clamps and snaps the stored progress', () => {
    const state = new GameState(new EventBus());
    state.setProgress(1.5);
    expect(state.getSnapshot().progress).toBe(1);

    state.setProgress(-1);
    expect(state.getSnapshot().progress).toBe(0);

    state.setProgress(0.5);
    expect(state.getSnapshot().progress).toBeCloseTo(0.5);
  });

  it('emits transformComplete exactly once when crossing into the 1.0 snap', () => {
    const bus = new EventBus();
    const state = new GameState(bus);
    const completed: GameEvent[] = [];
    bus.on('transformComplete', (event) => completed.push(event));

    state.setProgress(0.5);
    state.setProgress(0.98); // crosses into snap -> emits
    state.setProgress(0.99); // already at 1.0 -> no duplicate emit
    expect(completed).toHaveLength(1);
  });

  it('emits transformReset exactly once when crossing into the 0.0 snap', () => {
    const bus = new EventBus();
    const state = new GameState(bus);
    const resets: GameEvent[] = [];
    bus.on('transformReset', (event) => resets.push(event));

    state.setProgress(0.5);
    state.setProgress(0.02); // crosses into snap -> emits
    state.setProgress(0.01); // already at 0.0 -> no duplicate emit
    expect(resets).toHaveLength(1);
  });

  it('emits transformProgress with the current pair and velocity every call', () => {
    const bus = new EventBus();
    const state = new GameState(bus);
    state.setPair({ from: 'forest', to: 'rustic' });
    const events: Array<{ p: number; velocity: number }> = [];
    bus.on('transformProgress', (event) => events.push({ p: event.p, velocity: event.velocity }));

    state.setProgress(0.4, 0.8);
    expect(events).toEqual([{ p: 0.4, velocity: 0.8 }]);
  });

  it('regression: many small forward ropeDrag-sized increments from 0 accumulate past SNAP_LOW (F1)', () => {
    // Reproduces a real Wave 3 integration bug: a direction-agnostic snap
    // rule reset every sub-0.03 raw value to exactly 0, so `current +
    // deltaProgress` starting from 0 with realistic per-frame deltas
    // (~0.029 each, per the MASTER_SPEC stroke formula) could never climb
    // past 0 at all — the rope was permanently stuck.
    const state = new GameState(new EventBus());
    const perFrameDelta = 0.029; // just under SNAP_LOW (0.03)
    for (let i = 0; i < 6; i++) {
      state.setProgress(state.getSnapshot().progress + perFrameDelta);
    }
    expect(state.getSnapshot().progress).toBeGreaterThan(0.03);
    expect(state.getSnapshot().progress).toBeCloseTo(6 * perFrameDelta);
  });

  it('regression: dragging back down to near 0 still snaps cleanly to exactly 0 (F3)', () => {
    const state = new GameState(new EventBus());
    state.setProgress(0.5);
    state.setProgress(0.2);
    state.setProgress(0.02); // falling toward 0, below SNAP_LOW -> snaps
    expect(state.getSnapshot().progress).toBe(0);
  });

  it('does not change p unless setProgress is called (no autoplay, CONTRACTS invariant #2)', () => {
    const state = new GameState(new EventBus());
    state.setProgress(0.4);
    const before = state.getSnapshot().progress;
    // Unrelated mutations must not perturb progress.
    state.setPhase('pull1');
    state.setQuality('low');
    expect(state.getSnapshot().progress).toBe(before);
  });
});

describe('GameState.setPhase', () => {
  it('emits phaseChanged with from/to and no-ops on a redundant set', () => {
    const bus = new EventBus();
    const state = new GameState(bus);
    const events: GameEvent[] = [];
    bus.on('phaseChanged', (event) => events.push(event));

    state.setPhase('title');
    state.setPhase('title'); // same phase -> no event
    state.setPhase('establish');

    expect(events).toEqual([
      { type: 'phaseChanged', from: 'boot', to: 'title' },
      { type: 'phaseChanged', from: 'title', to: 'establish' }
    ]);
  });
});
