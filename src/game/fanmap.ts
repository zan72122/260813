import { Game } from './game'
import { BINS } from './uchiwa'
import { lerp } from '../core/math'

export type FanCell = { x: number; y: number; f: number; u: number }

const U_STEPS = 9

/**
 * Per-frame screen-space lookup grid over the fan surface. Lets any stage ask
 * "which rib / how far out is the finger?" cheaply, with very forgiving
 * snapping — a four-year-old never has to be accurate.
 */
export class FanMap {
  grid: FanCell[] = []
  private frame = -1

  build(g: Game, frameId: number, uMin = 0.16, uMax = 0.98) {
    if (this.frame === frameId) return
    this.frame = frameId
    this.grid.length = 0
    const u = g.u
    const half = u.halfSpread
    const cam = g.cam
    for (let b = 0; b < BINS; b++) {
      const f = b / (BINS - 1)
      const ang = lerp(-half, half, f) * 1.05
      for (let k = 0; k < U_STEPS; k++) {
        const uu = lerp(uMin, uMax, k / (U_STEPS - 1))
        const z = u.dome * Math.sin(uu * Math.PI * 0.86) * Math.cos(ang * 1.05) + 0.05
        const p = cam.project(u.toWorld({
          x: Math.sin(ang) * uu * u.L,
          y: Math.cos(ang) * uu * u.L,
          z
        }))
        if (p.ok) this.grid.push({ x: p.x, y: p.y, f, u: uu })
      }
    }
  }

  /** nearest point on the fan to a screen position */
  nearest(x: number, y: number): { cell: FanCell; d: number } | null {
    let best: FanCell | null = null
    let bd = Infinity
    for (const c of this.grid) {
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y)
      if (d < bd) { bd = d; best = c }
    }
    return best ? { cell: best, d: Math.sqrt(bd) } : null
  }

  /** every bin whose surface point is within `r` px of the position */
  within(x: number, y: number, r: number, cb: (c: FanCell, d: number) => void) {
    const r2 = r * r
    for (const c of this.grid) {
      const d2 = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y)
      if (d2 <= r2) cb(c, Math.sqrt(d2))
    }
  }
}

export function binIndex(f: number) {
  return Math.max(0, Math.min(BINS - 1, Math.round(f * (BINS - 1))))
}

/** screen position of a point on the fan surface */
export function fanScreen(g: Game, f: number, uu: number) {
  const u = g.u
  const ang = lerp(-u.halfSpread, u.halfSpread, f) * 1.05
  const z = u.dome * Math.sin(uu * Math.PI * 0.86) * Math.cos(ang * 1.05) + 0.05
  return g.cam.project(u.toWorld({
    x: Math.sin(ang) * uu * u.L,
    y: Math.cos(ang) * uu * u.L,
    z
  }))
}

/** nearest rib index to a screen position (very forgiving) */
export function ribAtScreen(g: Game, x: number, y: number) {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < g.u.N; i++) {
    for (const uu of [0.45, 0.62, 0.8]) {
      const p = g.cam.project(g.u.ribPoint(i, uu))
      if (!p.ok) continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bd) { bd = d; best = i }
    }
  }
  return { i: best, d: bd }
}
