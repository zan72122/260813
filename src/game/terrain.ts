import {
  BEDROCK,
  CASTLE_X,
  CASTLE_Z,
  CELL,
  GRID_NX,
  GRID_NZ,
  MOAT_INNER,
  MOAT_OUTER,
  SAND_X,
  SAND_Z,
  SOURCE_X,
  SOURCE_Z,
} from '../core/config'
import { ValueNoise2D, makeRng } from '../core/rng'
import { clamp, smoothstep } from '../core/util'

export type TerrainPatternId = 'gentle' | 'sidepath' | 'ridge' | 'sandbox'

export type Rect = { i0: number; j0: number; i1: number; j1: number }

const NX = GRID_NX
const NZ = GRID_NZ
/** Vertices per row / column. `WX` is also the row stride of every array. */
const WX = NX + 1
const WZ = NZ + 1

export const emptyRect = (): Rect => ({ i0: 1e9, j0: 1e9, i1: -1, j1: -1 })

export function growRect(r: Rect, i: number, j: number): void {
  if (i < r.i0) r.i0 = i
  if (j < r.j0) r.j0 = j
  if (i > r.i1) r.i1 = i
  if (j > r.j1) r.j1 = j
}

export function rectValid(r: Rect): boolean {
  return r.i1 >= r.i0 && r.j1 >= r.j0
}

export function unionRect(a: Rect, b: Rect): Rect {
  if (!rectValid(a)) return { ...b }
  if (!rectValid(b)) return { ...a }
  return {
    i0: Math.min(a.i0, b.i0),
    j0: Math.min(a.j0, b.j0),
    i1: Math.max(a.i1, b.i1),
    j1: Math.max(a.j1, b.j1),
  }
}

/** Result of a brush stroke — used to drive particles and audio. */
export type StrokeFeedback = {
  moved: number
  x: number
  z: number
  height: number
}

/**
 * The sand as a height field. Everything the child does to the ground —
 * digging, mounding, wetting — is a change to one of these arrays.
 */
export class Terrain {
  /** Row stride (vertices across X). */
  readonly w = WX
  /** Rows (vertices across Z). */
  readonly h = WZ
  readonly height = new Float32Array(WX * WZ)
  readonly baseHeight = new Float32Array(WX * WZ)
  /** 0 dry .. 1 soaked. Drives colour and roughness. */
  readonly wetness = new Float32Array(WX * WZ)
  /** 0 loose .. 1 patted down. Mounded sand starts loose and settles. */
  readonly compaction = new Float32Array(WX * WZ)
  /** Per-vertex speckle so the sand does not look like flat plastic. */
  readonly grainTint = new Float32Array(WX * WZ)
  /** 1 where the moat ring is, used for the fill metric. */
  readonly moatMask = new Uint8Array(WX * WZ)
  /** 1 where the castle island sits — protected from digging. */
  readonly castleMask = new Uint8Array(WX * WZ)

  moatCellCount = 0
  dirty: Rect = emptyRect()
  pattern: TerrainPatternId = 'gentle'

  constructor() {
    this.build('gentle', 1)
  }

  idx(i: number, j: number): number {
    return j * WX + i
  }

  /** World X of vertex column i. */
  wx(i: number): number {
    return i * CELL - SAND_X / 2
  }

  /** World Z of vertex row j. */
  wz(j: number): number {
    return j * CELL - SAND_Z / 2
  }

  /** Grid column (fractional) for a world X. */
  gi(x: number): number {
    return (x + SAND_X / 2) / CELL
  }

  gj(z: number): number {
    return (z + SAND_Z / 2) / CELL
  }

  markAllDirty(): void {
    this.dirty = { i0: 0, j0: 0, i1: WX - 1, j1: WZ - 1 }
  }

  /** Bilinear height sample in world space. */
  heightAt(x: number, z: number): number {
    const fi = clamp(this.gi(x), 0, WX - 1.001)
    const fj = clamp(this.gj(z), 0, WZ - 1.001)
    const i = Math.floor(fi)
    const j = Math.floor(fj)
    const tx = fi - i
    const tz = fj - j
    const k = j * WX + i
    const h00 = this.height[k]
    const h10 = this.height[k + 1]
    const h01 = this.height[k + WX]
    const h11 = this.height[k + WX + 1]
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz
  }

  // ---------------------------------------------------------------- build

