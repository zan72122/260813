// src/game/procession.ts
// King procession model: advances along the garden path toward each of the
// three fountain stops in turn. This module only tracks abstract progress
// (which leg, how far along it) — the concrete 3D path (src/scenes/anchors.ts)
// samples this same normalized progress to place the procession token mesh,
// and the camera's garden-idle beat uses phase/fountain to frame it. Neither
// of those needs a bespoke contract event: the phase-changed event already
// carries the upcoming fountain id, and both consumers derive position from
// the shared GARDEN_IDLE_APPROACH_SEC timing constant (src/game/timing.ts).

import { ALL_FOUNTAIN_IDS, type FountainId } from '../contracts';
import { GARDEN_IDLE_APPROACH_SEC } from './timing';

export class KingProcession {
  private legIndex = 0; // which fountain (0..2) the king is currently walking toward
  private legElapsed = 0;

  /** The fountain the king is currently approaching / stopped at. */
  get currentFountain(): FountainId {
    return ALL_FOUNTAIN_IDS[this.legIndex] ?? 'fountain-fan';
  }

  get isLastFountain(): boolean {
    return this.legIndex >= ALL_FOUNTAIN_IDS.length - 1;
  }

  /** 0..1 progress of the current approach leg (1 = arrived at the stop). */
  get legProgress(): number {
    return Math.min(1, this.legElapsed / GARDEN_IDLE_APPROACH_SEC);
  }

  get hasArrived(): boolean {
    return this.legProgress >= 1;
  }

  /** Reset to the very first fountain, procession back at the garden entrance. */
  reset(): void {
    this.legIndex = 0;
    this.legElapsed = 0;
  }

  /** Advance to the next fountain's approach leg (after a reveal completes). */
  advanceToNextFountain(): void {
    this.legIndex = Math.min(ALL_FOUNTAIN_IDS.length - 1, this.legIndex + 1);
    this.legElapsed = 0;
  }

  /** Re-walk the current leg from the start (used by the 'same' replay choice). */
  restartCurrentLeg(): void {
    this.legElapsed = 0;
  }

  /** Advance the walking clock; only meaningful while the king is still
   * approaching (garden-idle). No-op once arrived. */
  update(dt: number): void {
    if (this.legElapsed < GARDEN_IDLE_APPROACH_SEC) {
      this.legElapsed = Math.min(GARDEN_IDLE_APPROACH_SEC, this.legElapsed + dt);
    }
  }
}
