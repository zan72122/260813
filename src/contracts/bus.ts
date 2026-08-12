// src/contracts/bus.ts
// Minimal typed event bus. Safe against listeners being added/removed
// from within a handler that runs during emit() (snapshot-iterate).

import type { GameEventMap, GameEventName } from './types';

type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

export interface EventBus {
  on<K extends GameEventName>(event: K, listener: Listener<K>): () => void;
  off<K extends GameEventName>(event: K, listener: Listener<K>): void;
  emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();

  function on<K extends GameEventName>(event: K, listener: Listener<K>): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(listener as Listener<GameEventName>);
    return () => off(event, listener);
  }

  function off<K extends GameEventName>(event: K, listener: Listener<K>): void {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<GameEventName>);
  }

  function emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    // Snapshot before iterating: listeners may unsubscribe themselves or
    // subscribe new listeners during emit without affecting this pass.
    const snapshot = Array.from(set);
    for (const listener of snapshot) {
      listener(payload);
    }
  }

  return { on, off, emit };
}
