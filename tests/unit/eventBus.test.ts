import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvent } from '../../src/core/types';

describe('EventBus', () => {
  it('delivers emitted events only to listeners of the matching type', () => {
    const bus = new EventBus();
    const phaseListener = vi.fn();
    const progressListener = vi.fn();
    bus.on('phaseChanged', phaseListener);
    bus.on('transformProgress', progressListener);

    bus.emit({ type: 'phaseChanged', from: 'boot', to: 'title' });

    expect(phaseListener).toHaveBeenCalledTimes(1);
    expect(progressListener).not.toHaveBeenCalled();
  });

  it('passes the strongly-typed event payload through to the listener', () => {
    const bus = new EventBus();
    let received: Extract<GameEvent, { type: 'transformProgress' }> | undefined;
    bus.on('transformProgress', (event) => {
      received = event;
    });

    bus.emit({
      type: 'transformProgress',
      pair: { from: 'salon', to: 'forest' },
      p: 0.25,
      velocity: 1.2
    });

    // Type-level: `received` is narrowed to the transformProgress member, so
    // `.p` / `.velocity` / `.pair` are accessible without a cast.
    expect(received?.p).toBe(0.25);
    expect(received?.velocity).toBe(1.2);
    expect(received?.pair).toEqual({ from: 'salon', to: 'forest' });
  });

  it('supports multiple listeners for the same event type', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('lockReleased', a);
    bus.on('lockReleased', b);

    bus.emit({ type: 'lockReleased' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('on() returns an unsubscribe function', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsubscribe = bus.on('lockReleased', listener);

    unsubscribe();
    bus.emit({ type: 'lockReleased' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('off() removes a specific listener without affecting others', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('lockReleased', a);
    bus.on('lockReleased', b);

    bus.off('lockReleased', a);
    bus.emit({ type: 'lockReleased' });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a listener unsubscribing itself mid-dispatch does not break sibling delivery', () => {
    const bus = new EventBus();
    const b = vi.fn();
    const unsubscribeA = bus.on('lockReleased', () => unsubscribeA());
    bus.on('lockReleased', b);

    expect(() => bus.emit({ type: 'lockReleased' })).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);

    b.mockClear();
    bus.emit({ type: 'lockReleased' });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clear() removes every listener for every event type', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on('lockReleased', listener);
    bus.clear();
    bus.emit({ type: 'lockReleased' });
    expect(listener).not.toHaveBeenCalled();
  });
});
