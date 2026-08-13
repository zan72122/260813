/**
 * GameController — the stateful runtime that wraps the pure, frozen
 * contracts (`stateMachine.transition`, `legModel` via the state machine,
 * `rng.legScenario` indirectly via createGameState) and turns them into:
 *   - a tick-driven loop that integrates continuous input (the sand gate)
 *     and paces cinematics (establish hold, leg intro, orbit, snap slow-mo,
 *     finale reveal beats) with internal timers instead of requiring the
 *     player to read anything;
 *   - a complete, correctly-ordered stream of `GameEvent`s (events.ts) for
 *     every observable change, emitted on the shared `EventBus`;
 *   - `CameraCue`s (camera.ts) choreographed to match ARCHITECTURE_CONTRACT's
 *     cause/effect-same-frame rule and the per-phase shot list.
 *
 * Design summary (see also src/game/index.ts's `createGame` JSDoc for the
 * external contract):
 *
 * 1. `applyIntent` never mutates gameplay state itself — it only records
 *    the caller's intent (queues discrete intents; for the one continuous
 *    intent, `gateSet`, it just stores the latest lever position). ALL
 *    actual state mutation and event emission happens inside `tick(dt)`,
 *    matching "applyIntent(intent) queueing processed on tick" — this keeps
 *    a single deterministic processing point per frame and means replaying
 *    an identical (intent, tick) call script is bit-for-bit reproducible
 *    (see tests/unit/game-controller.test.ts determinism suite).
 *
 * 2. Every event is derived by diffing the GameState immediately before and
 *    after each individual pure `transition()` call — never by tracking
 *    parallel "have I already told everyone about X" flags — which makes
 *    the diff automatically correct across `replay()` too: replay resets
 *    GameState wholesale, so the very next diff naturally sees legs go from
 *    (locked, error 0) back to (unlocked, error ~20+), and every
 *    crossing-detector (nearTarget, magnifierShown, wedgeSeated,
 *    sandDepleted) is a plain `prev` vs `next` comparison that just works
 *    without any manual reset bookkeeping. The only genuinely
 *    controller-local memory is the sand gate's last-known lever position
 *    (gateSet is a lever *position*, not a discrete action, so it cannot be
 *    derived from GameState alone) and the single in-flight cinematic timer
 *    — both are explicitly reset on every `replay()`.
 *
 * 3. Cinematic beats that the pure reducer collapses into a single atomic
 *    transition (e.g. jack→wedge "snap" per stateMachine.ts doc §3, or a
 *    leg-lock's cascade straight into the next leg's `intro` per §4) are
 *    NOT observable as their own resting GameState — so this controller
 *    layers its own internal `pending` cinematic timer on top to give them
 *    real screen time (camera cue held, `snapped`/`revealBeat`/etc. paced
 *    out) without ever blocking or altering the underlying pure state. An
 *    `advance` intent arriving while a cinematic is pending simply zeroes
 *    that timer (fires it on this tick instead of forwarding the intent to
 *    `transition()` a second time) — "tap = advance sooner", never a double
 *    application. An `advance` intent arriving with no cinematic pending
 *    forwards straight to `transition()`, which is always a safe no-op
 *    outside boot/establish/intro/finalReveal (see stateMachine.ts §9).
 *    This is also why boot never gets an internal timer: leaving `boot`
 *    should correspond to a real audio-unlock gesture, not an autonomous
 *    clock, so it only ever advances via an explicit `advance` intent.
 *
 *    EXCEPTION — `finalReveal` is never mash-skippable (review round 1,
 *    F1). PRODUCT_SPEC names the four-beat reveal chain (revealBeat×4 →
 *    settle → pullback) the single biggest reward in the whole game ("四本
 *    目完成が最大の報酬"); the "tap = advance sooner" shortcut above exists
 *    for *waiting* cinematics (establish hold, leg intro, orbit) a child
 *    may want to hurry past, not for the payoff itself. So while
 *    `state.phase === 'finalReveal'`, a queued `advance` intent is dropped
 *    silently — never punished, never forwarded to `transition()` (which
 *    would otherwise jump straight to `complete` per stateMachine.ts's
 *    finalReveal branch), and the in-flight `pending` timer (if any) is
 *    left counting down untouched. Every beat/settle/pullback still fires,
 *    always at its scheduled logical time, driven only by `tick(dt)` — see
 *    tests/unit/game-controller.test.ts's "finalReveal is not
 *    mash-skippable" suite.
 */

