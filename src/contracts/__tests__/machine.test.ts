import { describe, expect, it } from 'vitest';
import { createEventBus } from '../bus';
import { advance, createInitialState, MAX_TOWER_LEVEL, TRANSITIONS } from '../machine';
import { createStore } from '../store';
import type { GamePhase } from '../types';

const CANONICAL_ORDER: GamePhase[] = [
  'loading',
  'title',
  'opening',
  'hookDown',
  'hoist',
  'align',
  'bolts',
  'rivetHeat',
  'rivetCarry',
  'rivetInsert',
  'rivetHammer',
  'rivetCool',
  'sling',
  'climb',
  'reveal',
  'complete',
];

describe('createInitialState', () => {
  it('starts in loading with fresh sub-state and given seed/prefs', () => {
    const state = createInitialState(42, { reducedMotion: true });
    expect(state.phase).toBe('loading');
    expect(state.seed).toBe(42);
    expect(state.towerLevel).toBe(0);
    expect(state.hook).toEqual({ depth: 0, attached: false });
    expect(state.bolts).toEqual([false, false]);
    expect(state.prefs.reducedMotion).toBe(true);
    expect(state.audio).toEqual({ unlocked: false, muted: false });
  });

  it('is deterministic: same seed -> same beamShape', () => {
    const a = createInitialState(7, { reducedMotion: false });
    const b = createInitialState(7, { reducedMotion: false });
    expect(a.beamShape).toBe(b.beamShape);
  });
});

describe('advance()', () => {
  it('walks the full canonical loop from loading to complete', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    const entered: GamePhase[] = [];
    bus.on('phase:enter', (p) => entered.push(p.phase));

    for (let i = 1; i < CANONICAL_ORDER.length; i += 1) {
      const to = CANONICAL_ORDER[i];
      if (!to) throw new Error('bad test data');
      const ok = advance(store, bus, to);
      expect(ok).toBe(true);
      expect(store.get().phase).toBe(to);
    }

    expect(entered).toEqual(CANONICAL_ORDER.slice(1));
  });

  it('no-ops on an illegal transition and does not emit phase:enter', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    let emitted = 0;
    bus.on('phase:enter', () => {
      emitted += 1;
    });

    // loading -> climb is not a legal transition.
    const ok = advance(store, bus, 'climb');
    expect(ok).toBe(false);
    expect(store.get().phase).toBe('loading');
    expect(emitted).toBe(0);
  });

  it('rejects skipping ahead in the canonical order', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    advance(store, bus, 'title');
    advance(store, bus, 'opening');
    // opening -> align (skipping hookDown, hoist) is illegal.
    const ok = advance(store, bus, 'align');
    expect(ok).toBe(false);
    expect(store.get().phase).toBe('opening');
  });

  it('supports complete -> playRivet -> complete without disturbing towerLevel', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    store.set({ phase: 'complete', towerLevel: 3 });

    expect(advance(store, bus, 'playRivet')).toBe(true);
    expect(store.get().phase).toBe('playRivet');
    expect(store.get().rivet).toEqual({
      temp: 0,
      station: 0,
      inserted: false,
      hits: 0,
      formed: 0,
      cooled: 0,
    });

    expect(advance(store, bus, 'complete')).toBe(true);
    expect(store.get().phase).toBe('complete');
    expect(store.get().towerLevel).toBe(3);
  });

  it('supports complete -> playClimb -> complete', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    store.set({ phase: 'complete' });
    expect(advance(store, bus, 'playClimb')).toBe(true);
    expect(store.get().climb).toEqual({ lever: 0, progress: 0, locked: false });
    expect(advance(store, bus, 'complete')).toBe(true);
  });

  it('supports complete -> opening replay and resets per-loop fields', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    store.set({
      phase: 'complete',
      towerLevel: 2,
      hook: { depth: 1, attached: true },
      bolts: [true, true],
    });
    expect(advance(store, bus, 'opening')).toBe(true);
    const state = store.get();
    expect(state.phase).toBe('opening');
    expect(state.hook).toEqual({ depth: 0, attached: false });
    expect(state.bolts).toEqual([false, false]);
    // towerLevel is a session-persistent accumulator, not reset by replay.
    expect(state.towerLevel).toBe(2);
  });

  it('increments towerLevel on entering reveal, capped at MAX_TOWER_LEVEL', () => {
    const store = createStore(createInitialState(1, { reducedMotion: false }));
    const bus = createEventBus();
    store.set({ phase: 'climb', towerLevel: MAX_TOWER_LEVEL });
    advance(store, bus, 'reveal');
    expect(store.get().towerLevel).toBe(MAX_TOWER_LEVEL);

    store.set({ phase: 'climb', towerLevel: 1 });
    advance(store, bus, 'reveal');
    expect(store.get().towerLevel).toBe(2);
  });

  it('TRANSITIONS table has an entry for every phase', () => {
    const phases: GamePhase[] = [...CANONICAL_ORDER, 'playRivet', 'playClimb'];
    for (const phase of phases) {
      expect(TRANSITIONS[phase]).toBeDefined();
    }
  });
});
