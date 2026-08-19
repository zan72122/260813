import { CELL, GRID_NX, GRID_NZ, MOAT_TARGET_DEPTH, WATER_EPS, WATER_G } from '../core/config'
import { clamp } from '../core/util'
import { Rect, Terrain, emptyRect, growRect, rectValid } from './terrain'

const WX = GRID_NX + 1
const WZ = GRID_NZ + 1
const COUNT = WX * WZ

/** Below this the film is genuinely negligible and may be dropped. */
const MIN_KEEP = 2e-5

/**
 * A "virtual pipe" shallow-water model (Mei-style): each cell exchanges volume
 * with its four neighbours according to the difference in water *surface*
 * height. It is not a real fluid solver, but it reproduces every causal fact a
 * four-year-old needs to read off the screen:
 *   - water runs downhill and finds grooves
 *   - it cannot climb a bank
 *   - it pools in holes and overflows when the hole is full
 */
export class Water {
  readonly depth = new Float32Array(COUNT)
  private readonly fL = new Float32Array(COUNT)
  private readonly fR = new Float32Array(COUNT)
  private readonly fU = new Float32Array(COUNT)
  private readonly fD = new Float32Array(COUNT)
  /** Horizontal velocity, used for foam, flow direction and particles. */
  readonly velX = new Float32Array(COUNT)
  readonly velZ = new Float32Array(COUNT)

  /** Bounding box of cells that currently hold water (plus a margin). */
  activeRect: Rect = emptyRect()

  totalVolume = 0
  moatFill = 0
  /** World-space centroid + leading edge of the water, for the camera. */
  frontX = 0
  frontZ = 0
  centroidX = 0
  centroidZ = 0
  /** Sum of |velocity| * depth — drives the stream sound. */
  flowEnergy = 0
  /** Volume that reached the moat this frame (for the filling chime). */
  moatGainRate = 0

  private prevMoatVolume = 0

  reset(): void {
    this.depth.fill(0)
    this.fL.fill(0)
    this.fR.fill(0)
    this.fU.fill(0)
    this.fD.fill(0)
    this.velX.fill(0)
    this.velZ.fill(0)
    this.activeRect = emptyRect()
    this.totalVolume = 0
    this.moatFill = 0
    this.flowEnergy = 0
    this.moatGainRate = 0
    this.prevMoatVolume = 0
  }

