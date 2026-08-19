import { Vec3, clamp, clamp01, lerp, smooth, TAU, Rng } from '../core/math'

export const RIB_COUNT = 20

/** angular bins used by every "painted" surface state (glue / wrinkle / roller) */
export const BINS = 28

export type RibState = {
  t: number          // 0 = still inside the pole, 1 = fully fanned out
  rank: number       // opening order (0 opens first)
  popped: boolean    // has the "para" sound fired
  sway: number       // live springy offset driven by the finger
  swayV: number
  jitter: number     // per-rib grain irregularity
}

export type Xf = { x: number; y: number; z: number; rotZ: number; rotY: number; rotX: number }

export class Uchiwa {
  readonly N = RIB_COUNT
  /** world-space pivot: where all ribs meet, i.e. top of the handle */
  pivot: Vec3 = { x: 0, y: -0.35, z: 0 }
  L = 1.72          // rib length
  R = 0.088         // radius of the un-split pole
  handleLen = 1.28
  spread = 2.50     // total fan angle (rad) when fully opened & symmetrised
  bloom = 0         // extra spread from the final "fasa" burst
  bloomV = 0
  dome = 0.15       // forward curvature of the fan

  ribs: RibState[] = []
  notch = 0
  progress = 0
  twist = 0
  bow = 0
  thread = 0
  threadHit: boolean[] = []
  threadColor = 0
  sym = 0
  glue: number[] = []
  paperOn = 0
  paperPattern = 0
  wrinkle: number[] = []
  trim = 0
  edge = 0
  roller = 0
  xf: Xf = { x: 0, y: 0, z: 0, rotZ: 0, rotY: 0, rotX: 0 }

  rng: Rng
  bambooHue = 0

  constructor(seed = 1234) {
    this.rng = new Rng(seed)
    this.reset(seed)
  }

  reset(seed = 1234) {
    this.rng = new Rng(seed >>> 0 || 1)
    const r = this.rng
    this.ribs = []
    // opening order: from the middle outwards, alternating sides — the fan
    // blossoms symmetrically instead of sweeping from one end.
    const mid = (this.N - 1) / 2
    const seq: number[] = []
    for (let k = 0; k <= this.N * 2; k++) {
      const a = Math.round(mid - k / 2)
      const b = Math.round(mid + (k + 1) / 2)
      const cand = k % 2 === 0 ? a : b
      if (cand >= 0 && cand < this.N && !seq.includes(cand)) seq.push(cand)
    }
    for (let i = 0; i < this.N; i++) if (!seq.includes(i)) seq.push(i)
    for (let i = 0; i < this.N; i++) {
      this.ribs.push({
        t: 0,
        rank: seq.indexOf(i),
        popped: false,
        sway: 0, swayV: 0,
        jitter: r.range(-1, 1)
      })
    }
    this.notch = 0
    this.progress = 0
    this.twist = 0
    this.bloom = 0
    this.bloomV = 0
    this.bow = 0
    this.thread = 0
    this.threadHit = new Array(this.N).fill(false)
    this.sym = 0
    this.glue = new Array(BINS).fill(0)
    this.wrinkle = new Array(BINS).fill(0)
    this.paperOn = 0
    this.trim = 0
    this.edge = 0
    this.roller = 0
    this.xf = { x: 0, y: 0, z: 0, rotZ: 0, rotY: 0, rotX: 0 }
    this.spread = 2.50
    this.bambooHue = 0
  }

  get halfSpread() {
    return (this.spread * (1 + this.bloom * 0.11)) * 0.5
  }

  ribAngle(i: number) {
    const mid = (this.N - 1) / 2
    const step = (this.halfSpread * 2) / (this.N - 1)
    const ideal = (i - mid) * step
    const wob = this.ribs[i].jitter * 0.085 * (1 - this.sym)
    return ideal + wob
  }

  ribOpen(i: number) { return this.ribs[i].t }

  ribFrac(i: number) { return this.N > 1 ? i / (this.N - 1) : 0.5 }

  binOf(i: number) { return clamp(Math.round(this.ribFrac(i) * (BINS - 1)), 0, BINS - 1) }

