import * as THREE from 'three'
import { SAND, SAND_COLORS, WORLD, type SandColor } from '../core/config'
import { rng } from '../core/rng'
import { SandSystem } from './sandSystem'

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _blob = { x: 0, y: 0, z: 0, r: 0 }
const _col = new THREE.Color()

export interface PlaceEvent {
  x: number
  y: number
  z: number
  r: number
  /** true when the blob dropped onto a support instead of staying at the finger */
  landed: boolean
  first: boolean
}

/**
 * Turns a held-and-dragged pointer into a continuous rope of sand blobs.
 * The rules that make it feel right:
 *  - a blob appears on the very first frame of the press
 *  - blobs are laid at a fixed spacing along the path, so a fast drag
 *    still makes an unbroken rope
 *  - a blob with no neighbour settles onto whatever is underneath it
 *  - a blob close to an existing one is nudged into contact (visual weld)
 */
export class Emitter {
  /** softly pulls a point toward the current guide; may modify in place */
  snap: ((p: THREE.Vector3, speed: number) => void) | null = null
  zSpread = 0.22
  emitting = false
  strokeId = 0
  onPlace: ((e: PlaceEvent) => void) | null = null
  /** fired when a new blob fuses two separate runs of sand together */
  onConnect: ((x: number, y: number, z: number) => void) | null = null
  /** blocked when the segment budget is exhausted */
  budgetBlocked = false
  /** makes the next press the slow, extra-chunky "first squeeze" */
  heroNext = false

  private sand: SandSystem
  private last = new THREE.Vector3()
  private target = new THREE.Vector3()
  private hasLast = false
  private idleTime = 0
  private sideFlip = 1
  private speed = 0
  private placedThisStroke = 0
  private firstOfStroke = false
  private colorIndex = 0

  constructor(sand: SandSystem) {
    this.sand = sand
  }

  get color(): SandColor {
    return SAND_COLORS[this.colorIndex]
  }
  get colorIdx(): number {
    return this.colorIndex
  }
  setColor(i: number) {
    this.colorIndex = Math.max(0, Math.min(SAND_COLORS.length - 1, i))
  }

  get strokeBlobs(): number {
    return this.placedThisStroke
  }
  get dragSpeed(): number {
    return this.speed
  }

  begin(p: THREE.Vector3, now: number) {
    this.emitting = true
    this.strokeId++
    this.placedThisStroke = 0
    this.firstOfStroke = true
    this.idleTime = 0
    this.speed = 0
    this.target.copy(p)
    this.last.copy(p)
    this.hasLast = false
    this.place(p, now, this.heroNext ? 1.5 : 1.16, false, this.heroNext ? 0.62 : 0.34)
    this.heroNext = false
    this.hasLast = true
    this.last.copy(p)
  }

  moveTo(p: THREE.Vector3, dt: number) {
    const d = this.target.distanceTo(p)
    this.speed = dt > 0 ? THREE.MathUtils.lerp(this.speed, d / dt, 0.35) : this.speed
    this.target.copy(p)
  }

  end() {
    this.emitting = false
    this.hasLast = false
  }

  update(dt: number, now: number) {
    if (!this.emitting) return
    // coarser rope as the segment budget runs low
    const p = this.sand.pressure
    const step = SAND.radius * SAND.spacing * (p > 0.85 ? 1.7 : p > 0.7 ? 1.25 : 1)
    if (!this.hasLast) {
      this.last.copy(this.target)
      this.hasLast = true
    }
    let guard = 0
    while (this.last.distanceTo(this.target) >= step && guard++ < 40) {
      _v.copy(this.target).sub(this.last)
      const len = _v.length()
      _v.multiplyScalar(step / len)
      this.last.add(_v)
      this.place(this.last, now, 1)
      this.idleTime = 0
    }
    // held still: keep piling up so a long press builds a mound
    if (this.last.distanceTo(this.target) < step) {
      this.idleTime += dt
      const period = 0.13
      while (this.idleTime >= period && guard++ < 40) {
        this.idleTime -= period
        _v.copy(this.target)
        _v.x += rng.range(-0.045, 0.045)
        _v.z += rng.range(-0.045, 0.045)
        this.place(_v, now, 1, true)
      }
    }
  }

