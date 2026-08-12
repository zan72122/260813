/**
 * Wires EventBus → routeEvent → voices. Owns the WebAudio node graph
 * lifecycle: lazy context creation (first `unlock()`, satisfying iOS
 * Safari's user-gesture requirement), the master gain stage, the
 * continuous loop voices (sand, near-target resonance, ambient site bed),
 * and pause/hidden suspension. Not unit-tested directly (it constructs real
 * WebAudio node graphs) — `cueRouter.ts`'s `routeEvent` carries the tested
 * logic; this module is thin glue over it.
 */
import type { EventBus, GameEvent } from '../contracts/events';
import type { GameState, LegId } from '../contracts/types';
import { legScenario } from '../contracts/rng';
import type { AudioContextFactory, MinimalAudioContext } from './context';
import { defaultAudioContextFactory } from './context';
import { MasterBus } from './masterBus';
import { routeEvent } from './cueRouter';
import type { LoopController } from './voices';
import {
  playGateCreak,
  playHammerImpact,
  playJackPump,
  playRevealBeat,
  playSettleChord,
  playSnap,
  playWedgeSlide,
  startAmbientBed,
  startNearTargetSwell,
  startSandLoop,
} from './voices';

export interface AudioEngineOptions {
  bus: EventBus;
  getState: () => GameState;
  /** Injectable for tests; defaults to a real browser AudioContext. */
  contextFactory?: AudioContextFactory;
}

export interface AudioEngineHandle {
  /** Resolves once the AudioContext exists and is resumed — call from the first user tap/pointerdown. */
  unlock(): Promise<void>;
  setEnabled(on: boolean): void;
  dispose(): void;
}

export function createAudioEngine(opts: AudioEngineOptions): AudioEngineHandle {
  const contextFactory = opts.contextFactory ?? defaultAudioContextFactory;

  let ctx: MinimalAudioContext | undefined;
  let master: MasterBus | undefined;
  let unlocked = false;
  let pendingEnabled = true;
  let ambient: LoopController | undefined;
  const sandLoops = new Map<LegId, LoopController>();
  const nearTargetSwells = new Map<LegId, LoopController>();
  const unsubscribers: (() => void)[] = [];

  function pitchShiftFor(leg: LegId): number {
    const state = opts.getState();
    return legScenario(state.seed, leg).pitchShift;
  }

  function handleEvent(event: GameEvent): void {
    if (!ctx || !master) return;
    const cue = routeEvent(event);
    if (!cue) return;
    const dest = master.gain;

    switch (cue.kind) {
      case 'gateCreak':
        playGateCreak(ctx, dest, cue.intensity ?? 0);
        return;

      case 'sandFlow': {
        const leg = cue.leg;
        if (leg === undefined) return;
        let loop = sandLoops.get(leg);
        if (!loop) {
          loop = startSandLoop(ctx, dest, opts.getState().seed ^ (leg + 1));
          sandLoops.set(leg, loop);
        }
        loop.setIntensity(cue.intensity ?? 0, cue.intensity ?? 0);
        return;
      }

      case 'sandStop': {
        const leg = cue.leg;
        if (leg === undefined) return;
        const loop = sandLoops.get(leg);
        if (loop) {
          loop.stop();
          sandLoops.delete(leg);
        }
        return;
      }

      case 'jackPump':
        playJackPump(ctx, dest, cue.leg === undefined ? 0 : pitchShiftFor(cue.leg));
        return;

      case 'nearTargetSwell': {
        const leg = cue.leg;
        if (leg === undefined) return;
        let swell = nearTargetSwells.get(leg);
        if (!swell) {
          swell = startNearTargetSwell(ctx, dest);
          nearTargetSwells.set(leg, swell);
        }
        swell.setIntensity(cue.intensity ?? 0, 0);
        return;
      }

      case 'snap': {
        const leg = cue.leg;
        if (leg !== undefined) {
          const swell = nearTargetSwells.get(leg);
          if (swell) {
            swell.stop();
            nearTargetSwells.delete(leg);
          }
        }
        playSnap(ctx, dest);
        return;
      }

      case 'wedgeSlide':
        playWedgeSlide(ctx, dest);
        return;

      case 'hammerImpact':
        playHammerImpact(ctx, dest);
        return;

      case 'revealBeat':
        if (cue.index !== undefined) playRevealBeat(ctx, dest, cue.index);
        return;

      case 'settleChord':
        playSettleChord(ctx, dest);
        return;

      case 'mute':
        master.setEnabled(false);
        return;

      case 'unmute':
        master.setEnabled(true);
        return;

      case 'suspendAmbient':
        master.setSuspended(true);
        return;

      case 'resumeAmbient':
        master.setSuspended(false);
        return;
    }
  }

  const ALL_EVENT_TYPES: GameEvent['type'][] = [
    'gateOpened',
    'sandFlow',
    'sandDepleted',
    'jackPumped',
    'nearTarget',
    'snapped',
    'wedgeSeated',
    'hammered',
    'revealBeat',
    'settled',
    'soundToggled',
    'pauseChanged',
  ];

  function subscribeAll(): void {
    for (const type of ALL_EVENT_TYPES) {
      unsubscribers.push(
        opts.bus.on(type, (e) => {
          handleEvent(e);
        }),
      );
    }
  }

  function handleVisibility(): void {
    if (!master) return;
    master.setSuspended(document.hidden);
  }

  async function unlock(): Promise<void> {
    if (unlocked) return;
    unlocked = true;
    ctx = contextFactory();
    master = new MasterBus(ctx);
    master.setEnabled(pendingEnabled);
    await ctx.resume();
    ambient = startAmbientBed(ctx, master.gain, opts.getState().seed ^ 0x51ee);
    subscribeAll();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
  }

  function setEnabled(on: boolean): void {
    pendingEnabled = on;
    master?.setEnabled(on);
  }

  function dispose(): void {
    for (const off of unsubscribers) off();
    unsubscribers.length = 0;
    ambient?.stop();
    ambient = undefined;
    for (const loop of sandLoops.values()) loop.stop();
    sandLoops.clear();
    for (const swell of nearTargetSwells.values()) swell.stop();
    nearTargetSwells.clear();
    master?.dispose();
    master = undefined;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (ctx) {
      void ctx.close();
      ctx = undefined;
    }
    unlocked = false;
  }

  return { unlock, setEnabled, dispose };
}
