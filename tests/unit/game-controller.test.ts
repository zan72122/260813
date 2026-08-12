import { describe, expect, it } from 'vitest';
import { TypedEventBus } from '../../src/contracts/events';
import type { EventBus, GameEvent, GameEventType } from '../../src/contracts/events';
import type { LegId } from '../../src/contracts/types';
import { createGame } from '../../src/game';
import type { GameController } from '../../src/game';

const LEGS: LegId[] = [0, 1, 2, 3];
/** A larger-than-real-time dt is safe to drive physics with — sandStep/jackStroke both clamp to the remaining distance. */
const FAST_DT = 0.35;

function createRecordingBus(): { bus: EventBus; log: GameEvent[] } {
  const inner = new TypedEventBus();
  const log: GameEvent[] = [];
  const bus: EventBus = {
    emit(e) {
      log.push(e);
      inner.emit(e);
    },
    on(t, fn) {
      return inner.on(t, fn);
    },
  };
  return { bus, log };
}

function currentLegPhase(controller: GameController): string {
  const s = controller.getState();
  return s.legs[s.activeLeg].phase;
}

/** Repeatedly sends `advance` + one tick — each pair fast-forwards exactly one internal cinematic segment (or is a safe no-op). */
function skipOneCinematicBeat(controller: GameController, dt: number): void {
  controller.applyIntent({ type: 'advance' });
  controller.tick(dt);
}

function runToLegPhase(controller: GameController, target: string, dt: number, maxSteps = 30): void {
  let guard = 0;
  while (currentLegPhase(controller) !== target && guard < maxSteps) {
    skipOneCinematicBeat(controller, dt);
    guard++;
  }
  if (currentLegPhase(controller) !== target) {
    throw new Error(`runToLegPhase: did not reach '${target}', stuck at '${currentLegPhase(controller)}'`);
  }
}

function runToGamePhase(controller: GameController, target: string, dt: number, maxSteps = 40): void {
  let guard = 0;
  while (controller.getState().phase !== target && guard < maxSteps) {
    skipOneCinematicBeat(controller, dt);
    guard++;
  }
  if (controller.getState().phase !== target) {
    throw new Error(`runToGamePhase: did not reach '${target}', stuck at '${controller.getState().phase}'`);
  }
}

function driveSandToDepletion(controller: GameController, dt = FAST_DT): void {
  controller.applyIntent({ type: 'gateSet', open: 1 });
  let guard = 0;
  while (currentLegPhase(controller) === 'sand' && guard < 5000) {
    controller.tick(dt);
    guard++;
  }
  if (guard >= 5000) throw new Error('driveSandToDepletion did not converge');
}

function driveJackToWedge(controller: GameController, dt = FAST_DT): void {
  let guard = 0;
  while (currentLegPhase(controller) === 'jack' && guard < 200) {
    controller.applyIntent({ type: 'jackStroke' });
    controller.tick(dt);
    guard++;
  }
  if (guard >= 200) throw new Error('driveJackToWedge did not converge');
}

/** Full scripted happy path for exactly the currently active leg, from wherever it is through to locked. */
function completeActiveLeg(controller: GameController, dt = FAST_DT): void {
  runToLegPhase(controller, 'sand', dt);
  driveSandToDepletion(controller, dt);
  driveJackToWedge(controller, dt);
  runToLegPhase(controller, 'wedge', dt);
  controller.applyIntent({ type: 'wedgeDrag', progress: 1 });
  controller.tick(dt);
  controller.applyIntent({ type: 'hammerTap' });
  controller.tick(dt);
}

function eventTypesOf(log: GameEvent[]): GameEventType[] {
  return log.map((e) => e.type);
}

function firstIndex(log: GameEvent[], pred: (e: GameEvent) => boolean): number {
  return log.findIndex(pred);
}

