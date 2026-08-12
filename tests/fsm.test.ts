import { beforeEach, describe, expect, it } from 'vitest';
import { GameFsm } from '../src/game/fsm.ts';
import { CURATED_SEEDS } from '../src/game/seeds.ts';

describe('GameFsm phase transitions', () => {
  let fsm: GameFsm;
  beforeEach(() => {
    fsm = new GameFsm(1);
  });

  it('starts at TITLE', () => {
    expect(fsm.phase).toBe('TITLE');
  });

  it('walks the full canonical loop title -> ... -> replay -> play_cleanup again', () => {
    const seen: string[] = [fsm.phase];
    fsm.start();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('PLAY_CLEANUP');

    fsm.completeCurrentObjective();
    expect(fsm.isPlayCleanupComplete()).toBe(true);
    fsm.advance();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('LUNCH_SETUP');

    fsm.completeCurrentObjective();
    expect(fsm.isLunchSetupComplete()).toBe(true);
    fsm.advance();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('LUNCH_CLEANUP');

    fsm.completeCurrentObjective();
    expect(fsm.isLunchCleanupComplete()).toBe(true);
    fsm.advance();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('NAP_SETUP');

    fsm.completeCurrentObjective();
    expect(fsm.isNapSetupComplete()).toBe(true);
    fsm.advance();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('WAKE_RESTORE');

    fsm.completeCurrentObjective();
    expect(fsm.isWakeRestoreComplete()).toBe(true);
    fsm.advance();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('REPLAY');

    fsm.replaySameDay();
    seen.push(fsm.phase);
    expect(fsm.phase).toBe('PLAY_CLEANUP');

    expect(seen).toEqual([
      'TITLE',
      'PLAY_CLEANUP',
      'LUNCH_SETUP',
      'LUNCH_CLEANUP',
      'NAP_SETUP',
      'WAKE_RESTORE',
      'REPLAY',
      'PLAY_CLEANUP',
    ]);
  });

  it('rejects illegal transitions', () => {
    expect(() => fsm.transitionTo('NAP_SETUP')).toThrow();
    expect(() => fsm.transitionTo('LUNCH_CLEANUP')).toThrow();
  });

  it('emits phaseChange events with from/to/seed', () => {
    const events: { from: string; to: string }[] = [];
    fsm.events.on('phaseChange', (e) => events.push({ from: e.from, to: e.to }));
    fsm.start();
    fsm.completeCurrentObjective();
    fsm.advance();
    expect(events).toEqual([
      { from: 'TITLE', to: 'PLAY_CLEANUP' },
      { from: 'PLAY_CLEANUP', to: 'LUNCH_SETUP' },
    ]);
  });

  it('replaySameDay keeps the same seed; replayShuffle changes it', () => {
    fsm.start();
    fsm.completeCurrentObjective();
    fsm.advance(); // LUNCH_SETUP
    fsm.completeCurrentObjective();
    fsm.advance(); // LUNCH_CLEANUP
    fsm.completeCurrentObjective();
    fsm.advance(); // NAP_SETUP
    fsm.completeCurrentObjective();
    fsm.advance(); // WAKE_RESTORE
    fsm.completeCurrentObjective();
    fsm.advance(); // REPLAY

    const originalSeed = fsm.seedConfig.seed;
    fsm.replaySameDay();
    expect(fsm.seedConfig.seed).toBe(originalSeed);
    expect(fsm.phase).toBe('PLAY_CLEANUP');

    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    expect(fsm.phase).toBe('REPLAY');
    const newSeed = fsm.replayShuffle();
    expect(newSeed).not.toBe(originalSeed);
    expect(fsm.seedConfig.seed).toBe(newSeed);
    expect(fsm.phase).toBe('PLAY_CLEANUP');
  });

  it('replaying resets per-phase progress (no stale completion carried over)', () => {
    fsm.start();
    fsm.completeCurrentObjective();
    expect(fsm.playCleanup.storedToyIds.length).toBeGreaterThan(0);
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.replaySameDay();
    expect(fsm.playCleanup.storedToyIds).toHaveLength(0);
    expect(fsm.isPlayCleanupComplete()).toBe(false);
  });

  it('free play is reachable from REPLAY and returns to REPLAY', () => {
    fsm.start();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    fsm.completeCurrentObjective();
    fsm.advance();
    expect(fsm.phase).toBe('REPLAY');
    fsm.enterFreePlay();
    expect(fsm.phase).toBe('FREE_PLAY');
    fsm.exitFreePlay();
    expect(fsm.phase).toBe('REPLAY');
  });
});

describe('GameFsm toy capture', () => {
  it('accepts a sloppy drop within the correct basket capture radius and rejects wrong basket', () => {
    const fsm = new GameFsm(1);
    fsm.start();
    const toy = fsm.seedConfig.toys[0]!;
    const correctBasket = fsm.seedConfig.baskets.find((b) => b.symbol === toy.symbol)!;
    const wrongBasket = fsm.seedConfig.baskets.find((b) => b.symbol !== toy.symbol)!;

    const wrongAttempt = fsm.attemptStoreToy(toy.id, wrongBasket.position);
    expect(wrongAttempt.success).toBe(false);
    expect(fsm.playCleanup.storedToyIds).not.toContain(toy.id);

    const rightAttempt = fsm.attemptStoreToy(toy.id, correctBasket.position);
    expect(rightAttempt.success).toBe(true);
    expect(rightAttempt.basketId).toBe(correctBasket.id);
    expect(fsm.playCleanup.storedToyIds).toContain(toy.id);
  });

  it('a sloppy-but-inside-capture-radius drop near the correct basket still succeeds', () => {
    const fsm = new GameFsm(1);
    fsm.start();
    const toy = fsm.seedConfig.toys[0]!;
    const correctBasket = fsm.seedConfig.baskets.find((b) => b.symbol === toy.symbol)!;
    // Offset within capture radius (radius * 2.2) but not exactly centered.
    const offset = correctBasket.radius * 1.5;
    const attempt = fsm.attemptStoreToy(toy.id, { x: correctBasket.position.x + offset, z: correctBasket.position.z });
    expect(attempt.success).toBe(true);
  });
});

describe('GameFsm determinism across seeds', () => {
  it('same seed produces an identical seedConfig snapshot every construction', () => {
    for (const seed of CURATED_SEEDS) {
      const a = new GameFsm(seed);
      const b = new GameFsm(seed);
      expect(a.seedConfig).toEqual(b.seedConfig);
    }
  });

  it('setSeed swaps layout deterministically and resets progress', () => {
    const fsm = new GameFsm(1);
    fsm.start();
    fsm.attemptStoreToy(fsm.seedConfig.toys[0]!.id, fsm.seedConfig.baskets[0]!.position);
    fsm.setSeed(2);
    expect(fsm.seedConfig.seed).toBe(2);
    expect(fsm.playCleanup.storedToyIds).toHaveLength(0);
    const again = new GameFsm(2);
    expect(fsm.seedConfig).toEqual(again.seedConfig);
  });
});
