/**
 * Fixed-timestep engine loop — ARCHITECTURE_CONTRACT.md § Engine loop:
 * "固定タイムステップ(1/60s)accumulator + 描画補間。`fixedStep=1`時はRAF自走せず
 * TestApi.step()のみで進む。hidden時はRAF停止しaccumulatorを凍結(復帰時に巻き戻しなし)。"
 *
 * Two independent axes of behavior:
 * - normal mode: `start()` self-schedules requestAnimationFrame, accumulates
 *   wall-clock delta, drains it in fixed `tick(dt)` steps, then calls
 *   `render(alpha)` once with the leftover fractional-step interpolation
 *   factor.
 * - fixedStep mode (constructed with `fixedStep: true`): `start()`/`stop()`
 *   only toggle the `running` flag — nothing self-schedules. The caller
 *   (TestApi.step, wired by the Wave 4 integrator) drives everything
 *   through `stepFrames(n)`, which runs exactly `n` whole `tick+render`
 *   steps synchronously. This is what makes Playwright's `drive.*` +
 *   `step()` path deterministic.
 *
 * All browser globals (`requestAnimationFrame`, `document.hidden`,
 * `performance.now`) are injected with lazily-evaluated defaults so this
 * module has zero *load-time* DOM dependency — importing it (and exercising
 * the fixedStep path) is safe in a DOM-free unit test environment.
 */

/** Defensive clamp on a single real-time frame delta (ms) to avoid a spiral-of-death catch-up burst after e.g. a debugger pause. */
export const MAX_FRAME_DELTA_MS = 250;

export interface EngineLoopCallbacks {
  /** One fixed logical step. `dt` is always exactly the configured fixed timestep. */
  tick(dt: number): void;
  /** Render with interpolation alpha in [0,1]: 0 = previous logical state, 1 = current. */
  render(alpha: number): void;
}

export interface EngineLoopOptions {
  /** Fixed logical timestep, seconds. Default 1/60. */
  fixedDt?: number;
  /** fixedStep mode: disables RAF self-run; only stepFrames() advances time. Default false. */
  fixedStep?: boolean;
  /** Clock source, ms. Default performance.now (evaluated lazily, not at construction). */
  now?: () => number;
  /** requestAnimationFrame source, injectable for tests. Default window.requestAnimationFrame. */
  raf?: (cb: (t: number) => void) => number;
  /** cancelAnimationFrame source. Default window.cancelAnimationFrame. */
  cancelRaf?: (handle: number) => void;
  /** Hidden-tab predicate. Default () => document.hidden. */
  isHidden?: () => boolean;
  /** Visibility-change subscription, injectable for tests. Default document.addEventListener('visibilitychange', ...). */
  onVisibilityChange?: (handler: () => void) => () => void;
}

export interface EngineLoop {
  start(): void;
  stop(): void;
  /** fixedStep mode: advance exactly `frames` whole tick+render steps synchronously. No-op (defensively) outside fixedStep mode. */
  stepFrames(frames: number): void;
  readonly running: boolean;
  readonly fixedDt: number;
}

function defaultNow(): number {
  return performance.now();
}

function defaultRaf(cb: (t: number) => void): number {
  return requestAnimationFrame(cb);
}

function defaultCancelRaf(handle: number): void {
  cancelAnimationFrame(handle);
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function defaultOnVisibilityChange(handler: () => void): () => void {
  document.addEventListener('visibilitychange', handler);
  return () => {
    document.removeEventListener('visibilitychange', handler);
  };
}

class EngineLoopImpl implements EngineLoop {
  readonly fixedDt: number;
  private readonly isFixedStepMode: boolean;
  private readonly now: () => number;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly cancelRaf: (handle: number) => void;
  private readonly isHidden: () => boolean;
  private readonly onVisibilityChange: (handler: () => void) => () => void;

  private accumulator = 0;
  private lastTimeMs = 0;
  private rafHandle: number | null = null;
  private unsubscribeVisibility: (() => void) | null = null;
  private _running = false;

  constructor(
    private readonly callbacks: EngineLoopCallbacks,
    opts: EngineLoopOptions,
  ) {
    this.fixedDt = opts.fixedDt ?? 1 / 60;
    this.isFixedStepMode = opts.fixedStep ?? false;
    this.now = opts.now ?? defaultNow;
    this.raf = opts.raf ?? defaultRaf;
    this.cancelRaf = opts.cancelRaf ?? defaultCancelRaf;
    this.isHidden = opts.isHidden ?? defaultIsHidden;
    this.onVisibilityChange = opts.onVisibilityChange ?? defaultOnVisibilityChange;
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    if (this.isFixedStepMode) return; // no self-run — see module doc.

    this.lastTimeMs = this.now();
    this.accumulator = 0;
    this.unsubscribeVisibility = this.onVisibilityChange(this.handleVisibilityChange);
    this.scheduleNext();
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this.rafHandle !== null) {
      this.cancelRaf(this.rafHandle);
      this.rafHandle = null;
    }
    if (this.unsubscribeVisibility) {
      this.unsubscribeVisibility();
      this.unsubscribeVisibility = null;
    }
  }

  stepFrames(frames: number): void {
    if (!this.isFixedStepMode) return; // defensive — real-time mode drives itself via RAF.
    for (let i = 0; i < frames; i++) {
      this.callbacks.tick(this.fixedDt);
      this.callbacks.render(1);
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (!this._running || this.isFixedStepMode) return;
    if (this.isHidden()) {
      // RAF stops itself (browsers already suppress it in hidden tabs); we
      // additionally cancel any in-flight handle so no queued frame can
      // sneak a tick/render through, and freeze the accumulator by simply
      // not touching it again until we resume.
      if (this.rafHandle !== null) {
        this.cancelRaf(this.rafHandle);
        this.rafHandle = null;
      }
      return;
    }
    // Resuming: reset the clock baseline so the hidden interval is not
    // replayed as a giant catch-up delta ("復帰時に巻き戻しなし").
    this.lastTimeMs = this.now();
    this.accumulator = 0;
    this.scheduleNext();
  };

  private scheduleNext(): void {
    if (!this._running || this.isFixedStepMode) return;
    if (this.isHidden()) return; // do not self-schedule while hidden.
    this.rafHandle = this.raf(this.frameHandler);
  }

  private readonly frameHandler = (): void => {
    this.rafHandle = null;
    if (!this._running || this.isHidden()) return;

    const nowMs = this.now();
    let deltaMs = nowMs - this.lastTimeMs;
    this.lastTimeMs = nowMs;
    deltaMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);

    this.accumulator += deltaMs / 1000;
    while (this.accumulator >= this.fixedDt) {
      this.callbacks.tick(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    const alpha = this.accumulator / this.fixedDt;
    this.callbacks.render(alpha);
    this.scheduleNext();
  };
}

/** Creates an EngineLoop. See module doc comment for the two operating modes. */
export function createEngineLoop(callbacks: EngineLoopCallbacks, opts: EngineLoopOptions = {}): EngineLoop {
  return new EngineLoopImpl(callbacks, opts);
}
