import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/contracts/bus';
import type { ActionIntent } from '../../src/contracts/intents';
import type { GameEvent } from '../../src/contracts/events';

describe('EventBus contract', () => {
  it('delivers emitted intents to subscribers', () => {
    const bus = createEventBus();
    const received: ActionIntent[] = [];
    bus.onIntent((i) => received.push(i));

    bus.emitIntent({ kind: 'whistle-blow' });
    bus.emitIntent({ kind: 'valve-rotate', deltaAngleRad: 0.1, angularVelocityRadPerSec: 1 });

    expect(received).toEqual([
      { kind: 'whistle-blow' },
      { kind: 'valve-rotate', deltaAngleRad: 0.1, angularVelocityRadPerSec: 1 },
    ]);
  });

  it('delivers emitted events to subscribers', () => {
    const bus = createEventBus();
    const received: GameEvent[] = [];
    bus.onEvent((e) => received.push(e));

    bus.emitEvent({ kind: 'phase-changed', phase: 'title', fountain: null });

    expect(received).toEqual([{ kind: 'phase-changed', phase: 'title', fountain: null }]);
  });

  it('onIntent/onEvent return working unsubscribe functions', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const unsubscribe = bus.onIntent(fn);

    bus.emitIntent({ kind: 'whistle-blow' });
    expect(fn).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emitIntent({ kind: 'whistle-blow' });
    expect(fn).toHaveBeenCalledTimes(1); // no additional calls after unsubscribe
  });

  it('supports multiple independent subscribers', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.onEvent(a);
    bus.onEvent(b);

    bus.emitEvent({ kind: 'whistle-blown' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing one listener does not affect others', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.onEvent(a);
    bus.onEvent(b);

    unsubA();
    bus.emitEvent({ kind: 'whistle-blown' });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('intent and event channels are independent', () => {
    const bus = createEventBus();
    const intentFn = vi.fn();
    const eventFn = vi.fn();
    bus.onIntent(intentFn);
    bus.onEvent(eventFn);

    bus.emitIntent({ kind: 'whistle-blow' });

    expect(intentFn).toHaveBeenCalledTimes(1);
    expect(eventFn).not.toHaveBeenCalled();
  });
});
