import { PerspectiveCamera, Vector3 } from 'three'
import { SAND_SIZE } from '../core/config'
import { clamp, damp, lerp } from '../core/util'

export type Orientation = 'portrait' | 'landscape'

/**
 * A shot-composer, not a free camera. The child never rotates anything; the
 * rig only ever eases between framings so cause and effect stay in one shot.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera
  orientation: Orientation = 'landscape'

  /** Where the shot is centred, in world XZ. */
  private targetX = 0
  private targetZ = 0
  private wantX = 0
  private wantZ = 0
  /** 1 = whole sandbox; <1 pushes in. */
  private zoom = 1
  private wantZoom = 1
  private azimuth = 0
  private wantAzimuth = 0
  private elevation = 0.72
  private baseDistance = 20
  private aspect = 1
  private offY = 0
  private wantOffY = 0
  private shake = 0

  constructor() {
    this.camera = new PerspectiveCamera(42, 1, 0.6, 90)
    this.camera.position.set(0, 12, 14)
  }

  setOrientation(o: Orientation, immediate = false): void {
    this.orientation = o
    // Landscape looks down -Z (water runs left → right).
    // Portrait looks along +X (water runs bottom → top).
    this.wantAzimuth = o === 'landscape' ? 0 : -Math.PI / 2
    this.elevation = o === 'landscape' ? 0.7 : 0.76
    this.wantOffY = o === 'landscape' ? -0.055 : -0.085
    if (immediate) {
      this.azimuth = this.wantAzimuth
      this.offY = this.wantOffY
    }
  }

  resize(w: number, h: number): void {
    this.aspect = w / h
    this.camera.aspect = this.aspect
    const fovY = (this.camera.fov * Math.PI) / 180
    const tan = Math.tan(fovY / 2)

    // Half-extents of what must stay on screen, in "screen right" and
    // "screen away" ground directions.
    const half = SAND_SIZE / 2 + 0.8
    const across = half
    const along = half

    const needV = (along * Math.sin(this.elevation) + 1.5) / tan
    const needH = across / (tan * this.aspect)
    this.baseDistance = Math.max(needV, needH) * 1.22
    this.camera.updateProjectionMatrix()
  }

  /** Compose a shot on a point. zoom 1 = wide, 0.6 = close. */
  focus(x: number, z: number, zoom: number): void {
    this.wantX = x
    this.wantZ = z
    this.wantZoom = zoom
  }

  /** Small camera nudge used when water spills somewhere new. */
  pulse(strength: number): void {
    this.shake = Math.min(1, this.shake + strength)
  }

  snap(): void {
    this.targetX = this.wantX
    this.targetZ = this.wantZ
    this.zoom = this.wantZoom
    this.azimuth = this.wantAzimuth
    this.offY = this.wantOffY
    this.apply(0)
  }

  update(dt: number, calmMotion: boolean): void {
    const rate = calmMotion ? 1.6 : 2.4
    this.targetX = damp(this.targetX, this.wantX, rate, dt)
    this.targetZ = damp(this.targetZ, this.wantZ, rate, dt)
    this.zoom = damp(this.zoom, this.wantZoom, rate * 0.85, dt)
    this.azimuth = damp(this.azimuth, this.wantAzimuth, 3.2, dt)
    this.offY = damp(this.offY, this.wantOffY, 3.2, dt)
    this.shake = damp(this.shake, 0, 4, dt)
    this.apply(calmMotion ? 0 : this.shake)
  }

  private apply(shake: number): void {
    const dist = this.baseDistance * clamp(this.zoom, 0.4, 1.4)
    const cosEl = Math.cos(this.elevation)
    const sinEl = Math.sin(this.elevation)
    const sx = Math.sin(this.azimuth)
    const cz = Math.cos(this.azimuth)

    const tx = this.targetX
    const tz = this.targetZ
    const ty = 0.55

    const px = tx + dist * sx * cosEl
    const py = ty + dist * sinEl
    const pz = tz + dist * cz * cosEl

    this.camera.position.set(px, py, pz)
    this.camera.lookAt(tx, ty, tz)

    // Shift the framing in screen space (keeps the angle, moves the crop).
    if (this.offY !== 0) {
      const up = new Vector3()
      this.camera.getWorldDirection(up)
      const right = new Vector3().crossVectors(up, new Vector3(0, 1, 0)).normalize()
      const screenUp = new Vector3().crossVectors(right, up).normalize()
      const shift = this.offY * dist
      this.camera.position.addScaledVector(screenUp, shift)
      const look = new Vector3(tx, ty, tz).addScaledVector(screenUp, shift)
      this.camera.lookAt(look)
    }

    if (shake > 0.001) {
      const s = shake * 0.06
      this.camera.position.x += Math.sin(performance.now() * 0.021) * s
      this.camera.position.y += Math.sin(performance.now() * 0.017) * s
    }
    this.camera.updateMatrixWorld()
  }

  /** Convenience for hints: how wide the shot currently is. */
  get distance(): number {
    return this.baseDistance * this.zoom
  }

  blendFocus(ax: number, az: number, bx: number, bz: number, t: number, zoom: number): void {
    this.focus(lerp(ax, bx, t), lerp(az, bz, t), zoom)
  }
}
