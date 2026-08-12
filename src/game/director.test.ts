// src/game/director.test.ts
// Colocated unit test: registers the GameDirector against a stub
// SceneContext and drives the whole loop from synthetic intents —
// whistle tap -> valve rotations -> water -> reveal (x3 fountains) ->
// finale -> replay-choice -> replay. Also covers the Debug API and the
// clockwise-only, non-punishing valve model in isolation.

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_FOUNTAIN_IDS, createEventBus, type GameEvent, type SceneContext } from '../contracts';
import { installDebugApi } from './debug';
import { GameDirector } from './director';
import { VALVE_APPROACH_SEC, VALVE_TOTAL_RADIANS } from './timing';
import { ValveModel } from './valve';

function createStubContext(): SceneContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 390 / 844, 0.1, 100);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const renderer = {
    info: { render: { calls: 12, triangles: 3400 } },
  } as unknown as THREE.WebGLRenderer;

  return {
    scene,
    camera,
    renderer,
    bus: createEventBus(),
    quality: 'medium',
    viewport: { width: 390, height: 844, dpr: 2, orientation: 'portrait' },
    audio: {
      muted: false,
      async unlock() {},
      play() {},
      setIntensity() {},
    },
  };
}

/** Turns the valve fully open (clockwise) by feeding synthetic valve-rotate
 * intents, mirroring what the input layer would emit from a finger's
 * circular drag. */
function turnValveFullyOpen(ctx: SceneContext, stepRad = 2, velocity = 3): void {
  let turned = 0;
  // A few extra iterations of headroom beyond the exact turns needed.
  const maxSteps = Math.ceil(VALVE_TOTAL_RADIANS / stepRad) + 3;
  for (let i = 0; i < maxSteps && turned < VALVE_TOTAL_RADIANS * 1.05; i++) {
    ctx.bus.emitIntent({ kind: 'valve-rotate', deltaAngleRad: stepRad, angularVelocityRadPerSec: velocity });
    turned += stepRad;
  }
}

describe('GameDirector: full loop from synthetic intents', () => {
  let ctx: SceneContext;
  let director: GameDirector;
  let events: GameEvent[];

  beforeEach(() => {
    ctx = createStubContext();
    events = [];
    ctx.bus.onEvent((e) => events.push(e));
    director = new GameDirector(ctx);
    // Simulate the app skeleton's title -> garden-idle transition.
    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'garden-idle', fountain: null });
  });

  function lastPhaseEvent(): Extract<GameEvent, { kind: 'phase-changed' }> | undefined {
    return [...events].reverse().find((e): e is Extract<GameEvent, { kind: 'phase-changed' }> => e.kind === 'phase-changed');
  }

  function runOneFountainCycle(expectedFountain: string): void {
    // garden-idle -> whistle-cue (king finishes the walk-up)
    director.update(10);
    expect(lastPhaseEvent()?.phase).toBe('whistle-cue');
    expect(lastPhaseEvent()?.fountain).toBe(expectedFountain);

    // whistle tap
    ctx.bus.emitIntent({ kind: 'whistle-blow' });
    expect(events.some((e) => e.kind === 'whistle-blown')).toBe(true);
    expect(lastPhaseEvent()?.phase).toBe('valve-approach');

    // continuous dolly finishes
    director.update(VALVE_APPROACH_SEC + 0.1);
    expect(lastPhaseEvent()?.phase).toBe('valve-turn');

    // valve rotations: clockwise-only, monotonic openness
    turnValveFullyOpen(ctx);
    expect(events.some((e) => e.kind === 'valve-opened' && e.fountain === expectedFountain)).toBe(true);
    expect(lastPhaseEvent()?.phase).toBe('pipe-run');
    expect(director.getState().openness).toBeCloseTo(1, 5);

    // water travels the pipe
    director.update(10);
    expect(events.some((e) => e.kind === 'water-arrived' && e.fountain === expectedFountain)).toBe(true);
    expect(lastPhaseEvent()?.phase).toBe('fountain-reveal');

    // staged reveal envelope -> hold >= 1.5s -> auto-advance
    director.update(6);
    const flowEvents = events.filter((e): e is Extract<GameEvent, { kind: 'fountain-flow' }> =>
      e.kind === 'fountain-flow' && e.fountain === expectedFountain,
    );
    expect(flowEvents.length).toBeGreaterThan(0);
    expect(flowEvents[flowEvents.length - 1]?.intensity).toBeCloseTo(1, 5);
  }

  it('drives whistle -> valve -> water -> reveal for all 3 fountains, then finale, then replay', () => {
    for (const id of ALL_FOUNTAIN_IDS) {
      runOneFountainCycle(id);
    }

    expect(lastPhaseEvent()?.phase).toBe('finale');
    expect(events.some((e) => e.kind === 'finale-started')).toBe(true);

    director.update(10);
    expect(lastPhaseEvent()?.phase).toBe('replay-choice');
    expect(events.some((e) => e.kind === 'loop-completed')).toBe(true);

    // Replay: 'same' should be playable within 2 taps (choice tap + whistle tap).
    ctx.bus.emitIntent({ kind: 'choice', choice: 'same' });
    expect(lastPhaseEvent()?.phase).toBe('whistle-cue');
    expect(lastPhaseEvent()?.fountain).toBe('fountain-crown');

    ctx.bus.emitIntent({ kind: 'whistle-blow' });
    expect(lastPhaseEvent()?.phase).toBe('valve-approach');
  });

  it('does not punish counter-clockwise rotation and holds openness while idle', () => {
    director.update(10); // -> whistle-cue
    ctx.bus.emitIntent({ kind: 'whistle-blow' });
    director.update(VALVE_APPROACH_SEC + 0.1); // -> valve-turn

    ctx.bus.emitIntent({ kind: 'valve-rotate', deltaAngleRad: 3, angularVelocityRadPerSec: 2 });
    const opennessAfterClockwise = director.getState().openness;
    expect(opennessAfterClockwise).toBeGreaterThan(0);

    ctx.bus.emitIntent({ kind: 'valve-rotate', deltaAngleRad: -3, angularVelocityRadPerSec: 2 });
    expect(director.getState().openness).toBe(opennessAfterClockwise); // no loss

    // finger stops: openness holds, no further intents, no auto-progress.
    director.update(1);
    expect(director.getState().openness).toBe(opennessAfterClockwise);
    expect(director.getState().phase).toBe('valve-turn');
  });

  it('emits idle hints during whistle-cue and valve-turn', () => {
    director.update(10); // -> whistle-cue
    director.update(5.1); // idle past the 3-5s hint window
    expect(events.some((e) => e.kind === 'hint' && e.target === 'whistle')).toBe(true);

    ctx.bus.emitIntent({ kind: 'whistle-blow' });
    director.update(VALVE_APPROACH_SEC + 0.1); // -> valve-turn
    director.update(5.1);
    expect(events.some((e) => e.kind === 'hint' && e.target === 'valve')).toBe(true);
  });

  it('free-valve replay choice loops valve-turn without returning to garden-idle', () => {
    for (const id of ALL_FOUNTAIN_IDS) runOneFountainCycle(id);
    director.update(10); // finale -> replay-choice

    ctx.bus.emitIntent({ kind: 'choice', choice: 'free-valve' });
    expect(lastPhaseEvent()?.phase).toBe('valve-turn');
    expect(director.getState().freeValveMode).toBe(true);

    turnValveFullyOpen(ctx);
    director.update(10); // pipe-run -> fountain-reveal
    director.update(6); // reveal hold -> loops back into valve-turn again
    expect(director.getState().phase).toBe('valve-turn');
    expect(director.getState().freeValveMode).toBe(true);
  });
});

