import { describe, expect, it } from 'vitest';
import { createStore } from '../store';

interface Counter {
  n: number;
  label: string;
}

describe('createStore', () => {
  it('get() returns the current state', () => {
    const store = createStore<Counter>({ n: 0, label: 'a' });
    expect(store.get()).toEqual({ n: 0, label: 'a' });
  });

  it('set() merges a partial and notifies subscribers exactly once', () => {
    const store = createStore<Counter>({ n: 0, label: 'a' });
    let notifications = 0;
    let lastState: Counter | undefined;
    store.subscribe((s) => {
      notifications += 1;
      lastState = s;
    });
    store.set({ n: 5 });
    expect(notifications).toBe(1);
    expect(lastState).toEqual({ n: 5, label: 'a' });
  });

  it('update() derives a partial from current state and notifies once', () => {
    const store = createStore<Counter>({ n: 1, label: 'a' });
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.update((s) => ({ n: s.n + 1 }));
    expect(notifications).toBe(1);
    expect(store.get()).toEqual({ n: 2, label: 'a' });
  });

  it('subscribe() returns a working unsubscribe function', () => {
    const store = createStore<Counter>({ n: 0, label: 'a' });
    let calls = 0;
    const unsub = store.subscribe(() => {
      calls += 1;
    });
    store.set({ n: 1 });
    unsub();
    store.set({ n: 2 });
    expect(calls).toBe(1);
  });

  it('supports multiple independent subscribers', () => {
    const store = createStore<Counter>({ n: 0, label: 'a' });
    const seenA: number[] = [];
    const seenB: number[] = [];
    store.subscribe((s) => seenA.push(s.n));
    store.subscribe((s) => seenB.push(s.n));
    store.set({ n: 1 });
    store.set({ n: 2 });
    expect(seenA).toEqual([1, 2]);
    expect(seenB).toEqual([1, 2]);
  });
});
