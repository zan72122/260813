/**
 * The 12-state game flow (PRODUCT_SPEC "Game flow (states)" table) driven by
 * the 16 `GameTransitionEventId`s (`src/contracts/states.ts`). Owns: the
 * transition graph, auto-progression threshold-watching (arc-length /
 * leveling-settled crossings and fixed-duration beats), the canonical
 * "consistent derived snapshot" position for direct state entry, and all
 * `state:changed` / `camera:cue` / `sound:cue` / `fx:cue` bus emission.
 *
 * Design notes (mapping the contract IDs onto behavior; flagged per the
 * task's "map them sensibly; flag mismatches in notes" instruction):
 *
 * - The transition table below is a direct, unambiguous transcription of
 *   the per-event docstrings already written in `contracts/states.ts` (e.g.
 *   `VALVE_OPENED` is documented there as "machineRoom -> cableFollow") —
 *   no mismatches found against that file.
 * - PRODUCT_SPEC's replay tile ▲ ("ride again") is wired to the
 *   `REPLAY_ASCEND` event, whose contracts/states.ts docstring is explicit:
 *   "replayMenu -> ascendLower". The task text's own parenthetical for that
 *   tile ("reset to machineRoom ready-to-ride") reads as a looser
 *   description of the RESET aspect (fresh position, valve/throttle idle)
 *   rather than a literal demand for the `machineRoom` state id — since
 *   `machineRoom` and `ascendLower` share the same canonical arc-length
 *   anchor (0) anyway, "ride again" landing directly in `ascendLower` at a
 *   freshly-reset position (skip the lever minigame, re-ride the climb) is
 *   both contract-literal and a sensible product read: "machine-room free
 *   play" is the separate, dedicated tile for replaying the lever itself.
 *   Flagging this reading here per the task's instruction rather than
 *   editing the frozen contract.
 * - `cableFollow`, `arrival`, `celebrate` are fixed-duration auto-advancing
 *   beats (PRODUCT_SPEC: "a fixed-step-timed camera ride, auto-advances").
 *   Their hold durations, the brief `interiorProof` overlay length, and the
 *   arrival door-open stagger are NOT MATH_CONTRACT quantities (no named
 *   constant exists for any of them there) — they are this module's own
 *   pacing choices, named and documented below rather than left as bare
 *   numbers.
 * - The task text describes the "slope-change replay" tile as jumping "s to
 *   just below BLEND_START_S" (a lead-in before the curve), while the same
 *   deliverable's general `gotoState` example states plainly "gotoState
 *   ('transition') places s at BLEND_START_S". `GameLogic` exposes no replay-
 *   specific entry point beyond `gotoState` for the integrator to call (see
 *   ARCHITECTURE_CONTRACT "Wiring conventions" — UI actions reach game logic
 *   through `gotoState`/`applyInput` only), so both paths necessarily land
 *   on the same code here. They are reconciled rather than in conflict:
 *   `trackTheta` treats `s <= BLEND_START_S` as still exactly `THETA_LOWER`
 *   (the curve begins the instant `s` exceeds it), so entering exactly AT
 *   `BLEND_START_S` already IS "just below the curve" in every way that
 *   matters — theta hasn't started changing yet, and the very first step of
 *   forward motion is what begins it. `REPLAY_TRANSITION` (used by `fire()`)
 *   and `gotoState('transition')` both resolve to `BLEND_START_S`.
 *
 * INTEGRATOR FIX (Wave 4): `updateMotionSoundCues` now re-fires the
 * `hydraulicHum`/`cableRun`/`carrierRide` LOOP cues every step for as long
 * as their motion is active, not just once on the edge/entry that starts
 * it — see that method's doc for why the one-shot original firing pattern
 * was a real defect against `EiffelAudioEngine`'s documented keep-alive
 * contract (a loop auto-stops ~260ms after its last firing).
 *
 * INTEGRATOR FIX (Wave 4, VISUAL_ACCEPTANCE `06-horizontal-cabin-proof`):
 * `transition`'s `LEVELED` auto-progression (in `update()`'s switch) is now
 * also gated on the `interiorProof` brief overlay having finished, not just
 * `leveling.settled && arcLength >= BLEND_END_S` — see that switch case's
 * doc for the real, empirically-confirmed race this closes (settling and
 * crossing `BLEND_END_S` in the exact same tick could overwrite
 * `interiorProof` with `carrierSide` before it was ever observable).
 */

