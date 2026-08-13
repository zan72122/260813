import { beforeEach, describe, expect, it } from 'vitest';

import {
  BLEND_END_S,
  BLEND_START_S,
  SIM_DT,
  STATION_BOTTOM_S,
  STATION_TOP_S,
} from '../../../src/contracts/constants.ts';
import { TypedEventBus, type EiffelEventMap } from '../../../src/contracts/events.ts';
import { GAME_STATE_IDS, type GameStateId } from '../../../src/contracts/states.ts';
import { EiffelStateMachine } from '../../../src/game/stateMachine.ts';

function driveAt(arcLength: number, valveOpen = 0): { arcLength: number; valveOpen: number } {
  return { arcLength, valveOpen };
}

function levelingSettled(settled: boolean): { settled: boolean } {
  return { settled };
}

/** Collects every event emitted on the bus, in order, for assertion. */
class EventRecorder {
  readonly events: { event: keyof EiffelEventMap; payload: unknown }[] = [];

  constructor(bus: TypedEventBus) {
    bus.on('state:changed', (p) => this.events.push({ event: 'state:changed', payload: p }));
    bus.on('camera:cue', (p) => this.events.push({ event: 'camera:cue', payload: p }));
    bus.on('sound:cue', (p) => this.events.push({ event: 'sound:cue', payload: p }));
    bus.on('fx:cue', (p) => this.events.push({ event: 'fx:cue', payload: p }));
  }

  soundCues(): string[] {
    return this.events.filter((e) => e.event === 'sound:cue').map((e) => (e.payload as { cue: string }).cue);
  }

  cameraCues(): string[] {
    return this.events.filter((e) => e.event === 'camera:cue').map((e) => (e.payload as { cue: string }).cue);
  }

  fxCues(): string[] {
    return this.events.filter((e) => e.event === 'fx:cue').map((e) => (e.payload as { cue: string }).cue);
  }

  stateChanges(): { state: GameStateId; previous: GameStateId }[] {
    return this.events
      .filter((e) => e.event === 'state:changed')
      .map((e) => e.payload as { state: GameStateId; previous: GameStateId });
  }

  clear(): void {
    this.events.length = 0;
  }
}

describe('EiffelStateMachine — transition table (PRODUCT_SPEC flow / contracts/states.ts docstrings)', () => {
  let bus: TypedEventBus;
  let sm: EiffelStateMachine;

  beforeEach(() => {
    bus = new TypedEventBus();
    sm = new EiffelStateMachine(bus);
  });

  it('starts in boot', () => {
    expect(sm.state).toBe('boot');
  });

  it('walks the entire forward flow exactly per the documented event chain', () => {
    const steps: [GameTransitionEventIdLike, GameStateId][] = [
      ['BOOT_READY', 'attract'],
      ['BEGIN', 'machineRoom'],
      ['VALVE_OPENED', 'cableFollow'],
      ['CABLE_FOLLOW_DONE', 'ascendLower'],
      ['SLOPE_REACHED', 'transition'],
      ['LEVELED', 'ascendUpper'],
      ['UPPER_ARRIVED', 'arrival'],
      ['CELEBRATE', 'celebrate'],
      ['MENU_READY', 'replayMenu'],
    ];
    for (const [event, expected] of steps) {
      const result = sm.fire(event);
      expect(result.transitioned).toBe(true);
      expect(sm.state).toBe(expected);
    }
  });

  it('replayMenu offers all four replay tiles to their documented targets', () => {
    for (const [event, expected] of [
      ['REPLAY_ASCEND', 'ascendLower'],
      ['REPLAY_DESCEND', 'descend'],
      ['REPLAY_MACHINE_ROOM', 'machineRoom'],
      ['REPLAY_TRANSITION', 'transition'],
    ] as const) {
      const fresh = new EiffelStateMachine(new TypedEventBus());
      fresh.gotoState('replayMenu');
      const result = fresh.fire(event);
      expect(result.transitioned).toBe(true);
      expect(fresh.state).toBe(expected);
    }
  });

  it('descend returns to replayMenu on DESCEND_ARRIVED', () => {
    sm.gotoState('descend');
    const result = sm.fire('DESCEND_ARRIVED');
    expect(result.transitioned).toBe(true);
    expect(sm.state).toBe('replayMenu');
  });

  it('ignores an event with no matching transition from the current state (safely, no throw)', () => {
    expect(sm.state).toBe('boot');
    const result = sm.fire('LEVELED'); // valid only from `transition`
    expect(result.transitioned).toBe(false);
    expect(sm.state).toBe('boot');
  });
});

