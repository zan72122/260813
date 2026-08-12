/**
 * `EiffelAudioEngine` — the UX owner's implementation of the frozen
 * `AudioEngine` interface (src/contracts/subsystems.ts). 100% synthesized
 * WebAudio, no samples, no network (ARCHITECTURE_CONTRACT).
 *
 * Loop cues (`hydraulicHum`, `cableRun`, `carrierRide`) have no paired
 * "stop" id in the frozen `SoundCueId` union — the EventBus is
 * fire-and-forget, so a loop is kept alive by *repeated* `handleCue` calls
 * (e.g. once per sim tick while the underlying motion continues) and is
 * treated as idempotent: re-firing the same loop id never restarts or
 * stacks it. If a keep-alive window passes with no further firing, the
 * loop fades out and stops on its own — this is what "starts/stops
 * smoothly" and "idempotent" mean together for a cue channel with no
 * explicit stop event.
 */

import type { SoundCueId } from '../contracts/events.ts';
import type { AudioEngine } from '../contracts/subsystems.ts';

import {
  playBrakeLock,
  playChime,
  playDoorOpen,
  playPistonSwell,
  playPulleyClick,
  playSparkle,
  playUiTap,
  playValveClose,
  playValveOpen,
  startCableRun,
  startCarrierRide,
  startHydraulicHum,
} from './sounds.ts';
import { createBrowserAudioContext, type AudioContextLike, type GainNodeLike } from './webAudioTypes.ts';

/** Default (unmuted) master gain — modest and warm, never harsh. */
const MASTER_GAIN_DEFAULT = 0.55;
/** Master-gain fade duration for `setEnabled` — no clicks. */
const MASTER_GAIN_FADE_S = 0.15;
/** A loop cue must repeat within this window or it is treated as finished
 * and fades out. Comfortably above one sim tick (SIM_DT = 1/60s ≈ 16.7ms)
 * or one render frame, so any reasonable emission cadence keeps it alive. */
const LOOP_KEEPALIVE_MS = 260;

const LOOP_CUE_IDS: ReadonlySet<SoundCueId> = new Set<SoundCueId>([
  'hydraulicHum',
  'cableRun',
  'carrierRide',
]);

interface ActiveLoop {
  keepaliveTimer: ReturnType<typeof setTimeout>;
  readonly stop: () => void;
}

export interface EiffelAudioEngineOptions {
  /** Injectable for tests; defaults to a real `AudioContext` in the browser. */
  readonly context?: AudioContextLike;
}

export class EiffelAudioEngine implements AudioEngine {
  private readonly context: AudioContextLike;
  private readonly master: GainNodeLike;
  /** While `false`, `handleCue` is a no-op (nothing is scheduled at all,
   * not just silenced) — cheaper, and loops simply restart cleanly on the
   * next cue once sound is re-enabled rather than resuming a stale timer. */
  private enabled = true;
  private disposed = false;
  private readonly activeLoops = new Map<SoundCueId, ActiveLoop>();

  constructor(options: EiffelAudioEngineOptions = {}) {
    this.context = options.context ?? createBrowserAudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = MASTER_GAIN_DEFAULT;
    this.master.connect(this.context.destination);
  }

  unlock(): void | Promise<void> {
    if (this.disposed) return undefined;
    if (this.context.state === 'suspended') {
      return this.context.resume();
    }
    return undefined;
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.enabled = enabled;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(
      enabled ? MASTER_GAIN_DEFAULT : 0,
      now + MASTER_GAIN_FADE_S,
    );
  }

  handleCue(cue: SoundCueId): void {
    if (this.disposed || !this.enabled) return;
    if (LOOP_CUE_IDS.has(cue)) {
      this.keepLoopAlive(cue);
      return;
    }
    this.playOneShot(cue);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const loop of this.activeLoops.values()) {
      clearTimeout(loop.keepaliveTimer);
      loop.stop();
    }
    this.activeLoops.clear();
    this.master.disconnect();
    void this.context.close();
  }

  private playOneShot(cue: SoundCueId): void {
    const ctx = this.context;
    const dest = this.master;
    switch (cue) {
      case 'valveOpen':
        playValveOpen(ctx, dest);
        return;
      case 'valveClose':
        playValveClose(ctx, dest);
        return;
      case 'pistonMove':
        playPistonSwell(ctx, dest);
        return;
      case 'pulleyTurn':
        playPulleyClick(ctx, dest);
        return;
      case 'brakeLock':
        playBrakeLock(ctx, dest);
        return;
      case 'doorOpen':
        playDoorOpen(ctx, dest);
        return;
      case 'chime':
        playChime(ctx, dest);
        return;
      case 'sparkle':
        playSparkle(ctx, dest);
        return;
      case 'uiTap':
        playUiTap(ctx, dest);
        return;
      case 'hydraulicHum':
      case 'cableRun':
      case 'carrierRide':
        return; // handled by keepLoopAlive; unreachable via handleCue's guard.
    }
  }

  private keepLoopAlive(cue: SoundCueId): void {
    const existing = this.activeLoops.get(cue);
    if (existing) {
      clearTimeout(existing.keepaliveTimer);
      existing.keepaliveTimer = setTimeout(() => this.expireLoop(cue), LOOP_KEEPALIVE_MS);
      return;
    }
    const stop = this.startLoop(cue);
    const keepaliveTimer = setTimeout(() => this.expireLoop(cue), LOOP_KEEPALIVE_MS);
    this.activeLoops.set(cue, { keepaliveTimer, stop });
  }

  private expireLoop(cue: SoundCueId): void {
    const loop = this.activeLoops.get(cue);
    if (!loop) return;
    this.activeLoops.delete(cue);
    loop.stop();
  }

  private startLoop(cue: SoundCueId): () => void {
    const ctx = this.context;
    const dest = this.master;
    switch (cue) {
      case 'hydraulicHum':
        return startHydraulicHum(ctx, dest);
      case 'cableRun':
        return startCableRun(ctx, dest);
      case 'carrierRide':
        return startCarrierRide(ctx, dest);
      default:
        return () => {
          /* unreachable: only LOOP_CUE_IDS route here */
        };
    }
  }
}