describe('GameController — full scripted leg event sequence', () => {
  it('drives leg 0 through the full causal chain with every documented event, correctly ordered', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 7, reducedMotion: true });

    runToLegPhase(controller, 'sand', FAST_DT);
    driveSandToDepletion(controller, FAST_DT);
    driveJackToWedge(controller, FAST_DT);
    runToLegPhase(controller, 'wedge', FAST_DT);
    controller.applyIntent({ type: 'wedgeDrag', progress: 1 });
    controller.tick(FAST_DT);
    controller.applyIntent({ type: 'hammerTap' });
    controller.tick(FAST_DT);

    const leg0 = (e: GameEvent): boolean => 'leg' in e && e.leg === 0;

    const idxGateOpened = firstIndex(log, (e) => e.type === 'gateOpened' && leg0(e));
    const idxSandFlow = firstIndex(log, (e) => e.type === 'sandFlow' && leg0(e) && e.rate > 0);
    const idxNearTarget = firstIndex(log, (e) => e.type === 'nearTarget' && leg0(e));
    const idxSandDepleted = firstIndex(log, (e) => e.type === 'sandDepleted' && leg0(e));
    const idxFirstPump = firstIndex(log, (e) => e.type === 'jackPumped' && leg0(e));
    const idxSnapped = firstIndex(log, (e) => e.type === 'snapped' && leg0(e));
    const idxWedgeSeated = firstIndex(log, (e) => e.type === 'wedgeSeated' && leg0(e));
    const idxHammered = firstIndex(log, (e) => e.type === 'hammered' && leg0(e));
    const idxLegLocked = firstIndex(log, (e) => e.type === 'legLocked' && leg0(e));

    for (const [name, idx] of Object.entries({
      idxGateOpened,
      idxSandFlow,
      idxNearTarget,
      idxSandDepleted,
      idxFirstPump,
      idxSnapped,
      idxWedgeSeated,
      idxHammered,
      idxLegLocked,
    })) {
      expect(idx, `${name} should have fired`).toBeGreaterThanOrEqual(0);
    }

    // Causal ordering: gate open -> sand flowing -> (nearTarget crosses during sand, since
    // sandUndershoot < ASSIST_RADIUS always) -> sand depleted -> pumps -> snap -> wedge seated -> hammered -> locked.
    expect(idxGateOpened).toBeLessThan(idxSandFlow);
    expect(idxSandFlow).toBeLessThan(idxNearTarget);
    expect(idxNearTarget).toBeLessThan(idxSandDepleted);
    expect(idxSandDepleted).toBeLessThan(idxFirstPump);
    expect(idxFirstPump).toBeLessThan(idxSnapped);
    expect(idxSnapped).toBeLessThan(idxWedgeSeated);
    expect(idxWedgeSeated).toBeLessThan(idxHammered);
    expect(idxHammered).toBeLessThan(idxLegLocked);

    expect(controller.getState().legs[0].locked).toBe(true);
  });

  it('emits legPhaseChanged for every leg-phase transition and magnifierShown true-at-jack-start, false-at-snap', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 11, reducedMotion: true });
    completeActiveLeg(controller, FAST_DT);

    const legPhases = log
      .filter((e): e is Extract<GameEvent, { type: 'legPhaseChanged' }> => e.type === 'legPhaseChanged' && e.leg === 0)
      .map((e) => e.legPhase);
    expect(legPhases).toEqual(['intro', 'sand', 'jack', 'wedge', 'locked']);

    const magEvents = log.filter(
      (e): e is Extract<GameEvent, { type: 'magnifierShown' }> => e.type === 'magnifierShown' && e.leg === 0,
    );
    expect(magEvents.length).toBeGreaterThanOrEqual(2);
    expect(magEvents[0]?.shown).toBe(true);
    expect(magEvents.at(-1)?.shown).toBe(false);
  });

  it('emits the correct cameraCue choreography for a leg (activeLeg, sandboxCutaway, jackCloseup, alignment, wedge)', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 3, reducedMotion: true });
    completeActiveLeg(controller, FAST_DT);

    const cues = log
      .filter((e): e is Extract<GameEvent, { type: 'cameraCue' }> => e.type === 'cameraCue')
      .map((e) => e.cue.kind);

    expect(cues).toContain('establish');
    expect(cues).toContain('activeLeg');
    expect(cues).toContain('sandboxCutaway');
    expect(cues).toContain('jackCloseup');
    expect(cues).toContain('alignment');
    expect(cues).toContain('wedge');

    expect(cues.indexOf('establish')).toBeLessThan(cues.indexOf('activeLeg'));
    expect(cues.indexOf('activeLeg')).toBeLessThan(cues.indexOf('sandboxCutaway'));
    expect(cues.indexOf('sandboxCutaway')).toBeLessThan(cues.indexOf('jackCloseup'));
    expect(cues.indexOf('alignment')).toBeLessThan(cues.indexOf('wedge'));
  });
});

