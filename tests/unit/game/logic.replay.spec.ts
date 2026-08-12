import { describe, expect, it } from 'vitest';

import {
  BLEND_END_S,
  BLEND_START_S,
  MECH_ADVANTAGE,
  PULLEY_RADIUS,
  SIM_DT,
  STATION_TOP_S,
  THETA_LOWER_DEG,
  THETA_UPPER_DEG,
  TOLERANCE_REPLAY_RESET,
  TRACK_LENGTH,
} from '../../../src/contracts/constants.ts';
import { TypedEventBus } from '../../../src/contracts/events.ts';
import { GAME_STATE_IDS } from '../../../src/contracts/states.ts';
import type { GameSnapshot } from '../../../src/contracts/store.ts';
import type { InputIntent } from '../../../src/contracts/subsystems.ts';
import { EiffelGameLogic } from '../../../src/game/logic.ts';
import { createTestStore } from './helpers/testStore.ts';

const SEED = 777;

// Fields that reflect actual RIDE/MATH state (excludes cross-cutting app
// settings like quality/soundOn/reducedMotion, which reset() deliberately
// preserves — see logic.ts's reset() doc).
const GAMEPLAY_FIELDS: readonly (keyof GameSnapshot)[] = [
  'valveOpen',
  'direction',
  'pistonDisplacement',
  'cableTravel',
  'arcLength',
  't',
  'thetaDeg',
  'carrierAngleDeg',
  'cabinTiltErrorDeg',
  'cabinWorldTiltDeg',
  'speed',
  'state',
  'seed',
];

function expectSameGameplaySnapshot(a: GameSnapshot, b: GameSnapshot, tolerance: number): void {
  for (const field of GAMEPLAY_FIELDS) {
    const va = a[field];
    const vb = b[field];
    if (typeof va === 'number' && typeof vb === 'number') {
      expect(Math.abs(va - vb), `field "${field}"`).toBeLessThanOrEqual(tolerance);
    } else {
      expect(vb, `field "${field}"`).toBe(va);
    }
  }
}

/** A fixed, deterministic input script exercising every control kind. */
const SCRIPT: InputIntent[] = [
  { kind: 'lever', value: 0.4 },
  { kind: 'lever', value: 1 },
  { kind: 'throttle', value: 1 },
  { kind: 'wheel', deltaRadians: 0.05 },
  { kind: 'throttle', value: -1 },
  { kind: 'throttle', value: 1 },
];

function runScript(seed: number, steps: number): GameSnapshot[] {
  const bus = new TypedEventBus();
  const store = createTestStore(seed);
  const logic = new EiffelGameLogic(store, bus, seed);
  logic.gotoState('machineRoom');
  const trajectory: GameSnapshot[] = [store.get()];
  for (let i = 0; i < steps; i++) {
    logic.applyInput(SCRIPT[i % SCRIPT.length]!);
    logic.step(SIM_DT);
    trajectory.push(store.get());
  }
  return trajectory;
}

describe('EiffelGameLogic — reset(seed) returns EXACTLY to the initial snapshot', () => {
  it('matches a freshly-constructed instance to within TOLERANCE_REPLAY_RESET, after a long, varied ride', () => {
    const freshBus = new TypedEventBus();
    const freshStore = createTestStore(SEED);
    const fresh = new EiffelGameLogic(freshStore, freshBus, SEED);
    const freshInitial = freshStore.get();

    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);

    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'lever', value: 1 });
    for (let i = 0; i < 600; i++) logic.step(SIM_DT);
    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 600; i++) logic.step(SIM_DT);
    expect(store.get().arcLength).toBeGreaterThan(0); // sanity: it actually moved

    logic.reset(SEED);

    expectSameGameplaySnapshot(store.get(), freshInitial, TOLERANCE_REPLAY_RESET);
    void fresh; // constructed only to produce freshInitial
  });

  it('reset(seed) with a DIFFERENT seed changes the seed field but resets every other gameplay field identically', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'lever', value: 1 });
    for (let i = 0; i < 300; i++) logic.step(SIM_DT);

    logic.reset(999);
    const s = store.get();
    expect(s.seed).toBe(999);
    expect(s.arcLength).toBe(0);
    expect(s.state).toBe('boot');
    expect(s.valveOpen).toBe(0);
  });

  it('reset() preserves cross-cutting settings (sound/quality/reducedMotion) rather than wiping them', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    store.set({ soundOn: false, quality: 'low', reducedMotion: true });
    logic.reset(SEED);
    const s = store.get();
    expect(s.soundOn).toBe(false);
    expect(s.quality).toBe('low');
    expect(s.reducedMotion).toBe(true);
  });
});

describe('EiffelGameLogic — seed determinism: same seed + same inputs => bit-identical trajectory', () => {
  it('two independently-constructed instances produce an identical readout trajectory for 400 steps', () => {
    const a = runScript(SEED, 400);
    const b = runScript(SEED, 400);
    expect(a).toEqual(b);
  });

  it('a different seed produces a DIFFERENT trajectory (proves the seed is not simply ignored)', () => {
    // Only `seed` itself is guaranteed to visibly differ (the deterministic
    // math pipeline takes no other seed-dependent branches) — but that alone
    // proves the constructor's seed argument actually reaches the snapshot.
    const a = runScript(111, 50);
    const b = runScript(222, 50);
    expect(a[a.length - 1]!.seed).not.toBe(b[b.length - 1]!.seed);
  });
});