  /** Pour water into a disc. Returns the volume actually added. */
  add(terrain: Terrain, x: number, z: number, radius: number, volume: number): number {
    const i0 = clamp(Math.floor(terrain.gi(x - radius)), 1, WX - 2)
    const i1 = clamp(Math.ceil(terrain.gi(x + radius)), 1, WX - 2)
    const j0 = clamp(Math.floor(terrain.gj(z - radius)), 1, WZ - 2)
    const j1 = clamp(Math.ceil(terrain.gj(z + radius)), 1, WZ - 2)
    let weightSum = 0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(terrain.wx(i) - x, terrain.wz(j) - z)
        if (d <= radius) weightSum += 1 - d / radius
      }
    }
    if (weightSum <= 0) return 0
    // `volume` is a volume; the grid stores depth, so divide by the cell area.
    const per = volume / (weightSum * CELL * CELL)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(terrain.wx(i) - x, terrain.wz(j) - z)
        if (d > radius) continue
        const k = j * WX + i
        this.depth[k] += per * (1 - d / radius)
        growRect(this.activeRect, i, j)
      }
    }
    return volume
  }

  step(terrain: Terrain, dt: number): void {
    const h = terrain.height
    const d = this.depth
    const { fL, fR, fU, fD } = this

    // Only visit cells that could plausibly hold water this frame.
    let r = this.activeRect
    if (!rectValid(r)) {
      this.totalVolume = 0
      this.flowEnergy = 0
      this.moatGainRate = 0
      return
    }
    r = {
      i0: Math.max(1, r.i0 - 2),
      j0: Math.max(1, r.j0 - 2),
      i1: Math.min(WX - 2, r.i1 + 2),
      j1: Math.min(WZ - 2, r.j1 + 2),
    }

    // Pipe cross-section scales with how much water is actually in the pipe,
    // so a deep channel carries far more than a thin film. That is what makes
    // "dig it deeper and the water really goes" true in play.
    const g = WATER_G
    const PIPE = 2.6
    const kBase = dt * g * PIPE
    const damping = 0.96
    const cellArea = CELL * CELL

    // --- 1. flux update -------------------------------------------------
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const k = j * WX + i
        const dk = d[k]
        if (dk <= 0 && fL[k] === 0 && fR[k] === 0 && fU[k] === 0 && fD[k] === 0) continue
        const sk = h[k] + dk

        const nl = k - 1
        const nr = k + 1
        const nu = k - WX
        const nd = k + WX

        const dl = d[nl]
        const dr = d[nr]
        const du = d[nu]
        const dd = d[nd]
        const pipe = (a: number, b: number) => kBase * Math.min(0.3, (a + b) * 0.5 + 0.004)

        fL[k] = Math.max(0, fL[k] * damping + pipe(dk, dl) * (sk - (h[nl] + dl)))
        fR[k] = Math.max(0, fR[k] * damping + pipe(dk, dr) * (sk - (h[nr] + dr)))
        fU[k] = Math.max(0, fU[k] * damping + pipe(dk, du) * (sk - (h[nu] + du)))
        fD[k] = Math.max(0, fD[k] * damping + pipe(dk, dd) * (sk - (h[nd] + dd)))

        // Never move out more water than the cell holds.
        const out = (fL[k] + fR[k] + fU[k] + fD[k]) * dt
        const have = dk * cellArea
        if (out > have) {
          const s = out > 1e-12 ? have / out : 0
          fL[k] *= s
          fR[k] *= s
          fU[k] *= s
          fD[k] *= s
        }
      }
    }

    // --- 2. apply, and gather the metrics the game reads ------------------
    const next = emptyRect()
    let total = 0
    let energy = 0
    let cx = 0
    let cz = 0
    let frontX = -1e9
    let frontZ = 0
    let moatVol = 0
    const wetn = terrain.wetness
    const absorbRate = 0.05 * dt
    const seep = 0.0008 * dt

    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const k = j * WX + i
        const inflow = fR[k - 1] + fL[k + 1] + fD[k - WX] + fU[k + WX]
        const outflow = fL[k] + fR[k] + fU[k] + fD[k]
        let nd = d[k] + ((inflow - outflow) * dt) / cellArea
        if (nd < 0) nd = 0

        if (nd > 0) {
          // Dry sand drinks a little; soaked sand stops absorbing. This makes
          // the very first trickle sink in and later water run further.
          const wk = wetn[k]
          if (wk < 1) {
            const soak = Math.min(nd, absorbRate * (1 - wk) * (nd > 0.004 ? 1 : 0.35))
            nd -= soak
            wetn[k] = Math.min(1, wk + soak * 60)
          } else {
            wetn[k] = 1
          }
          // Even soaked sand keeps seeping, so a river fades once the child
          // stops pouring and the sandbox can never become a permanent lake.
          // The moat is the exception: it is stone-lined and holds what it
          // is given, which is the whole point of filling it.
          if (!terrain.moatMask[k]) nd = Math.max(0, nd - seep)
        }

        d[k] = nd

        const vx = (fR[k - 1] - fL[k] + fR[k] - fL[k + 1]) * 0.5
        const vz = (fD[k - WX] - fU[k] + fD[k] - fU[k + WX]) * 0.5
        this.velX[k] = vx
        this.velZ[k] = vz

        if (nd > MIN_KEEP) {
          // The active rect follows even the thinnest film, so no water is
          // ever quietly discarded: a poured litre stays a poured litre.
          growRect(next, i, j)
          if (nd > WATER_EPS) {
            const vol = nd * cellArea
            total += vol
            energy += (Math.abs(vx) + Math.abs(vz)) * Math.min(nd, 0.05)
            const x = terrain.wx(i)
            const z = terrain.wz(j)
            cx += x * vol
            cz += z * vol
            if (x > frontX) {
              frontX = x
              frontZ = z
            }
            if (terrain.moatMask[k]) moatVol += Math.min(nd, MOAT_TARGET_DEPTH * 2.2)
          }
        } else if (nd > 0) {
          wetn[k] = Math.min(1, wetn[k] + nd * 20)
          d[k] = 0
        }
      }
    }

    this.activeRect = next
    this.totalVolume = total
    this.flowEnergy = energy
    if (total > 1e-6) {
      this.centroidX = cx / total
      this.centroidZ = cz / total
      this.frontX = frontX
      this.frontZ = frontZ
    }

    const moatCap = Math.max(1, terrain.moatCellCount) * MOAT_TARGET_DEPTH
    this.moatFill = clamp(moatVol / moatCap, 0, 1)
    this.moatGainRate = dt > 0 ? (moatVol - this.prevMoatVolume) / dt : 0
    this.prevMoatVolume = moatVol
  }

  /** Rect covering water plus a margin, for mesh/colour updates. */
  renderRect(): Rect {
    const r = this.activeRect
    if (!rectValid(r)) return r
    return {
      i0: Math.max(0, r.i0 - 2),
      j0: Math.max(0, r.j0 - 2),
      i1: Math.min(WX - 1, r.i1 + 2),
      j1: Math.min(WZ - 1, r.j1 + 2),
    }
  }
}
