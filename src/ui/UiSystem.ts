/**
 * STUB — owner C (mobile-qa) owns src/ui/**.
 * Real responsibility: icon-only UI (no text), choice screen, mute/quality/
 * Reduce Motion toggles, all driven by GameEvent subscriptions. This
 * placeholder subscribes to nothing and renders nothing yet.
 */
import type { EventBus } from '../core';

export class UiSystem {
  private unsubscribes: Array<() => void> = [];

  init(_bus: EventBus): void {
    // TODO(owner C): subscribe to phaseChanged/hintShown/etc and render icon UI.
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
  }
}
