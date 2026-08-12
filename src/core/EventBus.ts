import type { GameEvent } from './types';

type EventType = GameEvent['type'];
type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
type Listener<K extends EventType> = (event: EventOf<K>) => void;
/** Unsubscribe function returned by on(). */
type Unsubscribe = () => void;

/**
 * Typed publish/subscribe bus for GameEvent. Synchronous dispatch (no batching,
 * no async), so listeners observe cause/effect ordering matching emit() calls.
 */
export class EventBus {
  private readonly listeners = new Map<EventType, Set<Listener<EventType>>>();

  on<K extends EventType>(type: K, listener: Listener<K>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as unknown as Listener<EventType>);
    return () => this.off(type, listener);
  }

  off<K extends EventType>(type: K, listener: Listener<K>): void {
    this.listeners.get(type)?.delete(listener as unknown as Listener<EventType>);
  }

  emit<E extends GameEvent>(event: E): void {
    const set = this.listeners.get(event.type);
    if (!set || set.size === 0) return;
    // Snapshot before iterating so a listener can safely unsubscribe itself/others mid-dispatch.
    for (const listener of [...set]) {
      (listener as unknown as Listener<E['type']>)(event as unknown as EventOf<E['type']>);
    }
  }

  /** Removes every listener for every event type. Used on scene/app teardown. */
  clear(): void {
    this.listeners.clear();
  }
}