import {
  BLEND_END_S,
  BLEND_START_S,
  STATION_BOTTOM_S,
  STATION_TOP_S,
} from '../contracts/constants.ts';
import type { EventBus } from '../contracts/events.ts';
import type { CameraCueId } from '../contracts/camera.ts';
import type { EiffelEventMap } from '../contracts/events.ts';
import type { GameStateId, GameTransitionEventId } from '../contracts/states.ts';

// ---------------------------------------------------------------------------
// State-machine-owned pacing constants (NOT MATH_CONTRACT quantities)
// ---------------------------------------------------------------------------

/** How long the automatic `cableFollow` causal-chain camera ride holds before advancing. */
const CABLE_FOLLOW_DURATION_S = 4;
/** How long `arrival` holds (brake/doors/reveal beat) before auto-advancing to `celebrate`. */
const ARRIVAL_HOLD_S = 3;
/** Delay after entering `arrival` before the door-open sound cue fires (brake first, then doors). */
const ARRIVAL_DOOR_DELAY_S = 1;
/** How long `celebrate` holds before auto-advancing to `replayMenu`. */
const CELEBRATE_HOLD_S = 3;
/** How long the `interiorProof` cue overlays `transitionClose` once leveling first settles. */
const INTERIOR_PROOF_BRIEF_S = 1.5;
/**
 * Arc length (meters) past which `ascendLower`'s shot switches from
 * `carrierSide` to `firstSlope` — literally specified by the task
 * ("ascendLower→carrierSide then firstSlope once s>30").
 */
const FIRST_SLOPE_ARC_LENGTH_M = 30;
/**
 * Cadence (sim seconds) `hydraulicHum`/`cableRun`/`carrierRide` are
 * re-fired at while motion continues — see `updateMotionSoundCues`'s doc.
 * Comfortably inside `EiffelAudioEngine`'s 260ms loop keep-alive window
 * with margin to spare, far below the ~60/s a per-fixed-step cadence would
 * produce.
 */
const LOOP_CUE_REFIRE_INTERVAL_S = 0.12;

// ---------------------------------------------------------------------------
// Transition graph
// ---------------------------------------------------------------------------

type TransitionTable = Partial<Record<GameStateId, Partial<Record<GameTransitionEventId, GameStateId>>>>;

/** PAUSE/RESUME are handled specially (any-state -> pause / pause -> remembered state) and are not in this table. */
const TRANSITIONS: TransitionTable = {
  boot: { BOOT_READY: 'attract' },
  attract: { BEGIN: 'machineRoom' },
  machineRoom: { VALVE_OPENED: 'cableFollow' },
  cableFollow: { CABLE_FOLLOW_DONE: 'ascendLower' },
  ascendLower: { SLOPE_REACHED: 'transition' },
  transition: { LEVELED: 'ascendUpper' },
  ascendUpper: { UPPER_ARRIVED: 'arrival' },
  arrival: { CELEBRATE: 'celebrate' },
  celebrate: { MENU_READY: 'replayMenu' },
  replayMenu: {
    REPLAY_ASCEND: 'ascendLower',
    REPLAY_DESCEND: 'descend',
    REPLAY_MACHINE_ROOM: 'machineRoom',
    REPLAY_TRANSITION: 'transition',
  },
  descend: { DESCEND_ARRIVED: 'replayMenu' },
  pause: {},
};

/** Canonical arc-length anchor for direct entry into each state (task deliverable #3: "consistent derived snapshot"). */
const CANONICAL_ARC_LENGTH: Record<GameStateId, number> = {
  boot: STATION_BOTTOM_S,
  attract: STATION_BOTTOM_S,
  machineRoom: STATION_BOTTOM_S,
  cableFollow: STATION_BOTTOM_S,
  ascendLower: STATION_BOTTOM_S,
  transition: BLEND_START_S,
  ascendUpper: BLEND_END_S,
  arrival: STATION_TOP_S,
  celebrate: STATION_TOP_S,
  replayMenu: STATION_TOP_S,
  descend: STATION_TOP_S,
  pause: STATION_BOTTOM_S, // unused in practice: `pause` preserves the current position (see StateMachine.gotoState).
};

