import { describe, expect, it } from 'vitest';
import { createGameState, setPaused, transition } from '../../src/contracts/stateMachine';
import { mulberry32 } from '../../src/contracts/rng';
import type { GameState, LegId } from '../../src/contracts/types';
import type { Intent } from '../../src/contracts/intents';
import { FIXED_DT } from '../../src/contracts/constants';

const LEGS: LegId[] = [0, 1, 2, 3];

function doIntent(state: GameState, intent: Intent, dt = FIXED_DT): GameState {
  return transition(state, { kind: 'intent', intent, dt });
}

const advance = (s: GameState): GameState => doIntent(s, { type: 'advance' });
const setGate = (s: GameState, open: number): GameState => doIntent(s, { type: 'gateSet', open });
const pump = (s: GameState): GameState => doIntent(s, { type: 'jackStroke' });
const dragWedge = (s: GameState, p: number): GameState => doIntent(s, { type: 'wedgeDrag', progress: p });
const releaseWedge = (s: GameState): GameState => doIntent(s, { type: 'wedgeRelease' });
const hammerTap = (s: GameState): GameState => doIntent(s, { type: 'hammerTap' });
const replay = (s: GameState): GameState => doIntent(s, { type: 'replay' });

/** Drives the sand phase to full depletion (phase auto-flips to 'jack'). */
function driveSandToDepletion(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.legs[s.activeLeg].phase === 'sand' && guard < 200_000) {
    s = setGate(s, 1);
    guard++;
  }
  if (guard >= 200_000) throw new Error('driveSandToDepletion did not converge');
  return s;
}

/** Pumps until the leg leaves 'jack' (auto snap→wedge cascade). */
function driveJackToWedge(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.legs[s.activeLeg].phase === 'jack' && guard < 100) {
    s = pump(s);
    guard++;
  }
  if (guard >= 100) throw new Error('driveJackToWedge did not converge');
  return s;
}

/** Full scripted happy-path for exactly the currently active leg, from idle/intro through locked. */
function completeActiveLeg(state: GameState): GameState {
  let s = state;
  s = advance(s); // intro -> sand
  s = driveSandToDepletion(s); // sand -> jack (auto)
  s = driveJackToWedge(s); // jack -> wedge (auto snap cascade)
  s = dragWedge(s, 1); // seat the wedge
  s = hammerTap(s); // lock (+ cascade to next leg / finalReveal)
  return s;
}

/** Scripted full playthrough: boot -> establish -> 4 legs -> finalReveal -> complete. */
function playThrough(seed: number, onAfterEachLeg?: (s: GameState, leg: LegId) => void): GameState {
  let s = createGameState(seed);
  s = advance(s); // boot -> establish
  s = advance(s); // establish -> leg (leg0 intro)
  for (const leg of LEGS) {
    s = completeActiveLeg(s);
    onAfterEachLeg?.(s, leg);
  }
  s = advance(s); // finalReveal -> complete
  return s;
}

describe('createGameState', () => {
  it('same seed twice deep-equals (determinism, invariant 8)', () => {
    expect(createGameState(20260812)).toEqual(createGameState(20260812));
  });

  it('starts at boot, leg 0 active, no leg locked', () => {
    const s = createGameState(1);
    expect(s.phase).toBe('boot');
    expect(s.activeLeg).toBe(0);
    expect(s.paused).toBe(false);
    for (const leg of LEGS) expect(s.legs[leg].locked).toBe(false);
  });
});

describe('boot/establish/leg-intro global transitions', () => {
  it('advance walks boot -> establish -> leg(intro, leg0)', () => {
    let s = createGameState(1);
    expect(s.phase).toBe('boot');
    s = advance(s);
    expect(s.phase).toBe('establish');
    s = advance(s);
    expect(s.phase).toBe('leg');
    expect(s.activeLeg).toBe(0);
    expect(s.legs[0].phase).toBe('intro');
  });

  it('non-advance intents are safe no-ops during boot/establish (no crash, no state change besides elapsed)', () => {
    const s = createGameState(1);
    for (const intent of [{ type: 'jackStroke' as const }, { type: 'hammerTap' as const }, { type: 'wedgeRelease' as const }]) {
      const next = doIntent(s, intent);
      expect(next.phase).toBe(s.phase);
      expect(next.legs).toEqual(s.legs);
    }
  });
});

