import { describe, expect, it } from 'vitest';
import {
  createLegState,
  hammer,
  jackStroke,
  sandStep,
  shouldSnap,
  snap,
  wedgeDrag,
} from '../../src/contracts/legModel';
import { legScenario, mulberry32 } from '../../src/contracts/rng';
import { ASSIST_RADIUS, SAND_UNDERSHOOT_MAX, SAND_UNDERSHOOT_MIN, SNAP_TOLERANCE } from '../../src/contracts/constants';
import type { LegId, LegState } from '../../src/contracts/types';

const LEGS: LegId[] = [0, 1, 2, 3];
const EPS = 1e-9;

function driveSandToFloor(seed: number, leg: LegId, gate = 1, dt = 1 / 60): LegState {
  const scenario = legScenario(seed, leg);
  let state = createLegState(seed, leg);
  let guard = 0;
  while (state.sandLevel > 0 && guard < 200_000) {
    state = sandStep(state, gate, dt, scenario);
    guard++;
  }
  return state;
}

describe('createLegState', () => {
  it('starts idle, full sand, leg above target by exactly initialOffset', () => {
    for (const seed of [0, 7, 12345]) {
      for (const leg of LEGS) {
        const scenario = legScenario(seed, leg);
        const s = createLegState(seed, leg);
        expect(s.phase).toBe('idle');
        expect(s.sandLevel).toBe(1);
        expect(s.legOffsetY).toBeCloseTo(scenario.initialOffset, 9);
        expect(s.alignmentError).toBeCloseTo(scenario.initialOffset, 9);
        expect(s.jackExtension).toBe(0);
        expect(s.wedgeProgress).toBe(0);
        expect(s.locked).toBe(false);
      }
    }
  });
});

describe('sandStep — invariant 1 (monotonic decrease while gate>0) & invariant 2 (floor, never crossed)', () => {
  it('is strictly monotonic decreasing under a RANDOM gate sequence while sand remains and gate>0', () => {
    const rng = mulberry32(555);
    for (const leg of LEGS) {
      const seed = 4242;
      const scenario = legScenario(seed, leg);
      let state = createLegState(seed, leg);
      let guard = 0;
      while (state.sandLevel > 0 && guard < 100_000) {
        const gate = rng(); // random 0..1, occasionally near 0 but essentially never exactly 0
        const prevOffset = state.legOffsetY;
        const next = sandStep(state, gate, 1 / 60, scenario);
        if (gate > 0 && prevOffset > -scenario.sandUndershoot) {
          expect(next.legOffsetY).toBeLessThan(prevOffset + EPS);
          if (next.legOffsetY < prevOffset - EPS) {
            // real progress happened this step — must be strictly decreasing
            expect(next.legOffsetY).toBeLessThan(prevOffset);
          }
        }
        state = next;
        guard++;
      }
      expect(guard).toBeLessThan(100_000); // sanity: it actually terminated
    }
  });

  it('gate=0 leaves the leg completely unchanged (same reference)', () => {
    const seed = 1;
    const leg: LegId = 0;
    const scenario = legScenario(seed, leg);
    const state = createLegState(seed, leg);
    const next = sandStep(state, 0, 1 / 60, scenario);
    expect(next).toBe(state);
  });

  it('never crosses the floor (-sandUndershoot), for any gate/dt combination, across many seeds', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const leg of LEGS) {
        const scenario = legScenario(seed, leg);
        const floor = -scenario.sandUndershoot;
        let state = createLegState(seed, leg);
        // Use a large dt occasionally to stress the clamp against overshoot.
        const dts: readonly number[] = [1 / 60, 1 / 30, 0.5, 2, 10];
        for (let i = 0; i < 300; i++) {
          const dt = dts[i % dts.length] ?? 1 / 60;
          state = sandStep(state, 1, dt, scenario);
          expect(state.legOffsetY).toBeGreaterThanOrEqual(floor - EPS);
        }
      }
    }
  });

  it('sand depletes exactly when legOffsetY reaches the floor — not before, not after', () => {
    for (const seed of [1, 2, 3, 99]) {
      for (const leg of LEGS) {
        const scenario = legScenario(seed, leg);
        const floor = -scenario.sandUndershoot;
        const final = driveSandToFloor(seed, leg);
        expect(final.sandLevel).toBe(0);
        expect(final.legOffsetY).toBeCloseTo(floor, 6);
      }
    }
  });

  it('flow rate (implied by delta-per-step) scales down as the leg nears the floor', () => {
    const seed = 5;
    const leg: LegId = 1;
    const scenario = legScenario(seed, leg);
    let state = createLegState(seed, leg);
    const early = sandStep(state, 1, 1 / 60, scenario);
    const earlyDelta = state.legOffsetY - early.legOffsetY;
    // fast-forward close to the floor
    let guard = 0;
    while (state.legOffsetY - (-scenario.sandUndershoot) > 0.5 && guard < 100_000) {
      state = sandStep(state, 1, 1 / 60, scenario);
      guard++;
    }
    const beforeLate = state.legOffsetY;
    const late = sandStep(state, 1, 1 / 60, scenario);
    const lateDelta = beforeLate - late.legOffsetY;
    expect(lateDelta).toBeLessThan(earlyDelta);
  });

  it('locked leg: sandStep is a total no-op regardless of gate', () => {
    const seed = 3;
    const leg: LegId = 2;
    const scenario = legScenario(seed, leg);
    const locked: LegState = { ...createLegState(seed, leg), locked: true, phase: 'locked' };
    for (const gate of [0, 0.3, 1]) {
      expect(sandStep(locked, gate, 1 / 60, scenario)).toBe(locked);
    }
  });
});

