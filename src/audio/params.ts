// src/audio/params.ts — pure numeric sound-parameter curves. No AudioContext
// here so these are unit-testable without a browser; src/audio/index.ts
// consumes them when scheduling real WebAudio nodes.

/** Rising pitch for each hammer strike (1..3), in Hz, multiplying a base tone. */
export function hammerPitchForHit(hit: 1 | 2 | 3): number {
  const base = 520;
  const steps: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.16, 3: 1.34 };
  return base * steps[hit];
}

/** Anvil "ring" tail frequency companion to the hammer tink — a fixed fifth above. */
export function anvilRingFrequency(hit: 1 | 2 | 3): number {
  return hammerPitchForHit(hit) * 1.5;
}

const CHUG_MIN_INTERVAL_S = 0.22;
const CHUG_MAX_INTERVAL_S = 0.62;

/** Seconds between climb "chug" thumps; speeds up (shorter interval) as progress -> 1. */
export function chugIntervalSeconds(progress: number): number {
  const p = clamp01(progress);
  return CHUG_MAX_INTERVAL_S - p * (CHUG_MAX_INTERVAL_S - CHUG_MIN_INTERVAL_S);
}

/** Steam-hiss gain, proportional to how far the climb lever is opened. */
export function steamHissGain(lever: number): number {
  const l = clamp01(lever);
  return 0.05 + l * 0.22;
}

/** Forge crackle bed gain while the rivet is heating (0 before lit, fades out at temp=1). */
export function forgeCrackleGain(temp: number): number {
  const t = clamp01(temp);
  if (t <= 0) return 0;
  if (t >= 1) return 0;
  // gentle rise then settle — loudest mid-heat, quieter near full heat (about to hand off)
  return 0.18 * Math.sin(Math.PI * t) + 0.06;
}

/** Cooling sizzle gain, loud right after quenching and fading toward 0 as cooled -> 1. */
export function coolingSizzleGain(cooled: number): number {
  const c = clamp01(cooled);
  return 0.3 * (1 - c);
}

/** Cable slack "whip" pitch-bend amount (semitone-ish ratio) — soft, small. */
export function slingWhipBendRatio(): number {
  return 0.88;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