describe('sand phase — invariant 1 & 2 at the reducer level, and the sand->jack auto-cascade', () => {
  it('gate held drains sand to depletion and auto-flips the leg to jack phase', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s); // leg0 intro
    s = advance(s); // intro -> sand
    expect(s.legs[0].phase).toBe('sand');
    s = driveSandToDepletion(s);
    expect(s.legs[0].phase).toBe('jack');
    expect(s.legs[0].sandLevel).toBe(0);
  });

  it('only gateSet has any effect during sand phase — jackStroke/hammerTap/wedgeDrag are no-ops', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    expect(s.legs[0].phase).toBe('sand');
    const before = s.legs[0];
    for (const intent of [{ type: 'jackStroke' as const }, { type: 'hammerTap' as const }, { type: 'wedgeDrag' as const, progress: 1 }]) {
      const next = doIntent(s, intent);
      expect(next.legs[0]).toEqual(before);
    }
  });
});

describe('jack phase — invariant 3, and the auto snap->wedge cascade (invariant 4)', () => {
  it('pumping is the only effective intent, and legOffsetY never exceeds 0', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    expect(s.legs[0].phase).toBe('jack');

    let prev = s.legs[0].legOffsetY;
    for (let i = 0; i < 30 && s.legs[0].phase === 'jack'; i++) {
      s = pump(s);
      const cur = s.legs[0].legOffsetY;
      expect(cur).toBeLessThanOrEqual(0);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('crossing SNAP_TOLERANCE finalizes legOffsetY to 0 and moves the leg straight to wedge phase', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    s = driveJackToWedge(s);
    expect(s.legs[0].phase).toBe('wedge');
    expect(s.legs[0].legOffsetY).toBe(0);
    expect(s.legs[0].alignmentError).toBe(0);
    expect(s.legs[0].locked).toBe(false);
  });

  it('1000 rapid pump intents sent after already snapped-to-wedge are safe no-ops (no overshoot possible)', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    s = driveJackToWedge(s);
    const before = s.legs[0];
    for (let i = 0; i < 1000; i++) s = pump(s);
    expect(s.legs[0]).toEqual(before);
  });
});

describe('wedge/hammer phase', () => {
  it('hammerTap before the wedge is seated (progress < threshold) is a safe no-op', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    s = driveJackToWedge(s);
    s = dragWedge(s, 0.5); // not seated
    const before = s.legs[0];
    s = hammerTap(s);
    expect(s.legs[0]).toEqual(before);
    expect(s.legs[0].locked).toBe(false);
  });

  it('mid-drag wedgeRelease never punishes — progress holds, leg stays unlockable-later', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    s = driveJackToWedge(s);
    s = dragWedge(s, 0.6);
    const beforeRelease = s.legs[0].wedgeProgress;
    s = releaseWedge(s);
    expect(s.legs[0].wedgeProgress).toBe(beforeRelease);
    s = dragWedge(s, 1);
    s = hammerTap(s);
    expect(s.legs[0].locked).toBe(true);
  });

  it('seated + hammerTap locks the leg and emits it via legs[].locked', () => {
    let s = createGameState(7);
    s = advance(s);
    s = advance(s);
    s = advance(s);
    s = driveSandToDepletion(s);
    s = driveJackToWedge(s);
    s = dragWedge(s, 1);
    s = hammerTap(s);
    expect(s.legs[0].locked).toBe(true);
    expect(s.legs[0].phase).toBe('locked');
  });
});

