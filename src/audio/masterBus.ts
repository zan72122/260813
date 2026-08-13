/**
 * Master gain stage: everything the engine synthesizes routes through this
 * single node before `ctx.destination`, so mute/unmute and pause/resume are
 * always one smooth ramp in one place rather than scattered per-voice
 * logic.
 *
 * F7 (review round 1): a `DynamicsCompressorNode` sits between the gain
 * stage and `ctx.destination` as a gentle master limiter — every voice this
 * engine ever synthesizes is a one-shot or a short loop routed through
 * `this.gain` (engine.ts's `dest`), so a mashing player overlapping several
 * jackPump/hammerImpact one-shots on top of a sustained sand loop can sum
 * past 0dBFS and clip. Settings are deliberately conservative "glue"
 * compression, not an audible effect on ordinary single-voice playback:
 *   - threshold -24dB: only engages once several voices are summing loud;
 *     any one voice alone (peaks well under -24dB per voices.ts's envelope
 *     peaks, all <=0.6 linear ~= -4.4dB... actually most <=0.3 ~= -10dB)
 *     essentially never trips it on its own.
 *   - ratio 4:1: a mild, musical limiting slope, not a hard brick-wall.
 *   - knee 12dB: soft-kneed, so gain reduction fades in rather than
 *     "grabbing" audibly at the threshold.
 *   - attack 3ms: fast enough to catch a hammer/snap transient before it
 *     clips, without audibly softening its punch.
 *   - release 150ms: long enough that rapid mash-triggered one-shots don't
 *     produce audible "pumping" between them.
 */
import type { MinimalAudioContext } from './context';

const RAMP_SECONDS = 0.12;
const MUTE_RAMP_SECONDS = 0.05;

/** F7 master-limiter settings — see this module's doc comment for the rationale behind each value. */
export const MASTER_COMPRESSOR_SETTINGS = {
  thresholdDb: -24,
  kneeDb: 12,
  ratio: 4,
  attackSeconds: 0.003,
  releaseSeconds: 0.15,
} as const;

export class MasterBus {
  readonly gain: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private enabled = true;
  private suspended = false;
  private readonly baseVolume: number;

  constructor(private readonly ctx: MinimalAudioContext, initialVolume = 0.7) {
    this.gain = ctx.createGain();
    this.gain.gain.value = initialVolume;
    this.baseVolume = initialVolume;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = MASTER_COMPRESSOR_SETTINGS.thresholdDb;
    this.compressor.knee.value = MASTER_COMPRESSOR_SETTINGS.kneeDb;
    this.compressor.ratio.value = MASTER_COMPRESSOR_SETTINGS.ratio;
    this.compressor.attack.value = MASTER_COMPRESSOR_SETTINGS.attackSeconds;
    this.compressor.release.value = MASTER_COMPRESSOR_SETTINGS.releaseSeconds;

    this.gain.connect(this.compressor);
    this.compressor.connect(ctx.destination);
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
    try {
      this.compressor.disconnect();
    } catch {
      /* already disconnected — safe to ignore */
    }
  }
}