/** Reposition applied by specific externally-fired events (all others: `null`, motion continues from wherever it is). */
const REPOSITION_ON_EVENT: Partial<Record<GameTransitionEventId, number>> = {
  REPLAY_ASCEND: STATION_BOTTOM_S,
  REPLAY_DESCEND: STATION_TOP_S,
  REPLAY_MACHINE_ROOM: STATION_BOTTOM_S,
  REPLAY_TRANSITION: BLEND_START_S,
};

/** Camera cue shown immediately on entering each state (CAMERA_CONTRACT cue chain / task's mapping table). `null` = leave the active cue as-is. */
const ENTRY_CAMERA_CUE: Record<GameStateId, CameraCueId | null> = {
  boot: null,
  attract: 'establish',
  machineRoom: 'underground',
  cableFollow: 'cableFollow',
  ascendLower: 'carrierSide',
  transition: 'transitionClose',
  ascendUpper: 'carrierSide',
  arrival: 'arrivalReveal',
  celebrate: 'interiorProof',
  replayMenu: 'menu',
  descend: 'descent',
  pause: null,
};

// ---------------------------------------------------------------------------
// Inputs the state machine needs from the rest of the pipeline each step
// ---------------------------------------------------------------------------

/** The slice of `DriveState` the state machine watches for auto-progression + motion sound cues. */
export interface DriveReadout {
  readonly arcLength: number;
  readonly valveOpen: number;
}

/** The slice of `LevelingState` the state machine watches for the `transition -> ascendUpper` gate + the leveling-success cue. */
export interface LevelingReadout {
  readonly settled: boolean;
}

/** Result of a `fire()` call (external or internal), so the caller knows whether — and where — to reposition the sim. */
export interface FireResult {
  readonly transitioned: boolean;
  readonly state: GameStateId;
  /** Canonical arc length to reposition the drive pipeline to, or `null` to leave position untouched. */
  readonly arcLength: number | null;
}

/** Result of a direct `gotoState()` entry. */
export interface GotoStateResult {
  readonly state: GameStateId;
  /** Canonical arc length for this state, or `null` for `pause` (preserves whatever position the sim was already at). */
  readonly arcLength: number | null;
}

function noTransition(state: GameStateId): FireResult {
  return { transitioned: false, state, arcLength: null };
}

export class EiffelStateMachine {
  private stateId: GameStateId = 'boot';
  private pausedFrom: GameStateId | null = null;
  private isFiring = false;

  // Per-state auto-progression timers / edge trackers. Reset on every entry
  // into the state they belong to (see `resetTimersForEntry`).
  private cableFollowElapsedS = 0;
  private arrivalElapsedS = 0;
  private celebrateElapsedS = 0;
  private doorOpened = false;
  private everValveFullyOpened = false;
  private crossedFirstSlopeMark = false;
  private interiorProofBriefRemainingS = 0;
  /** INTEGRATOR FIX (Wave 4, see `updateLevelingSuccessCue`'s doc): true for
   * exactly one `update()` call after entering `transition`, so that call
   * only captures the CURRENT `leveling.settled` as the fresh edge-detector
   * baseline instead of comparing against it. */
  private transitionLevelingBaselineNeeded = false;

  // Cross-step edge detectors, not reset on state entry (they track raw
  // pipeline motion, which is continuous across state boundaries).
  private prevValveOpen = 0;
  private prevLevelingSettled = true;
  /** Sim-time accumulator driving the loop-cue re-fire cadence (see
   * `updateMotionSoundCues`'s doc). Starts "already due" so the very first
   * step of motion fires immediately, matching the previous edge-triggered
   * behavior for that first onset. */
  private loopCueRefireElapsedS = LOOP_CUE_REFIRE_INTERVAL_S;

  constructor(private readonly bus: EventBus<EiffelEventMap>) {}

  get state(): GameStateId {
    return this.stateId;
  }

  /** Whether the machine is currently paused (and, if so, which state it will `RESUME` back to). */
  get pausedFromState(): GameStateId | null {
    return this.pausedFrom;
  }

