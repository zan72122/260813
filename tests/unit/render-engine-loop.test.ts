import { describe, expect, it, vi } from 'vitest';
import { createEngineLoop, MAX_FRAME_DELTA_MS, type EngineLoopOptions } from '../../src/core/engineLoop';

/**
 * A tiny manually-driven requestAnimationFrame double. Deliberately holds
 * the pending callback in an object property (`this.pending`) rather than
 * a bare reassigned closure variable — TypeScript's control-flow narrowing
 * of a `let` reassigned inside a callback passed across a function-call
 * boundary can (in isolation, reproducible outside this project too)
 * degrade to `never` at the use site; a property on an object sidesteps
 * that inference quirk cleanly.
 */
class FakeScheduler {
  now = 0;
  hidden = false;
  scheduleCount = 0;
  private pending: ((t: number) => void) | null = null;
  private visHandler: (() => void) | undefined;

  raf = (cb: (t: number) => void): number => {
    this.scheduleCount++;
    this.pending = cb;
    return this.scheduleCount;
  };

  cancelRaf = (): void => {
    this.pending = null;
  };

  onVisibilityChange = (handler: () => void): (() => void) => {
    this.visHandler = handler;
    return () => {
      this.visHandler = undefined;
    };
  };

  fireVisibilityChange(): void {
    this.visHandler?.();
  }

  hasPendingFrame(): boolean {
    return this.pending !== null;
  }

  /** Fires the pending RAF callback, if any (consuming it, matching real RAF semantics). */
  fireFrame(): void {
    const cb = this.pending;
    this.pending = null;
    cb?.(this.now);
  }

  options(fixedDt?: number): EngineLoopOptions {
    return {
      ...(fixedDt !== undefined ? { fixedDt } : {}),
      now: () => this.now,
      raf: this.raf,
      cancelRaf: this.cancelRaf,
      isHidden: () => this.hidden,
      onVisibilityChange: this.onVisibilityChange,
    };
  }
}

describe('createEngineLoop — fixedStep mode', () => {
  it('start()/stop() only toggle `running`; nothing self-schedules (no raf/document access needed)', () => {
    const tick = vi.fn();
    const render = vi.fn();
    const loop = createEngineLoop({ tick, render }, { fixedStep: true });
    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    expect(tick).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    loop.stop();
    expect(loop.running).toBe(false);
  });

  it('stepFrames(n) runs exactly n tick+render pairs, each tick with the fixed dt, each render with alpha=1', () => {
    const dts: number[] = [];
    const alphas: number[] = [];
    const loop = createEngineLoop(
      { tick: (dt) => dts.push(dt), render: (alpha) => alphas.push(alpha) },
      { fixedStep: true, fixedDt: 1 / 60 },
    );
    loop.stepFrames(5);
    expect(dts).toHaveLength(5);
    expect(dts.every((dt) => dt === 1 / 60)).toBe(true);
    expect(alphas).toEqual([1, 1, 1, 1, 1]);
  });

  it('stepFrames is deterministic across independent loop instances given the same call sequence', () => {
    const trace = (): number[] => {
      const log: number[] = [];
      const loop = createEngineLoop({ tick: (dt) => log.push(dt), render: () => undefined }, { fixedStep: true });
      loop.stepFrames(10);
      return log;
    };
    expect(trace()).toEqual(trace());
  });

  it('stepFrames is a no-op outside fixedStep mode (real-time mode drives itself)', () => {
    const tick = vi.fn();
    const render = vi.fn();
    const loop = createEngineLoop(
      { tick, render },
      {
        fixedStep: false,
        raf: () => 0,
        cancelRaf: () => undefined,
        now: () => 0,
        isHidden: () => true, // keep it from ever self-scheduling in this test
      },
    );
    loop.stepFrames(3);
    expect(tick).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});

describe('createEngineLoop — real-time (RAF) mode with injected clock/scheduler', () => {
  it('drains the accumulator in fixed dt steps and renders once per RAF callback with the correct interpolation alpha', () => {
    const sched = new FakeScheduler();
    const ticks: number[] = [];
    const alphas: number[] = [];
    const loop = createEngineLoop({ tick: (dt) => ticks.push(dt), render: (alpha) => alphas.push(alpha) }, sched.options(1 / 60));

    loop.start();
    expect(sched.hasPendingFrame()).toBe(true);

    // Advance by exactly 3 fixed steps worth of time (50ms) — expect exactly 3 ticks, alpha ~0.
    sched.now += 3 * (1000 / 60);
    sched.fireFrame();
    expect(ticks).toHaveLength(3);
    expect(alphas[0]).toBeCloseTo(0, 5);

    // Advance by 1.5 steps — 1 more tick, alpha ~0.5.
    sched.now += 1.5 * (1000 / 60);
    sched.fireFrame();
    expect(ticks).toHaveLength(4);
    expect(alphas[1]).toBeCloseTo(0.5, 1);

    loop.stop();
  });

  it('clamps an enormous real-time delta (e.g. after a debugger pause) instead of a catch-up burst of ticks', () => {
    const sched = new FakeScheduler();
    const ticks: number[] = [];
    const loop = createEngineLoop({ tick: (dt) => ticks.push(dt), render: () => undefined }, sched.options(1 / 60));

    loop.start();
    sched.now += 10_000; // 10 real seconds
    sched.fireFrame();
    // Clamped to MAX_FRAME_DELTA_MS worth of ticks, not 10s/dt (~600) worth.
    expect(ticks.length).toBeLessThanOrEqual(Math.ceil(MAX_FRAME_DELTA_MS / (1000 / 60)) + 1);
    expect(ticks.length).toBeGreaterThan(0);
    loop.stop();
  });

  it('hidden => does not self-schedule the next frame (RAF stops, accumulator frozen)', () => {
    const sched = new FakeScheduler();
    const loop = createEngineLoop({ tick: () => undefined, render: () => undefined }, sched.options());

    loop.start();
    expect(sched.scheduleCount).toBe(1);
    sched.hidden = true;
    sched.fireFrame(); // this frame bails immediately because isHidden() is now true
    expect(sched.scheduleCount).toBe(1); // no further scheduling while hidden
    loop.stop();
  });

  it('resuming from hidden resets the clock baseline (no giant catch-up tick burst) and resumes scheduling', () => {
    const sched = new FakeScheduler();
    const ticks: number[] = [];
    const loop = createEngineLoop({ tick: (dt) => ticks.push(dt), render: () => undefined }, sched.options(1 / 60));

    loop.start();
    sched.hidden = true;
    sched.now += 8_000; // 8 real seconds pass while hidden (small enough to avoid float-precision noise at the assertion boundary below)
    sched.fireVisibilityChange(); // hidden->still hidden path: just cancels; but simulate the visibility event firing on hide too
    sched.hidden = false;
    sched.fireVisibilityChange(); // now visible: should reset baseline and reschedule, not replay 8s of ticks
    expect(sched.hasPendingFrame()).toBe(true);
    sched.now += 2 * (1000 / 60); // a little over one fixed step after resuming
    sched.fireFrame();
    // The key assertion: a handful of steps (matching the ~2 real steps elapsed since resuming),
    // NOT the ~480 steps an 8-second catch-up burst would have produced had the hidden interval
    // been replayed instead of discarded.
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    expect(ticks.length).toBeLessThanOrEqual(3);
    loop.stop();
  });
});
