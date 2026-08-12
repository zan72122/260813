/**
 * Core domain types — ARCHITECTURE_CONTRACT.md § types.ts is the authority.
 * Pure types only. No runtime logic lives in this file.
 */

/** 0:NE 1:SE 2:SW 3:NW — legs are attacked in this fixed order. */
export type LegId = 0 | 1 | 2 | 3;

export type LegPhase =
  | 'idle'
  | 'intro'
  | 'sand'
  | 'jack'
  | 'snap'
  | 'wedge'
  | 'locked';

export type GamePhase = 'boot' | 'establish' | 'leg' | 'finalReveal' | 'complete';

export interface LegState {
  /** 0..1 残砂率 (remaining sand fraction). */
  sandLevel: number;
  /** 支持部高さ (units). */
  sandboxSupportY: number;
  /** 0..maxJack (units). */
  jackExtension: number;
  /** 目標との差 (units)。+は高い、0で一致。 */
  legOffsetY: number;
  /** |legOffsetY| */
  alignmentError: number;
  /** 0..1 楔挿入率 (hammer後1)。 */
  wedgeProgress: number;
  locked: boolean;
  phase: LegPhase;
}

export interface GameState {
  phase: GamePhase;
  activeLeg: LegId;
  legs: [LegState, LegState, LegState, LegState];
  seed: number;
  /** 論理時間 (s)。 */
  elapsed: number;
  paused: boolean;
  soundOn: boolean;
  reducedMotion: boolean;
}

/** Fixed leg attack order used throughout game/render/state-machine logic. */
export const LEG_ORDER: readonly [LegId, LegId, LegId, LegId] = [0, 1, 2, 3];
