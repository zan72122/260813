import { describe, expect, it } from 'vitest';
import { createEventBus } from '../bus';

describe('createEventBus', () => {
  it('delivers payload to a subscribed listener', () => {
    const bus = createEventBus();
    const received: Array<{ phase: string; from: string }> = [];
    bus.on('phase:enter', (payload) => received.push(payload));
    bus.emit('phase:enter', { phase: 'title', from: 'loading' });
    expect(received).toEqual([{ phase: 'title', from: 'loading' }]);
  });

  it('on() returns an unsubscribe function', () => {
    const bus = createEventBus();
    let count = 0;
    const unsub = bus.on('sling:released', () => {
      count += 1;
    });
    bus.emit('sling:released', {});
    unsub();
    bus.emit('sling:released', {});
    expect(count).toBe(1);
  });

  it('off() removes a listener', () => {
    const bus = createEventBus();
    let count = 0;
    const listener = (): void => {
      count += 1;
    };
    bus.on('climb:start', listener);
    bus.off('climb:start', listener);
    bus.emit('climb:start', {});
    expect(count).toBe(0);
  });

  it('is safe when a listener unsubscribes itself during emit', () => {
    const bus = createEventBus();
    let calls = 0;
    const unsub = bus.on('climb:locked', () => {
      calls += 1;
      unsub();
    });
    bus.emit('climb:locked', {});
    bus.emit('climb:locked', {});
    // Self-unsubscribe during the first emit must not throw and must not
    // fire again on the second emit.
    expect(calls).toBe(1);
  });

  it('is safe when a listener subscribes a new listener during emit', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('reveal:done', () => {
      order.push('first');
      // Subscribing during emit should not affect the snapshot already
      // being iterated for this emit() call.
      bus.on('reveal:done', () => order.push('late-added'));
    });
    bus.emit('reveal:done', {});
    expect(order).toEqual(['first']);
    order.length = 0;
    bus.emit('reveal:done', {});
    expect(order).toEqual(['first', 'late-added']);
  });

  it('is safe when a listener removes a different listener during emit', () => {
    const bus = createEventBus();
    const order: string[] = [];
    const second = (): void => {
      order.push('second');
    };
    bus.on('assist:breathe', () => {
      order.push('first');
      bus.off('assist:breathe', second);
    });
    bus.on('assist:breathe', second);
    bus.emit('assist:breathe', { anchor: 'hook' });
    // second was still in the snapshot when emit started, so it still fires
    // for this pass; it must simply not throw and must not fire again after.
    expect(order).toEqual(['first', 'second']);
  });

  it('does nothing for an event with no listeners', () => {
    const bus = createEventBus();
    expect(() => bus.emit('assist:point', { anchor: 'lever' })).not.toThrow();
  });
});
