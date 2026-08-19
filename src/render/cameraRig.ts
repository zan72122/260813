import { PerspectiveCamera, Vector3 } from 'three'
import { CASTLE_X, CASTLE_Z, SAND_X, SAND_Z, SOURCE_X, SOURCE_Z } from '../core/config'
import { clamp, damp } from '../core/util'

export type Orientation = 'portrait' | 'landscape'

/** Fractions of the viewport that must stay clear of the sandbox. */
export type Reserve = { top: number; right: number; bottom: number; left: number }

/**
 * A shot-composer, not a free camera. The child never rotates anything; the
 * rig only ever eases between framings so cause and effect stay in one shot.
 *
 * Framing is solved against the real projection: the sandbox corners are
 * projected and the distance is iterated until they fill the area not
 * reserved for the tool tray and the settings buttons.
 */
function clampOffset(want: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2
  return want < lo ? lo : want > hi ? hi : want
}

export class CameraRig {
  readonly camera: PerspectiveCamera
  orientation: Orientation = 'landscape'

  private targetX = 0
  private targetZ = 0
  private wantX = 0
  private wantZ = 0
  private zoom = 1
  private wantZoom = 1
  private azimuth = 0
  private wantAzimuth = 0
  private elevation = 0.72
  private baseDistance = 20
  private ndcOffX = 0
  private ndcOffY = 0
  private shake = 0
  private reserve: Reserve = { top: 0, right: 0, bottom: 0, left: 0 }
  private readonly probe = new PerspectiveCamera(42, 1, 0.6, 90)
  private readonly scratch = new Vector3()

  constructor() {
    this.camera = new PerspectiveCamera(42, 1, 0.6, 90)
    this.camera.position.set(0, 12, 14)
  }

  setOrientation(o: Orientation, immediate = false): void {
    this.orientation = o
    // Landscape looks down -Z: the river runs left → right.
    // Portrait looks along +X: the river runs bottom → top.
    this.wantAzimuth = o === 'landscape' ? 0 : -Math.PI / 2
    if (immediate) this.azimuth = this.wantAzimuth
  }


  resize(w: number, h: number, reserve: Reserve): void {
    this.reserve = reserve
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.probe.aspect = w / h
    this.probe.fov = this.camera.fov
    this.solveFraming()
  }

