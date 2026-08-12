/**
 * `EiffelGameLogic` — the gameplay/math subsystem's `GameLogic` implementation
 * (ARCHITECTURE_CONTRACT "Wiring conventions"). Orchestrates `sim.ts`
 * (drive pipeline), `leveling.ts` (residual tilt), and `stateMachine.ts`
 * (flow + cues) into one `step(dt)` that writes a fresh, complete
 * `GameSnapshot` to the store every fixed step — THE single source of
 * motion (MATH_CONTRACT §2).
 *
 * Per-state control mapping (this module's own, documented design choice —
 * MATH_CONTRACT specifies the pipeline's math but not which scene owns which
 * control; PRODUCT_SPEC's "one verb per scene" motivates the split below):
 *  - `machineRoom`: the master lever sets `valveTarget` proportionally
 *    (PRODUCT_SPEC: "opens the hydraulic valve proportionally"); direction
 *    is fixed forward (there is only one direction the underground
 *    machinery ever runs from this screen).
 *  - `ascendLower` / `ascendUpper` / `descend`: the up/down throttle is a
 *    hold button (PRODUCT_SPEC: "hold to move, release to ease-stop") — full
 *    valve open in the held direction, idle otherwise.
 *  - `cableFollow` / `transition`: these are the two auto-advancing beats
 *    (PRODUCT_SPEC: cableFollow is an automatic camera ride; transition's
 *    single-finger verb is the level wheel, which cannot also hold a
 *    throttle) — the drive pipeline auto-holds full-forward so arc length
 *    keeps advancing through them without requiring impossible two-fingered
 *    input. `transition`'s auto-drive speed comfortably outlasts the
 *    leveling assist's worst-case settle window (LEVEL_ASSIST_SETTLE_S),
 *    confirmed empirically in `tests/unit/game/logic.spec.ts`.
 *  - all other states: idle (no valve, no direction).
 */

import { BLEND_END_S, BLEND_START_S, TRACK_LENGTH } from '../contracts/constants.ts';
import type { EventBus } from '../contracts/events.ts';
import type { GameStateId } from '../contracts/states.ts';
import type { GameSnapshot, MutableGameStore } from '../contracts/store.ts';
import type { GameLogic, InputIntent, ThrottleDirection } from '../contracts/subsystems.ts';

import {
  cabinWorldTiltDegFromError,
  carrierAngleDegFromTheta,
  INITIAL_LEVELING_STATE,
  stepLeveling,
  type LevelingState,
} from './leveling.ts';
import {
  deriveDriveStateAtArcLength,
  INITIAL_DRIVE_STATE,
  stepDrive,
  type DriveControls,
  type DriveState,
} from './sim.ts';
import { EiffelStateMachine } from './stateMachine.ts';
import { tFromArcLength } from './track.ts';

// Note: `src/game/rng.ts` (mulberry32) is the only randomness source in
// `src/game` per MATH_CONTRACT §6, but nothing in the drive/leveling/state
// pipeline needs randomness — it is fully deterministic by design ("same
// seed + same input script => bit-identical readout trajectory"). `rng.ts`
// is provided as complete, tested, ready-to-use infrastructure (e.g. for a
// future attract-mode idle-demo timing jitter) rather than force-wired in
// here for its own sake.

const RAD_TO_DEG = 180 / Math.PI;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Which `GameStateId` a scrubbed arc length `s` belongs to (used by `scrubToT`). */
function stateForArcLength(s: number): GameStateId {
  if (s >= TRACK_LENGTH) return 'arrival';
  if (s >= BLEND_END_S) return 'ascendUpper';
  if (s >= BLEND_START_S) return 'transition';
  return 'ascendLower';
}

/**
 * Dev-only NaN/Infinity guard on every numeric snapshot field
 * (MATH_CONTRACT §6), stripped from production builds via `import.meta.env`.
 */
function assertFiniteSnapshot(snapshot: GameSnapshot): void {
  if (import.meta.env.PROD) return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new RangeError(`EiffelGameLogic: non-finite snapshot field "${key}" = ${String(value)}`);
    }
  }
}

export class EiffelGameLogic implements GameLogic {
  private readonly store: MutableGameStore;
  private readonly bus: EventBus;

  private stateMachine: EiffelStateMachine;
  private seed: number;

  private drive: DriveState = INITIAL_DRIVE_STATE;
  private leveling: LevelingState = INITIAL_LEVELING_STATE;
  private prevThetaRad = INITIAL_DRIVE_STATE.thetaRad;

  // Last-applied raw control inputs (§ applyInput). Reset to idle on every
  // state change (see the `state:changed` listener below) so a stale hold
  // from a previous scene/replay lap can never carry forward unnoticed.
  private leverValue = 0;
  private throttleDirection: ThrottleDirection = 0;
  private wheelInputMagnitudeRadThisStep = 0;

  constructor(store: MutableGameStore, bus: EventBus, seed: number) {
    this.store = store;
    this.bus = bus;
    this.seed = seed >>> 0;
    this.stateMachine = new EiffelStateMachine(this.bus);
    this.bus.on('state:changed', () => {
      this.leverValue = 0;
      this.throttleDirection = 0;
      this.wheelInputMagnitudeRadThisStep = 0;
    });
    this.publishSnapshot();
  }

  // -- GameLogic -----------------------------------------------------------