type GameTransitionEventIdLike =
  | 'BOOT_READY'
  | 'BEGIN'
  | 'VALVE_OPENED'
  | 'CABLE_FOLLOW_DONE'
  | 'SLOPE_REACHED'
  | 'LEVELED'
  | 'UPPER_ARRIVED'
  | 'CELEBRATE'
  | 'MENU_READY';

describe('EiffelStateMachine — no double-fire', () => {
  let bus: TypedEventBus;
  let recorder: EventRecorder;
  let sm: EiffelStateMachine;

  beforeEach(() => {
    bus = new TypedEventBus();
    recorder = new EventRecorder(bus);
    sm = new EiffelStateMachine(bus);
  });

  it('firing the same forward event twice in a row only transitions once', () => {
    sm.fire('BOOT_READY');
    expect(sm.state).toBe('attract');
    recorder.clear();
    const second = sm.fire('BOOT_READY'); // no matching transition from `attract`
    expect(second.transitioned).toBe(false);
    expect(sm.state).toBe('attract');
    expect(recorder.stateChanges()).toHaveLength(0);
  });

  it('firing PAUSE twice in a row only pauses once (does not overwrite pausedFromState)', () => {
    sm.gotoState('ascendLower');
    sm.fire('PAUSE');
    expect(sm.pausedFromState).toBe('ascendLower');
    const second = sm.fire('PAUSE');
    expect(second.transitioned).toBe(false);
    expect(sm.pausedFromState).toBe('ascendLower'); // unchanged, not clobbered
  });

  it('firing RESUME while not paused is a no-op', () => {
    sm.gotoState('ascendLower');
    const result = sm.fire('RESUME');
    expect(result.transitioned).toBe(false);
    expect(sm.state).toBe('ascendLower');
  });

  it('re-entrant fire() from within a bus listener is ignored (isFiring guard)', () => {
    const bus2 = new TypedEventBus();
    const sm2 = new EiffelStateMachine(bus2);
    let reentrantResultTransitioned: boolean | undefined;
    bus2.on('state:changed', () => {
      // Attempt a nested fire during the very event this fire() call emits.
      reentrantResultTransitioned = sm2.fire('BEGIN').transitioned;
    });
    sm2.fire('BOOT_READY'); // boot -> attract; listener above tries `attract -> machineRoom` reentrantly
    expect(reentrantResultTransitioned).toBe(false); // reentrant call was ignored
    expect(sm2.state).toBe('attract'); // only the ORIGINAL fire() took effect
  });
});