describe('ValveModel', () => {
  it('is monotonic, clockwise-only, and low-passes angular velocity', () => {
    const valve = new ValveModel();
    valve.applyRotation(1, 5);
    const afterFirst = valve.openness;
    expect(afterFirst).toBeGreaterThan(0);
    expect(valve.angularVelocityRadPerSec).toBeGreaterThan(0);
    expect(valve.angularVelocityRadPerSec).toBeLessThanOrEqual(5);

    valve.applyRotation(-10, 5); // counter-clockwise: never subtracts
    expect(valve.openness).toBe(afterFirst);

    valve.update(10); // long idle: velocity decays toward 0, openness holds
    expect(valve.angularVelocityRadPerSec).toBe(0);
    expect(valve.openness).toBe(afterFirst);
  });

  it('reaches isFullyOpen at openness 1 and clamps there', () => {
    const valve = new ValveModel();
    valve.applyRotation(VALVE_TOTAL_RADIANS * 3, 4);
    expect(valve.openness).toBe(1);
    expect(valve.isFullyOpen).toBe(true);
  });
});

describe('Debug API (window.__versailles)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {} as unknown as Window);
  });

  it('exposes read-only phase/openness/hotspots/rendererInfo', () => {
    const ctx = createStubContext();
    const director = new GameDirector(ctx);
    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'garden-idle', fountain: null });

    const dispose = installDebugApi(ctx, director);
    const debugApi = (window as unknown as { __versailles: Record<string, unknown> }).__versailles;

    expect(debugApi.phase).toBe('garden-idle');
    expect(debugApi.openness).toBe(0);
    const hotspots = debugApi.hotspots as { whistle?: { x: number; y: number; r: number }; valve?: { x: number; y: number; r: number } };
    expect(hotspots.whistle).toBeDefined();
    expect(hotspots.valve).toBeDefined();
    expect(typeof hotspots.whistle?.x).toBe('number');
    expect(typeof hotspots.valve?.r).toBe('number');

    const rendererInfo = debugApi.rendererInfo as { drawCalls: number; triangles: number };
    expect(rendererInfo.drawCalls).toBe(12);
    expect(rendererInfo.triangles).toBe(3400);

    dispose();
    expect((window as unknown as { __versailles?: unknown }).__versailles).toBeUndefined();
  });
});
