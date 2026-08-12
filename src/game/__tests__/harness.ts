// Shared test harness (not a *.test.ts — vitest's include pattern won't collect
// this file as a suite). Builds a real contracts store/bus/anchors + the
// DOM-free game logic, and provides small helpers to synthesize GameIntents
// so tests can drive the whole loop without a browser.

import { createAnchorRegistry } from '../../contracts/anchors';
import { createEventBus } from '../../contracts/bus';
import { createInitialState } from '../../contracts/machine';
import { createStore } from '../../contracts/store';
import { createGameLogic } from '../logic';
import type { AnchorRegistry } from '../../contracts/anchors';
import type { EventBus } from '../../contracts/bus';
import type { GameStore } from '../../contracts/store';
import type { GameEventName, GamePhase } from '../../contracts/types';
import type { GameLogic } from '../logic';
import type { SwipeDirection } from '../intents';

export interface Harness {
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
  logic: GameLogic;
  events: { name: GameEventName; payload: unknown }[];
  clock: { t: number };
}

const TRACKED_EVENTS: GameEventName[] = [
  'phase:enter',
  'snap:hook',
  'snap:align',
  'bolt:seated',
  'rivet:heated',
  'rivet:handoff',
  'rivet:inserted',
  'rivet:hit',
  'rivet:formed',
  'rivet:cooled',
  'sling:released',
  'climb:start',
  'climb:locked',
  'reveal:done',
  'assist:breathe',
  'assist:point',
  'cam:cue',
  'sfx:*',
];

export function makeHarness(
  seed = 1,
  opts: { reducedMotion?: boolean; testMode?: boolean; startPhase?: GamePhase } = {},
): Harness {
  const store = createStore(createInitialState(seed, { reducedMotion: opts.reducedMotion ?? false }));
  const bus = createEventBus();
  const anchors = createAnchorRegistry();
  const events: { name: GameEventName; payload: unknown }[] = [];
  for (const name of TRACKED_EVENTS) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  if (opts.startPhase) store.set({ phase: opts.startPhase });
  const logic = createGameLogic({ store, bus, anchors, testMode: opts.testMode ?? true });
  return { store, bus, anchors, logic, events, clock: { t: 0 } };
}

export function down(h: Harness, x: number, y: number): void {
  h.clock.t += 16;
  h.logic.handleIntent({ kind: 'down', x, y, t: h.clock.t });
}

export function move(h: Harness, x: number, y: number, dx: number, dy: number): void {
  h.clock.t += 16;
  h.logic.handleIntent({ kind: 'move', x, y, dx, dy, t: h.clock.t });
}

export function up(h: Harness, x: number, y: number): void {
  h.clock.t += 16;
  h.logic.handleIntent({ kind: 'up', x, y, t: h.clock.t });
}

export function cancel(h: Harness): void {
  h.clock.t += 16;
  h.logic.handleIntent({ kind: 'cancel', t: h.clock.t });
}

/** A clean, fast tap: matches what src/input/index.ts emits for a short touch. */
export function tap(h: Harness, x: number, y: number): void {
  down(h, x, y);
  up(h, x, y);
  h.clock.t += 1;
  h.logic.handleIntent({ kind: 'tap', x, y, t: h.clock.t });
}

export function swipe(h: Harness, dir: SwipeDirection, x = 100, y = 100): void {
  h.clock.t += 16;
  const vx = dir === 'left' ? -0.6 : dir === 'right' ? 0.6 : 0;
  const vy = dir === 'up' ? -0.6 : dir === 'down' ? 0.6 : 0;
  h.logic.handleIntent({ kind: 'swipe', dir, vx, vy, x, y, t: h.clock.t });
}

/** Drag a vertical distance in a handful of move samples (down -> moves -> up). */
export function dragVertical(h: Harness, x: number, startY: number, totalDy: number, steps = 5): void {
  down(h, x, startY);
  const stepDy = totalDy / steps;
  let y = startY;
  for (let i = 0; i < steps; i += 1) {
    y += stepDy;
    move(h, x, y, 0, stepDy);
  }
  up(h, x, y);
}

/** Advance the fixed-step simulation clock, calling logic.update in dtMs increments. */
export function tick(h: Harness, totalMs: number, dtMs = 16.67): void {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(dtMs, remaining);
    h.logic.update(step);
    remaining -= step;
  }
}