describe('EiffelStateMachine — pause/resume preserves and restores exactly', () => {
  let bus: TypedEventBus;
  let sm: EiffelStateMachine;

  beforeEach(() => {
    bus = new TypedEventBus();
    sm = new EiffelStateMachine(bus);
  });

  it('PAUSE is reachable from every non-pause state and remembers it', () => {
    for (const id of GAME_STATE_IDS) {
      if (id === 'pause') continue;
      const fresh = new EiffelStateMachine(new TypedEventBus());
      fresh.gotoState(id);
      const result = fresh.fire('PAUSE');
      expect(result.transitioned).toBe(true);
      expect(fresh.state).toBe('pause');
      expect(fresh.pausedFromState).toBe(id);
      expect(result.arcLength).toBeNull(); // freezes in place, no reposition
    }
  });

  it('RESUME (fired) returns to exactly the remembered state, with no reposition', () => {
    sm.gotoState('transition');
    sm.fire('PAUSE');
    const result = sm.fire('RESUME');
    expect(result.transitioned).toBe(true);
    expect(result.state).toBe('transition');
    expect(result.arcLength).toBeNull();
    expect(sm.state).toBe('transition');
    expect(sm.pausedFromState).toBeNull();
  });

  it('gotoState(pause) then gotoState(<pausedFromState>) is treated as resume: no reposition', () => {
    sm.gotoState('ascendUpper');
    const pauseResult = sm.gotoState('pause');
    expect(pauseResult.arcLength).toBeNull();
    expect(sm.pausedFromState).toBe('ascendUpper');

    const resumeResult = sm.gotoState('ascendUpper'); // the UI's natural "resume" wiring: gotoState(rememberedState)
    expect(resumeResult.arcLength).toBeNull(); // exact restore, NOT the canonical anchor
    expect(sm.state).toBe('ascendUpper');
    expect(sm.pausedFromState).toBeNull();
  });

  it('gotoState to a DIFFERENT state while paused is a normal canonical jump, not a resume', () => {
    sm.gotoState('ascendUpper');
    sm.gotoState('pause');
    const result = sm.gotoState('machineRoom'); // NOT the paused-from state
    expect(result.arcLength).toBe(STATION_BOTTOM_S); // canonical anchor, not preserved
    expect(sm.pausedFromState).toBeNull();
  });
});

describe('EiffelStateMachine — every state directly enterable with a consistent derived position', () => {
  it('gotoState places every non-pause state at its documented canonical anchor', () => {
    const expected: Record<Exclude<GameStateId, 'pause'>, number> = {
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
    };
    for (const [id, arcLength] of Object.entries(expected) as [Exclude<GameStateId, 'pause'>, number][]) {
      const sm = new EiffelStateMachine(new TypedEventBus());
      const result = sm.gotoState(id);
      expect(result.state).toBe(id);
      expect(result.arcLength).toBe(arcLength);
      expect(sm.state).toBe(id);
    }
  });

  it('re-entering the SAME state via gotoState still resets (transition-only-loop replay: "allow instant repeat")', () => {
    const sm = new EiffelStateMachine(new TypedEventBus());
    sm.gotoState('transition');
    const again = sm.gotoState('transition');
    expect(again.arcLength).toBe(BLEND_START_S);
    expect(sm.state).toBe('transition');
  });

  it('every GameStateId is reachable via gotoState and matches contracts/states.ts GAME_STATE_IDS exactly', () => {
    expect(GAME_STATE_IDS).toHaveLength(12);
    for (const id of GAME_STATE_IDS) {
      const sm = new EiffelStateMachine(new TypedEventBus());
      sm.gotoState(id);
      expect(sm.state).toBe(id);
    }
  });
});