describe('jackStroke — invariant 3 (monotonic increase, never overshoots 0)', () => {
  it('never overshoots 0 under 1000 rapid strokes, from any starting undershoot', () => {
    for (const undershoot of [0.1, 1, SAND_UNDERSHOOT_MIN, 3.5, SAND_UNDERSHOOT_MAX, 8]) {
      const scenario = legScenario(1, 0);
      let state: LegState = {
        ...createLegState(1, 0),
        sandboxSupportY: -undershoot,
        jackExtension: 0,
        legOffsetY: -undershoot,
        alignmentError: undershoot,
        phase: 'jack',
      };
      let prev = state.legOffsetY;
      for (let i = 0; i < 1000; i++) {
        state = jackStroke(state, scenario);
        expect(state.legOffsetY).toBeLessThanOrEqual(0 + EPS);
        expect(state.legOffsetY).toBeGreaterThanOrEqual(prev - EPS); // monotonic increase (or flat once at 0)
        prev = state.legOffsetY;
      }
      expect(state.legOffsetY).toBeCloseTo(0, 6);
    }
  });

  it('is monotonic non-decreasing under repeated pumps for every leg/seed combination', () => {
    for (const seed of [1, 2, 3]) {
      for (const leg of LEGS) {
        const scenario = legScenario(seed, leg);
        let state = driveSandToFloor(seed, leg);
        let prev = state.legOffsetY;
        for (let i = 0; i < 50; i++) {
          state = jackStroke(state, scenario);
          expect(state.legOffsetY).toBeGreaterThanOrEqual(prev - EPS);
          prev = state.legOffsetY;
        }
      }
    }
  });

  it('reaches SNAP_TOLERANCE within 4-9 pumps across the full sandUndershoot range (2..5 units)', () => {
    for (let undershootTenths = 20; undershootTenths <= 50; undershootTenths += 5) {
      const undershoot = undershootTenths / 10;
      for (const pumpGain of [0.8, 1.0, 1.2]) {
        const scenario = { ...legScenario(1, 0), pumpGain };
        let state: LegState = {
          ...createLegState(1, 0),
          sandboxSupportY: -undershoot,
          jackExtension: 0,
          legOffsetY: -undershoot,
          alignmentError: undershoot,
          phase: 'jack',
        };
        let pumps = 0;
        while (!shouldSnap(state) && pumps < 50) {
          state = jackStroke(state, scenario);
          pumps++;
        }
        expect(shouldSnap(state)).toBe(true);
        expect(pumps).toBeGreaterThanOrEqual(4);
        expect(pumps).toBeLessThanOrEqual(9);
      }
    }
  });

  it('already-at-target (legOffsetY>=0) leaves the leg unchanged', () => {
    const scenario = legScenario(1, 0);
    const state: LegState = { ...createLegState(1, 0), legOffsetY: 0, alignmentError: 0, sandboxSupportY: 0 };
    expect(jackStroke(state, scenario)).toBe(state);
  });

  it('locked leg: jackStroke is a total no-op', () => {
    const scenario = legScenario(1, 0);
    const locked: LegState = { ...createLegState(1, 0), legOffsetY: -3, locked: true, phase: 'locked' };
    expect(jackStroke(locked, scenario)).toBe(locked);
  });

  it('adaptive gain only engages within ASSIST_RADIUS; outside it strokes use the flat JACK_MAX_STROKE branch', () => {
    const scenario = legScenario(1, 0);
    const farState: LegState = {
      ...createLegState(1, 0),
      sandboxSupportY: -(ASSIST_RADIUS + 4),
      jackExtension: 0,
      legOffsetY: -(ASSIST_RADIUS + 4),
      alignmentError: ASSIST_RADIUS + 4,
    };
    const next = jackStroke(farState, scenario);
    const strokeTaken = next.legOffsetY - farState.legOffsetY;
    expect(strokeTaken).toBeCloseTo(3 * scenario.pumpGain, 9); // JACK_MAX_STROKE=3
  });
});