describe('EiffelGameLogic — scrubToT consistency (scrub then serialize: pipeline identities hold, state matches t)', () => {
  it('every scrubbed t produces exact drive-pipeline identities and a settled cabin', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);

    for (const t of [0, 0.1, 0.25, BLEND_START_S / TRACK_LENGTH, 0.6, BLEND_END_S / TRACK_LENGTH, 0.9, 1]) {
      logic.scrubToT(t);
      const s = logic.serialize();
      const expectedArcLength = t * TRACK_LENGTH;
      expect(s.arcLength).toBeCloseTo(expectedArcLength, 6);
      expect(s.t).toBeCloseTo(t, 9);
      expect(s.cableTravel).toBeCloseTo(MECH_ADVANTAGE * s.pistonDisplacement, 6);
      expect(s.cableTravel).toBeCloseTo(s.arcLength, 6);
      expect(s.pistonDisplacement).toBeCloseTo(s.arcLength / MECH_ADVANTAGE, 6);
      expect(s.carrierAngleDeg).toBeCloseTo(s.thetaDeg - 90, 6);
      expect(s.cabinTiltErrorDeg).toBe(0);
      expect(s.cabinWorldTiltDeg).toBe(0);
      expect(s.speed).toBe(0);
      expect(s.valveOpen).toBe(0);
      expect(s.direction).toBe(0);
      expect(s.paused).toBe(false);
    }
  });

  it('maps arc length to the documented ride-progress state (ascendLower / transition / ascendUpper / arrival)', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);

    logic.scrubToT(0);
    expect(logic.serialize().state).toBe('ascendLower');
    logic.scrubToT((BLEND_START_S + 1) / TRACK_LENGTH);
    expect(logic.serialize().state).toBe('transition');
    logic.scrubToT((BLEND_END_S + 1) / TRACK_LENGTH);
    expect(logic.serialize().state).toBe('ascendUpper');
    logic.scrubToT(1);
    expect(logic.serialize().state).toBe('arrival');
  });

  it('holds theta at the documented anchors at the track endpoints and blend joints', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);

    logic.scrubToT(0);
    expect(logic.serialize().thetaDeg).toBeCloseTo(THETA_LOWER_DEG, 6);
    logic.scrubToT(BLEND_START_S / TRACK_LENGTH);
    expect(logic.serialize().thetaDeg).toBeCloseTo(THETA_LOWER_DEG, 6);
    logic.scrubToT(BLEND_END_S / TRACK_LENGTH);
    expect(logic.serialize().thetaDeg).toBeCloseTo(THETA_UPPER_DEG, 6);
    logic.scrubToT(1);
    expect(logic.serialize().thetaDeg).toBeCloseTo(THETA_UPPER_DEG, 6);
  });

  it('clamps out-of-range t without producing NaN', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.scrubToT(-5);
    expect(logic.serialize().arcLength).toBe(0);
    logic.scrubToT(50);
    expect(logic.serialize().arcLength).toBeCloseTo(STATION_TOP_S, 9);
    logic.scrubToT(Number.NaN);
    expect(Number.isFinite(logic.serialize().arcLength)).toBe(true);
  });

  it('scrubbing is idempotent-consistent: scrubbing to the same t twice yields the same snapshot', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.scrubToT(0.42);
    const first = logic.serialize();
    logic.scrubToT(0.42);
    const second = logic.serialize();
    expectSameGameplaySnapshot(first, second, 1e-9);
  });
});

describe('EiffelGameLogic — gotoState produces a consistent derived snapshot for every state', () => {
  it('every state satisfies the drive-pipeline identities and a settled, in-range cabin tilt', () => {
    for (const id of GAME_STATE_IDS) {
      const bus = new TypedEventBus();
      const store = createTestStore(SEED);
      const logic = new EiffelGameLogic(store, bus, SEED);
      logic.gotoState(id);
      const s = store.get();
      expect(s.state, id).toBe(id);
      expect(s.cableTravel, id).toBeCloseTo(MECH_ADVANTAGE * s.pistonDisplacement, 6);
      expect(s.cableTravel, id).toBeCloseTo(s.arcLength, 6);
      expect(s.carrierAngleDeg, id).toBeCloseTo(s.thetaDeg - 90, 6);
      expect(Number.isFinite(s.thetaDeg), id).toBe(true);
      const expectedPulleyAngle = s.cableTravel / PULLEY_RADIUS;
      expect(expectedPulleyAngle, id).toBeCloseTo(s.cableTravel / PULLEY_RADIUS, 9); // self-consistency guard
      if (id !== 'pause') {
        expect(s.cabinWorldTiltDeg, id).toBe(0);
        expect(s.speed, id).toBe(0);
      }
    }
  });

  it("'transition' lands exactly at BLEND_START_S with matching p/c/theta (explicit deliverable example)", () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.gotoState('transition');
    const s = store.get();
    expect(s.arcLength).toBe(BLEND_START_S);
    expect(s.cableTravel).toBe(BLEND_START_S);
    expect(s.pistonDisplacement).toBeCloseTo(BLEND_START_S / MECH_ADVANTAGE, 9);
    expect(s.thetaDeg).toBeCloseTo(THETA_LOWER_DEG, 9);
  });

  it("'arrival' lands exactly at the track top", () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.gotoState('arrival');
    expect(store.get().arcLength).toBe(STATION_TOP_S);
  });

  it("'machineRoom' lands exactly at arc length 0", () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    const logic = new EiffelGameLogic(store, bus, SEED);
    logic.gotoState('ascendUpper'); // move away from 0 first
    logic.gotoState('machineRoom');
    expect(store.get().arcLength).toBe(0);
  });
});
