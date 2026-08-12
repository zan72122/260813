// src/contracts/types.ts
// Shared, frozen types for the whole game. See docs/ARCHITECTURE_CONTRACT.md.
// Do not edit outside Wave 2 (Foundation) — this file is frozen after handoff.

/** Canonical phase order (see ARCHITECTURE_CONTRACT.md GamePhase). */
export type GamePhase =
  | 'loading'
  | 'title'
  | 'opening'
  | 'hookDown'
  | 'hoist'
  | 'align'
  | 'bolts'
  | 'rivetHeat'
  | 'rivetCarry'
  | 'rivetInsert'
  | 'rivetHammer'
  | 'rivetCool'
  | 'sling'
  | 'climb'
  | 'reveal'
  | 'complete'
  | 'playRivet'
  | 'playClimb';

/** Beam silhouette variants, chosen deterministically from seed + towerLevel. */
export type BeamShape = 'girder' | 'xpanel' | 'curved';

/** Adaptive-quality tier. */
export type QualityLevel = 'low' | 'mid' | 'high';

/** Interactive world anchors published by the renderer for input/UI hit-testing. */
export type AnchorId =
  | 'hook'
  | 'beam'
  | 'ghost'
  | 'lever'
  | 'bolt0'
  | 'bolt1'
  | 'hole0'
  | 'hole1'
  | 'forge'
  | 'tongs'
  | 'rivetHole'
  | 'hammerSpot'
  | 'slingClasp'
  | 'climbLever'
  | 'worker0'
  | 'worker1'
  | 'worker2'
  | 'worker3';

/** A screen-space (CSS pixel) hit target published every frame by the renderer. */
export interface Anchor {
  id: AnchorId;
  x: number;
  y: number;
  r: number;
  active: boolean;
}

/** Camera director cue names, dispatched via the 'cam:cue' bus event. */
export type CameraCueName =
  | 'establish'
  | 'approach'
  | 'hoist'
  | 'align'
  | 'rivetMacro'
  | 'climb'
  | 'reveal'
  | 'complete';

export interface GameState {
  phase: GamePhase;
  seed: number;
  towerLevel: number;
  beamShape: BeamShape;
  hook: { depth: number; attached: boolean };
  hoist: { height: number; sway: number };
  align: { dx: number; dy: number; snapped: boolean };
  bolts: [boolean, boolean];
  rivet: {
    temp: number;
    station: 0 | 1 | 2 | 3;
    inserted: boolean;
    hits: 0 | 1 | 2 | 3;
    formed: number;
    cooled: number;
  };
  sling: { released: boolean };
  climb: { lever: number; progress: number; locked: boolean };
  audio: { unlocked: boolean; muted: boolean };
  prefs: { reducedMotion: boolean };
  idleMs: number;
}

/** Typed event payload map for the EventBus. Frozen — additions only through Wave 2. */
export interface GameEventMap {
  'phase:enter': { phase: GamePhase; from: GamePhase };
  'snap:hook': Record<string, never>;
  'snap:align': Record<string, never>;
  'bolt:seated': { index: 0 | 1 };
  'rivet:heated': Record<string, never>;
  'rivet:handoff': { station: 0 | 1 | 2 | 3 };
  'rivet:inserted': Record<string, never>;
  'rivet:hit': { hits: 1 | 2 | 3 };
  'rivet:formed': Record<string, never>;
  'rivet:cooled': Record<string, never>;
  'sling:released': Record<string, never>;
  'climb:start': Record<string, never>;
  'climb:locked': Record<string, never>;
  'reveal:done': Record<string, never>;
  'assist:breathe': { anchor: AnchorId };
  'assist:point': { anchor: AnchorId };
  'cam:cue': { cue: CameraCueName };
  'sfx:*': { name: string };
}

export type GameEventName = keyof GameEventMap;