  /** The rectangle that must be centred and filled: the sand surface. */
  private sandPoints(): Vector3[] {
    const hx = SAND_X / 2 + 0.08
    const hz = SAND_Z / 2 + 0.08
    const pts: Vector3[] = []
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) pts.push(new Vector3(sx * hx, 0.7, sz * hz))
    }
    return pts
  }

  /** Everything that must stay on screen, including the castle's spire. */
  private allPoints(): Vector3[] {
    const pts = this.sandPoints()
    pts.push(new Vector3(CASTLE_X, 3.05, CASTLE_Z))
    pts.push(new Vector3(SOURCE_X, 1.25, SOURCE_Z))
    return pts
  }

  private projectBox(pts: Vector3[]): { x0: number; x1: number; y0: number; y1: number } {
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    for (const p of pts) {
      this.scratch.copy(p).project(this.probe)
      box.x0 = Math.min(box.x0, this.scratch.x)
      box.x1 = Math.max(box.x1, this.scratch.x)
      box.y0 = Math.min(box.y0, this.scratch.y)
      box.y1 = Math.max(box.y1, this.scratch.y)
    }
    return box
  }

  private placeProbe(dist: number): void {
    const cosEl = Math.cos(this.elevation)
    const sinEl = Math.sin(this.elevation)
    this.probe.position.set(
      dist * Math.sin(this.wantAzimuth) * cosEl,
      0.55 + dist * sinEl,
      dist * Math.cos(this.wantAzimuth) * cosEl,
    )
    this.probe.lookAt(0, 0.55, 0)
    this.probe.updateMatrixWorld()
    this.probe.updateProjectionMatrix()
  }

  /**
   * Solve tilt *and* distance numerically against the real projection:
   * pick the tilt whose projected sandbox matches the shape of the free
   * screen area, then the distance that fills it, then shear the projection
   * so the sandbox sits centred in that area.
   */
  private solveFraming(): void {
    const r = this.reserve
    const xLo = -1 + 2 * r.left
    const xHi = 1 - 2 * r.right
    const yLo = -1 + 2 * r.bottom
    const yHi = 1 - 2 * r.top
    const halfW = Math.max(0.15, (xHi - xLo) / 2) * 0.99
    const halfH = Math.max(0.15, (yHi - yLo) / 2) * 0.99
    const targetAspect = halfW / halfH

    const sandPts = this.sandPoints()
    const allPts = this.allPoints()
    let dist = this.baseDistance
    let sinEl = Math.sin(this.elevation)
    let boxAll = { x0: -1, x1: 1, y0: -1, y1: 1 }
    let boxSand = boxAll

    for (let outer = 0; outer < 7; outer++) {
      this.elevation = Math.asin(clamp(sinEl, 0.5, 0.86))
      for (let inner = 0; inner < 8; inner++) {
        this.placeProbe(dist)
        boxAll = this.projectBox(allPts)
        const ratio = Math.max(
          (boxAll.x1 - boxAll.x0) / (2 * halfW),
          (boxAll.y1 - boxAll.y0) / (2 * halfH),
        )
        dist = clamp(dist * ratio, 5, 90)
        if (Math.abs(ratio - 1) < 0.003) break
      }
      this.placeProbe(dist)
      boxAll = this.projectBox(allPts)
      boxSand = this.projectBox(sandPts)
      const aspect = (boxSand.x1 - boxSand.x0) / Math.max(1e-4, boxSand.y1 - boxSand.y0)
      const err = aspect / targetAspect
      if (Math.abs(err - 1) < 0.015) break
      const next = clamp(sinEl * err, 0.5, 0.86)
      if (Math.abs(next - sinEl) < 1e-4) break
      sinEl = next
    }

    this.baseDistance = dist

    // Centre the sand surface in the free area, then pull the offset back
    // just enough that the castle's spire also stays inside it.
    let offX = (xLo + xHi) / 2 - (boxSand.x0 + boxSand.x1) / 2
    let offY = (yLo + yHi) / 2 - (boxSand.y0 + boxSand.y1) / 2
    offX = clampOffset(offX, xLo - boxAll.x0, xHi - boxAll.x1)
    offY = clampOffset(offY, yLo - boxAll.y0, yHi - boxAll.y1)
    this.ndcOffX = offX
    this.ndcOffY = offY
  }

  /**
   * While a finger is down the rig stops re-targeting. Moving the camera
   * under a held finger would change which patch of sand the finger is over,
   * which turns "follow the tool" into a runaway feedback loop.
   */
  hold = false

  focus(x: number, z: number, zoom: number): void {
    if (this.hold) return
    const z0 = clamp(zoom, 0.4, 1.4)
    // Never let a push-in drag the composition off the sandbox.
    const slack = 1 - z0
    const maxX = (SAND_X / 2) * slack * 0.95
    const maxZ = (SAND_Z / 2) * slack * 0.95
    this.wantX = clamp(x, -maxX, maxX)
    this.wantZ = clamp(z, -maxZ, maxZ)
    this.wantZoom = z0
  }

  pulse(strength: number): void {
    this.shake = Math.min(1, this.shake + strength)
  }

  snap(): void {
    this.targetX = this.wantX
    this.targetZ = this.wantZ
    this.zoom = this.wantZoom
    this.azimuth = this.wantAzimuth
    this.apply(0)
  }

  update(dt: number, calmMotion: boolean): void {
    const rate = calmMotion ? 1.6 : 2.4
    this.targetX = damp(this.targetX, this.wantX, rate, dt)
    this.targetZ = damp(this.targetZ, this.wantZ, rate, dt)
    this.zoom = damp(this.zoom, this.wantZoom, rate * 0.85, dt)
    const azWas = this.azimuth
    this.azimuth = damp(this.azimuth, this.wantAzimuth, 3.2, dt)
    if (Math.abs(azWas - this.azimuth) > 1e-5) this.solveFramingLazy()
    this.shake = damp(this.shake, 0, 4, dt)
    this.apply(calmMotion ? 0 : this.shake)
  }

  private lazyTimer = 0
  private solveFramingLazy(): void {
    // Re-solving every frame while the device rotates is wasteful; the
    // framing only needs to be right by the time the swing settles.
    this.lazyTimer++
    if (this.lazyTimer % 6 === 0) this.solveFraming()
  }

  private apply(shake: number): void {
    const dist = this.baseDistance * clamp(this.zoom, 0.4, 1.5)
    const cosEl = Math.cos(this.elevation)
    const sinEl = Math.sin(this.elevation)
    const tx = this.targetX
    const tz = this.targetZ
    const ty = 0.55

    let px = tx + dist * Math.sin(this.azimuth) * cosEl
    let py = ty + dist * sinEl
    let pz = tz + dist * Math.cos(this.azimuth) * cosEl

    if (shake > 0.001) {
      const s = shake * 0.05
      px += Math.sin(performance.now() * 0.021) * s
      py += Math.sin(performance.now() * 0.017) * s
    }

    this.camera.position.set(px, py, pz)
    this.camera.lookAt(tx, ty, tz)
    this.camera.updateMatrixWorld()

    // Shear the projection so the composition sits in the free area.
    this.camera.updateProjectionMatrix()
    // The (1,2) / (0,2) terms of a perspective matrix subtract from NDC, so
    // a positive "move the picture up" offset is applied negatively here.
    const e = this.camera.projectionMatrix.elements
    e[8] -= this.ndcOffX
    e[9] -= this.ndcOffY
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
  }


}
