// src/contracts/store.ts
// Tiny observable store. One synchronous notify per set()/update() call.

import type { GameState } from './types';

export type Listener<T> = (state: T) => void;

export interface Store<T> {
  get(): T;
  set(partial: Partial<T>): void;
  update(fn: (state: T) => Partial<T>): void;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  function notify(): void {
    // Snapshot: a listener may subscribe/unsubscribe during notification.
    for (const listener of Array.from(listeners)) {
      listener(state);
    }
  }

  function get(): T {
    return state;
  }

  function set(partial: Partial<T>): void {
    state = { ...state, ...partial };
    notify();
  }

  function update(fn: (state: T) => Partial<T>): void {
    const partial = fn(state);
    state = { ...state, ...partial };
    notify();
  }

  function subscribe(listener: Listener<T>): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, update, subscribe };
}

/** The single observable store type shared by every module (see contract). */
export type GameStore = Store<GameState>;
