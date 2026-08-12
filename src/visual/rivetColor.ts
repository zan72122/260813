// src/visual/rivetColor.ts
// Pure rivet color/emissive ramp: bright orange-white (freshly heated) ->
// orange -> dark iron (cooled). Driven by GameState.rivet.temp (0..1, set
// while at the forge / during the carry-relay) and .cooled (0..1, ramps up
// during rivetCool). No THREE/DOM dependency so the ramp math is testable
// in isolation from material creation.

export interface RivetColorResult {
  /** 0xRRGGBB base color. */
  color: number;
  /** 0xRRGGBB emissive color (black when fully cooled = no glow). */
  emissive: number;
  /** Emissive intensity multiplier, 0 (dark iron) .. 1 (white-hot). */
  emissiveIntensity: number;
}

const HOT_WHITE = { r: 1.0, g: 0.96, b: 0.82 };
const HOT_ORANGE = { r: 1.0, g: 0.45, b: 0.08 };
const WARM_ORANGE = { r: 0.85, g: 0.25, b: 0.05 };
const DARK_IRON = { r: 0.16, g: 0.13, b: 0.12 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function toHex(c: { r: number; g: number; b: number }): number {
  const r = Math.round(Math.min(Math.max(c.r, 0), 1) * 255);
  const g = Math.round(Math.min(Math.max(c.g, 0), 1) * 255);
  const b = Math.round(Math.min(Math.max(c.b, 0), 1) * 255);
  return (r << 16) | (g << 8) | b;
}

/**
 * `temp` (0..1): how heated the rivet currently is (rises at the forge,
 * stays ~1 during the carry/insert/hammer relay). `cooled` (0..1): the
 * rivetCool phase's cooling progress, 0 = still glowing hot, 1 = fully dark
 * iron. When cooled=0 the ramp is purely a function of temp; as cooled rises
 * it overrides toward dark iron regardless of temp.
 */
export function rivetColorRamp(temp: number, cooled: number): RivetColorResult {
  const t = Math.min(Math.max(temp, 0), 1);
  const c = Math.min(Math.max(cooled, 0), 1);

  let heatColor: { r: number; g: number; b: number };
  let heatIntensity: number;
  if (t < 0.001) {
    heatColor = DARK_IRON;
    heatIntensity = 0;
  } else if (t < 0.55) {
    heatColor = mixRgb(WARM_ORANGE, HOT_ORANGE, t / 0.55);
    heatIntensity = lerp(0.15, 0.7, t / 0.55);
  } else {
    heatColor = mixRgb(HOT_ORANGE, HOT_WHITE, (t - 0.55) / 0.45);
    heatIntensity = lerp(0.7, 1, (t - 0.55) / 0.45);
  }

  const finalColor = mixRgb(heatColor, DARK_IRON, c);
  const finalIntensity = heatIntensity * (1 - c);

  return {
    color: toHex(finalColor),
    emissive: toHex(finalColor),
    emissiveIntensity: finalIntensity,
  };
}