describe('GameController — full 4-leg playthrough', () => {
  it('produces allLegsLocked -> revealBeat 0..3 -> settled -> complete, with orbitToNext between every pair of legs', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 42, reducedMotion: true });

    for (const leg of LEGS) {
      completeActiveLeg(controller, FAST_DT);
      expect(controller.getState().legs[leg].locked).toBe(true);
    }
    runToGamePhase(controller, 'complete', FAST_DT);

    const types = eventTypesOf(log);
    expect(types).toContain('allLegsLocked');

    const idxAllLocked = firstIndex(log, (e) => e.type === 'allLegsLocked');
    const idxFinalReveal = firstIndex(log, (e) => e.type === 'phaseChanged' && e.phase === 'finalReveal');
    expect(idxAllLocked).toBeLessThan(idxFinalReveal);

    const revealBeats = log
      .filter((e): e is Extract<GameEvent, { type: 'revealBeat' }> => e.type === 'revealBeat')
      .map((e) => e.index);
    expect(revealBeats).toEqual([0, 1, 2, 3]);

    const idxLastBeat = firstIndex(log, (e) => e.type === 'revealBeat' && e.index === 3);
    const idxSettled = firstIndex(log, (e) => e.type === 'settled');
    const idxComplete = firstIndex(log, (e) => e.type === 'phaseChanged' && e.phase === 'complete');
    expect(idxLastBeat).toBeLessThan(idxSettled);
    expect(idxSettled).toBeLessThan(idxComplete);

    const cueKinds = log
      .filter((e): e is Extract<GameEvent, { type: 'cameraCue' }> => e.type === 'cameraCue')
      .map((e) => e.cue.kind);
    expect(cueKinds.filter((k) => k === 'orbitToNext')).toHaveLength(3); // between leg0-1, leg1-2, leg2-3
    expect(cueKinds).toContain('topReveal');
    expect(cueKinds).toContain('pullback');
    expect(cueKinds.indexOf('topReveal')).toBeLessThan(cueKinds.indexOf('pullback'));

    for (const leg of LEGS) expect(controller.getState().legs[leg].locked).toBe(true);
    expect(controller.getState().phase).toBe('complete');
  });

  it('orbitToNext cue carries the correct from/to leg pair', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 5, reducedMotion: true });
    completeActiveLeg(controller, FAST_DT); // locks leg 0, cascades leg 1 into intro

    const orbit = log.find(
      (e): e is Extract<GameEvent, { type: 'cameraCue' }> =>
        e.type === 'cameraCue' && e.cue.kind === 'orbitToNext',
    );
    expect(orbit).toBeDefined();
    if (orbit?.cue.kind === 'orbitToNext') {
      expect(orbit.cue.from).toBe(0);
      expect(orbit.cue.to).toBe(1);
    }
  });
});

