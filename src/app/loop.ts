/**
 * Fixed-step simulation loop: accumulator pattern, render interpolation
 * alpha. Pure — no DOM, no RAF, no wall-clock reads — so it is trivially
 * unit-testable and reusable for both the normal (wall-clock-driven) mode
 * and deterministic mode (`step(n)` only). ARCHITECTURE_CONTRACT
 * "Simulation model".
 */

export interface FixedStepLoopOptions {
  /** Fixed step size, seconds. */
  readonly dt: number;
  /** Advance the simulation by exactly one fixed step. */
  readonly step: (dt: number) => void;
  /** Render/interpolation callback, invoked once per `advance`/`stepExact` call. */
  readonly render?: (alpha: number) => void;
  /**
   * Max fixed steps to run per `advance()` call before dropping the
   * remainder (spiral-of-death guard after a long stall, e.g. tab switch).
   * Default 5.
   */
  readonly maxStepsPerAdvance?: number;
}

/** Default spiral-of-death guard: at most this many fixed steps per `advance()`. */
const DEFAULT_MAX_STEPS_PER_ADVANCE = 5;

export class FixedStepLoop {
  private readonly dt: number;
  private readonly stepFn: (dt: number) => void;
  private readonly renderFn: ((alpha: number) => void) | undefined;
  private readonly maxStepsPerAdvance: number;
  private accumulator = 0;
  private totalSteps = 0;

  constructor(options: FixedStepLoopOptions) {
    if (!(options.dt > 0)) {
      throw new RangeError('FixedStepLoop: dt must be a positive number');
    }
    this.dt = options.dt;
    this.stepFn = options.step;
    this.renderFn = options.render;
    this.maxStepsPerAdvance = options.maxStepsPerAdvance ?? DEFAULT_MAX_STEPS_PER_ADVANCE;
  }

  /** Fixed step size, seconds. */
  get stepSize(): number {
    return this.dt;
  }

  /** Total number of fixed steps run since construction or the last `reset()`. */
  get steps(): number {
    return this.totalSteps;
  }

  /** Render interpolation factor for the current accumulator remainder, `[0, 1)`. */
  get alpha(): number {
    return this.accumulator / this.dt;
  }

  /**
   * Consume a wall-clock frame delta (seconds): run as many fixed steps as
   * fit, then invoke `render(alpha)` once with the leftover fraction. A
   * delta of 0 (or smaller than `dt`) runs zero steps but still renders,
   * which is what keeps interpolation smooth between fixed steps.
   */
  advance(frameDeltaSeconds: number): void {
    if (!(frameDeltaSeconds >= 0)) {
      throw new RangeError('FixedStepLoop.advance: frameDeltaSeconds must be >= 0');
    }
    this.accumulator += frameDeltaSeconds;
    let ranSteps = 0;
    while (this.accumulator >= this.dt && ranSteps < this.maxStepsPerAdvance) {
      this.stepFn(this.dt);
      this.totalSteps += 1;
      this.accumulator -= this.dt;
      ranSteps += 1;
    }
    if (ranSteps >= this.maxStepsPerAdvance) {
      // Stalled far enough behind that catching up would spiral — drop the
      // remainder instead of ever-growing step bursts.
      this.accumulator = 0;
    }
    this.renderFn?.(this.alpha);
  }

  /**
   * Deterministic mode: advance exactly `n` fixed steps regardless of any
   * wall-clock delta, then render once at `alpha = 1` (fully settled).
   */
  stepExact(n: number): void {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError('FixedStepLoop.stepExact: n must be a non-negative integer');
    }
    for (let i = 0; i < n; i += 1) {
      this.stepFn(this.dt);
      this.totalSteps += 1;
    }
    this.accumulator = 0;
    this.renderFn?.(1);
  }

  /** Reset the accumulator and step counter (does not touch simulation state). */
  reset(): void {
    this.accumulator = 0;
    this.totalSteps = 0;
  }
}