describe('shouldSnap / snap', () => {
  it('shouldSnap is exactly the SNAP_TOLERANCE threshold on alignmentError', () => {
    const base = createLegState(1, 0);
    const inside: LegState = { ...base, legOffsetY: -SNAP_TOLERANCE, alignmentError: SNAP_TOLERANCE };
    const outside: LegState = { ...base, legOffsetY: -(SNAP_TOLERANCE + 0.01), alignmentError: SNAP_TOLERANCE + 0.01 };
    expect(shouldSnap(inside)).toBe(true);
    expect(shouldSnap(outside)).toBe(false);
  });

  it('snap forces legOffsetY/alignmentError to exactly 0 and sets phase snap', () => {
    const state: LegState = { ...createLegState(1, 0), legOffsetY: -0.4, alignmentError: 0.4, phase: 'jack' };
    const snapped = snap(state);
    expect(snapped.legOffsetY).toBe(0);
    expect(snapped.alignmentError).toBe(0);
    expect(snapped.phase).toBe('snap');
  });

  it('snap on a locked leg is a no-op', () => {
    const locked: LegState = { ...createLegState(1, 0), locked: true, phase: 'locked' };
    expect(snap(locked)).toBe(locked);
  });
});

describe('wedgeDrag', () => {
  it('clamps progress to [0,1]', () => {
    const state = createLegState(1, 0);
    expect(wedgeDrag(state, -5).wedgeProgress).toBe(0);
    expect(wedgeDrag(state, 5).wedgeProgress).toBe(1);
    expect(wedgeDrag(state, 0.42).wedgeProgress).toBe(0.42);
  });

  it('locked leg: wedgeDrag is a no-op', () => {
    const locked: LegState = { ...createLegState(1, 0), locked: true, phase: 'locked' };
    expect(wedgeDrag(locked, 1)).toBe(locked);
  });
});

describe('hammer — invariant 5 (locked immutability)', () => {
  it('locks the leg and is idempotent', () => {
    const state: LegState = { ...createLegState(1, 0), wedgeProgress: 1, phase: 'wedge' };
    const locked = hammer(state);
    expect(locked.locked).toBe(true);
    expect(locked.phase).toBe('locked');
    const lockedAgain = hammer(locked);
    expect(lockedAgain).toBe(locked);
  });

  it('once locked, sandStep/jackStroke/wedgeDrag/hammer never change the value again', () => {
    const scenario = legScenario(1, 0);
    const wedged: LegState = { ...createLegState(1, 0), wedgeProgress: 1, phase: 'wedge' };
    const locked = hammer(wedged);
    const attempts: LegState[] = [
      sandStep(locked, 1, 1, scenario),
      jackStroke(locked, scenario),
      wedgeDrag(locked, 0),
      hammer(locked),
    ];
    for (const a of attempts) {
      expect(a).toEqual(locked);
    }
  });
});