describe('GameController — determinism', () => {
  it('identical intent/tick scripts against the same seed produce identical event logs', () => {
    const seed = 20260812;
    const runA = createRecordingBus();
    const runB = createRecordingBus();
    const a = createGame({ bus: runA.bus, seed, reducedMotion: true });
    const b = createGame({ bus: runB.bus, seed, reducedMotion: true });

    expect(a.seed).toBe(b.seed);

    const script = (controller: GameController): void => {
      for (const _leg of LEGS) completeActiveLeg(controller, FAST_DT);
      runToGamePhase(controller, 'complete', FAST_DT);
    };
    script(a);
    script(b);

    expect(runA.log).toEqual(runB.log);
  });

  it('different seeds produce different initial-offset-derived event payloads', () => {
    const runA = createRecordingBus();
    const runB = createRecordingBus();
    const a = createGame({ bus: runA.bus, seed: 1, reducedMotion: true });
    const b = createGame({ bus: runB.bus, seed: 2, reducedMotion: true });
    expect(a.seed).not.toBe(b.seed);

    completeActiveLeg(a, FAST_DT);
    completeActiveLeg(b, FAST_DT);

    // sandDepleted timing/order relative to other same-tick events is seed-scenario-dependent;
    // simplest robust determinism-sensitive check is that the two full logs differ.
    expect(runA.log).not.toEqual(runB.log);
  });
});

describe('GameController — pause/resume', () => {
  it('tick() is a total no-op while paused, and resume continues exactly where it left off', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 9, reducedMotion: true });
    runToLegPhase(controller, 'sand', FAST_DT);

    controller.applyIntent({ type: 'gateSet', open: 1 });
    controller.tick(FAST_DT);
    const beforePause = controller.getState();

    controller.pause();
    expect(controller.getState().paused).toBe(true);
    const logLengthAtPause = log.length;

    // Spam intents and ticks while paused — nothing should change.
    controller.applyIntent({ type: 'gateSet', open: 1 });
    controller.applyIntent({ type: 'jackStroke' });
    for (let i = 0; i < 20; i++) controller.tick(FAST_DT);
    expect(controller.getState().legs[0]).toEqual(beforePause.legs[0]);
    expect(log.length).toBe(logLengthAtPause);

    controller.resume();
    expect(controller.getState().paused).toBe(false);
    controller.tick(FAST_DT);
    // Gameplay resumes: further ticks with the gate held should keep lowering the leg.
    driveSandToDepletion(controller, FAST_DT);
    expect(currentLegPhase(controller)).toBe('jack');
  });

  it('pauseChanged fires only on an actual change, never on redundant pause()/resume() calls', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 1, reducedMotion: true });
    controller.pause();
    controller.pause();
    controller.pause();
    controller.resume();
    controller.resume();

    const pauseEvents = log.filter((e) => e.type === 'pauseChanged');
    expect(pauseEvents).toEqual([
      { type: 'pauseChanged', paused: true },
      { type: 'pauseChanged', paused: false },
    ]);
  });
});