describe('full playthrough — invariant 6 (finalReveal only once all 4 locked) and leg progression', () => {
  it('locking legs 0..2 never reaches finalReveal; locking leg 3 does, immediately', () => {
    let s = createGameState(3);
    s = advance(s);
    s = advance(s);

    for (const leg of [0, 1, 2] as const) {
      s = completeActiveLeg(s);
      expect(s.phase).toBe('leg');
      expect(s.legs[leg].locked).toBe(true);
      expect(s.activeLeg).toBe(((leg + 1) as LegId));
      expect(s.legs[s.activeLeg].phase).toBe('intro');
      for (const other of LEGS) {
        if (other > leg) expect(s.legs[other].locked).toBe(false);
      }
    }

    s = completeActiveLeg(s); // leg 3
    expect(s.legs[3].locked).toBe(true);
    expect(s.phase).toBe('finalReveal');
    for (const leg of LEGS) expect(s.legs[leg].locked).toBe(true);
  });

  it('finalReveal -> advance -> complete', () => {
    const s = playThrough(3);
    expect(s.phase).toBe('complete');
    for (const leg of LEGS) expect(s.legs[leg].locked).toBe(true);
  });

  it('a locked leg is never touched again by later legs progressing (structural immutability)', () => {
    let s = createGameState(11);
    s = advance(s);
    s = advance(s);
    s = completeActiveLeg(s); // leg 0 locked
    const leg0Snapshot = s.legs[0];
    s = completeActiveLeg(s); // leg 1
    s = completeActiveLeg(s); // leg 2
    s = completeActiveLeg(s); // leg 3 -> finalReveal
    expect(s.legs[0]).toEqual(leg0Snapshot);
  });
});

describe('pause/resume — invariant 7', () => {
  it('while paused, transition() is a total no-op for every intent type', () => {
    let s = createGameState(5);
    s = advance(s);
    s = setPaused(s, true);
    const snapshot = s;
    for (const intent of [
      { type: 'advance' as const },
      { type: 'gateSet' as const, open: 1 },
      { type: 'jackStroke' as const },
      { type: 'wedgeDrag' as const, progress: 1 },
      { type: 'wedgeRelease' as const },
      { type: 'hammerTap' as const },
      { type: 'replay' as const },
    ]) {
      expect(doIntent(s, intent)).toBe(snapshot);
    }
  });

  it('pausing and resuming at every stage of a playthrough loses no state', () => {
    let s = createGameState(9);
    s = advance(s);
    s = advance(s);
    for (let i = 0; i < 4; i++) {
      s = advance(s); // intro -> sand
      s = setPaused(s, true);
      s = setPaused(s, false); // pause/resume with no gameplay in between
      s = driveSandToDepletion(s);
      s = setPaused(s, true);
      s = setPaused(s, false);
      s = driveJackToWedge(s);
      s = setPaused(s, true);
      s = setPaused(s, false);
      s = dragWedge(s, 1);
      s = hammerTap(s);
    }
    expect(s.phase).toBe('finalReveal');
    for (const leg of LEGS) expect(s.legs[leg].locked).toBe(true);
  });
});

describe('replay — invariant 8 (deterministic reset)', () => {
  it('replay from a fully-completed game resets legs to a fresh createGameState with the same seed', () => {
    const seed = 20260812;
    const completed = playThrough(seed);
    const replayed = replay(completed);
    const fresh = createGameState(seed);
    expect(replayed.phase).toBe('establish');
    expect(replayed.activeLeg).toBe(0);
    expect(replayed.legs).toEqual(fresh.legs);
    expect(replayed.seed).toBe(seed);
    for (const leg of LEGS) expect(replayed.legs[leg].locked).toBe(false);
  });

  it('replay preserves soundOn/reducedMotion but resets paused/elapsed', () => {
    const seed = 42;
    let s = createGameState(seed, { soundOn: false, reducedMotion: true });
    s = advance(s);
    s = setPaused(s, true);
    s = setPaused(s, false);
    s = replay(s);
    expect(s.soundOn).toBe(false);
    expect(s.reducedMotion).toBe(true);
    expect(s.paused).toBe(false);
  });

  it('replay is available from any phase, and is deterministic regardless of how much progress preceded it', () => {
    const seed = 77;
    const earlyReplay = replay(advance(createGameState(seed)));
    const lateReplay = replay(playThrough(seed));
    expect(earlyReplay.legs).toEqual(lateReplay.legs);
    expect(earlyReplay.phase).toBe(lateReplay.phase);
  });

  it('two independent playthroughs of the same seed produce byte-identical leg trajectories', () => {
    const seed = 555;
    const legsA: unknown[] = [];
    const legsB: unknown[] = [];
    playThrough(seed, (s) => legsA.push(structuredClone(s.legs)));
    playThrough(seed, (s) => legsB.push(structuredClone(s.legs)));
    expect(legsA).toEqual(legsB);
  });
});

