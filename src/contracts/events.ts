/**
 * Cross-subsystem communication channel #2 (the other is GameStore).
 * Fire-and-forget cues only — no subsystem calls another subsystem's
 * classes directly (ARCHITECTURE_CONTRACT "Dependency rule").
 */

import type { CameraCueId } from './camera.ts';
import type { GameStateId } from './states.ts';

/**
 * Concrete sound cue ids. One cue per causal step of valve -> piston ->
 * linkage -> pulley -> cable -> carrier, plus UI/feedback cues.
 */
export type SoundCueId =
  | 'valveOpen'
  | 'valveClose'
  | 'hydraulicHum'
  | 'pistonMove'
  | 'pulleyTurn'
  | 'cableRun'
  | 'carrierRide'
  | 'brakeLock'
  | 'doorOpen'
  | 'chime'
  | 'sparkle'
  | 'uiTap';

export const SOUND_CUE_IDS: readonly SoundCueId[] = [
  'valveOpen',
  'valveClose',
  'hydraulicHum',
  'pistonMove',
  'pulleyTurn',
  'cableRun',
  'carrierRide',
  'brakeLock',
  'doorOpen',
  'chime',
  'sparkle',
  'uiTap',
] as const;

/** Minimal visual-effect cue set (light particles only, PERFORMANCE_BUDGET-bounded). */
export type FxCueId = 'sparkle' | 'steamWisp' | 'confettiLight' | 'splash';

export const FX_CUE_IDS: readonly FxCueId[] = [
  'sparkle',
  'steamWisp',
  'confettiLight',
  'splash',
] as const;

/** The complete, frozen event map. Keys are namespaced `domain:name`. */
export type EiffelEventMap = {
  /** Request the camera director tween/cut to this cue. */
  'camera:cue': { readonly cue: CameraCueId };
  /** Play a synthesized sound cue (no-op if audio is disabled/locked). */
  'sound:cue': { readonly cue: SoundCueId };
  /** Trigger a lightweight visual effect. */
  'fx:cue': { readonly cue: FxCueId };
  /** Fired whenever the state machine's active state changes. */
  'state:changed': { readonly state: GameStateId; readonly previous: GameStateId };
  /** Fired once per fixed simulation step. */
  'sim:tick': { readonly step: number; readonly dt: number; readonly elapsed: number };
};

export type EventBusListener<T> = (payload: T) => void;

/** Unsubscribe function returned by `on()`. */
export type Unsubscribe = () => void;

export interface EventBus<TEventMap extends Record<string, unknown> = EiffelEventMap> {
  on<K extends keyof TEventMap>(event: K, listener: EventBusListener<TEventMap[K]>): Unsubscribe;
  off<K extends keyof TEventMap>(event: K, listener: EventBusListener<TEventMap[K]>): void;
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;
  /** Remove every listener for every event. */
  clear(): void;
}

/**
 * Tiny synchronous pub/sub. Pure — no DOM, no timers, no globals. Listener
 * exceptions are isolated (one throwing listener never blocks the rest).
 */
export class TypedEventBus<TEventMap extends Record<string, unknown> = EiffelEventMap>
  implements EventBus<TEventMap>
{
  private listeners: { [K in keyof TEventMap]?: Set<EventBusListener<TEventMap[K]>> } = {};

  on<K extends keyof TEventMap>(event: K, listener: EventBusListener<TEventMap[K]>): Unsubscribe {
    const existing = this.listeners[event];
    const set = existing ?? new Set<EventBusListener<TEventMap[K]>>();
    if (!existing) {
      this.listeners[event] = set;
    }
    set.add(listener);
    return () => {
      this.off(event, listener);
    };
  }

  off<K extends keyof TEventMap>(event: K, listener: EventBusListener<TEventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const set = this.listeners[event];
    if (!set || set.size === 0) return;
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
