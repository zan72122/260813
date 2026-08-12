// src/contracts/machine.ts
// Canonical phase transition table, state machine, deterministic PRNG.

import type { EventBus } from './bus';
import type { GameStore } from './store';
import type { BeamShape, GamePhase, GameState } from './types';

/** Beyond this towerLevel, visual growth stops (see PRODUCT_SPEC "最大表示レベル"). */
export const MAX_TOWER_LEVEL = 8;

// ---- deterministic PRNG ---------------------------------------------------

/** mulberry32: small, fast, deterministic PRNG. Returns a fn producing [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BEAM_SHAPES: readonly BeamShape[] = ['girder', 'xpanel', 'curved'];

/** Deterministic beam silhouette for a given seed + towerLevel. */
export function beamShapeFor(seed: number, towerLevel: number): BeamShape {
  const rand = mulberry32((seed ^ (towerLevel * 0x9e3779b1)) >>> 0);
  const idx = Math.floor(rand() * BEAM_SHAPES.length) % BEAM_SHAPES.length;
  return BEAM_SHAPES[idx] ?? 'girder';
}

// ---- initial state ---------------------------------------------------------

function initialHook(): GameState['hook'] {
  return { depth: 0, attached: false };
}
function initialHoist(): GameState['hoist'] {
  return { height: 0, sway: 0 };
}
function initialAlign(): GameState['align'] {
  return { dx: 0, dy: 0, snapped: false };
}
function initialBolts(): GameState['bolts'] {
  return [false, false];
}
function initialRivet(): GameState['rivet'] {
  return { temp: 0, station: 0, inserted: false, hits: 0, formed: 0, cooled: 0 };
}
function initialSling(): GameState['sling'] {
  return { released: false };
}
function initialClimb(): GameState['climb'] {
  return { lever: 0, progress: 0, locked: false };
}

export function createInitialState(
  seed: number,
  prefs: { reducedMotion: boolean },
): GameState {
  return {
    phase: 'loading',
    seed,
    towerLevel: 0,
    beamShape: beamShapeFor(seed, 0),
    hook: initialHook(),
    hoist: initialHoist(),
    align: initialAlign(),
    bolts: initialBolts(),
    rivet: initialRivet(),
    sling: initialSling(),
    climb: initialClimb(),
    audio: { unlocked: false, muted: false },
    prefs: { reducedMotion: prefs.reducedMotion },
    idleMs: 0,
  };
}

// ---- transition table -------------------------------------------------------

/** Canonical + free-play transitions. Frozen (see ARCHITECTURE_CONTRACT.md). */
export const TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  loading: ['title'],
  title: ['opening'],
  opening: ['hookDown'],
  hookDown: ['hoist'],
  hoist: ['align'],
  align: ['bolts'],
  bolts: ['rivetHeat'],
  rivetHeat: ['rivetCarry'],
  rivetCarry: ['rivetInsert'],
  rivetInsert: ['rivetHammer'],
  rivetHammer: ['rivetCool'],
  rivetCool: ['sling'],
  sling: ['climb'],
  climb: ['reveal'],
  reveal: ['complete'],
  complete: ['opening', 'playRivet', 'playClimb'],
  playRivet: ['complete'],
  playClimb: ['complete'],
};

/** Per-entry sub-state reset. Phases not listed only clear idleMs. */
const PHASE_RESET: Partial<
  Record<GamePhase, (state: GameState) => Partial<GameState>>
> = {
  opening: () => ({
    hook: initialHook(),
    hoist: initialHoist(),
    align: initialAlign(),
    bolts: initialBolts(),
    rivet: initialRivet(),
    sling: initialSling(),
    climb: initialClimb(),
    idleMs: 0,
  }),
  hookDown: () => ({ hook: initialHook(), idleMs: 0 }),
  hoist: () => ({ hoist: initialHoist(), idleMs: 0 }),
  align: () => ({ align: initialAlign(), idleMs: 0 }),
  bolts: () => ({ bolts: initialBolts(), idleMs: 0 }),
  rivetHeat: () => ({ rivet: initialRivet(), idleMs: 0 }),
  sling: () => ({ sling: initialSling(), idleMs: 0 }),
  climb: () => ({ climb: initialClimb(), idleMs: 0 }),
  reveal: (state) => ({
    towerLevel: Math.min(state.towerLevel + 1, MAX_TOWER_LEVEL),
    idleMs: 0,
  }),
  playRivet: () => ({ rivet: initialRivet(), idleMs: 0 }),
  playClimb: () => ({ climb: initialClimb(), idleMs: 0 }),
};

/**
 * Attempt to move the store to phase `to`. No-ops (returns false) on any
 * transition not present in TRANSITIONS[current]. On success: resets the
 * entering phase's scoped sub-state, sets `phase`, and emits `phase:enter`.
 * Never throws, never logs — illegal transitions are silently ignored per
 * ARCHITECTURE_CONTRACT.md's no-console-error policy.
 */
export function advance(store: GameStore, bus: EventBus, to: GamePhase): boolean {
  const state = store.get();
  const from = state.phase;
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) return false;

  const reset = PHASE_RESET[to];
  const patch: Partial<GameState> = { phase: to, ...(reset ? reset(state) : { idleMs: 0 }) };
  store.set(patch);
  bus.emit('phase:enter', { phase: to, from });
  return true;
}