  /**
   * Fire a named transition event. Re-entrant calls (from inside a bus
   * listener triggered by this very call) and events with no matching
   * transition from the current state are both silently ignored — this is
   * the "no double-fire" guarantee: once a transition has moved the machine
   * out of the state an event applies to, firing that event again always
   * finds no match and is a no-op.
   */
  fire(event: GameTransitionEventId): FireResult {
    if (this.isFiring) return noTransition(this.stateId);
    this.isFiring = true;
    try {
      if (event === 'PAUSE') {
        if (this.stateId === 'pause') return noTransition(this.stateId);
        this.pausedFrom = this.stateId;
        this.enterState('pause');
        return { transitioned: true, state: 'pause', arcLength: null };
      }
      if (event === 'RESUME') {
        if (this.stateId !== 'pause' || this.pausedFrom === null) return noTransition(this.stateId);
        const target = this.pausedFrom;
        this.pausedFrom = null;
        this.enterState(target);
        return { transitioned: true, state: target, arcLength: null };
      }

      const target = TRANSITIONS[this.stateId]?.[event];
      if (!target) return noTransition(this.stateId);
      this.enterState(target);
      const arcLength = REPOSITION_ON_EVENT[event] ?? null;
      return { transitioned: true, state: target, arcLength };
    } finally {
      this.isFiring = false;
    }
  }

  /**
   * Force-enter a state directly (test API / UI flows) with a consistent
   * derived position — EXCEPT two position-preserving special cases the
   * frozen `GameLogic.gotoState(state)` signature has no other room to
   * express:
   *  - `gotoState('pause')` freezes in place (position untouched; that IS
   *    the pause semantics — "preserves and restores exactly").
   *  - `gotoState(id)` called while currently paused, where `id` is the
   *    exact state pause was entered from, is treated as **resume**:
   *    position stays untouched (already frozen since pause) rather than
   *    being reset to that state's canonical anchor. This is what makes
   *    "resume restores exactly" work through the UI's natural
   *    pause/resume wiring (remember the pre-pause state, call
   *    `gotoState` with it to resume) without needing a second entry
   *    point beyond the one `GameLogic` exposes.
   * Any other direct entry (including re-entering the CURRENT state, e.g.
   * the "transition-only loop" replay tile) resets to that state's
   * canonical arc-length anchor.
   */
  gotoState(id: GameStateId): GotoStateResult {
    if (id === 'pause') {
      if (this.stateId !== 'pause') this.pausedFrom = this.stateId;
      this.enterState('pause');
      return { state: 'pause', arcLength: null };
    }
    const isResume = this.stateId === 'pause' && this.pausedFrom === id;
    this.pausedFrom = null;
    this.enterState(id);
    return { state: id, arcLength: isResume ? null : CANONICAL_ARC_LENGTH[id] };
  }