  build(pattern: TerrainPatternId, seed: number): void {
    this.pattern = pattern
    const noise = new ValueNoise2D(seed * 7919 + 13)
    const rng = makeRng(seed * 104729 + 7)
    const h = this.height

    for (let j = 0; j < WZ; j++) {
      const z = this.wz(j)
      for (let i = 0; i < WX; i++) {
        const x = this.wx(i)
        const k = j * WX + i

        // Base slope: high at the source end, low at the castle end.
        let y = 1.0 - ((x + SAND_X / 2) / SAND_X) * 0.46

        // Gentle natural undulation — never enough to trap water on its own.
        y += (noise.fbm(x * 0.38 + 3.1, z * 0.38 - 2.4) - 0.5) * 0.045

        // Raised lip along the sandbox border so water does not just run off.
        const edge = Math.max(
          0,
          1 - Math.min(Math.min(i, WX - 1 - i), Math.min(j, WZ - 1 - j)) / 5,
        )
        y += edge * edge * 0.36

        h[k] = y
        this.grainTint[k] = rng()
        this.wetness[k] = 0
        this.compaction[k] = 0.5
        this.moatMask[k] = 0
        this.castleMask[k] = 0
      }
    }

    this.applyPattern(pattern, noise)
    // Settle the free-form terrain first, then cut the built features so the
    // moat and the source basin keep crisp, readable edges.
    this.relaxSlopes(3, 0.62)
    this.carveSourceBasin()
    this.carveMoat()

    this.baseHeight.set(h)
    this.moatCellCount = 0
    for (let k = 0; k < this.moatMask.length; k++) if (this.moatMask[k]) this.moatCellCount++
    this.markAllDirty()
  }

  private carveSourceBasin(): void {
    const h = this.height
    for (let j = 0; j < WZ; j++) {
      const z = this.wz(j)
      for (let i = 0; i < WX; i++) {
        const x = this.wx(i)
        const d = Math.hypot(x - SOURCE_X, z - SOURCE_Z)
        const k = j * WX + i
        // A shallow bowl with a raised rim: a clear "the water starts here".
        if (d < 1.1) {
          const bowl = smoothstep(1.1, 0.25, d)
          h[k] = h[k] * (1 - bowl) + 0.88 * bowl
        }
        if (d > 0.7 && d < 1.12) {
          const rim = Math.sin(((d - 0.7) / 0.42) * Math.PI)
          h[k] += rim * 0.09
        }
      }
    }
  }

  private carveMoat(): void {
    const h = this.height
    const mid = (MOAT_INNER + MOAT_OUTER) / 2
    const halfW = (MOAT_OUTER - MOAT_INNER) / 2
    for (let j = 0; j < WZ; j++) {
      const z = this.wz(j)
      for (let i = 0; i < WX; i++) {
        const x = this.wx(i)
        const dx = x - CASTLE_X
        const dz = z - CASTLE_Z
        const d = Math.hypot(dx, dz)
        const k = j * WX + i

        if (d < MOAT_INNER + 0.16) {
          // Castle island — a firm, slightly raised platform.
          const t = smoothstep(MOAT_INNER + 0.16, MOAT_INNER - 0.35, d)
          h[k] = h[k] * (1 - t) + 0.6 * t
          this.compaction[k] = 1
          if (d < MOAT_INNER + 0.05) this.castleMask[k] = 1
        }

        if (d > MOAT_INNER - 0.05 && d < MOAT_OUTER + 0.05) {
          const t = 1 - Math.min(1, Math.abs(d - mid) / halfW)
          const dip = smoothstep(0, 1, t)
          h[k] = h[k] * (1 - dip) + 0.2 * dip
          if (t > 0.25) this.moatMask[k] = 1
        }

        // Outer bank keeps the moat holding water, with a notch on the
        // source side: the gate the child's river has to reach.
        if (d > MOAT_OUTER - 0.05 && d < MOAT_OUTER + 0.6) {
          const ang = Math.atan2(dz, dx)
          const gate = smoothstep(0.5, 0.14, Math.abs(ang - Math.PI))
          const bank = Math.sin(((d - (MOAT_OUTER - 0.05)) / 0.65) * Math.PI)
          h[k] += bank * 0.24 * (1 - gate)
          if (gate > 0.2) {
            // A short inviting channel leading outward from the gate.
            const t = gate * smoothstep(MOAT_OUTER + 0.65, MOAT_OUTER - 0.05, d)
            h[k] = h[k] * (1 - t * 0.85) + 0.34 * t * 0.85
          }
        }
      }
    }
  }