import type { EventBus, GameEvent } from '../contracts/events';
import type { CameraCue } from '../contracts/camera';
import type { Intent } from '../contracts/intents';
import type { GamePhase, GameState, LegId, LegPhase } from '../contracts/types';
import { LEG_ORDER } from '../contracts/types';
import { ASSIST_RADIUS, WEDGE_SEAT_THRESHOLD } from '../contracts/constants';
import { createGameState, setPaused, transition } from '../contracts/stateMachine';
import {
  ESTABLISH_HOLD_MS,
  LEG_INTRO_HOLD_MS,
  ORBIT_HOLD_MS,
  PULLBACK_HOLD_MS,
  REDUCED_MOTION_SCALE,
  REVEAL_BEAT_INTERVAL_MS,
  REVEAL_SETTLE_HOLD_MS,
  SNAP_HOLD_MS,
} from './constants';
import { resolveSeed } from './seed';

export interface GameControllerOptions {
  /** The shared EventBus every owner subscribes to. Required — this is the only output channel. */
  bus: EventBus;
  /** Explicit seed; otherwise resolved from `?seed=` or drawn randomly once (see seed.ts). */
  seed?: number;
  /** Shortens every internal cinematic hold (PRODUCT_SPEC prefers-reduced-motion). Default false. */
  reducedMotion?: boolean;
  /** Initial sound-on state. Default true. */
  soundOn?: boolean;
}

export interface GameController {
  /** Advances logic by `dt` seconds: drains queued intents, integrates the held sand gate, and paces cinematics. */
  tick(dt: number): void;
  /** Records one Intent for processing on the next `tick()`. Never mutates state synchronously. */
  applyIntent(intent: Intent): void;
  /** Deep copy of the current GameState — safe for callers to hold onto without aliasing live state. */
  getState(): GameState;
  /** Freezes gameplay logic (subsequent `tick()` calls are no-ops) without touching the renderer. */
  pause(): void;
  /** Resumes gameplay logic after `pause()`. */
  resume(): void;
  /** Sets the sound-on preference, emitting `soundToggled` on an actual change. */
  setSound(on: boolean): void;
  /** Requests a same-seed reset, processed on the next `tick()` (same path as `applyIntent({type:'replay'})`). */
  replay(): void;
  /** The seed this run actually started with (explicit, URL-derived, or randomly drawn — see seed.ts). */
  readonly seed: number;
}

