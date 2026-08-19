import { CELL, GRID_N, MOAT_TARGET_DEPTH, WATER_EPS } from '../core/config'
import { clamp } from '../core/util'
import { Rect, Terrain, emptyRect, growRect, rectValid } from './terrain'

const W = GRID_N + 1

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
  readonly depth = new Float32Array(W * W)
  private readonly fL = new Float32Array(W * W)
  private readonly fR = new Float32Array(W * W)
  private readonly fU = new Float32Array(W * W)
  private readonly fD = new Float32Array(W * W)
  /** Horizontal velocity, used for foam, flow direction and particles. */
  readonly velX = new Float32Array(W * W)
  readonly velZ = new Float32Array(W * W)

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
    const i0 = clamp(Math.floor(terrain.gi(x - radius)), 1, W - 2)
    const i1 = clamp(Math.ceil(terrain.gi(x + radius)), 1, W - 2)
    const j0 = clamp(Math.floor(terrain.gj(z - radius)), 1, W - 2)
    const j1 = clamp(Math.ceil(terrain.gj(z + radius)), 1, W - 2)
    let weightSum = 0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(terrain.wx(i) - x, terrain.wz(j) - z)
        if (d <= radius) weightSum += 1 - d / radius
      }
    }
    if (weightSum <= 0) return 0
    const per = volume / weightSum
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(terrain.wx(i) - x, terrain.wz(j) - z)
        if (d > radius) continue
        const k = j * W + i
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
      i1: Math.min(W - 2, r.i1 + 2),
      j1: Math.min(W - 2, r.j1 + 2),
    }

    const A = CELL * CELL * 0.42 // effective pipe cross-section
    const g = 9.81
    const kFlux = (dt * A * g) / CELL
    const damping = 0.965
    const cellArea = CELL * CELL

    // --- 1. flux update -------------------------------------------------
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const k = j * W + i
        const dk = d[k]
        if (dk <= 0 && fL[k] === 0 && fR[k] === 0 && fU[k] === 0 && fD[k] === 0) continue
        const sk = h[k] + dk

        const nl = k - 1
        const nr = k + 1
        const nu = k - W
        const nd = k + W

        fL[k] = Math.max(0, fL[k] * damping + kFlux * (sk - (h[nl] + d[nl])))
        fR[k] = Math.max(0, fR[k] * damping + kFlux * (sk - (h[nr] + d[nr])))
        fU[k] = Math.max(0, fU[k] * damping + kFlux * (sk - (h[nu] + d[nu])))
        fD[k] = Math.max(0, fD[k] * damping + kFlux * (sk - (h[nd] + d[nd])))

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
    const absorbRate = 0.13 * dt

    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const k = j * W + i
        const inflow = fR[k - 1] + fL[k + 1] + fD[k - W] + fU[k + W]
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
            wetn[k] = Math.min(1, wk + soak * 9)
          } else {
            wetn[k] = 1
          }
        }

        d[k] = nd

        const vx = (fR[k - 1] - fL[k] + fR[k] - fL[k + 1]) * 0.5
        const vz = (fD[k - W] - fU[k] + fD[k] - fU[k + W]) * 0.5
        this.velX[k] = vx
        this.velZ[k] = vz

        if (nd > WATER_EPS) {
          growRect(next, i, j)
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
        } else if (nd > 0) {
          // Snuff out sub-visible films so the active rect can shrink.
          wetn[k] = Math.min(1, wetn[k] + nd * 6)
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
      i1: Math.min(W - 1, r.i1 + 2),
      j1: Math.min(W - 1, r.j1 + 2),
    }
  }
}