describe('EiffelStateMachine — no soft-locks: every state has a forward path out', () => {
  it('every state except pause has at least one outgoing event OR an auto-progression path', () => {
    // Structural reachability check driven purely by the public API: from
    // each state, either an explicit fire() with the right conditions moves
    // it, or update() with a satisfied threshold does. This test exercises
    // both families so no state is a dead end.
    const autoProgressed: Partial<Record<GameStateId, () => void>> = {
      machineRoom: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('machineRoom');
        sm.update(SIM_DT, driveAt(0, 1), levelingSettled(true));
        expect(sm.state).toBe('cableFollow');
      },
      cableFollow: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('cableFollow');
        for (let i = 0; i < 600; i++) sm.update(SIM_DT, driveAt(5, 1), levelingSettled(true));
        expect(sm.state).toBe('ascendLower');
      },
      ascendLower: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('ascendLower');
        sm.update(SIM_DT, driveAt(BLEND_START_S, 1), levelingSettled(true));
        expect(sm.state).toBe('transition');
      },
      transition: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('transition');
        sm.update(SIM_DT, driveAt(BLEND_END_S, 1), levelingSettled(true));
        expect(sm.state).toBe('ascendUpper');
      },
      ascendUpper: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('ascendUpper');
        sm.update(SIM_DT, driveAt(STATION_TOP_S, 1), levelingSettled(true));
        expect(sm.state).toBe('arrival');
      },
      arrival: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('arrival');
        for (let i = 0; i < 200; i++) sm.update(SIM_DT, driveAt(STATION_TOP_S, 0), levelingSettled(true));
        expect(sm.state).toBe('celebrate');
      },
      celebrate: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('celebrate');
        for (let i = 0; i < 600; i++) sm.update(SIM_DT, driveAt(STATION_TOP_S, 0), levelingSettled(true));
        expect(sm.state).toBe('replayMenu');
      },
      descend: () => {
        const sm = new EiffelStateMachine(new TypedEventBus());
        sm.gotoState('descend');
        sm.update(SIM_DT, driveAt(STATION_BOTTOM_S, 1), levelingSettled(true));
        expect(sm.state).toBe('replayMenu');
      },
    };
    for (const [, run] of Object.entries(autoProgressed)) run();

    // boot / attract / replayMenu progress only via an explicit fire(), which the transition-table test above already covers.
    const bootSm = new EiffelStateMachine(new TypedEventBus());
    expect(bootSm.fire('BOOT_READY').transitioned).toBe(true);
    const attractSm = new EiffelStateMachine(new TypedEventBus());
    attractSm.gotoState('attract');
    expect(attractSm.fire('BEGIN').transitioned).toBe(true);

    // pause always has a way out too: RESUME.
    const pauseSm = new EiffelStateMachine(new TypedEventBus());
    pauseSm.gotoState('ascendLower');
    pauseSm.fire('PAUSE');
    expect(pauseSm.fire('RESUME').transitioned).toBe(true);
  });

  it('wrong-direction throttle in ascendLower (moving back toward 0) never gets stuck: forward progress still reaches BLEND_START_S', () => {
    const sm = new EiffelStateMachine(new TypedEventBus());
    sm.gotoState('ascendLower');
    // Simulate some backward wobble first (arc length dips, never crosses the threshold).
    sm.update(SIM_DT, driveAt(5, 1), levelingSettled(true));
    sm.update(SIM_DT, driveAt(2, 1), levelingSettled(true));
    expect(sm.state).toBe('ascendLower');
    // Recovery: forward progress resumes and eventually crosses.
    sm.update(SIM_DT, driveAt(BLEND_START_S, 1), levelingSettled(true));
    expect(sm.state).toBe('transition');
  });
});

