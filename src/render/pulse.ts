/**
 * Generic exponential-decay "impulse" — a value that jumps to 1 (or a given
 * amount) when triggered and decays smoothly back toward 0, framerate-
 * independent (uses a half-life, not a fixed per-frame multiplier). Used
 * for every one-shot cinematic bump this renderer needs: the pump lever's
 * swing kick on `jackPumped`, the hammer's strike swing + dust puff on
 * `hammered`, the pin's snap flash on `snapped`, and each finale
 * `revealBeat`'s glow. One small, well-tested primitive instead of five
 * bespoke ad-hoc timers.
 */
export interface Pulse {
  value: number;
}

export function createPulse(initial = 0): Pulse {
  return { value: initial };
}

/** Jumps `pulse.value` to `amount` (default 1), overriding any in-flight decay. */
export function triggerPulse(pulse: Pulse, amount = 1): void {
  pulse.value = amount;
}

/** Exponentially decays `pulse.value` toward 0 over `halfLifeS` seconds; snaps to exactly 0 once negligible. */
export function decayPulse(pulse: Pulse, dtSeconds: number, halfLifeS: number): void {
  if (pulse.value <= 0 || dtSeconds <= 0) return;
  const factor = Math.pow(0.5, dtSeconds / Math.max(halfLifeS, 1e-6));
  const next = pulse.value * factor;
  pulse.value = next < 0.001 ? 0 : next;
}

/**
 * Exponential smoothing toward an arbitrary (not necessarily 0) target —
 * the one-way sibling of decayPulse, used for things that ease in and then
 * HOLD (e.g. the finale's permanent first-level settle-down) rather than
 * decaying back to 0. Framerate-independent via the same half-life model.
 */
export function approach(current: number, target: number, dtSeconds: number, halfLifeS: number): number {
  if (dtSeconds <= 0) return current;
  const factor = 1 - Math.pow(0.5, dtSeconds / Math.max(halfLifeS, 1e-6));
  const next = current + (target - current) * factor;
  return Math.abs(next - target) < 0.001 ? target : next;
}
