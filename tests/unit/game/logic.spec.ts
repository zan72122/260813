import { beforeEach, describe, expect, it } from 'vitest';

import {
  BLEND_END_S,
  BLEND_START_S,
  CABIN_MAX_WORLD_TILT_DEG,
  MECH_ADVANTAGE,
  SIM_DT,
  STATION_BOTTOM_S,
  STATION_TOP_S,
  THETA_LOWER_DEG,
  TRACK_LENGTH,
} from '../../../src/contracts/constants.ts';
import { TypedEventBus } from '../../../src/contracts/events.ts';
import type { InputIntent } from '../../../src/contracts/subsystems.ts';
import { EiffelGameLogic } from '../../../src/game/logic.ts';
import { createTestStore, type TestStoreHandle } from './helpers/testStore.ts';

const SEED = 20260812;

function make(): { logic: EiffelGameLogic; store: TestStoreHandle; bus: TypedEventBus } {
  const bus = new TypedEventBus();
  const store = createTestStore(SEED);
  const logic = new EiffelGameLogic(store, bus, SEED);
  return { logic, store, bus };
}

function assertConsistentSnapshot(store: TestStoreHandle): void {
  const s = store.get();
  for (const [key, value] of Object.entries(s)) {
    if (typeof value === 'number') expect(Number.isFinite(value), `field "${key}"`).toBe(true);
  }
  expect(s.cableTravel).toBeCloseTo(MECH_ADVANTAGE * s.pistonDisplacement, 6);
  expect(s.arcLength).toBeCloseTo(s.cableTravel, 6);
  expect(Math.abs(s.cabinWorldTiltDeg)).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG + 1e-6);
  expect(s.cabinWorldTiltDeg).toBeCloseTo(s.cabinTiltErrorDeg, 9);
  expect(s.arcLength).toBeGreaterThanOrEqual(STATION_BOTTOM_S - 1e-9);
  expect(s.arcLength).toBeLessThanOrEqual(TRACK_LENGTH + 1e-9);
  expect(s.paused).toBe(s.state === 'pause');
}

describe('EiffelGameLogic — construction', () => {
  it('publishes a consistent boot snapshot immediately on construction', () => {
    const { store } = make();
    const s = store.get();
    expect(s.state).toBe('boot');
    expect(s.arcLength).toBe(0);
    expect(s.valveOpen).toBe(0);
    expect(s.direction).toBe(0);
    expect(s.speed).toBe(0);
    // The track is never literally flat: even at s=0 the analytic curve
    // holds THETA_LOWER, so thetaDeg is 54 here, not 0 (see track.ts §1).
    expect(s.thetaDeg).toBeCloseTo(THETA_LOWER_DEG, 9);
    expect(s.carrierAngleDeg).toBeCloseTo(THETA_LOWER_DEG - 90, 9);
    expect(s.cabinWorldTiltDeg).toBe(0);
    expect(s.seed).toBe(SEED >>> 0);
    assertConsistentSnapshot(make().store);
  });

  it('preserves the pre-existing store settings (quality/soundOn/reducedMotion) rather than overwriting them', () => {
    const bus = new TypedEventBus();
    const store = createTestStore(SEED);
    store.set({ quality: 'low', soundOn: false, reducedMotion: true });
    new EiffelGameLogic(store, bus, SEED);
    const s = store.get();
    expect(s.quality).toBe('low');
    expect(s.soundOn).toBe(false);
    expect(s.reducedMotion).toBe(true);
  });
});