describe('no soft-lock — invariant 9', () => {
  it('random garbage intents interspersed throughout never prevent eventual completion', () => {
    const rng = mulberry32(2026);
    function randomIntent(): Intent {
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

    for (const seed of [1, 2, 3]) {
      let s = createGameState(seed);
      // Spam garbage before every scripted step; the scripted path must
      // still succeed regardless of how much noise preceded it.
      const garbage = (state: GameState): GameState => {
        let cur = state;
        for (let i = 0; i < 5; i++) cur = doIntent(cur, randomIntent());
        return cur;
      };

      s = garbage(s);
      s = advance(s); // boot -> establish
      s = garbage(s);
      s = advance(s); // establish -> leg0 intro
      for (const leg of LEGS) {
        s = garbage(s);
        s = advance(s); // intro -> sand (no-op if garbage already advanced it — advance from 'sand' is itself a no-op)
        s = garbage(s);
        s = driveSandToDepletion(s);
        s = garbage(s);
        s = driveJackToWedge(s);
        // wedgeDrag is the one intent that can *regress* progress (a real
        // player can legitimately let go and re-grab lower), so garbage
        // sandwiched between seating and hammering can transiently un-seat
        // it — that is correct behavior, not a soft-lock. Proving no
        // soft-lock means persistent correct effort always eventually
        // wins, not that a single attempt can never be undone by noise.
        let guard = 0;
        while (!s.legs[leg].locked && guard < 50) {
          s = garbage(s);
          s = dragWedge(s, 1);
          s = hammerTap(s);
          guard++;
        }
        expect(guard).toBeLessThan(50);
        expect(s.legs[leg].locked).toBe(true);
      }
      s = garbage(s);
      s = advance(s);
      expect(s.phase).toBe('complete');
    }
  });

  it('a long random walk of intents from any state never throws and always keeps GameState well-formed', () => {
    const rng = mulberry32(31337);
    const intentTypes: Intent['type'][] = [
      'gateSet',
      'jackStroke',
      'wedgeDrag',
      'wedgeRelease',
      'hammerTap',
      'advance',
      'replay',
    ];
    function randomIntent(): Intent {
      const t = intentTypes[Math.floor(rng() * intentTypes.length)] ?? 'advance';
      if (t === 'gateSet') return { type: 'gateSet', open: rng() };
      if (t === 'wedgeDrag') return { type: 'wedgeDrag', progress: rng() };
      return { type: t };
    }

    let s = createGameState(999);
    expect(() => {
      for (let i = 0; i < 5000; i++) {
        s = doIntent(s, randomIntent());
        expect(['boot', 'establish', 'leg', 'finalReveal', 'complete']).toContain(s.phase);
        expect(s.activeLeg).toBeGreaterThanOrEqual(0);
        expect(s.activeLeg).toBeLessThanOrEqual(3);
        for (const leg of LEGS) {
          expect(Number.isFinite(s.legs[leg].legOffsetY)).toBe(true);
          expect(Number.isFinite(s.legs[leg].sandLevel)).toBe(true);
          expect(s.legs[leg].sandLevel).toBeGreaterThanOrEqual(0);
          expect(s.legs[leg].sandLevel).toBeLessThanOrEqual(1);
          expect(s.legs[leg].alignmentError).toBeCloseTo(Math.abs(s.legs[leg].legOffsetY), 6);
          // A leg past the sand phase (jack/snap/wedge/locked) has already
          // depleted its sand and can only ever be at or below target.
          if (['jack', 'snap', 'wedge', 'locked'].includes(s.legs[leg].phase)) {
            expect(s.legs[leg].legOffsetY).toBeLessThanOrEqual(1e-6);
          }
          if (s.legs[leg].phase === 'locked') {
            expect(s.legs[leg].legOffsetY).toBe(0);
            expect(s.legs[leg].locked).toBe(true);
          }
        }
      }
    }).not.toThrow();
  });
});