  private applyPattern(p: TerrainPatternId, noise: ValueNoise2D): void {
    const h = this.height
    const bump = (cx: number, cz: number, r: number, amp: number) => {
      for (let j = 0; j < WZ; j++) {
        const z = this.wz(j)
        if (Math.abs(z - cz) > r) continue
        for (let i = 0; i < WX; i++) {
          const x = this.wx(i)
          const d = Math.hypot(x - cx, z - cz)
          if (d > r) continue
          const k = j * WX + i
          if (this.castleMask[k]) continue
          h[k] += amp * smoothstep(r, 0, d)
        }
      }
    }
    const trough = (x0: number, z0: number, x1: number, z1: number, r: number, amp: number) => {
      for (let j = 0; j < WZ; j++) {
        for (let i = 0; i < WX; i++) {
          const k = j * WX + i
          if (this.castleMask[k] || this.moatMask[k]) continue
          const d = distToSegment(this.wx(i), this.wz(j), x0, z0, x1, z1)
          if (d > r) continue
          h[k] -= amp * smoothstep(r, 0, d)
        }
      }
    }

    if (p === 'gentle') {
      // A single clean run. The first river should succeed easily.
      trough(-3.6, 0, 2.2, 0, 0.6, 0.05)
      bump(-0.6, 2.2, 1.5, 0.07)
      bump(0.8, -2.3, 1.6, 0.06)
    } else if (p === 'sidepath') {
      // A tempting low side route that steals the water away from the castle.
      trough(-3.0, 0.2, 0.2, 2.6, 0.66, 0.115)
      bump(1.4, 0.1, 1.3, 0.08)
      bump(-1.6, -2.0, 1.7, 0.06)
    } else if (p === 'ridge') {
      // A sand ridge across the middle: dig through it, or go around.
      for (let j = 0; j < WZ; j++) {
        const z = this.wz(j)
        for (let i = 0; i < WX; i++) {
          const x = this.wx(i)
          const k = j * WX + i
          if (this.castleMask[k] || this.moatMask[k]) continue
          const band = Math.exp(-((x - 0.2) * (x - 0.2)) / 0.55)
          const wobble = Math.sin(z * 0.9) * 0.16
          h[k] += band * (0.15 + wobble * 0.2)
        }
      }
      trough(-4.0, -0.4, -1.6, -0.2, 0.55, 0.05)
    } else {
      // Free sandbox: quiet, almost flat, nothing in the way.
      for (let j = 0; j < WZ; j++) {
        for (let i = 0; i < WX; i++) {
          const k = j * WX + i
          if (this.castleMask[k] || this.moatMask[k]) continue
          h[k] += (noise.fbm(this.wx(i) * 0.7, this.wz(j) * 0.7) - 0.5) * 0.03
        }
      }
    }
  }

  // ---------------------------------------------------------------- brushes

  /**
   * Dig along a segment. Sand taken out of the groove piles up on the banks,
   * which is what makes a hand-dug channel actually hold water.
   */
  dig(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    radius: number,
    strength: number,
  ): StrokeFeedback {
    const h = this.height
    const r = radius
    const outer = r * 1.85
    let moved = 0

    const i0 = clamp(Math.floor(this.gi(Math.min(x0, x1) - outer)), 1, WX - 2)
    const i1 = clamp(Math.ceil(this.gi(Math.max(x0, x1) + outer)), 1, WX - 2)
    const j0 = clamp(Math.floor(this.gj(Math.min(z0, z1) - outer)), 1, WZ - 2)
    const j1 = clamp(Math.ceil(this.gj(Math.max(z0, z1) + outer)), 1, WZ - 2)

    for (let j = j0; j <= j1; j++) {
      const z = this.wz(j)
      for (let i = i0; i <= i1; i++) {
        const k = j * WX + i
        if (this.castleMask[k]) continue
        const x = this.wx(i)
        const d = distToSegment(x, z, x0, z0, x1, z1)
        if (d > outer) continue

        if (d < r) {
          const fall = smoothstep(r, r * 0.15, d)
          const take = strength * fall * (1 - this.compaction[k] * 0.28)
          const target = Math.max(BEDROCK, h[k] - take)
          moved += h[k] - target
          h[k] = target
          this.compaction[k] = Math.min(1, this.compaction[k] + 0.1)
        } else {
          // Spoil heap either side of the groove.
          const t = smoothstep(outer, r, d) * smoothstep(r * 0.98, r * 1.15, d)
          h[k] += strength * t * 0.42
        }
        growRect(this.dirty, i, j)
      }
    }

    // Smooth the groove so a wobbly child finger still yields a clean channel.
    this.smoothRegion(i0, j0, i1, j1, 0.45, x0, z0, x1, z1, outer)
    return { moved, x: x1, z: z1, height: this.heightAt(x1, z1) }
  }