describe('EiffelStateMachine — camera cue emission (task mapping table)', () => {
  it('emits the documented entry cue for each state', () => {
    const expected: Partial<Record<GameStateId, string>> = {
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
    };
    for (const [id, cue] of Object.entries(expected) as [GameStateId, string][]) {
      const bus = new TypedEventBus();
      const recorder = new EventRecorder(bus);
      const sm = new EiffelStateMachine(bus);
      sm.gotoState(id);
      expect(recorder.cameraCues()).toContain(cue);
    }
  });

  it('ascendLower switches from carrierSide to firstSlope once arc length exceeds 30m', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('ascendLower');
    recorder.clear();
    sm.update(SIM_DT, driveAt(29, 1), levelingSettled(true));
    expect(recorder.cameraCues()).not.toContain('firstSlope');
    sm.update(SIM_DT, driveAt(31, 1), levelingSettled(true));
    expect(recorder.cameraCues()).toContain('firstSlope');
  });

  it('does NOT fire interiorProof on the very first update after entering transition, even if leveling already reads settled', () => {
    // INTEGRATOR FIX (Wave 4): `leveling.settled` is NOT reset on a natural
    // (auto-progression) entry into `transition` — it simply carries over
    // whatever it already was at the end of `ascendLower` (calm, settled).
    // The first `update()` call in `transition` must treat that as the
    // edge-detector's fresh BASELINE, not as a false->true edge — otherwise
    // `interiorProof` fires immediately, before `transitionClose` (the
    // signature-moment shot) is ever actually shown, and before the cabin
    // has even been disturbed by the steepening track.
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('transition');
    recorder.clear();
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // already settled: baseline only
    expect(recorder.cameraCues()).not.toContain('interiorProof');
    expect(recorder.soundCues()).not.toContain('chime');
  });

  it('leveling success while in transition briefly shows interiorProof, then reverts to transitionClose', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('transition');
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // baseline capture, no fire
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(false)); // the track disturbs the cabin
    recorder.clear();
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // REAL settled edge fires
    expect(recorder.cameraCues()).toContain('interiorProof');
    expect(recorder.fxCues()).toContain('sparkle');
    expect(recorder.soundCues()).toContain('chime');

    recorder.clear();
    for (let i = 0; i < 200 && sm.state === 'transition'; i++) {
      sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true));
    }
    expect(recorder.cameraCues()).toContain('transitionClose');
  });

  it('does not let LEVELED preempt the interiorProof brief when settle and BLEND_END_S coincide in the same tick', () => {
    // INTEGRATOR FIX (Wave 4): reproduces a real race found driving the
    // actual sim (not just this isolated state machine) — the auto-drive's
    // speed and the blend zone's length are close enough that
    // `leveling.settled` can flip false->true in the EXACT SAME fixed step
    // `drive.arcLength` first crosses `BLEND_END_S`. Before the fix, that
    // fired `LEVELED` (-> `ascendUpper`, cue `carrierSide`) in the very same
    // `update()` call that had just emitted `interiorProof` — overwriting it
    // before it was ever externally observable at any polling granularity,
    // including single-step (confirmed via a real e2e trace: state jumped
    // straight from `transition`/`transitionClose` to
    // `ascendUpper`/`carrierSide`, `interiorProof` never seen).
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('transition');
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // baseline capture, no fire
    sm.update(SIM_DT, driveAt(BLEND_END_S - 0.001, 1), levelingSettled(false)); // still short of BLEND_END_S, unsettled
    recorder.clear();

    // Settle AND cross BLEND_END_S in the very same tick — the race.
    sm.update(SIM_DT, driveAt(BLEND_END_S + 5, 1), levelingSettled(true));
    expect(recorder.cameraCues()).toContain('interiorProof');
    expect(sm.state).toBe('transition'); // must NOT have jumped to ascendUpper yet
    expect(recorder.stateChanges()).toHaveLength(0);

    // LEVELED must fire only once the interiorProof brief has actually run
    // its course (~INTERIOR_PROOF_BRIEF_S = 1.5s later), not immediately.
    let firedAfterSteps = -1;
    for (let i = 0; i < 200; i++) {
      sm.update(SIM_DT, driveAt(BLEND_END_S + 5, 1), levelingSettled(true));
      if (sm.state === 'ascendUpper') {
        firedAfterSteps = i;
        break;
      }
    }
    expect(firedAfterSteps).toBeGreaterThanOrEqual(0);
    const firedAfterSeconds = firedAfterSteps * SIM_DT;
    expect(firedAfterSeconds).toBeGreaterThan(1.0);
    expect(firedAfterSeconds).toBeLessThan(2.0);
  });
});

