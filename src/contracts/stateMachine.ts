/**
 * Pure global phase transition function. `transition(state, action)` is the
 * single authority for how GameState evolves; ARCHITECTURE_CONTRACT.md
 * names this module's responsibility ("game state machineの骨格") but does
 * not pin an exact function signature the way types.ts/events.ts/intents.ts
 * do, so the following choices are Wave 2 design decisions, documented here
 * for Wave 3 (Gameplay owner) and reviewers:
 *
 * 1. Time model — `GameAction` has two kinds: `{kind:'intent', intent, dt}`
 *    for discrete/continuous user input, and `{kind:'tick', dt}` for a pure
 *    passage-of-time step with no input. Only `gateSet` actually consumes
 *    `dt` (to integrate legModel.sandStep); every other intent is a
 *    discrete, dt-independent event. `dt` defaults to FIXED_DT when a
 *    caller omits it on an intent action. This keeps the reducer a pure
 *    function of its explicit arguments — no wall clock, no closures — so
 *    it needs no internal timers for cinematics; scripted cinematic
 *    durations (snap slow-mo, orbit, reveal beats — TIMING in constants.ts)
 *    are a render/UX concern layered on top of the *events* this module's
 *    caller derives from before/after state diffs, not on GameState itself.
 *
 * 2. Per-leg scenario constants (initialOffset/sandUndershoot/pumpGain) are
 *    recomputed on demand via `legScenario(state.seed, leg)` (pure,
 *    deterministic — see rng.ts) rather than stored in GameState, per the
 *    design note at the top of legModel.ts.
 *
 * 3. "自動snap→wedgeへ" (invariant 4) is implemented as a same-call
 *    cascade: the jackStroke (or gateSet, defensively) that first crosses
 *    into SNAP_TOLERANCE immediately finalizes via legModel.snap and moves
 *    the leg straight into the 'wedge' LegPhase. 'snap' remains a valid,
 *    meaningful LegPhase value (a caller diffing state transitions can
 *    still observe it was passed through), it is just not a state the pure
 *    reducer parks in waiting for another intent — nothing in the contract
 *    requires a user action to leave a purely cinematic beat.
 *
 * 4. Locking the 4th leg transitions directly to 'finalReveal' in the same
 *    call (invariant 6: never before all 4 are locked, and nothing in the
 *    contract requires an extra tap to *arrive* at finalReveal — leaving it
 *    is what 'advance' is for). Locking a non-final leg advances
 *    `activeLeg` to the next unlocked leg in LEG_ORDER and seeds its
 *    LegPhase to 'intro'.
 *
 * 5. `pause`/`resume` is not an Intent (intents.ts has no such member — it
 *    is a system/UI action, not a gameplay gesture) — it is a separate pure
 *    helper, `setPaused`. While `state.paused` is true, `transition` is a
 *    total no-op (returns the same reference) for every action; unpausing
 *    only ever happens through `setPaused`. This trivially satisfies
 *    invariant 7 (pause/resume never loses state) since no gameplay field
 *    is ever touched while paused.
 *
 * 6. `replay` fully resets to `phase:'establish'` (boot/audio-unlock are
 *    one-time session concerns, not re-run every replay) with a fresh
 *    `createLegState(seed, leg)` for all four legs — deterministic (same
 *    seed ⇒ identical legs) per invariant 8. `soundOn`/`reducedMotion` (user
 *    preferences, not gameplay progress) survive replay; `paused` is forced
 *    back to false and `elapsed` back to 0.
 *
 * Every branch not explicitly enabled by the current phase is a no-op that
 * returns `state` unchanged — this is what gives invariant 9 (no soft-lock
 * under any input sequence) for free: no input, in any order, mid-drag
 * release, or repeated spam, ever leaves the state machine somewhere it
 * cannot continue progressing from once the "right" input resumes.
 */

import type { GameState, LegId, LegState } from './types';
import { LEG_ORDER } from './types';
import type { Intent } from './intents';
import { FIXED_DT, WEDGE_SEAT_THRESHOLD } from './constants';
import { legScenario } from './rng';
import {
  createLegState,
  hammer,
  jackStroke,
  sandStep,
  shouldSnap,
  snap,
  wedgeDrag as wedgeDragModel,
} from './legModel';

export type GameAction =
  | { kind: 'intent'; intent: Intent; dt?: number }
  | { kind: 'tick'; dt: number };

export interface CreateGameStateOptions {
  soundOn?: boolean;
  reducedMotion?: boolean;
}

/** Fresh GameState at `phase:'boot'`, all four legs deterministically seeded. */
export function createGameState(seed: number, opts: CreateGameStateOptions = {}): GameState {
  return {
    phase: 'boot',
    activeLeg: 0,
    legs: [
      createLegState(seed, 0),
      createLegState(seed, 1),
      createLegState(seed, 2),
      createLegState(seed, 3),
    ],
    seed,
    elapsed: 0,
    paused: false,
    soundOn: opts.soundOn ?? true,
    reducedMotion: opts.reducedMotion ?? false,
  };
}

