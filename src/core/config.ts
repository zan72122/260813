/** Global tuning constants shared by simulation and rendering. */

/**
 * The play area is deliberately 2:1 along the direction the river runs.
 * That single choice is what lets one composition fill both a tall phone and
 * a wide tablet without ever cropping the castle or the water source.
 */
export const SAND_X = 15.36
export const SAND_Z = 6.4

/** Simulation grid resolution. One cell is CELL world units square. */
export const GRID_NX = 120
export const GRID_NZ = 50
export const CELL = SAND_X / GRID_NX

/** Lowest height the shovel can reach — the "bottom of the sandbox". */
export const BEDROCK = 0.06

/** Water shallower than this is treated as absent (no render, no flow). */
export const WATER_EPS = 0.0016

/** Castle centre in world space. Water travels from -X toward +X. */
export const CASTLE_X = 4.15
export const CASTLE_Z = 0

/** Moat geometry. */
export const MOAT_INNER = 1.3
export const MOAT_OUTER = 2.15

/** Water source basin centre. */
export const SOURCE_X = -5.6
export const SOURCE_Z = 0

/** Water depth in the moat that counts as "full". */
export const MOAT_TARGET_DEPTH = 0.052

export const isFastE2E = (): boolean => {
  try {
    const p = new URLSearchParams(location.search)
    return p.get('e2e') === '1' || p.get('fast') === '1'
  } catch {
    return false
  }
}
