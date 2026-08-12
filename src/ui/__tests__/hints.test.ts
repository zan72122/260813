import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../contracts/machine';
import type { GameState } from '../../contracts/types';
import { hintForPhase, placeHintNearAnchor } from '../hints';

function stateWith(patch: Partial<GameState>): GameState {
  return { ...createInitialState(1, { reducedMotion: false }), ...patch };
}

describe('hintForPhase', () => {
  it('maps each guided phase to its documented anchor + gesture', () => {
    expect(hintForPhase('hookDown', stateWith({}))).toEqual({ anchor: 'hook', gesture: 'drag-down' });
    expect(hintForPhase('hoist', stateWith({}))).toEqual({ anchor: 'hook', gesture: 'drag-up' });
    expect(hintForPhase('align', stateWith({}))).toEqual({ anchor: 'beam', gesture: 'drag-to' });
    expect(hintForPhase('rivetInsert', stateWith({}))).toEqual({ anchor: 'rivetHole', gesture: 'tap' });
    expect(hintForPhase('rivetHammer', stateWith({}))).toEqual({ anchor: 'hammerSpot', gesture: 'tap' });
    expect(hintForPhase('sling', stateWith({}))).toEqual({ anchor: 'slingClasp', gesture: 'tap' });
    expect(hintForPhase('climb', stateWith({}))).toEqual({ anchor: 'climbLever', gesture: 'drag-up' });
    expect(hintForPhase('playClimb', stateWith({}))).toEqual({ anchor: 'climbLever', gesture: 'drag-up' });
  });

  it('targets the first un-seated bolt, then the second', () => {
    expect(hintForPhase('bolts', stateWith({ bolts: [false, false] }))).toEqual({
      anchor: 'bolt0',
      gesture: 'drag-to',
    });
    expect(hintForPhase('bolts', stateWith({ bolts: [true, false] }))).toEqual({
      anchor: 'bolt1',
      gesture: 'drag-to',
    });
  });

  it('follows the relay station for rivetCarry across all four workers', () => {
    for (const station of [0, 1, 2, 3] as const) {
      expect(hintForPhase('rivetCarry', stateWith({ rivet: { ...stateWith({}).rivet, station } }))).toEqual({
        anchor: `worker${station}`,
        gesture: 'swipe-right',
      });
    }
  });

  it('returns null for non-interactive / observational phases', () => {
    for (const phase of ['loading', 'title', 'opening', 'rivetCool', 'reveal', 'complete'] as const) {
      expect(hintForPhase(phase, stateWith({}))).toBeNull();
    }
  });

  it('derives a playRivet hint from rivet sub-state (heat -> carry -> insert -> hammer -> done)', () => {
    const base = stateWith({}).rivet;
    expect(
      hintForPhase('playRivet', stateWith({ rivet: { ...base, temp: 0.4 } })),
    ).toEqual({ anchor: 'forge', gesture: 'tap-hold' });
    expect(
      hintForPhase('playRivet', stateWith({ rivet: { ...base, temp: 1, station: 1 } })),
    ).toEqual({ anchor: 'worker1', gesture: 'swipe-right' });
    expect(
      hintForPhase('playRivet', stateWith({ rivet: { ...base, temp: 1, station: 3, inserted: false } })),
    ).toEqual({ anchor: 'rivetHole', gesture: 'tap' });
    expect(
      hintForPhase(
        'playRivet',
        stateWith({ rivet: { ...base, temp: 1, station: 3, inserted: true, hits: 1 } }),
      ),
    ).toEqual({ anchor: 'hammerSpot', gesture: 'tap' });
    expect(
      hintForPhase(
        'playRivet',
        stateWith({ rivet: { ...base, temp: 1, station: 3, inserted: true, hits: 3 } }),
      ),
    ).toBeNull();
  });
});

describe('placeHintNearAnchor', () => {
  const viewport = { w: 400, h: 800 };
  const size = { w: 88, h: 88 };

  it('places the hint outside the anchor circle (never covering it) when there is room', () => {
    const anchor = { x: 200, y: 400, r: 30 };
    const pos = placeHintNearAnchor(anchor, viewport, size, 20);
    const dy = Math.abs(pos.y - anchor.y);
    expect(dy).toBeGreaterThanOrEqual(anchor.r + 20 + size.h / 2 - 1);
  });

  it('flips below the anchor when there is no room above', () => {
    const anchor = { x: 200, y: 10, r: 20 };
    const pos = placeHintNearAnchor(anchor, viewport, size, 20);
    expect(pos.y).toBeGreaterThan(anchor.y);
  });

  it('flips above the anchor when there is no room below', () => {
    const anchor = { x: 200, y: 790, r: 20 };
    const pos = placeHintNearAnchor(anchor, viewport, size, 20);
    expect(pos.y).toBeLessThan(anchor.y);
  });

  it('always clamps inside the viewport bounds', () => {
    const anchor = { x: -50, y: -50, r: 10 };
    const pos = placeHintNearAnchor(anchor, viewport, size, 20);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThanOrEqual(viewport.w);
    expect(pos.y).toBeLessThanOrEqual(viewport.h);
  });
});
