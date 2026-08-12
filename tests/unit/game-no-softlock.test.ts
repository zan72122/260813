import { describe, expect, it } from 'vitest';
import { TypedEventBus } from '../../src/contracts/events';
import type { Intent } from '../../src/contracts/intents';
import type { LegId } from '../../src/contracts/types';
import { mulberry32 } from '../../src/contracts/rng';
import { createGame } from '../../src/game';
import type { GameController } from '../../src/game';

const LEGS: LegId[] = [0, 1, 2, 3];
const FAST_DT = 0.35;

function currentLegPhase(controller: GameController): string {
  const s = controller.getState();
  return s.legs[s.activeLeg].phase;
}

function skipOneCinematicBeat(controller: GameController, dt: number): void {
  controller.applyIntent({ type: 'advance' });
  controller.tick(dt);
}

function runToLegPhase(controller: GameController, target: string, dt: number, maxSteps = 60): void {
  let guard = 0;
  while (currentLegPhase(controller) !== target && guard < maxSteps) {
    skipOneCinematicBeat(controller, dt);
    guard++;
  }
  if (currentLegPhase(controller) !== target) {
    throw new Error(`runToLegPhase: did not reach '${target}', stuck at '${currentLegPhase(controller)}'`);
  }
}

function runToGamePhase(controller: GameController, target: string, dt: number, maxSteps = 80): void {
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

function randomIntent(rng: () => number): Intent {
  const pick = Math.floor(rng() * 7);
  switch (pick) {
    case 0:
      return { type: 'advance' };
    case 1:
      return { type: 'gateSet', open: rng() * 1.4 - 0.2 };
    case 2:
      return { type: 'jackStroke' };
    case 3:
      return { type: 'wedgeDrag', progress: rng() * 1.4 - 0.2 };
    case 4:
      return { type: 'wedgeRelease' };
    case 5:
      return { type: 'hammerTap' };
    default:
      return { type: 'gateSet', open: 0 };
  }
}

describe('GameController — no-softlock under intent spam interleaved with the real script', () => {
  it('random garbage intents/ticks before every scripted step never prevent eventual completion', () => {
    for (const seed of [1, 2, 3]) {
      const rng = mulberry32(seed * 999_331 + 7);
      const controller = createGame({ bus: new TypedEventBus(), seed, reducedMotion: true });

      const garbage = (): void => {
        for (let i = 0; i < 6; i++) {
          controller.applyIntent(randomIntent(rng));
          controller.tick(0.01);
        }
      };

      garbage();
      for (const leg of LEGS) {
        garbage();
        completeActiveLeg(controller, FAST_DT);
        expect(controller.getState().legs[leg].locked).toBe(true);
        garbage();
      }
      garbage();
      runToGamePhase(controller, 'complete', FAST_DT);
      expect(controller.getState().phase).toBe('complete');
      for (const leg of LEGS) expect(controller.getState().legs[leg].locked).toBe(true);
    }
  });

  it('pause/resume and replay spammed randomly throughout a playthrough never prevent eventual completion', () => {
    const rng = mulberry32(4242);
    const controller = createGame({ bus: new TypedEventBus(), seed: 4242, reducedMotion: true });

    const maybeToggle = (): void => {
      if (rng() < 0.15) {
        controller.pause();
        controller.resume();
      }
      if (rng() < 0.1) {
        controller.setSound(rng() < 0.5);
      }
    };

    for (const leg of LEGS) {
      maybeToggle();
      completeActiveLeg(controller, FAST_DT);
      expect(controller.getState().legs[leg].locked).toBe(true);
    }
    maybeToggle();
    runToGamePhase(controller, 'complete', FAST_DT);
    expect(controller.getState().phase).toBe('complete');
  });
});

describe('GameController — pure-random fuzz never crashes or corrupts state', () => {
  it('a long random walk of intents and ticks never throws and always keeps GameState well-formed', () => {
    const rng = mulberry32(31337);
    const controller = createGame({ bus: new TypedEventBus(), seed: 999, reducedMotion: rng() < 0.5 });

    expect(() => {
      for (let i = 0; i < 4000; i++) {
        controller.applyIntent(randomIntent(rng));
        if (i % 3 === 0) controller.tick(rng() * 0.5);
        if (rng() < 0.02) controller.pause();
        if (rng() < 0.02) controller.resume();
        if (rng() < 0.005) controller.replay();

        const s = controller.getState();
        expect(['boot', 'establish', 'leg', 'finalReveal', 'complete']).toContain(s.phase);
        expect(s.activeLeg).toBeGreaterThanOrEqual(0);
        expect(s.activeLeg).toBeLessThanOrEqual(3);
        for (const leg of LEGS) {
          expect(Number.isFinite(s.legs[leg].legOffsetY)).toBe(true);
          expect(Number.isFinite(s.legs[leg].alignmentError)).toBe(true);
          expect(s.legs[leg].sandLevel).toBeGreaterThanOrEqual(0);
          expect(s.legs[leg].sandLevel).toBeLessThanOrEqual(1);
          expect(s.legs[leg].wedgeProgress).toBeGreaterThanOrEqual(0);
          expect(s.legs[leg].wedgeProgress).toBeLessThanOrEqual(1);
        }
      }
    }).not.toThrow();
  });

  it('never regresses a locked leg back to unlocked under any amount of noise (short of an explicit replay)', () => {
    const rng = mulberry32(2718);
    const controller = createGame({ bus: new TypedEventBus(), seed: 2718, reducedMotion: true });
    completeActiveLeg(controller, FAST_DT);
    expect(controller.getState().legs[0].locked).toBe(true);
    const lockedSnapshot = structuredClone(controller.getState().legs[0]);

    for (let i = 0; i < 1000; i++) {
      const intent = randomIntent(rng);
      if (intent.type === 'replay') continue; // replay is an explicit, expected full reset — excluded here on purpose
      controller.applyIntent(intent);
      controller.tick(0.02);
    }

    expect(controller.getState().legs[0]).toEqual(lockedSnapshot);
  });

  it('the scripted flow always remains reachable from a controller that just endured heavy fuzzing', () => {
    const rng = mulberry32(1234);
    const controller = createGame({ bus: new TypedEventBus(), seed: 1234, reducedMotion: true });

    for (let i = 0; i < 800; i++) {
      controller.applyIntent(randomIntent(rng));
      controller.tick(rng() * 0.3);
    }

    // Regardless of whatever state the fuzzing left the controller in, a
    // fresh replay must deterministically reach a completable state.
    controller.replay();
    controller.tick(FAST_DT);
    expect(controller.getState().phase).toBe('establish');

    for (const _leg of LEGS) completeActiveLeg(controller, FAST_DT);
    runToGamePhase(controller, 'complete', FAST_DT);
    expect(controller.getState().phase).toBe('complete');
    for (const leg of LEGS) expect(controller.getState().legs[leg].locked).toBe(true);
  });
});