  /** Drop a soft mound of sand — the dam-building tool. */
  mound(x: number, z: number, radius: number, amount: number): StrokeFeedback {
    const h = this.height
    const i0 = clamp(Math.floor(this.gi(x - radius)), 1, WX - 2)
    const i1 = clamp(Math.ceil(this.gi(x + radius)), 1, WX - 2)
    const j0 = clamp(Math.floor(this.gj(z - radius)), 1, WZ - 2)
    const j1 = clamp(Math.ceil(this.gj(z + radius)), 1, WZ - 2)
    let moved = 0
    for (let j = j0; j <= j1; j++) {
      const wz = this.wz(j)
      for (let i = i0; i <= i1; i++) {
        const k = j * WX + i
        if (this.castleMask[k]) continue
        const d = Math.hypot(this.wx(i) - x, wz - z)
        if (d > radius) continue
        const add = amount * smoothstep(radius, 0, d)
        h[k] += add
        moved += add
        this.compaction[k] = Math.max(0.15, this.compaction[k] - 0.15)
        growRect(this.dirty, i, j)
      }
    }
    this.relaxRegion(i0, j0, i1, j1, 2)
    return { moved, x, z, height: this.heightAt(x, z) }
  }

  /**
   * Blur a rectangle, weighted toward the stroke centreline so the groove
   * becomes smooth without smearing the whole neighbourhood flat.
   */
  private smoothRegion(
    i0: number,
    j0: number,
    i1: number,
    j1: number,
    amount: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    reach: number,
  ): void {
    const h = this.height
    const tmp: number[] = []
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * WX + i
        const avg =
          (h[k - 1] + h[k + 1] + h[k - WX] + h[k + WX]) * 0.175 +
          (h[k - WX - 1] + h[k - WX + 1] + h[k + WX - 1] + h[k + WX + 1]) * 0.075
        const d = distToSegment(this.wx(i), this.wz(j), x0, z0, x1, z1)
        const w = amount * smoothstep(reach, 0, d)
        tmp.push(h[k] * (1 - w) + avg * w)
      }
    }
    let p = 0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * WX + i
        if (!this.castleMask[k]) h[k] = tmp[p]
        p++
      }
    }
  }

  /** Slump anything steeper than the angle of repose. Dry sand cannot stand up. */
  relaxRegion(i0: number, j0: number, i1: number, j1: number, iterations: number): void {
    const h = this.height
    const maxSlope = CELL * 1.15
    const ia = Math.max(1, i0)
    const ib = Math.min(WX - 2, i1)
    const ja = Math.max(1, j0)
    const jb = Math.min(WZ - 2, j1)
    for (let it = 0; it < iterations; it++) {
      for (let j = ja; j <= jb; j++) {
        for (let i = ia; i <= ib; i++) {
          const k = j * WX + i
          if (this.castleMask[k]) continue
          for (let d = 0; d < 4; d++) {
            const nk = d === 0 ? k - 1 : d === 1 ? k + 1 : d === 2 ? k - WX : k + WX
            const diff = h[k] - h[nk]
            if (diff > maxSlope) {
              const move = (diff - maxSlope) * 0.32
              h[k] -= move
              h[nk] += move
            }
          }
        }
      }
    }
  }

  private relaxSlopes(iterations: number, strength: number): void {
    const h = this.height
    for (let it = 0; it < iterations; it++) {
      for (let j = 1; j < WZ - 1; j++) {
        for (let i = 1; i < WX - 1; i++) {
          const k = j * WX + i
          if (this.castleMask[k]) continue
          const avg = (h[k - 1] + h[k + 1] + h[k - WX] + h[k + WX]) * 0.25
          h[k] += (avg - h[k]) * strength * 0.25
        }
      }
    }
  }

  /** Sand dries out slowly when the water has moved on. */
  dryOut(dt: number, rect: Rect): void {
    const wetn = this.wetness
    if (!rectValid(rect)) return
    const rate = 0.028 * dt
    for (let j = rect.j0; j <= rect.j1; j++) {
      for (let i = rect.i0; i <= rect.i1; i++) {
        const k = j * WX + i
        if (wetn[k] > 0) wetn[k] = Math.max(0, wetn[k] - rate)
      }
    }
  }
}

export function distToSegment(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0
  const dz = z1 - z0
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-9) return Math.hypot(px - x0, pz - z0)
  let t = ((px - x0) * dx + (pz - z0) * dz) / len2
  t = clamp(t, 0, 1)
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t))
}
