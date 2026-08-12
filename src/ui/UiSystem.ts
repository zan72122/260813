import type { ActionIntent, UiSystem } from '../core';

/**
 * Null-object stub — owner C (mobile-qa) replaces this wholesale with real
 * icon-only UI (no text), choice screen, mute/quality/Reduce Motion toggles,
 * all driven by GameEvent subscriptions, per docs/CONTRACTS_ADDENDUM.md.
 * uiToggle intents flow back out through the onIntent callback.
 */
export class NullUiSystem implements UiSystem {
  mount(_root: HTMLElement, _onIntent: (intent: ActionIntent) => void): void {
    // TODO(owner C): render icon UI, subscribe to bus, forward uiToggle via onIntent.
  }

  dispose(): void {
    // TODO(owner C): remove DOM nodes, unsubscribe from bus.
  }
}
