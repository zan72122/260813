import type { EventBus, GameEvents } from "./types";

type Listener<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

class TypedEventBus implements EventBus {
  private listeners: Map<keyof GameEvents, Set<Listener<keyof GameEvents>>> = new Map();

  on<K extends keyof GameEvents>(k: K, cb: (p: GameEvents[K]) => void): () => void {
    let set = this.listeners.get(k);
    if (!set) {
      set = new Set();
      this.listeners.set(k, set);
    }
    set.add(cb as Listener<keyof GameEvents>);
    return () => {
      set?.delete(cb as Listener<keyof GameEvents>);
    };
  }

  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void {
    const set = this.listeners.get(k);
    if (!set || set.size === 0) return;
    // コールバック内でのon/off変更に影響されないようスナップショットを回す。
    for (const cb of Array.from(set)) {
      (cb as Listener<K>)(p);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export function createEventBus(): EventBus {
  return new TypedEventBus();
}
