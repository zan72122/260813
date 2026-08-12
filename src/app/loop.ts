// src/app/loop.ts
// Single requestAnimationFrame loop with delta time. Guards against double-start.
// Owned by Integrator (src/app/**).

export interface GameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export type LoopCallback = (dt: number, elapsed: number) => void;

const MAX_DT = 1 / 15; // clamp huge deltas (tab backgrounded, debugger pause, etc.)

export function createGameLoop(callback: LoopCallback): GameLoop {
  let rafHandle: number | null = null;
  let lastTime: number | null = null;
  let elapsed = 0;

  function tick(now: number): void {
    if (rafHandle === null) return; // stopped mid-frame
    if (lastTime === null) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, MAX_DT);
    lastTime = now;
    elapsed += dt;
    callback(dt, elapsed);
    rafHandle = requestAnimationFrame(tick);
  }

  return {
    start(): void {
      if (rafHandle !== null) return; // already running — guard double-start
      lastTime = null;
      rafHandle = requestAnimationFrame(tick);
    },
    stop(): void {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
    },
    get running(): boolean {
      return rafHandle !== null;
    },
  };
}