describe('EiffelStateMachine — sound cue emission', () => {
  it('emits valveOpen + hydraulicHum on the 0->positive valveOpen edge, valveClose on the way back to 0', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('machineRoom');
    recorder.clear();
    sm.update(SIM_DT, driveAt(0, 0.5), levelingSettled(true));
    expect(recorder.soundCues()).toContain('valveOpen');
    expect(recorder.soundCues()).toContain('hydraulicHum');

    recorder.clear();
    sm.update(SIM_DT, driveAt(0, 0), levelingSettled(true));
    expect(recorder.soundCues()).toContain('valveClose');
  });

  it('emits the causal-chain sounds on entering cableFollow', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('cableFollow');
    for (const cue of ['pistonMove', 'pulleyTurn', 'cableRun']) {
      expect(recorder.soundCues()).toContain(cue);
    }
  });

  it('emits carrierRide on entering each riding state', () => {
    for (const id of ['ascendLower', 'ascendUpper', 'descend'] as const) {
      const bus = new TypedEventBus();
      const recorder = new EventRecorder(bus);
      const sm = new EiffelStateMachine(bus);
      sm.gotoState(id);
      expect(recorder.soundCues()).toContain('carrierRide');
    }
  });

  it('emits brakeLock immediately and doorOpen after the door delay on arrival', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('arrival');
    expect(recorder.soundCues()).toContain('brakeLock');
    expect(recorder.soundCues()).not.toContain('doorOpen');
    for (let i = 0; i < 120; i++) sm.update(SIM_DT, driveAt(STATION_TOP_S, 0), levelingSettled(true));
    expect(recorder.soundCues()).toContain('doorOpen');
  });

  it('emits sparkle on entering celebrate', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('celebrate');
    expect(recorder.soundCues()).toContain('sparkle');
  });
});

describe('EiffelStateMachine — audio loop cadence (Wave 4 integrator fix)', () => {
  // EiffelAudioEngine (src/audio) treats hydraulicHum/cableRun/carrierRide
  // as keep-alive loops with no paired stop cue: a loop auto-fades ~260ms
  // after its last `handleCue` firing. A single edge/entry emission is
  // therefore a defect for a cue meant to sound for a multi-second ascent —
  // these cues must be RE-FIRED periodically for as long as the motion
  // driving them continues, not just once when it starts. Re-firing is
  // throttled to `LOOP_CUE_REFIRE_INTERVAL_S` (~120ms, comfortably inside
  // the 260ms keep-alive window) rather than every single fixed step — see
  // that constant's doc for why a per-step cadence turned out to be a real
  // integration defect of its own.
  const ONE_SIM_SECOND_STEPS = 60; // SIM_DT = 1/60s

  it('re-fires hydraulicHum and cableRun periodically (not just once) while valveOpen > 0, throttled below per-step', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('machineRoom');
    recorder.clear();

    for (let i = 0; i < ONE_SIM_SECOND_STEPS; i++) sm.update(SIM_DT, driveAt(0, 0.7), levelingSettled(true));

    const hums = recorder.soundCues().filter((cue) => cue === 'hydraulicHum');
    const cableRuns = recorder.soundCues().filter((cue) => cue === 'cableRun');
    // Repeated, not a one-shot ...
    expect(hums.length).toBeGreaterThanOrEqual(5);
    expect(cableRuns.length).toBeGreaterThanOrEqual(5);
    // ... but throttled well below a per-fixed-step cadence (60 steps).
    expect(hums.length).toBeLessThan(ONE_SIM_SECOND_STEPS);
    expect(cableRuns.length).toBeLessThan(ONE_SIM_SECOND_STEPS);
  });

  it('stops re-firing hydraulicHum/cableRun once valveOpen returns to 0 (lets the audio loop fade)', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('machineRoom');
    sm.update(SIM_DT, driveAt(0, 0.7), levelingSettled(true));
    recorder.clear();

    for (let i = 0; i < ONE_SIM_SECOND_STEPS; i++) sm.update(SIM_DT, driveAt(0, 0), levelingSettled(true));
    expect(recorder.soundCues()).not.toContain('hydraulicHum');
    expect(recorder.soundCues()).not.toContain('cableRun');
  });

  it('re-fires carrierRide periodically while riding (ascendLower/ascendUpper/transition/descend)', () => {
    for (const id of ['ascendLower', 'ascendUpper', 'transition', 'descend'] as const) {
      const bus = new TypedEventBus();
      const recorder = new EventRecorder(bus);
      const sm = new EiffelStateMachine(bus);
      sm.gotoState(id);
      recorder.clear();
      for (let i = 0; i < ONE_SIM_SECOND_STEPS; i++) {
        sm.update(SIM_DT, driveAt(sm.state === 'descend' ? 5 : 10, 0.8), levelingSettled(true));
      }
      const rides = recorder.soundCues().filter((cue) => cue === 'carrierRide');
      expect(rides.length).toBeGreaterThanOrEqual(5);
      expect(rides.length).toBeLessThan(ONE_SIM_SECOND_STEPS);
    }
  });

  it('does NOT fire carrierRide while in machineRoom (the causal chain has not reached the carrier yet)', () => {
    const bus = new TypedEventBus();
    const recorder = new EventRecorder(bus);
    const sm = new EiffelStateMachine(bus);
    sm.gotoState('machineRoom');
    recorder.clear();
    for (let i = 0; i < 5; i++) sm.update(SIM_DT, driveAt(3, 0.8), levelingSettled(true));
    expect(recorder.soundCues()).not.toContain('carrierRide');
  });
});

