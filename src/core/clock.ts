import type { GameClock } from "./types";

class Clock implements GameClock {
  timeScale = 1;
  private elapsedSec = 0;
  private tickListeners: Set<(dt: number) => void> = new Set();

  get elapsed(): number {
    return this.elapsedSec;
  }

  tick(rawDeltaSeconds: number): number {
    const clampedRaw = Math.max(0, rawDeltaSeconds);
    const dt = clampedRaw * this.timeScale;
    this.elapsedSec += dt;
    for (const cb of Array.from(this.tickListeners)) {
      cb(dt);
    }
    return dt;
  }

  onTick(cb: (dt: number) => void): () => void {
    this.tickListeners.add(cb);
    return () => {
      this.tickListeners.delete(cb);
    };
  }
}

export function createClock(): GameClock {
  return new Clock();
}
