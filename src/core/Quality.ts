/**
 * Device-tier detection + runtime adaptive quality.
 *
 * Mobile Safari is the target, so we start conservative and only scale up when
 * the device proves it can hold frame time. DPR is the first thing we sacrifice
 * because fill-rate is the usual bottleneck for a screen full of flowers.
 */

export type Tier = 'low' | 'mid' | 'high';

export interface QualitySettings {
  tier: Tier;
  dprCap: number;
  nearFlowers: number;
  midFlowers: number;
  farFlowers: number;
  bandRings: number;
  soilParticles: number;
  petalConfetti: number;
  textureSize: number;
}

const PRESETS: Record<Tier, Omit<QualitySettings, 'tier'>> = {
  low: {
    dprCap: 1.5, nearFlowers: 46, midFlowers: 1300, farFlowers: 4200,
    bandRings: 4, soilParticles: 26, petalConfetti: 0, textureSize: 256,
  },
  mid: {
    dprCap: 2.0, nearFlowers: 84, midFlowers: 2800, farFlowers: 9000,
    bandRings: 5, soilParticles: 40, petalConfetti: 24, textureSize: 512,
  },
  high: {
    dprCap: 2.0, nearFlowers: 130, midFlowers: 4200, farFlowers: 12000,
    bandRings: 6, soilParticles: 54, petalConfetti: 36, textureSize: 512,
  },
};

function detectTier(): Tier {
  if (typeof navigator === 'undefined') return 'mid';
  const params = new URLSearchParams(location.search);
  const forced = params.get('q');
  if (forced === 'low' || forced === 'mid' || forced === 'high') return forced;

  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const px = Math.min(window.innerWidth, window.innerHeight);
  const ua = navigator.userAgent;
  const isOldIPhone = /iPhone/.test(ua) && cores <= 4 && px <= 375;

  if (isOldIPhone || cores <= 3 || mem <= 2) return 'low';
  if (cores >= 6 && mem >= 4) return 'high';
  return 'mid';
}

export class Quality {
  readonly settings: QualitySettings;
  /** Multiplier applied on top of the device pixel ratio, lowered when we drop frames. */
  private resScale = 1;
  private samples: number[] = [];
  private lastAdjust = 0;
  onResScale?: (scale: number) => void;

  constructor() {
    const tier = detectTier();
    this.settings = { tier, ...PRESETS[tier] };
  }

  get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.settings.dprCap) * this.resScale;
  }

  /** Feed frame times (ms). Drops resolution when the device is clearly struggling. */
  sample(dtMs: number, now: number) {
    if (dtMs > 200) return; // tab was backgrounded
    this.samples.push(dtMs);
    if (this.samples.length < 50) return;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;
    if (now - this.lastAdjust < 2.5) return;

    if (median > 23 && this.resScale > 0.62) {
      this.resScale = Math.max(0.62, this.resScale - 0.16);
      this.lastAdjust = now;
      this.onResScale?.(this.resScale);
    } else if (median < 14 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.1);
      this.lastAdjust = now;
      this.onResScale?.(this.resScale);
    }
  }
}