describe('GameController — replay', () => {
  it('resets to a fresh establish phase with the same seed, all legs unlocked, and emits replayRequested', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 20260812, reducedMotion: true });
    const seed = controller.seed;

    for (const _leg of LEGS) completeActiveLeg(controller, FAST_DT);
    runToGamePhase(controller, 'complete', FAST_DT);
    expect(controller.getState().phase).toBe('complete');

    controller.replay();
    controller.tick(FAST_DT);

    expect(log.some((e) => e.type === 'replayRequested')).toBe(true);
    expect(controller.seed).toBe(seed);
    const s = controller.getState();
    expect(s.phase).toBe('establish');
    expect(s.paused).toBe(false);
    for (const leg of LEGS) {
      expect(s.legs[leg].locked).toBe(false);
      expect(s.legs[leg].sandLevel).toBe(1);
    }
  });

  it('a full playthrough after replay reaches byte-identical leg trajectories to a fresh controller with the same seed', () => {
    const seed = 555;
    const gameA = createGame({ bus: createRecordingBus().bus, seed, reducedMotion: true });
    const legsAfterEachLeg: unknown[] = [];
    for (const _leg of LEGS) {
      completeActiveLeg(gameA, FAST_DT);
      legsAfterEachLeg.push(structuredClone(gameA.getState().legs));
    }
    runToGamePhase(gameA, 'complete', FAST_DT);

    // Replay gameA and play through again from scratch.
    gameA.replay();
    gameA.tick(FAST_DT);
    const legsAfterEachLegPostReplay: unknown[] = [];
    for (const _leg of LEGS) {
      completeActiveLeg(gameA, FAST_DT);
      legsAfterEachLegPostReplay.push(structuredClone(gameA.getState().legs));
    }
    runToGamePhase(gameA, 'complete', FAST_DT);

    const gameB = createGame({ bus: createRecordingBus().bus, seed, reducedMotion: true });
    const legsB: unknown[] = [];
    for (const _leg of LEGS) {
      completeActiveLeg(gameB, FAST_DT);
      legsB.push(structuredClone(gameB.getState().legs));
    }
    runToGamePhase(gameB, 'complete', FAST_DT);

    expect(legsAfterEachLeg).toEqual(legsB);
    expect(legsAfterEachLegPostReplay).toEqual(legsB);
  });

  it('replay works mid-leg (before any leg is complete) and still resets deterministically', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 8, reducedMotion: true });
    runToLegPhase(controller, 'sand', FAST_DT);
    controller.applyIntent({ type: 'gateSet', open: 1 });
    controller.tick(FAST_DT);
    controller.tick(FAST_DT);

    controller.replay();
    controller.tick(FAST_DT);

    expect(log.some((e) => e.type === 'replayRequested')).toBe(true);
    const s = controller.getState();
    expect(s.phase).toBe('establish');
    expect(s.legs[0].locked).toBe(false);
  });

  it('soundOn/reducedMotion survive replay; paused/elapsed reset', () => {
    const { bus } = createRecordingBus();
    const controller = createGame({ bus, seed: 2, reducedMotion: true, soundOn: false });
    controller.applyIntent({ type: 'advance' });
    controller.tick(FAST_DT);
    controller.pause();
    controller.resume();

    controller.replay();
    controller.tick(FAST_DT);

    const s = controller.getState();
    expect(s.soundOn).toBe(false);
    expect(s.reducedMotion).toBe(true);
    expect(s.paused).toBe(false);
  });
});

describe('GameController — setSound', () => {
  it('emits soundToggled only on an actual change', () => {
    const { bus, log } = createRecordingBus();
    const controller = createGame({ bus, seed: 1, soundOn: true });
    controller.setSound(true); // no-op, already true
    controller.setSound(false);
    controller.setSound(false); // no-op
    controller.setSound(true);

    const events = log.filter((e) => e.type === 'soundToggled');
    expect(events).toEqual([
      { type: 'soundToggled', on: false },
      { type: 'soundToggled', on: true },
    ]);
  });
});

describe('GameController — reducedMotion shortens cinematics', () => {
  it('reaches sand phase in fewer real ticks with reducedMotion than without, for the same dt', () => {
    const dt = 0.05;
    const withReduced = createGame({ bus: createRecordingBus().bus, seed: 4, reducedMotion: true });
    const withoutReduced = createGame({ bus: createRecordingBus().bus, seed: 4, reducedMotion: false });

    function ticksToSand(controller: GameController): number {
      let ticks = 0;
      controller.applyIntent({ type: 'advance' }); // boot -> establish (no cinematic to shorten here, but harmless)
      while (currentLegPhase(controller) !== 'sand' && ticks < 20000) {
        controller.tick(dt);
        ticks++;
      }
      return ticks;
    }

    const reducedTicks = ticksToSand(withReduced);
    const normalTicks = ticksToSand(withoutReduced);
    expect(reducedTicks).toBeGreaterThan(0);
    expect(reducedTicks).toBeLessThan(normalTicks);
  });
});
