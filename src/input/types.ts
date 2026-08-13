/**
 * Input-layer types. `src/input` depends only on contracts/handles.ts (the
 * HandleRegistry) plus contracts/intents.ts and contracts/types.ts — never
 * on Three.js or any render-owner module (ARCHITECTURE_CONTRACT §handles.ts).
 */
import type { Intent } from '../contracts/intents';
import type { GameState } from '../contracts/types';

/**
 * Whatever `attachInput` listens on — a real `HTMLCanvasElement`/
 * `HTMLElement`/`Window` satisfies this structurally with zero adaptation.
 * Typed against the DOM lib's own `Event`/listener-option shapes (rather
 * than a bespoke event type) purely so real DOM elements are assignable
 * here without a cast; handlers narrow to `PointerEvent` internally.
 */
export interface EventTargetLike {
  addEventListener(
    type: string,
    listener: (ev: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (ev: Event) => void,
    options?: EventListenerOptions | boolean,
  ): void;
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

/**
 * Whatever `attachInput` emits Intents into. A live `GameController`
 * (src/game) satisfies this directly — `attachInput({ sink: game, ... })`
 * needs no adapter.
 */
export interface IntentSink {
  applyIntent(intent: Intent): void;
}

export interface AttachInputOptions {
  /** The element to listen on — typically the render canvas, or a wrapping root that fully covers it. */
  root: EventTargetLike;
  /** Read every frame for each handle's current screen-space transform (contracts/handles.ts). */
  handles: import('../contracts/handles').HandleRegistry;
  /** Where translated Intents go. */
  sink: IntentSink;
  /** Optional live-state peek; currently used only to ignore new grabs while `paused`. Safe to omit entirely. */
  getState?: () => GameState | undefined;
  /**
   * F4 (review round 1): window-like target `resize`/`orientationchange`
   * fire on — an in-flight gesture is cleanly ended (exactly like
   * `pointercancel`) whenever either fires, so a mid-drag rotation can never
   * slam `gateOpen`/wedge progress with a spurious jump once the handle's
   * on-screen position has moved out from under the player's finger.
   * Defaults to the global `window` when available (production); pass a
   * fake `EventTargetLike` in tests to drive this deterministically without
   * a real `window`/jsdom (see tests/unit/game-input.test.ts).
   */
  viewport?: EventTargetLike;
}

export interface InputHandle {
  /** Removes all listeners and releases any in-progress gesture. Idempotent. */
  dispose(): void;
}
