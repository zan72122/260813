// src/game/internalLoop.ts
// Tiny guarded requestAnimationFrame loop shared by registerGame/registerScenes
// /registerCamera. Each of the three register*(ctx) entry points is a void
// function per docs/CONTRACTS.md wiring conventions — nothing gets wired into
// main.ts — so each one owns ticking its own per-frame update via this helper.
// Guarded because our colocated unit tests run under vitest's Node
// environment, where requestAnimationFrame does not exist: in that case the
// loop simply never starts, and tests drive update(dt) manually instead.

export type InternalLoopCallback = (dt: number, elapsed: number) => void;

export interface InternalLoop {
  stop(): void;
}

const MAX_DT = 1 / 15;

export function startInternalLoop(callback: InternalLoopCallback): InternalLoop {
  if (typeof requestAnimationFrame === 'undefined') {
    return { stop: () => {} };
  }

  let handle: number | null = null;
  let last: number | null = null;
  let elapsed = 0;

  const tick = (now: number): void => {
    if (handle === null) return;
    if (last === null) last = now;
    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    elapsed += dt;
    callback(dt, elapsed);
    handle = requestAnimationFrame(tick);
  };

  handle = requestAnimationFrame(tick);

  return {
    stop(): void {
      if (handle !== null) {
        cancelAnimationFrame(handle);
        handle = null;
      }
    },
  };
}
