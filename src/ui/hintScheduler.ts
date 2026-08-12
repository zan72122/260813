/**
 * Pure inactivity-hint scheduler. Polls an injectable clock on an interval
 * and fires `onPulseStart`/`onDemoStart`/`onClear` callbacks at the
 * PRODUCT_SPEC-mandated 3s/5s idle thresholds — see
 * docs/PRODUCT_SPEC.md "無操作3秒で...pulse...5秒で...demonstration".
 *
 * Deliberately framework/DOM-free: it knows nothing about SVG, CSS, or
 * HandleRegistry directly — callers pass a `getActiveHandle()` accessor and
 * receive plain `HandleInfo` values back in the callbacks, which keeps this
 * module unit-testable with Vitest fake timers under the `node` test
 * environment (no DOM required) — see tests/unit/ui-hint-scheduler.test.ts.
 * `hintOverlay.ts` is the thin DOM-consuming wrapper around this class.
 */
import type { HandleInfo } from '../contracts/handles';
import { TIMING } from '../contracts/constants';
import type { HintDemoKind } from './svg';

export interface HintSchedulerOptions {
  /** Returns the currently-active interactive handle, or undefined if nothing is awaiting input right now. */
  getActiveHandle: () => HandleInfo | undefined;
  /** Maps a handle to which demonstration gesture to show at the 5s mark. */
  demoKindForHandle: (handle: HandleInfo) => HintDemoKind;
  onPulseStart: (handle: HandleInfo) => void;
  onDemoStart: (handle: HandleInfo, kind: HintDemoKind) => void;
  onClear: () => void;
  /** Injectable clock — defaults to `performance.now`. Tests inject a fake. */
  now?: () => number;
  /** ms of idle time before the pulse hint (default TIMING.hintPulseMs). */
  pulseDelayMs?: number;
  /** ms of idle time before the demonstration hand (default TIMING.hintDemoMs). */
  demoDelayMs?: number;
  /** Poll interval in ms (default 100). */
  pollIntervalMs?: number;
}

export type HintStage = 'none' | 'pulse' | 'demo';

/**
 * Timer-driven scheduler. `dispose()` must be called to stop its internal
 * interval; everything else is plain synchronous state.
 */
export class HintScheduler {
  private idleSince: number;
  private stage: HintStage = 'none';
  private paused = false;
  private pausedAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;
  private readonly pulseDelayMs: number;
  private readonly demoDelayMs: number;

  constructor(private readonly opts: HintSchedulerOptions) {
    this.now = opts.now ?? (() => performance.now());
    this.pulseDelayMs = opts.pulseDelayMs ?? TIMING.hintPulseMs;
    this.demoDelayMs = opts.demoDelayMs ?? TIMING.hintDemoMs;
    this.idleSince = this.now();
    this.timer = setInterval(() => {
      this.poll();
    }, opts.pollIntervalMs ?? 100);
  }

  /** Current stage — exposed mainly for tests/debugging; DOM callers should react to the callbacks instead. */
  currentStage(): HintStage {
    return this.stage;
  }

  private poll(): void {
    if (this.paused) return;
    const handle = this.opts.getActiveHandle();
    if (!handle?.active) return;

    const idle = this.now() - this.idleSince;
    if (idle >= this.demoDelayMs && this.stage !== 'demo') {
      this.stage = 'demo';
      this.opts.onDemoStart(handle, this.opts.demoKindForHandle(handle));
    } else if (idle >= this.pulseDelayMs && this.stage === 'none') {
      this.stage = 'pulse';
      this.opts.onPulseStart(handle);
    }
  }

  /** Call on any pointerdown — clears any active hint instantly and resets the idle clock. */
  registerInput(): void {
    this.idleSince = this.now();
    if (this.stage !== 'none') {
      this.stage = 'none';
      this.opts.onClear();
    }
  }

  /** Call whenever the active leg-phase (and therefore the active handle) changes — timers restart for the new phase. */
  resetForPhase(): void {
    this.registerInput();
  }

  /** Freezes the idle clock (e.g. while the game is paused) — no hint fires until `resume()`. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = this.now();
  }

  /** Resumes the idle clock, discounting the time spent paused so a pause never itself triggers a hint. */
  resume(): void {
    if (!this.paused) return;
    const pausedDuration = this.now() - this.pausedAt;
    this.idleSince += pausedDuration;
    this.paused = false;
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
