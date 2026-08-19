/** Global tuning constants shared by simulation and rendering. */

/** Side length of the playable sand area, in world units. */
export const SAND_SIZE = 12

/** Simulation grid resolution (cells per side). One cell = SAND_SIZE / GRID_N. */
export const GRID_N = 96

/** World size of one simulation cell. */
export const CELL = SAND_SIZE / GRID_N

/** Lowest height the shovel can reach — the "bottom of the sandbox". */
export const BEDROCK = 0.06

/** Water shallower than this is treated as absent (no render, no flow). */
export const WATER_EPS = 0.0016

/** Castle centre in world space. Water travels from -X toward +X. */
export const CASTLE_X = 4.05
export const CASTLE_Z = 0

/** Moat geometry. */
export const MOAT_INNER = 1.12
export const MOAT_OUTER = 1.95

/** Water source basin centre. */
export const SOURCE_X = -4.5
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