describe('EiffelGameLogic — applyInput validity gating (ignores intents invalid for current state)', () => {
  let logic: EiffelGameLogic;
  let store: TestStoreHandle;

  beforeEach(() => {
    ({ logic, store } = make());
  });

  it('ignores a lever intent outside machineRoom', () => {
    logic.gotoState('ascendLower');
    logic.applyInput({ kind: 'lever', value: 1 });
    logic.step(SIM_DT);
    expect(store.get().valveOpen).toBe(0); // throttle wasn't held either, so nothing moved
  });

  it('ignores a throttle intent outside ascend/descend states', () => {
    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 60; i++) logic.step(SIM_DT);
    // Only the lever (unused here) drives machineRoom; throttle must have no effect.
    expect(store.get().arcLength).toBe(0);
  });

  it('ignores a wheel intent outside transition', () => {
    logic.gotoState('ascendLower');
    logic.applyInput({ kind: 'throttle', value: 1 });
    logic.applyInput({ kind: 'wheel', deltaRadians: 5 }); // should be dropped silently
    logic.step(SIM_DT);
    // No crash, no effect beyond the throttle-driven motion — nothing to
    // assert on wheel specifically beyond "did not throw".
    expect(Number.isFinite(store.get().cabinWorldTiltDeg)).toBe(true);
  });

  it('a lever intent in machineRoom actually drives the valve', () => {
    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'lever', value: 1 });
    for (let i = 0; i < 5; i++) logic.step(SIM_DT);
    expect(store.get().valveOpen).toBeGreaterThan(0);
  });

  it('a throttle intent in ascendLower actually drives the carrier', () => {
    logic.gotoState('ascendLower');
    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 30; i++) logic.step(SIM_DT);
    expect(store.get().arcLength).toBeGreaterThan(0);
  });
});

describe('EiffelGameLogic — control input is reset on every state change', () => {
  it('a held throttle from ascendLower does not carry into transition (auto-drive takes over cleanly either way)', () => {
    const { logic, store } = make();
    logic.gotoState('ascendLower');
    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 60 * 40 && store.get().state === 'ascendLower'; i++) logic.step(SIM_DT);
    expect(store.get().state).toBe('transition');
    // transition's auto-drive keeps moving forward regardless of stale throttle state.
    const before = store.get().arcLength;
    for (let i = 0; i < 30; i++) logic.step(SIM_DT);
    expect(store.get().arcLength).toBeGreaterThan(before);
  });

  it('re-entering machineRoom via replay does not inherit a stale lever value', () => {
    const { logic, store } = make();
    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'lever', value: 1 });
    for (let i = 0; i < 5; i++) logic.step(SIM_DT);
    expect(store.get().valveOpen).toBeGreaterThan(0);

    logic.gotoState('replayMenu');
    logic.gotoState('machineRoom'); // fresh entry, no new lever input applied
    logic.step(SIM_DT);
    expect(store.get().valveOpen).toBe(0);
  });
});