  step(dt: number): void {
    if (this.store.get().paused) return; // defensive: App already gates calling step() while paused.

    const controls = this.controlsForState(this.stateMachine.state);
    this.drive = stepDrive(this.drive, dt, controls);

    const thetaRateRadPerS = dt > 0 ? (this.drive.thetaRad - this.prevThetaRad) / dt : 0;
    this.prevThetaRad = this.drive.thetaRad;

    this.leveling = stepLeveling(this.leveling, {
      thetaRateRadPerS,
      dt,
      wheelInputMagnitudeRad: this.wheelInputMagnitudeRadThisStep,
    });
    this.wheelInputMagnitudeRadThisStep = 0;

    this.stateMachine.update(
      dt,
      { arcLength: this.drive.arcLength, valveOpen: this.drive.valveOpen },
      { settled: this.leveling.settled },
    );

    this.publishSnapshot();
  }

  applyInput(intent: InputIntent): void {
    const state = this.stateMachine.state;
    switch (intent.kind) {
      case 'lever':
        if (state !== 'machineRoom') return; // invalid for this state: ignored safely
        this.leverValue = clamp01(intent.value);
        return;
      case 'throttle':
        if (state !== 'ascendLower' && state !== 'ascendUpper' && state !== 'descend') return;
        this.throttleDirection = intent.value;
        return;
      case 'wheel':
        if (state !== 'transition') return;
        this.wheelInputMagnitudeRadThisStep += Math.abs(intent.deltaRadians);
        return;
    }
  }

  gotoState(state: GameStateId): void {
    const result = this.stateMachine.gotoState(state);
    this.applyRepositionIfNeeded(result.arcLength);
    this.publishSnapshot();
  }

  serialize(): GameSnapshot {
    return this.store.get();
  }

  reset(seed: number): void {
    this.seed = seed >>> 0;
    this.stateMachine = new EiffelStateMachine(this.bus);
    this.drive = INITIAL_DRIVE_STATE;
    this.prevThetaRad = this.drive.thetaRad;
    this.leveling = INITIAL_LEVELING_STATE;
    this.leverValue = 0;
    this.throttleDirection = 0;
    this.wheelInputMagnitudeRadThisStep = 0;
    this.publishSnapshot();
  }

  // -- Extra, non-frozen QA method (ARCHITECTURE_CONTRACT "Wiring conventions") --

  /**
   * Derive a fully-consistent SETTLED state at normalized track progress
   * `t ∈ [0, 1]`: position/pipeline scalars exactly matching `t`, leveling
   * error `e = 0` (level, at rest), all speeds zero, and `state` set to
   * whichever `GameStateId` that arc length belongs to along the ride.
   * Intended for QA scrubbing (`__eiffel.setT`), not for gameplay.
   */
  scrubToT(t: number): void {
    const clampedT = clamp01(Number.isFinite(t) ? t : 0);
    const arcLength = clampedT * TRACK_LENGTH;
    const mappedState = stateForArcLength(arcLength);

    this.stateMachine.gotoState(mappedState);
    this.drive = deriveDriveStateAtArcLength(arcLength, 0);
    this.prevThetaRad = this.drive.thetaRad;
    this.leveling = INITIAL_LEVELING_STATE;
    this.leverValue = 0;
    this.throttleDirection = 0;
    this.wheelInputMagnitudeRadThisStep = 0;

    this.publishSnapshot();
  }

  // -- internals -------------------------------------------------------

  private controlsForState(state: GameStateId): DriveControls {
    switch (state) {
      case 'machineRoom':
        return { valveTarget: this.leverValue, direction: 1 };
      case 'cableFollow':
      case 'transition':
        return { valveTarget: 1, direction: 1 };
      case 'ascendLower':
      case 'ascendUpper':
      case 'descend':
        return { valveTarget: this.throttleDirection !== 0 ? 1 : 0, direction: this.throttleDirection };
      case 'boot':
      case 'attract':
      case 'arrival':
      case 'celebrate':
      case 'replayMenu':
      case 'pause':
        return { valveTarget: 0, direction: 0 };
    }
  }

  /** Applies a `gotoState`/`fire` position patch: `null` preserves the current position exactly (pause/resume); a number resets to a fresh, settled state at that arc length. */
  private applyRepositionIfNeeded(arcLength: number | null): void {
    if (arcLength === null) return;
    this.drive = deriveDriveStateAtArcLength(arcLength, 0);
    this.prevThetaRad = this.drive.thetaRad;
    this.leveling = INITIAL_LEVELING_STATE;
    this.leverValue = 0;
    this.throttleDirection = 0;
    this.wheelInputMagnitudeRadThisStep = 0;
  }

  private publishSnapshot(): void {
    const current = this.store.get();
    const cabinTiltDeg = cabinWorldTiltDegFromError(this.leveling.errorRad);
    const snapshot: GameSnapshot = {
      valveOpen: this.drive.valveOpen,
      direction: this.drive.direction,
      pistonDisplacement: this.drive.pistonDisplacement,
      cableTravel: this.drive.cableTravel,
      arcLength: this.drive.arcLength,
      t: tFromArcLength(this.drive.arcLength),
      thetaDeg: this.drive.thetaRad * RAD_TO_DEG,
      carrierAngleDeg: carrierAngleDegFromTheta(this.drive.thetaRad),
      cabinTiltErrorDeg: cabinTiltDeg,
      cabinWorldTiltDeg: cabinTiltDeg,
      speed: this.drive.speed,
      state: this.stateMachine.state,
      seed: this.seed,
      quality: current.quality,
      soundOn: current.soundOn,
      reducedMotion: current.reducedMotion,
      paused: this.stateMachine.state === 'pause',
    };
    assertFiniteSnapshot(snapshot);
    this.store.replace(snapshot);
  }
}
