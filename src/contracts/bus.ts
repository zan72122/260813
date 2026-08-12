// src/contracts/bus.ts
// Typed pub/sub. Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

import type { ActionIntent } from './intents';
import type { GameEvent } from './events';

export interface EventBus {
  emitIntent(i: ActionIntent): void;
  onIntent(fn: (i: ActionIntent) => void): () => void;
  emitEvent(e: GameEvent): void;
  onEvent(fn: (e: GameEvent) => void): () => void;
}

/**
 * Minimal synchronous typed pub/sub implementation shared by every layer.
 * - Subscribers are notified synchronously, in subscription order.
 * - Each `on*` call returns an unsubscribe function.
 * - Unsubscribing during dispatch is safe (does not affect the in-flight iteration).
 * - An exception thrown by one subscriber does not stop the others from running;
 *   it is rethrown after all subscribers have been notified (the last error wins).
 */
export function createEventBus(): EventBus {
  const intentListeners = new Set<(i: ActionIntent) => void>();
  const eventListeners = new Set<(e: GameEvent) => void>();

  function dispatch<T>(listeners: Set<(v: T) => void>, value: T): void {
    let firstError: unknown;
    let hasError = false;
    for (const fn of Array.from(listeners)) {
      try {
        fn(value);
      } catch (err) {
        hasError = true;
        firstError = err;
      }
    }
    if (hasError) throw firstError;
  }

  return {
    emitIntent(i: ActionIntent): void {
      dispatch(intentListeners, i);
    },
    onIntent(fn: (i: ActionIntent) => void): () => void {
      intentListeners.add(fn);
      return () => {
        intentListeners.delete(fn);
      };
    },
    emitEvent(e: GameEvent): void {
      dispatch(eventListeners, e);
    },
    onEvent(fn: (e: GameEvent) => void): () => void {
      eventListeners.add(fn);
      return () => {
        eventListeners.delete(fn);
      };
    },
  };
}