  /** local-space position of a point on rib i at length param u (0 base .. 1 tip) */
  ribPointLocal(i: number, u: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const rib = this.ribs[i]
    const t = rib.t
    const front = 1 - t
    const b = smooth((u - front) / 0.34)
    const phi = ((i + 0.5) / this.N) * TAU
    const cx = Math.cos(phi) * this.R
    const cz = Math.sin(phi) * this.R
    const ang = this.ribAngle(i) + rib.sway
    const L = this.L
    const ox = Math.sin(ang) * u * L
    const oy = Math.cos(ang) * u * L
    const oz = this.dome * Math.sin(u * Math.PI * 0.86) * Math.cos(ang * 1.05)
    const tear = (1 - b) * b * 4 * (1 - t) * 0.11 * rib.jitter
    out.x = lerp(cx, ox, b) + tear
    out.y = lerp(u * L, oy, b)
    out.z = lerp(cz, oz, b)
    return out
  }

  ribHalfWidth(i: number, u: number) {
    const t = this.ribs[i].t
    const front = 1 - t
    const b = smooth((u - front) / 0.34)
    const closed = (Math.PI * this.R) / this.N
    const open = lerp(0.017, 0.049, Math.pow(u, 0.72)) * (1 - 0.28 * Math.pow(u, 6))
    return lerp(closed, open, b)
  }

  toWorld(p: Vec3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const { rotZ, rotY, rotX } = this.xf
    let x = p.x, y = p.y, z = p.z
    if (rotZ) {
      const c = Math.cos(rotZ), s = Math.sin(rotZ)
      const nx = x * c - y * s, ny = x * s + y * c
      x = nx; y = ny
    }
    if (rotX) {
      const c = Math.cos(rotX), s = Math.sin(rotX)
      const ny = y * c - z * s, nz = y * s + z * c
      y = ny; z = nz
    }
    if (rotY) {
      const c = Math.cos(rotY), s = Math.sin(rotY)
      const nx = x * c + z * s, nz = -x * s + z * c
      x = nx; z = nz
    }
    out.x = x + this.pivot.x + this.xf.x
    out.y = y + this.pivot.y + this.xf.y
    out.z = z + this.pivot.z + this.xf.z
    return out
  }

  ribPoint(i: number, u: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
    const l = this.ribPointLocal(i, u, out)
    return this.toWorld(l, out)
  }

  /** outer contour of the paper: radius (in u) at a given fan fraction */
  paperRadius(f: number) {
    const ang = lerp(-this.halfSpread, this.halfSpread, f) * 1.05
    const sa = Math.sin(ang), ca = Math.cos(ang)
    const ell = (rx: number, ry: number) => 1 / Math.hypot(sa / rx, ca / ry)
    // the oversized blank, then the trimmed uchiwa head: the side ribs really
    // do get shorter when the shape is hammered out
    const raw = ell(1.02, 1.16) * (1 + 0.05 * Math.pow(Math.abs(sa), 4))
    const trimmed = ell(0.76, 1.02)
    return lerp(raw, trimmed, smooth(this.trim))
  }

  /** widest half-extent of the current paper, in world units */
  paperHalfWidth() {
    if (this.paperOn <= 0.01) return 0
    let m = 0
    for (let k = 0; k <= 10; k++) {
      const f = k / 10
      const ang = lerp(-this.halfSpread, this.halfSpread, f) * 1.05
      m = Math.max(m, Math.abs(Math.sin(ang)) * this.paperRadius(f))
    }
    return m * this.L
  }

  step(dt: number, onPop?: (i: number) => void) {
    for (let i = 0; i < this.N; i++) {
      const rib = this.ribs[i]
      const target = clamp01(this.progress - rib.rank)
      const k = 1 - Math.exp(-11 * dt)
      rib.t += (target - rib.t) * k
      if (!rib.popped && rib.t > 0.055) {
        rib.popped = true
        onPop?.(i)
      }
      if (rib.popped && rib.t < 0.02) rib.popped = false
      const edgeBias = 0.4 + 0.6 * Math.abs(this.ribFrac(i) - 0.5) * 2
      const drive = this.twist * 0.16 * (0.25 + rib.t) * edgeBias
      rib.swayV += (drive - rib.sway) * 42 * dt - rib.swayV * 8.5 * dt
      rib.sway += rib.swayV * dt
      rib.sway = clamp(rib.sway, -0.42, 0.42)
    }
    // the fan overshoots and rocks back — that little wobble is most of the
    // "fasa" feeling
    this.bloomV += (-this.bloom * 26 - this.bloomV * 5.2) * dt
    this.bloom += this.bloomV * dt
  }

  allOpen() { return this.progress >= this.N }
  openCount() { return this.ribs.reduce((a, r) => a + (r.t > 0.5 ? 1 : 0), 0) }
}