  /**
   * Advance auto-progression + cue bookkeeping by one fixed step. Reads
   * fresh drive/leveling readouts, fires whichever transition event (if
   * any) the crossed threshold implies, and emits every motion/milestone
   * sound cue.
   */
  update(dt: number, drive: DriveReadout, leveling: LevelingReadout): void {
    // 1. Advance this state's own elapsed-time timers first, so every cue
    //    check below and the threshold check at the end all see this step's
    //    up-to-date timer values (rather than last step's).
    if (this.stateId === 'cableFollow') this.cableFollowElapsedS += dt;
    if (this.stateId === 'arrival') this.arrivalElapsedS += dt;
    if (this.stateId === 'celebrate') this.celebrateElapsedS += dt;

    // 2. Edge-triggered / timed cues that don't themselves change state.
    this.updateMotionSoundCues(dt, drive);
    this.updateLevelingSuccessCue(leveling);
    this.updateFirstSlopeCue(drive);
    this.updateInteriorProofBriefTimer(dt);
    this.updateArrivalDoorCue();

    // 3. Auto-progression: fire the one event (if any) this state's
    //    threshold condition implies.
    switch (this.stateId) {
      case 'machineRoom':
        if (!this.everValveFullyOpened && drive.valveOpen >= 1) {
          this.everValveFullyOpened = true;
          this.fire('VALVE_OPENED');
        }
        break;
      case 'cableFollow':
        if (this.cableFollowElapsedS >= CABLE_FOLLOW_DURATION_S) {
          this.fire('CABLE_FOLLOW_DONE');
        }
        break;
      case 'ascendLower':
        if (drive.arcLength >= BLEND_START_S) {
          this.fire('SLOPE_REACHED');
        }
        break;
      case 'transition':
        // INTEGRATOR FIX (Wave 4, VISUAL_ACCEPTANCE `06-horizontal-cabin-
        // proof`): also gated on the `interiorProof` brief overlay having
        // finished (`interiorProofBriefRemainingS <= 0`), not just
        // `leveling.settled && arcLength >= BLEND_END_S` — a real,
        // reproducible race, confirmed empirically driving the actual sim
        // (not just the unit-level state machine in isolation): the
        // auto-drive's speed and the blend zone's length are close enough
        // that `leveling.settled` can flip false->true in the EXACT SAME
        // fixed step that `arcLength` first crosses `BLEND_END_S`. Both
        // conditions were true together, so `fire('LEVELED')` ran in the
        // very same `update()` call as `updateLevelingSuccessCue`'s
        // `interiorProof` emission (step 2, just above, always runs before
        // this switch) — jumping straight to `ascendUpper` and overwriting
        // `cameraCue` with `carrierSide` before `interiorProof` was ever
        // externally observable for even one frame/readout, at ANY polling
        // granularity including single-step. That starves
        // `INTERIOR_PROOF_BRIEF_S`'s entire purpose (a deliberate on-screen
        // overlay) down to zero, and is exactly what made
        // `tests/e2e/screenshots.spec.ts`'s `06-horizontal-cabin-proof`
        // shot's `stepUntil(cameraCue === 'interiorProof')` hang until its
        // step budget ran out, always landing on `ascendUpper` instead.
        // `interiorProofBriefRemainingS` is 0 whenever no brief is active
        // (either it already ran its course, or `interiorProof` never fired
        // at all this ride), so this only ever DELAYS `LEVELED` — never
        // blocks it — for the brief's `INTERIOR_PROOF_BRIEF_S` (1.5s)
        // window on the specific ticks that would otherwise race it.
        if (leveling.settled && drive.arcLength >= BLEND_END_S && this.interiorProofBriefRemainingS <= 0) {
          this.fire('LEVELED');
        }
        break;
      case 'ascendUpper':
        if (drive.arcLength >= STATION_TOP_S) {
          this.fire('UPPER_ARRIVED');
        }
        break;
      case 'arrival':
        if (this.arrivalElapsedS >= ARRIVAL_HOLD_S) {
          this.fire('CELEBRATE');
        }
        break;
      case 'celebrate':
        if (this.celebrateElapsedS >= CELEBRATE_HOLD_S) {
          this.fire('MENU_READY');
        }
        break;
      case 'descend':
        if (drive.arcLength <= STATION_BOTTOM_S) {
          this.fire('DESCEND_ARRIVED');
        }
        break;
      case 'boot':
      case 'attract':
      case 'replayMenu':
      case 'pause':
        break;
    }
  }

  // -- internals -------------------------------------------------------

  private enterState(id: GameStateId): void {
    // Note: unlike a typical FSM guard, entry is NOT skipped when `id` equals
    // the current state — `gotoState()` relies on exactly that to make the
    // "transition-only loop ... allow instant repeat" replay tile work
    // (re-entering `transition` while already there must still reset
    // position/timers and re-emit cues). `fire()` never calls this with
    // `id === this.stateId` in the first place (the transition table has no
    // self-loops, and PAUSE/RESUME both guard the already-there case before
    // calling in), so this never causes a spurious same-state re-emission
    // from ordinary event-driven play.
    const previous = this.stateId;
    this.stateId = id;
    this.resetTimersForEntry(id);
    this.bus.emit('state:changed', { state: id, previous });
    const cue = ENTRY_CAMERA_CUE[id];
    if (cue) this.bus.emit('camera:cue', { cue });
    this.emitEntrySoundCues(id);
  }