describe('EiffelStateMachine — auto-progression timers', () => {
  it('machineRoom advances to cableFollow only once valveOpen reaches (>=) 1', () => {
    const sm = new EiffelStateMachine(new TypedEventBus());
    sm.gotoState('machineRoom');
    sm.update(SIM_DT, driveAt(0, 0.99), levelingSettled(true));
    expect(sm.state).toBe('machineRoom');
    sm.update(SIM_DT, driveAt(0, 1), levelingSettled(true));
    expect(sm.state).toBe('cableFollow');
  });

  it('transition requires BOTH leveling settled AND arc length past BLEND_END_S', () => {
    // INTEGRATOR FIX (Wave 4): the settled-edge here also starts the
    // `interiorProof` brief overlay (see the dedicated race-condition test
    // above), which now legitimately gates `LEVELED` too for its
    // `INTERIOR_PROOF_BRIEF_S` window. Draining it before the final
    // "both satisfied" check (matching real play, where the assist settles
    // with margin to spare before the blend zone ends — see
    // `EiffelGameLogic`'s own "auto-drive speed comfortably outlasts the
    // settle window" doc) isolates THIS test back to what it's actually
    // checking: the `BLEND_END_S` gate, independent of that overlay.
    const sm = new EiffelStateMachine(new TypedEventBus());
    sm.gotoState('transition');
    sm.update(SIM_DT, driveAt(BLEND_END_S, 1), levelingSettled(false)); // past the arc, not yet settled
    expect(sm.state).toBe('transition');
    sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // settled, not yet past the arc
    expect(sm.state).toBe('transition');

    for (let i = 0; i < 200 && sm.state === 'transition'; i++) {
      sm.update(SIM_DT, driveAt(BLEND_START_S + 1, 1), levelingSettled(true)); // drain the interiorProof brief
    }
    expect(sm.state).toBe('transition'); // arc length still hasn't reached BLEND_END_S

    sm.update(SIM_DT, driveAt(BLEND_END_S, 1), levelingSettled(true)); // both satisfied, brief already drained
    expect(sm.state).toBe('ascendUpper');
  });

  it('descend requires reaching (or passing under) STATION_BOTTOM_S', () => {
    const sm = new EiffelStateMachine(new TypedEventBus());
    sm.gotoState('descend');
    sm.update(SIM_DT, driveAt(1, 1), levelingSettled(true));
    expect(sm.state).toBe('descend');
    sm.update(SIM_DT, driveAt(0, 1), levelingSettled(true));
    expect(sm.state).toBe('replayMenu');
  });
});
