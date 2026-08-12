/**
 * STUB — owner A (gameplay-camera) owns src/game/**.
 * Real responsibility: GamePhase state machine, ActionIntent consumption,
 * progress updates (GameState.setProgress), hint timers, and the
 * p -> per-element choreography helpers built on
 * src/core/TransformTimeline.ts. This placeholder only stores its
 * dependencies; it does not yet react to ActionIntent.
 */
import type { ActionIntent, EventBus, GameState } from '../core';

export class GameDirector {
  constructor(
    private readonly state: GameState,
    private readonly bus: EventBus
  ) {}

  handleIntent(_intent: ActionIntent): void {
    // TODO(owner A): phase state machine + progress updates, e.g. this.state.setProgress(...).
    void this.state;
    void this.bus;
  }

  update(_dt: number): void {
    // TODO(owner A): hint timers, choreography-driven scene updates.
  }
}