  private resetTimersForEntry(id: GameStateId): void {
    if (id === 'cableFollow') this.cableFollowElapsedS = 0;
    if (id === 'arrival') {
      this.arrivalElapsedS = 0;
      this.doorOpened = false;
    }
    if (id === 'celebrate') this.celebrateElapsedS = 0;
    if (id === 'machineRoom') this.everValveFullyOpened = false;
    if (id === 'ascendLower') this.crossedFirstSlopeMark = false;
    if (id === 'transition') {
      this.interiorProofBriefRemainingS = 0;
      this.transitionLevelingBaselineNeeded = true;
    }
  }

  private emitEntrySoundCues(id: GameStateId): void {
    if (id === 'cableFollow') {
      this.bus.emit('sound:cue', { cue: 'pistonMove' });
      this.bus.emit('sound:cue', { cue: 'pulleyTurn' });
      this.bus.emit('sound:cue', { cue: 'cableRun' });
    }
    if (id === 'ascendLower' || id === 'ascendUpper' || id === 'descend') {
      this.bus.emit('sound:cue', { cue: 'carrierRide' });
    }
    if (id === 'arrival') {
      this.bus.emit('sound:cue', { cue: 'brakeLock' });
    }
    if (id === 'celebrate') {
      this.bus.emit('sound:cue', { cue: 'sparkle' });
    }
  }

  /**
   * INTEGRATOR FIX (Wave 4, audio loop cadence — ARCHITECTURE_CONTRACT
   * "Wiring conventions"): `EiffelAudioEngine` treats `hydraulicHum` /
   * `cableRun` / `carrierRide` as keep-alive loops with no paired stop cue
   * — a loop auto-fades ~260ms after its last `handleCue` firing (see that
   * module's doc). Before this fix, this method only fired `hydraulicHum`
   * once on the `valveOpen` 0->positive EDGE, and `emitEntrySoundCues` only
   * fired `cableRun`/`carrierRide` once each on STATE ENTRY — one-shots for
   * cues whose whole purpose is to sound for as long as the underlying
   * motion continues (a multi-second ascent, not a 260ms blip). Fixed by
   * re-firing them every step for as long as their motion is actually
   * happening, in addition to (not instead of) the existing edge/entry
   * emissions those two methods and their unit tests already cover.
   *
   * `drive.valveOpen` is a reliable "is the pipeline moving right now"
   * signal in every state: `sim.ts` derives it FROM the drive speed
   * (`|speed| / CARRIER_MAX_SPEED`), so it is exactly 0 iff speed is
   * exactly 0. Cable travel is literally the carrier arc length
   * (`cableTravel = s`, MATH_CONTRACT §2), so the cable is always moving
   * exactly when the pipeline is; `carrierRide` is narrowed to the states
   * where the carrier is actually being ridden (the causal chain hasn't
   * reached the carrier yet in `machineRoom`, where only the valve/piston
   * and the cable already turning are meaningful to the player).
   *
   * Re-firing is THROTTLED to once per `LOOP_CUE_REFIRE_INTERVAL_S` of sim
   * time (~8/s), not literally every fixed step (~60/s): still an order of
   * magnitude inside `EiffelAudioEngine`'s 260ms keep-alive window (comment
   * re-affirmed empirically — see that module), but a real, measured
   * integrator finding while building the Wave-4 e2e suite: firing every
   * single step multiplies `EventBus.emit`/`handleCue` call volume ~60x for
   * no audible benefit, and repeatedly re-arming a `setTimeout` that close
   * to its own deadline made the loop's continued aliveness sensitive to
   * ordinary scheduling jitter (GC pauses, a slow frame) — the rare miss
   * expires the loop, which re-synthesizes its noise buffer (real,
   * non-trivial CPU work) on the very next firing, and a batch of
   * back-to-back sim steps (e.g. `__eiffel.step(n)` for QA scrubbing) could
   * cascade several such misses/re-syntheses in a row. An 8/s cadence keeps
   * the audible "continuous hum" behavior identical while removing that
   * fragility.
   */
  private updateMotionSoundCues(dt: number, drive: DriveReadout): void {
    if (this.prevValveOpen <= 0 && drive.valveOpen > 0) {
      this.bus.emit('sound:cue', { cue: 'valveOpen' });
    } else if (this.prevValveOpen > 0 && drive.valveOpen <= 0) {
      this.bus.emit('sound:cue', { cue: 'valveClose' });
    }
    this.prevValveOpen = drive.valveOpen;

    if (drive.valveOpen > 0) {
      this.loopCueRefireElapsedS += dt;
      if (this.loopCueRefireElapsedS >= LOOP_CUE_REFIRE_INTERVAL_S) {
        this.loopCueRefireElapsedS = 0;
        this.bus.emit('sound:cue', { cue: 'hydraulicHum' });
        this.bus.emit('sound:cue', { cue: 'cableRun' });
        if (this.isRidingState(this.stateId)) {
          this.bus.emit('sound:cue', { cue: 'carrierRide' });
        }
      }
    } else {
      // Next motion start should re-fire immediately, not wait out a stale partial interval.
      this.loopCueRefireElapsedS = LOOP_CUE_REFIRE_INTERVAL_S;
    }
  }