/** Pure pause/resume toggle. Not an Intent — see module doc comment § 5. */
export function setPaused(state: GameState, paused: boolean): GameState {
  if (state.paused === paused) return state;
  return { ...state, paused };
}

function withLeg(state: GameState, leg: LegId, next: LegState): GameState {
  const legs = [...state.legs] as GameState['legs'];
  legs[leg] = next;
  return { ...state, legs };
}

function nextUnlockedLeg(state: GameState): LegId | undefined {
  return LEG_ORDER.find((leg) => !state.legs[leg].locked);
}

function beginLegIntro(state: GameState, leg: LegId): GameState {
  const current = state.legs[leg];
  if (current.phase === 'intro') return state;
  return withLeg(state, leg, { ...current, phase: 'intro' });
}

/**
 * Applies one confirmed jack pump (or the tolerance check after a sand
 * step) and cascades snap→wedge in the same call — see module doc § 3.
 */
function afterOffsetUpdate(state: GameState, leg: LegId, updated: LegState): GameState {
  if (shouldSnap(updated) && updated.phase !== 'locked') {
    const snapped = snap(updated);
    return withLeg(state, leg, { ...snapped, phase: 'wedge' });
  }
  return withLeg(state, leg, updated);
}

/** Locks the active leg and cascades to the next leg or finalReveal — see module doc § 4. */
function lockActiveLeg(state: GameState): GameState {
  const leg = state.activeLeg;
  const locked = hammer(state.legs[leg]);
  const afterLock = withLeg(state, leg, locked);
  const next = nextUnlockedLeg(afterLock);
  if (next === undefined) {
    return { ...afterLock, phase: 'finalReveal' };
  }
  return beginLegIntro({ ...afterLock, activeLeg: next }, next);
}

function applyLegPhaseIntent(state: GameState, intent: Intent, dt: number): GameState {
  const leg = state.activeLeg;
  const legState = state.legs[leg];
  const scenario = legScenario(state.seed, leg);

  switch (legState.phase) {
    case 'idle':
    case 'intro':
      if (intent.type === 'advance') {
        return withLeg(state, leg, { ...legState, phase: 'sand' });
      }
      return state;

    case 'sand':
      if (intent.type === 'gateSet') {
        const updated = sandStep(legState, intent.open, dt, scenario);
        if (updated === legState) return state;
        const depleted = updated.sandLevel <= 0;
        return withLeg(state, leg, depleted ? { ...updated, phase: 'jack' } : updated);
      }
      return state;

    case 'jack':
      if (intent.type === 'jackStroke') {
        const updated = jackStroke(legState, scenario);
        if (updated === legState) return state;
        return afterOffsetUpdate(state, leg, updated);
      }
      return state;

    case 'snap':
      // Pure reducer never rests here (see module doc § 3) — defensive no-op only.
      return state;

    case 'wedge':
      if (intent.type === 'wedgeDrag') {
        return withLeg(state, leg, wedgeDragModel(legState, intent.progress));
      }
      if (intent.type === 'wedgeRelease') {
        return state; // mid-drag release is never punished — progress simply holds
      }
      if (intent.type === 'hammerTap') {
        if (legState.wedgeProgress < WEDGE_SEAT_THRESHOLD) return state; // not seated yet — safe no-op
        return lockActiveLeg(state);
      }
      return state;

    case 'locked':
      return state;
  }
}

/** The pure global phase transition function. See module doc comment for design rationale. */
export function transition(state: GameState, action: GameAction): GameState {
  if (state.paused) return state; // no-op while paused — see module doc § 5

  const dt = action.kind === 'tick' ? action.dt : (action.dt ?? FIXED_DT);
  if (action.kind === 'tick') {
    return dt > 0 ? { ...state, elapsed: state.elapsed + dt } : state;
  }

  const { intent } = action;
  const withElapsed = (s: GameState): GameState =>
    dt > 0 ? { ...s, elapsed: s.elapsed + dt } : s;

  if (intent.type === 'replay') {
    const fresh = createGameState(state.seed, { soundOn: state.soundOn, reducedMotion: state.reducedMotion });
    return withElapsed({ ...fresh, phase: 'establish' });
  }

  switch (state.phase) {
    case 'boot':
      if (intent.type === 'advance') {
        return withElapsed({ ...state, phase: 'establish' });
      }
      return withElapsed(state);

    case 'establish':
      if (intent.type === 'advance') {
        return withElapsed(beginLegIntro({ ...state, phase: 'leg', activeLeg: 0 }, 0));
      }
      return withElapsed(state);

    case 'leg':
      return withElapsed(applyLegPhaseIntent(state, intent, dt));

    case 'finalReveal':
      if (intent.type === 'advance') {
        return withElapsed({ ...state, phase: 'complete' });
      }
      return withElapsed(state);

    case 'complete':
      return withElapsed(state);
  }
}