  /** Places one cluster of blobs at `p` (which is NOT modified). */
  private place(p: THREE.Vector3, now: number, sizeMul: number, piling = false, grow = 0.3) {
    if (this.sand.isFull) {
      this.budgetBlocked = true
      return
    }
    this.budgetBlocked = false
    _v.copy(p)
    if (this.snap) this.snap(_v, this.speed)

    // pressure-driven quality: thinner rope near the budget ceiling
    const pressure = this.sand.pressure
    const speedThin = THREE.MathUtils.clamp(1.14 - this.speed * 0.06, 0.78, 1.14)
    const r = SAND.radius * sizeMul * speedThin * rng.range(0.9, 1.1) * (pressure > 0.8 ? 1.12 : 1)

    // depth assist — the finger only gives us x/y
    _v.z += rng.range(-this.zSpread, this.zSpread) * 0.55

    // settle onto whatever is below when nothing is holding it up
    const floor = WORLD.seabedY + r * 0.72
    let landed = false
    const nearRadius = r * 2.1
    const hasNear = this.sand.hasNeighbor(_v.x, _v.y, _v.z, nearRadius)
    if (!hasNear) {
      const sy = this.sand.supportY(_v.x, _v.z, r, WORLD.seabedY)
      const rest = Math.max(sy + r * 0.74, floor)
      if (_v.y > rest + r * 0.6) {
        _v.y = rest
        landed = true
      }
    }
    if (_v.y < floor) _v.y = floor
    if (piling) {
      // pile upward instead of drilling into the existing mound
      const sy = this.sand.supportY(_v.x, _v.z, r, WORLD.seabedY)
      if (sy > _v.y) _v.y = Math.min(sy + r * 0.5, _v.y + r * 0.85)
    }

    // visual weld: close the last sliver of gap to the nearest blob
    let bridge = -1
    const ni = this.sand.nearest(_v.x, _v.y, _v.z, r * 3.2)
    if (ni >= 0) {
      this.sand.info(ni, _blob)
      _n.set(_blob.x - _v.x, _blob.y - _v.y, _blob.z - _v.z)
      const d = _n.length()
      const want = (_blob.r + r) * 0.68
      if (d > want && d > 1e-4) {
        _n.multiplyScalar(((d - want) * SAND.snapPull) / d)
        _v.add(_n)
      }
      // a gap left over between two SEPARATE runs gets a bead so the two
      // pieces read as one solid thing — this is the "they joined!" moment
      const gap = Math.hypot(_blob.x - _v.x, _blob.y - _v.y, _blob.z - _v.z)
      if (
        this.sand.strokeOf(ni) !== this.strokeId &&
        gap > want * 1.02 &&
        gap < (_blob.r + r) * 1.8
      ) {
        bridge = ni
      }
    }

    _v.x = THREE.MathUtils.clamp(_v.x, -WORLD.halfWidth, WORLD.halfWidth)
    _v.z = THREE.MathUtils.clamp(_v.z, -1.9, 1.9)

    const c = this.pickColor(_v.x, _v.y)
    const spark = this.color.sparkle
    this.sand.add(_v.x, _v.y, _v.z, r, c, spark, this.strokeId, now, grow)

    // thickness in Z, so a 2D drag reads as a solid 3D wall
    if (pressure < 0.72) {
      const dz = r * 0.66 * this.sideFlip
      const sr = r * rng.range(0.68, 0.84)
      this.sand.add(
        _v.x + rng.range(-0.03, 0.03),
        _v.y + rng.range(-0.02, 0.03),
        THREE.MathUtils.clamp(_v.z + dz, -1.9, 1.9),
        sr,
        this.pickColor(_v.x, _v.y),
        spark,
        this.strokeId,
        now,
        grow * 1.15
      )
      this.sideFlip *= -1
    }

    if (bridge >= 0) {
      this.sand.info(bridge, _blob)
      const bx = (_blob.x + _v.x) * 0.5
      const by = (_blob.y + _v.y) * 0.5
      const bz = (_blob.z + _v.z) * 0.5
      this.sand.add(bx, by, bz, r * 0.86, this.pickColor(bx, by), spark, this.strokeId, now, grow)
      if (this.onConnect) this.onConnect(bx, by, bz)
    }

    this.placedThisStroke++
    if (this.onPlace) {
      this.onPlace({ x: _v.x, y: _v.y, z: _v.z, r, landed, first: this.firstOfStroke })
    }
    this.firstOfStroke = false
  }

  private pickColor(x: number, y: number): THREE.Color {
    const c = this.color
    if (c.rainbow >= 1) return SandSystem.rainbowAt(x, y)
    _col.set(c.hex)
    if (c.rainbow > 0) {
      _col.offsetHSL(Math.sin(x * 1.7 + y * 1.1) * 0.05 * c.rainbow, 0, 0)
    }
    // tiny per-blob variation keeps a wall from looking like flat plastic
    _col.offsetHSL(0, rng.range(-0.03, 0.03), rng.range(-0.045, 0.045))
    return _col.clone()
  }
}