  private isRidingState(id: GameStateId): boolean {
    return id === 'ascendLower' || id === 'ascendUpper' || id === 'transition' || id === 'descend';
  }

  /**
   * INTEGRATOR FIX (Wave 4): `leveling.settled` is owned by `EiffelGameLogic`
   * (this class only ever sees it as a readout), and it is NOT reset to
   * "freshly unsettled" on every entry into `transition` — only a direct
   * `gotoState`/`scrubToT` entry resets it (to `INITIAL_LEVELING_STATE`,
   * which is itself `settled: true`!); a NATURAL auto-progression entry
   * (`SLOPE_REACHED` firing mid-ride) leaves it exactly as it was at the end
   * of `ascendLower` — already settled, since the cabin was calm and level
   * on the constant-54° run. Before this fix, `resetTimersForEntry` forced
   * `prevLevelingSettled = false` unconditionally on entry, so the very
   * first `update()` call in `transition` always saw a false->true edge
   * against an ALREADY-true `leveling.settled` and fired `interiorProof`
   * immediately — before `transitionClose` (the signature-moment shot:
   * steepening track + re-tilting carrier + cabin floor + horizon,
   * CAMERA_CONTRACT) had been shown at all, and before the cabin had even
   * been disturbed by the steepening track. Fixed by capturing whatever
   * `leveling.settled` already is as the edge-detector's baseline on the
   * first update after entry, instead of assuming false — `interiorProof`
   * now only fires on a REAL false->true transition that happens while
   * actually in `transition`.
   */
  private updateLevelingSuccessCue(leveling: LevelingReadout): void {
    if (this.stateId === 'transition' && this.transitionLevelingBaselineNeeded) {
      this.transitionLevelingBaselineNeeded = false;
      this.prevLevelingSettled = leveling.settled;
      return;
    }
    if (this.stateId === 'transition' && !this.prevLevelingSettled && leveling.settled) {
      this.bus.emit('camera:cue', { cue: 'interiorProof' });
      this.bus.emit('sound:cue', { cue: 'chime' });
      this.bus.emit('sound:cue', { cue: 'sparkle' });
      this.bus.emit('fx:cue', { cue: 'sparkle' });
      this.interiorProofBriefRemainingS = INTERIOR_PROOF_BRIEF_S;
    }
    this.prevLevelingSettled = leveling.settled;
  }

  private updateFirstSlopeCue(drive: DriveReadout): void {
    if (this.stateId === 'ascendLower' && !this.crossedFirstSlopeMark && drive.arcLength > FIRST_SLOPE_ARC_LENGTH_M) {
      this.crossedFirstSlopeMark = true;
      this.bus.emit('camera:cue', { cue: 'firstSlope' });
    }
  }

  private updateInteriorProofBriefTimer(dt: number): void {
    if (this.interiorProofBriefRemainingS <= 0) return;
    this.interiorProofBriefRemainingS -= dt;
    if (this.interiorProofBriefRemainingS <= 0 && this.stateId === 'transition') {
      this.interiorProofBriefRemainingS = 0;
      this.bus.emit('camera:cue', { cue: 'transitionClose' });
    }
  }

  private updateArrivalDoorCue(): void {
    if (this.stateId !== 'arrival' || this.doorOpened) return;
    if (this.arrivalElapsedS >= ARRIVAL_DOOR_DELAY_S) {
      this.doorOpened = true;
      this.bus.emit('sound:cue', { cue: 'doorOpen' });
    }
  }
}