interface PendingCinematic {
  remainingMs: number;
  onComplete: () => void;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** The stateful GameController factory. See src/game/index.ts's `createGame` for the documented public entry point. */
export function createGameController(options: GameControllerOptions): GameController {
  const { bus } = options;
  const reducedMotion = options.reducedMotion ?? false;
  const initialSeed = resolveSeed(options.seed);

  let state: GameState = createGameState(initialSeed, {
    soundOn: options.soundOn ?? true,
    reducedMotion,
  });

  const intentQueue: Intent[] = [];
  /** Latest known sand-gate lever position (0..1) — a level, not an event; see module doc §1/§2. */
  let currentGateOpen = 0;
  /** Last `open` value an actual `gateOpened` event was emitted for, so we only emit on real changes. */
  let lastGateOpen = 0;
  /** Whether the previous sand-integration step had a positive flow rate, so we emit exactly one `rate:0` on stop. */
  let sandWasFlowing = false;
  /** The single in-flight internal cinematic timer, if any — see module doc §3. */
  let pending: PendingCinematic | null = null;

  function scaledMs(base: number): number {
    return reducedMotion ? Math.max(1, base * REDUCED_MOTION_SCALE) : base;
  }

  function scheduleCinematic(durationMs: number, onComplete: () => void): void {
    pending = { remainingMs: scaledMs(durationMs), onComplete };
  }

  function emit(e: GameEvent): void {
    bus.emit(e);
  }

  function cue(c: CameraCue): void {
    emit({ type: 'cameraCue', cue: c });
  }

  function scheduleRevealBeat(index: 0 | 1 | 2 | 3): void {
    scheduleCinematic(REVEAL_BEAT_INTERVAL_MS, () => {
      emit({ type: 'revealBeat', index });
      if (index < 3) {
        scheduleRevealBeat((index + 1) as 0 | 1 | 2 | 3);
        return;
      }
      scheduleCinematic(REVEAL_SETTLE_HOLD_MS, () => {
        emit({ type: 'settled' });
        cue({ kind: 'pullback' });
        scheduleCinematic(PULLBACK_HOLD_MS, () => {
          processIntent({ type: 'advance' });
        });
      });
    });
  }

  function scheduleLegIntroSequence(leg: LegId, fromEstablish: boolean): void {
    const enterIntroHold = (): void => {
      scheduleCinematic(LEG_INTRO_HOLD_MS, () => {
        processIntent({ type: 'advance' });
      });
    };
    if (fromEstablish) {
      enterIntroHold();
      return;
    }
    scheduleCinematic(ORBIT_HOLD_MS, () => {
      cue({ kind: 'activeLeg', leg });
      enterIntroHold();
    });
  }

  function onLegPhaseEnter(leg: LegId, newPhase: LegPhase, prev: GameState): void {
    switch (newPhase) {
      case 'intro': {
        const fromEstablish = prev.phase === 'establish';
        cue(
          fromEstablish
            ? { kind: 'activeLeg', leg }
            : { kind: 'orbitToNext', from: prev.activeLeg, to: leg },
        );
        scheduleLegIntroSequence(leg, fromEstablish);
        break;
      }
      case 'sand':
        // Gate lever state is per-leg, non-persistent: a fresh leg always
        // starts with the gate logically released, regardless of where the
        // previous leg's lever was left (see module doc §2).
        currentGateOpen = 0;
        lastGateOpen = 0;
        sandWasFlowing = false;
        cue({ kind: 'sandboxCutaway', leg });
        break;
      case 'jack':
        cue({ kind: 'jackCloseup', leg });
        break;
      case 'wedge':
        // The pure reducer already collapsed jack->wedge through an
        // unobservable 'snap' LegPhase (stateMachine.ts doc §3) — this is
        // the one and only place that cinematic beat gets real screen time.
        emit({ type: 'snapped', leg });
        scheduleCinematic(SNAP_HOLD_MS, () => {
          cue({ kind: 'wedge', leg });
        });
        break;
      default:
        break;
    }
  }

  function onGlobalPhaseEnter(phase: GamePhase): void {
    switch (phase) {
      case 'establish':
        cue({ kind: 'establish' });
        scheduleCinematic(ESTABLISH_HOLD_MS, () => {
          processIntent({ type: 'advance' });
        });
        break;
      case 'finalReveal':
        cue({ kind: 'topReveal' });
        scheduleRevealBeat(0);
        break;
      default:
        break;
    }
  }

  function diffAndEmit(prev: GameState, next: GameState): void {
    if (next === prev) return;

    for (const leg of LEG_ORDER) {
      const p = prev.legs[leg];
      const n = next.legs[leg];
      if (p === n) continue;

      if (p.jackExtension !== n.jackExtension) {
        emit({ type: 'jackPumped', leg, stroke: n.jackExtension - p.jackExtension });
      }

      if (p.sandLevel > 0 && n.sandLevel <= 0) {
        emit({ type: 'sandDepleted', leg });
        // Explicit stop signal regardless of gate state — depletion can
        // finish sand flow even while the gate lever is still held open.
        emit({ type: 'sandFlow', leg, rate: 0 });
        sandWasFlowing = false;
      }

      const wasNear = p.alignmentError <= ASSIST_RADIUS;
      const isNear = n.alignmentError <= ASSIST_RADIUS;
      if (!wasNear && isNear) {
        emit({ type: 'nearTarget', leg, error: n.alignmentError });
        cue({ kind: 'alignment', leg });
      }

      if (p.phase !== n.phase) {
        emit({ type: 'legPhaseChanged', leg, legPhase: n.phase });
        onLegPhaseEnter(leg, n.phase, prev);
      }

      const wantMagPrev = p.phase === 'jack' && p.alignmentError <= ASSIST_RADIUS;
      const wantMagNext = n.phase === 'jack' && n.alignmentError <= ASSIST_RADIUS;
      if (wantMagPrev !== wantMagNext) {
        emit({ type: 'magnifierShown', leg, shown: wantMagNext });
      }

      const wasSeated = p.wedgeProgress >= WEDGE_SEAT_THRESHOLD;
      const isSeated = n.wedgeProgress >= WEDGE_SEAT_THRESHOLD;
      if (!wasSeated && isSeated && n.phase === 'wedge') {
        emit({ type: 'wedgeSeated', leg });
      }

      if (!p.locked && n.locked) {
        emit({ type: 'hammered', leg });
        emit({ type: 'legLocked', leg });
      }
    }

    if (prev.phase !== 'finalReveal' && next.phase === 'finalReveal') {
      emit({ type: 'allLegsLocked' });
    }

    if (prev.phase !== next.phase) {
      emit({ type: 'phaseChanged', phase: next.phase });
      onGlobalPhaseEnter(next.phase);
    }
  }

  /** Applies one Intent through the pure reducer and emits every derived event. `dt` matters only to `gateSet`. */
  function processIntent(intent: Intent, dt = 0): void {
    const prev = state;
    const next = transition(prev, { kind: 'intent', intent, dt });
    state = next;

    if (intent.type === 'gateSet') {
      const clamped = clamp01(intent.open);
      if (clamped !== lastGateOpen) {
        emit({ type: 'gateOpened', leg: prev.activeLeg, open: clamped });
        lastGateOpen = clamped;
      }
      const p = prev.legs[prev.activeLeg];
      const n = next.legs[prev.activeLeg];
      const rate = dt > 0 ? Math.max(0, (p.legOffsetY - n.legOffsetY) / dt) : 0;
      if (rate > 0 || sandWasFlowing) {
        emit({ type: 'sandFlow', leg: prev.activeLeg, rate });
        sandWasFlowing = rate > 0;
      }
    }

    diffAndEmit(prev, next);
  }

  function handleReplay(): void {
    emit({ type: 'replayRequested' });
    pending = null;
    currentGateOpen = 0;
    lastGateOpen = 0;
    sandWasFlowing = false;
    const prev = state;
    const next = transition(prev, { kind: 'intent', intent: { type: 'replay' }, dt: 0 });
    state = next;
    // diffAndEmit's own phase-diff branch reschedules the establish
    // cinematic whenever the phase actually changed (the overwhelmingly
    // common case — replay always resets to `establish`). The only way to
    // reach `establish` with no phase diff is calling replay() again while
    // already sitting in `establish` with nothing else changed; guard that
    // edge case explicitly (via this plain boolean, not `pending`'s runtime
    // nullity) so the autonomous timer is never silently lost — a manual
    // `advance` would still work either way, but this keeps the hands-off
    // pacing intact.
    const phaseDiffAlreadyHandledEstablish = prev.phase !== next.phase;
    diffAndEmit(prev, next);
    if (!phaseDiffAlreadyHandledEstablish && next.phase === 'establish') {
      onGlobalPhaseEnter('establish');
    }
  }

  return {
    seed: initialSeed,

    tick(dt: number): void {
      if (state.paused) return;

      // F2 (review round 1): `elapsed` bookkeeping. contracts/stateMachine.ts's
      // `transition()` adds `dt` to `elapsed` on EVERY `{kind:'intent', ...}`
      // action with dt>0 (its `withElapsed` helper — frozen, cannot change),
      // not only on a `{kind:'tick', dt}` action. This controller calls
      // `transition()` once per queued intent, once more for the sand-gate
      // integration below, AND once for the trailing tick action, so passing
      // the same real `dt` to all of them would multi-count elapsed up to
      // (queued.length + 2)x real time in a single `tick(dt)` call — worst
      // during the sand phase, where a mashing/heavy-intent-traffic frame
      // could have several queued intents plus the gate call. `gateSet` is
      // the one intent that legitimately needs the real `dt` passed through
      // (legModel.sandStep integrates physics by it), so we cannot just zero
      // it there — instead we snapshot `elapsed` here and force it back to
      // exactly `elapsedBaseline + dt` at the very end of this function,
      // regardless of how many intermediate `transition()` calls happened or
      // what dt each one saw. `replay` resets `elapsed` to 0 mid-tick (via a
      // fresh `createGameState`), so the baseline is re-snapshotted right
      // after it fires too, keeping "exactly dt of logical time passes per
      // real tick(dt) call" true across a same-tick replay as well.
      let elapsedBaseline = state.elapsed;

      const queued = intentQueue.splice(0, intentQueue.length);
      for (const intent of queued) {
        if (intent.type === 'replay') {
          handleReplay();
          elapsedBaseline = state.elapsed;
          continue;
        }
        if (intent.type === 'advance' && state.phase === 'finalReveal') {
          // finalReveal's reveal-beat/settle/pullback chain is the game's
          // biggest reward and deliberately NOT mash-skippable (module doc
          // §3 EXCEPTION, review round 1 F1) — silently dropped, never
          // punished, never forwarded to transition() or used to zero the
          // pending timer below.
          continue;
        }
        if (intent.type === 'advance' && pending) {
          // Tap-to-skip: fast-forward the current cinematic instead of also
          // forwarding this intent to transition() (module doc §3).
          pending.remainingMs = 0;
          continue;
        }
        processIntent(intent, dt);
      }

      if (state.legs[state.activeLeg].phase === 'sand') {
        processIntent({ type: 'gateSet', open: currentGateOpen }, dt);
      }

      if (pending) {
        pending.remainingMs -= dt * 1000;
        if (pending.remainingMs <= 0) {
          const cb = pending.onComplete;
          pending = null;
          cb();
        }
      }

      state = transition(state, { kind: 'tick', dt });

      // See this function's opening comment (F2): correct the net figure so
      // exactly `dt` of logical time has passed since `elapsedBaseline`,
      // undoing whatever multiple of `dt` the intent-processing calls above
      // actually accumulated into `state.elapsed` via stateMachine.ts's
      // `withElapsed`.
      if (dt > 0) {
        state = { ...state, elapsed: elapsedBaseline + dt };
      }
    },

    applyIntent(intent: Intent): void {
      if (intent.type === 'gateSet') {
        currentGateOpen = clamp01(intent.open);
        return;
      }
      intentQueue.push(intent);
    },

    getState(): GameState {
      return structuredClone(state);
    },

    pause(): void {
      const next = setPaused(state, true);
      if (next !== state) {
        state = next;
        emit({ type: 'pauseChanged', paused: true });
      }
    },

    resume(): void {
      const next = setPaused(state, false);
      if (next !== state) {
        state = next;
        emit({ type: 'pauseChanged', paused: false });
      }
    },

    setSound(on: boolean): void {
      if (state.soundOn !== on) {
        state = { ...state, soundOn: on };
        emit({ type: 'soundToggled', on });
      }
    },

    replay(): void {
      intentQueue.push({ type: 'replay' });
    },
  };
}
