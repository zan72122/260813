/**
 * The ONE place legModel.ts's abstract `legOffsetY` (units, 1 unit ≈ 1mm
 * per HISTORICAL_NOTES) is translated into a world-space vertical offset.
 * Every other module (tower geometry, camera director, visual/sand) must
 * go through this function rather than re-deriving the scale factor.
 *
 * legOffsetY's usable range is roughly [-SAND_UNDERSHOOT_MAX, +INITIAL_OFFSET_MAX]
 * = about [-5, +30] (contracts/constants.ts). A naive 1:1 mapping would be
 * imperceptible next to a multi-hundred-unit tower model, so the factor is
 * deliberately exaggerated: 0.09 world units per legOffsetY unit, chosen so
 * the full initial-offset range (~30 units) reads as a clearly-visible
 * ~2.7 world-unit gap at establish/activeLeg framing distance (see
 * scene/layout.ts's GIRDER_RING_Y / LEG_TOP_RADIUS scale, where ~2.7 units
 * is a legible fraction of the ~32-unit tower height) without the leg
 * visibly leaving its lattice envelope.
 */

/** World units of vertical offset per one legOffsetY unit. See module doc for how this was chosen. */
export const LEG_OFFSET_WORLD_SCALE = 0.09;

/**
 * Maps a leg's current `legOffsetY` (game units, + is above target, 0 =
 * matched) to a world-space Y delta to add on top of the leg's fixed rest
 * position (scene/layout.ts GIRDER_RING_Y). Strictly monotonic increasing
 * (linear) — a smaller legOffsetY always yields a strictly smaller world Y,
 * so sand-phase descent and jack-phase ascent are guaranteed to read as
 * continuous, non-reversing motion on screen.
 */
export function legOffsetToWorldY(legOffsetY: number): number {
  return legOffsetY * LEG_OFFSET_WORLD_SCALE;
}
