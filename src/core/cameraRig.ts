import * as THREE from 'three'

export interface Framing {
  center: THREE.Vector3
  halfW: number
  halfH: number
  /** degrees above the horizon */
  elev: number
  /** degrees around Y, 0 = straight in front */
  azim: number
}

export function framing(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  elev = 10,
  azim = 0
): Framing {
  return { center: new THREE.Vector3(cx, cy, 0), halfW, halfH, elev, azim }
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/**
 * The child never drives the camera. Each stage names a box it wants on
 * screen; the rig works out the distance for the current aspect ratio, so
 * portrait and landscape both keep the towers and the gate fully visible.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  private fromPos = new THREE.Vector3()
  private fromLook = new THREE.Vector3()
  private toPos = new THREE.Vector3()
  private toLook = new THREE.Vector3()
  private curPos = new THREE.Vector3()
  private curLook = new THREE.Vector3()
  private t = 1
  private dur = 1
  private target: Framing | null = null
  private showcase = 0
  private showcaseT = 0
  private idle = 0
  private parallax = new THREE.Vector2()
  private parallaxTarget = new THREE.Vector2()
  private aspect = 1
  motion = 1

  constructor() {
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200)
    this.camera.position.set(0, 2, 9)
    this.curPos.copy(this.camera.position)
    this.curLook.set(0, 1.2, 0)
  }

  get portrait(): boolean {
    return this.aspect < 1
  }

  setViewport(w: number, h: number) {
    this.aspect = w / h
    this.camera.aspect = this.aspect
    this.camera.fov = this.aspect < 0.72 ? 60 : this.aspect < 1.05 ? 55 : 46
    this.camera.updateProjectionMatrix()
    if (this.target) this.applyFraming(this.target, this.toPos, this.toLook)
  }

  private applyFraming(f: Framing, outPos: THREE.Vector3, outLook: THREE.Vector3) {
    const fovR = THREE.MathUtils.degToRad(this.camera.fov)
    const pad = 1.14
    const dH = (f.halfH * pad) / Math.tan(fovR / 2)
    const dW = (f.halfW * pad) / (Math.tan(fovR / 2) * this.camera.aspect)
    const d = Math.max(dH, dW, 2.4)
    const e = THREE.MathUtils.degToRad(f.elev)
    const a = THREE.MathUtils.degToRad(f.azim)
    outPos.set(
      f.center.x + Math.sin(a) * Math.cos(e) * d,
      f.center.y + Math.sin(e) * d,
      f.center.z + Math.cos(a) * Math.cos(e) * d
    )
    outLook.copy(f.center)
  }

  goTo(f: Framing, duration = 1.3) {
    this.target = f
    this.fromPos.copy(this.curPos)
    this.fromLook.copy(this.curLook)
    this.applyFraming(f, this.toPos, this.toLook)
    this.dur = Math.max(0.001, duration)
    this.t = 0
  }

  snapTo(f: Framing) {
    this.goTo(f, 0.001)
  }

  get settled(): boolean {
    return this.t >= 1
  }

  setShowcase(on: boolean) {
    this.showcase = on ? 1 : 0
  }

  /** Very small pointer parallax; disabled when the calm setting is on. */
  setPointer(nx: number, ny: number) {
    this.parallaxTarget.set(nx, ny)
  }

  update(dt: number) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur)
      const e = smoother(this.t)
      this.curPos.lerpVectors(this.fromPos, this.toPos, e)
      this.curLook.lerpVectors(this.fromLook, this.toLook, e)
    } else {
      this.curPos.lerp(this.toPos, Math.min(1, dt * 3))
      this.curLook.lerp(this.toLook, Math.min(1, dt * 3))
    }

    this.idle += dt
    this.parallax.lerp(this.parallaxTarget, Math.min(1, dt * 2.2))

    const p = this.camera.position
    p.copy(this.curPos)
    const m = this.motion
    p.x += Math.sin(this.idle * 0.28) * 0.055 * m + this.parallax.x * 0.16 * m
    p.y += Math.cos(this.idle * 0.21) * 0.04 * m + this.parallax.y * 0.09 * m

    if (this.showcase > 0 && this.target) {
      this.showcaseT += dt
      const a = Math.sin(this.showcaseT * 0.26) * THREE.MathUtils.degToRad(15)
      const c = this.target.center
      const dx = this.curPos.x - c.x
      const dz = this.curPos.z - c.z
      p.x = c.x + dx * Math.cos(a) - dz * Math.sin(a)
      p.z = c.z + dx * Math.sin(a) + dz * Math.cos(a)
      p.y = this.curPos.y + Math.sin(this.showcaseT * 0.36) * 0.35
    }

    this.camera.lookAt(this.curLook)
  }

  get lookTarget(): THREE.Vector3 {
    return this.curLook
  }
}
