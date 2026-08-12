/**
 * Minimal typed event emitter. No DOM/three.js dependency so it works in
 * both the game logic layer and the scene layer.
 */
export type Listener<T> = (payload: T) => void;

export class EventEmitter<Events extends Record<string, unknown>> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners[event];
    if (!set) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners[event];
    if (!set || set.size === 0) return;
    // Copy to array so a listener removing itself mid-dispatch is safe.
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
