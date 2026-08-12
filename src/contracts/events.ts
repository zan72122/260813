/**
 * Typed EventBus contract. This is the ONLY channel for cross-owner
 * communication (see ARCHITECTURE_CONTRACT.md § モジュール境界). The bus
 * implementation here is a tiny, dependency-free pub/sub class — allowed in
 * contracts/ per the Wave 2 brief as it holds no game logic, only dispatch.
 */

import type { GamePhase, LegId, LegPhase } from './types';
import type { CameraCue } from './camera';

export type GameEvent =
  | { type: 'phaseChanged'; phase: GamePhase }
  | { type: 'legPhaseChanged'; leg: LegId; legPhase: LegPhase }
  | { type: 'gateOpened'; leg: LegId; open: number } // 0..1、毎変化
  | { type: 'sandFlow'; leg: LegId; rate: number } // 0で停止
  | { type: 'sandDepleted'; leg: LegId }
  | { type: 'jackPumped'; leg: LegId; stroke: number } // 一往復確定ごと
  | { type: 'nearTarget'; leg: LegId; error: number } // ASSIST_RADIUS進入時
  | { type: 'magnifierShown'; leg: LegId; shown: boolean }
  | { type: 'snapped'; leg: LegId }
  | { type: 'wedgeSeated'; leg: LegId } // 吸着完了、hammer待ち
  | { type: 'hammered'; leg: LegId }
  | { type: 'legLocked'; leg: LegId }
  | { type: 'allLegsLocked' }
  | { type: 'revealBeat'; index: 0 | 1 | 2 | 3 } // finale各接合点発光
  | { type: 'settled' } // 第一層沈み込み完了
  | { type: 'replayRequested' }
  | { type: 'pauseChanged'; paused: boolean }
  | { type: 'soundToggled'; on: boolean }
  | { type: 'cameraCue'; cue: CameraCue };

export type GameEventType = GameEvent['type'];

/** Narrows GameEvent to the member whose `type` matches T. */
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

export interface EventBus {
  emit(e: GameEvent): void;
  on<T extends GameEventType>(t: T, fn: (e: GameEventOf<T>) => void): () => void;
}

/**
 * Minimal synchronous pub/sub EventBus. No batching, no async dispatch:
 * `emit` calls every matching listener immediately, in subscription order.
 * A listener throwing does not stop delivery to the remaining listeners —
 * the error is rethrown after all listeners have been notified, so one
 * broken subscriber (e.g. an audio cue) cannot silently swallow a
 * `legLocked` event another owner depends on.
 */
export class TypedEventBus implements EventBus {
  private readonly listeners = new Map<GameEventType, Set<(e: never) => void>>();

  emit(e: GameEvent): void {
    const set = this.listeners.get(e.type);
    if (!set || set.size === 0) return;
    let firstError: unknown;
    let hasError = false;
    for (const fn of [...set]) {
      try {
        fn(e as never);
      } catch (err) {
        if (!hasError) {
          hasError = true;
          firstError = err;
        }
      }
    }
    if (hasError) throw firstError;
  }

  on<T extends GameEventType>(t: T, fn: (e: GameEventOf<T>) => void): () => void {
    let set = this.listeners.get(t);
    if (!set) {
      set = new Set();
      this.listeners.set(t, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }
}
