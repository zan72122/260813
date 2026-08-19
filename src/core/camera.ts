import { Vec3, v3, sub, cross, norm, dot, lerp, approach } from './math'

export type CamSpec = {
  pos: Vec3
  target: Vec3
  fov: number      // vertical fov in degrees
  roll?: number
}

export type Projected = { x: number; y: number; z: number; s: number; ok: boolean }

/** Simple pinhole camera projecting world points to CSS pixel screen space. */
export class Camera {
  pos: Vec3 = v3(0, 2, 8)
  target: Vec3 = v3(0, 0, 0)
  fov = 40
  roll = 0
  w = 1
  h = 1
  private right: Vec3 = v3(1, 0, 0)
  private up: Vec3 = v3(0, 1, 0)
  private fwd: Vec3 = v3(0, 0, -1)
  private f = 1

  setViewport(w: number, h: number) { this.w = w; this.h = h }

  /** smoothly move toward a spec */
  approachSpec(s: CamSpec, rate: number, dt: number) {
    this.pos.x = approach(this.pos.x, s.pos.x, rate, dt)
    this.pos.y = approach(this.pos.y, s.pos.y, rate, dt)
    this.pos.z = approach(this.pos.z, s.pos.z, rate, dt)
    this.target.x = approach(this.target.x, s.target.x, rate, dt)
    this.target.y = approach(this.target.y, s.target.y, rate, dt)
    this.target.z = approach(this.target.z, s.target.z, rate, dt)
    this.fov = approach(this.fov, s.fov, rate, dt)
    this.roll = approach(this.roll, s.roll ?? 0, rate, dt)
    this.update()
  }

  snapTo(s: CamSpec) {
    this.pos = { ...s.pos }
    this.target = { ...s.target }
    this.fov = s.fov
    this.roll = s.roll ?? 0
    this.update()
  }

  update() {
    this.fwd = norm(sub(this.target, this.pos))
    const worldUp = Math.abs(this.fwd.y) > 0.995 ? v3(0, 0, 1) : v3(0, 1, 0)
    let r = norm(cross(this.fwd, worldUp))
    let u = norm(cross(r, this.fwd))
    if (this.roll) {
      const c = Math.cos(this.roll), s = Math.sin(this.roll)
      const r2 = { x: r.x * c + u.x * s, y: r.y * c + u.y * s, z: r.z * c + u.z * s }
      const u2 = { x: u.x * c - r.x * s, y: u.y * c - r.y * s, z: u.z * c - r.z * s }
      r = r2; u = u2
    }
    this.right = r
    this.up = u
    this.f = (this.h * 0.5) / Math.tan((this.fov * Math.PI) / 360)
  }

  project(p: Vec3): Projected {
    const d = sub(p, this.pos)
    const z = dot(d, this.fwd)
    if (z < 0.05) {
      return { x: 0, y: 0, z, s: 0, ok: false }
    }
    const s = this.f / z
    return {
      x: this.w * 0.5 + dot(d, this.right) * s,
      y: this.h * 0.5 - dot(d, this.up) * s,
      z,
      s,
      ok: true
    }
  }

  /** approximate pixels-per-world-unit at a given world point */
  scaleAt(p: Vec3) {
    const z = Math.max(0.1, dot(sub(p, this.pos), this.fwd))
    return this.f / z
  }

  forward() { return this.fwd }
  rightVec() { return this.right }
  upVec() { return this.up }

  /** Unproject a screen point onto the plane z = planeZ (world), assuming camera looks roughly -Z. */
  screenToPlaneZ(sx: number, sy: number, planeZ: number): Vec3 {
    const ndx = (sx - this.w * 0.5) / this.f
    const ndy = -(sy - this.h * 0.5) / this.f
    // ray direction in world
    const dir = {
      x: this.fwd.x + this.right.x * ndx + this.up.x * ndy,
      y: this.fwd.y + this.right.y * ndx + this.up.y * ndy,
      z: this.fwd.z + this.right.z * ndx + this.up.z * ndy
    }
    const t = Math.abs(dir.z) < 1e-5 ? 0 : (planeZ - this.pos.z) / dir.z
    return { x: this.pos.x + dir.x * t, y: this.pos.y + dir.y * t, z: planeZ }
  }
}

export const mixSpec = (a: CamSpec, b: CamSpec, t: number): CamSpec => ({
  pos: { x: lerp(a.pos.x, b.pos.x, t), y: lerp(a.pos.y, b.pos.y, t), z: lerp(a.pos.z, b.pos.z, t) },
  target: {
    x: lerp(a.target.x, b.target.x, t),
    y: lerp(a.target.y, b.target.y, t),
    z: lerp(a.target.z, b.target.z, t)
  },
  fov: lerp(a.fov, b.fov, t),
  roll: lerp(a.roll ?? 0, b.roll ?? 0, t)
})