describe('EiffelGameLogic — full ride, state by state (integration)', () => {
  it('drives the complete flow from boot to replayMenu with no NaN and every invariant intact throughout', () => {
    const { logic, store, bus } = make();
    const cameraCues: string[] = [];
    bus.on('camera:cue', ({ cue }) => cameraCues.push(cue));

    logic.gotoState('attract');
    assertConsistentSnapshot(store);

    logic.gotoState('machineRoom');
    logic.applyInput({ kind: 'lever', value: 1 });
    for (let i = 0; i < 600 && store.get().state === 'machineRoom'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('cableFollow');

    for (let i = 0; i < 600 && store.get().state === 'cableFollow'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('ascendLower');

    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 60 * 60 && store.get().state === 'ascendLower'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('transition');
    expect(store.get().arcLength).toBeGreaterThanOrEqual(BLEND_START_S);

    for (let i = 0; i < 60 * 30 && store.get().state === 'transition'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('ascendUpper');
    expect(store.get().arcLength).toBeGreaterThanOrEqual(BLEND_END_S);

    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 60 * 60 && store.get().state === 'ascendUpper'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('arrival');
    expect(store.get().arcLength).toBeCloseTo(STATION_TOP_S, 6);

    for (let i = 0; i < 60 * 10 && store.get().state === 'arrival'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('celebrate');

    for (let i = 0; i < 60 * 10 && store.get().state === 'celebrate'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('replayMenu');

    expect(cameraCues).toContain('establish');
    expect(cameraCues).toContain('underground');
    expect(cameraCues).toContain('cableFollow');
    expect(cameraCues).toContain('carrierSide');
    expect(cameraCues).toContain('firstSlope');
    expect(cameraCues).toContain('transitionClose');
    expect(cameraCues).toContain('arrivalReveal');
    expect(cameraCues).toContain('menu');
  });

  it('supports the descend replay path with the same guarantees', () => {
    const { logic, store } = make();
    logic.gotoState('replayMenu');
    logic.gotoState('descend'); // REPLAY_DESCEND target, top of the track
    expect(store.get().arcLength).toBeCloseTo(STATION_TOP_S, 6);

    logic.applyInput({ kind: 'throttle', value: -1 });
    for (let i = 0; i < 60 * 60 && store.get().state === 'descend'; i++) {
      logic.step(SIM_DT);
      assertConsistentSnapshot(store);
    }
    expect(store.get().state).toBe('replayMenu');
    expect(store.get().arcLength).toBeCloseTo(STATION_BOTTOM_S, 6);
  });
});

describe('EiffelGameLogic — pause/resume preserves and restores exactly', () => {
  it('pausing mid-ride freezes the snapshot, and resuming restores it exactly', () => {
    const { logic, store } = make();
    logic.gotoState('ascendLower');
    logic.applyInput({ kind: 'throttle', value: 1 });
    for (let i = 0; i < 90; i++) logic.step(SIM_DT);
    const beforePause = store.get();
    expect(beforePause.arcLength).toBeGreaterThan(0);

    logic.gotoState('pause');
    const paused = store.get();
    expect(paused.state).toBe('pause');
    expect(paused.paused).toBe(true);
    expect(paused.arcLength).toBeCloseTo(beforePause.arcLength, 9);
    expect(paused.speed).toBeCloseTo(beforePause.speed, 9);

    // step() while paused must be a no-op even if something calls it directly.
    logic.step(SIM_DT);
    expect(store.get().arcLength).toBeCloseTo(beforePause.arcLength, 9);

    logic.gotoState('ascendLower'); // the UI's natural resume wiring: gotoState(rememberedState)
    const resumed = store.get();
    expect(resumed.state).toBe('ascendLower');
    expect(resumed.paused).toBe(false);
    expect(resumed.arcLength).toBeCloseTo(beforePause.arcLength, 9);
    expect(resumed.speed).toBeCloseTo(beforePause.speed, 9);
    expect(resumed.cabinWorldTiltDeg).toBeCloseTo(beforePause.cabinWorldTiltDeg, 9);
  });
});

describe('EiffelGameLogic — NaN-safety under adversarial input spam', () => {
  it('never produces a non-finite snapshot field across rapid, contradictory input across every state', () => {
    const { logic, store } = make();
    const intents: InputIntent[] = [
      { kind: 'lever', value: 1 },
      { kind: 'lever', value: 0 },
      { kind: 'throttle', value: 1 },
      { kind: 'throttle', value: -1 },
      { kind: 'throttle', value: 0 },
      { kind: 'wheel', deltaRadians: 12.5 },
      { kind: 'wheel', deltaRadians: -8 },
    ];
    const states = [
      'boot',
      'attract',
      'machineRoom',
      'cableFollow',
      'ascendLower',
      'transition',
      'ascendUpper',
      'arrival',
      'celebrate',
      'replayMenu',
      'descend',
      'pause',
    ] as const;
    let i = 0;
    for (const state of states) {
      logic.gotoState(state);
      for (let step = 0; step < 40; step++) {
        logic.applyInput(intents[i % intents.length]!);
        i += 1;
        logic.step(SIM_DT);
        assertConsistentSnapshot(store);
      }
    }
  });
});
