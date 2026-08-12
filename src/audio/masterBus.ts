/**
 * Master gain stage: everything the engine synthesizes routes through this
 * single node before `ctx.destination`, so mute/unmute and pause/resume are
 * always one smooth ramp in one place rather than scattered per-voice
 * logic.
 */
import type { MinimalAudioContext } from './context';

const RAMP_SECONDS = 0.12;
const MUTE_RAMP_SECONDS = 0.05;

export class MasterBus {
  readonly gain: GainNode;
  private enabled = true;
  private suspended = false;
  private readonly baseVolume: number;

  constructor(private readonly ctx: MinimalAudioContext, initialVolume = 0.7) {
    this.gain = ctx.createGain();
    this.gain.gain.value = initialVolume;
    this.gain.connect(ctx.destination);
    this.baseVolume = initialVolume;
  }

  private target(): number {
    return this.enabled && !this.suspended ? this.baseVolume : 0;
  }

  private rampTo(value: number, seconds: number): void {
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(Math.max(0, value), now + seconds);
  }

  /** Instant-mute contract: sound toggle takes effect immediately, just ramped smoothly to avoid a click. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.rampTo(this.target(), MUTE_RAMP_SECONDS);
  }

  /** Pause/hidden: suspend audibility without tearing down the graph. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.rampTo(this.target(), RAMP_SECONDS);
  }

  dispose(): void {
    try {
      this.gain.disconnect();
    } catch {
      /* already disconnected — safe to ignore */
    }
  }
}
