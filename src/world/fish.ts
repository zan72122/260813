import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng } from '../core/rng'

export type FishMode = 'far' | 'approach' | 'pause' | 'through' | 'orbit' | 'wander'

function makeFishGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const body = new THREE.SphereGeometry(0.5, 14, 10)
  body.scale(1.05, 0.62, 0.42)
  parts.push(body)

  const tail = new THREE.ConeGeometry(0.3, 0.46, 3, 1)
  tail.rotateZ(Math.PI / 2)
  tail.rotateX(Math.PI / 2)
  tail.scale(1, 1, 0.16)
  tail.translate(-0.66, 0, 0)
  parts.push(tail)

  const dorsal = new THREE.ConeGeometry(0.17, 0.3, 3, 1)
  dorsal.rotateY(Math.PI / 2)
  dorsal.scale(1, 1, 0.14)
  dorsal.translate(-0.02, 0.3, 0)
  parts.push(dorsal)

  const finL = new THREE.ConeGeometry(0.13, 0.24, 3, 1)
  finL.rotateZ(-Math.PI / 2)
  finL.scale(1, 1, 0.2)
  finL.translate(0.02, -0.06, 0.17)
  parts.push(finL)
  const finR = finL.clone()
  finR.translate(0, 0, -0.34)
  parts.push(finR)

  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  return merged ?? body
}

const FISH_GEO_CACHE: { geo: THREE.BufferGeometry | null } = { geo: null }

/** One small fish: body-sway shader plus a tiny behaviour state machine. */
export class Fish {
  readonly mesh: THREE.Mesh
  mode: FishMode = 'far'
  private mat: THREE.MeshPhongMaterial
  private uTime = { value: 0 }
  private uSway = { value: 1 }
  private vel = new THREE.Vector3(0, 0, 1)
  private target = new THREE.Vector3()
  private speed = 1
  private phase: number
  private timer = 0
  private orbitA = 0
  private path: THREE.Vector3[] = []
  private pathI = 0
  private eyes: THREE.Mesh

  constructor(color: number, seedPhase: number) {
    if (!FISH_GEO_CACHE.geo) FISH_GEO_CACHE.geo = makeFishGeometry()
    this.phase = seedPhase
    this.mat = new THREE.MeshPhongMaterial({
      color,
      shininess: 55,
      specular: 0xffffff,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    })
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime
      sh.uniforms.uSway = this.uSway
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uSway;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float w = clamp((-transformed.x + 0.25) / 1.1, 0.0, 1.0);
           transformed.z += sin(uTime * 7.0 - transformed.x * 3.4) * 0.16 * w * w * uSway;
           transformed.y += sin(uTime * 3.2 - transformed.x * 1.4) * 0.02 * uSway;`
        )
    }
    this.mesh = new THREE.Mesh(FISH_GEO_CACHE.geo, this.mat)
    this.mesh.scale.setScalar(rng.range(0.34, 0.52))

    const eyeGeo = new THREE.SphereGeometry(0.075, 8, 6)
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0x14232b, shininess: 100, specular: 0xffffff })
    this.eyes = new THREE.Mesh(eyeGeo, eyeMat)
    this.eyes.position.set(0.34, 0.1, 0.15)
    const e2 = new THREE.Mesh(eyeGeo, eyeMat)
    e2.position.set(0.34, 0.1, -0.15)
    this.mesh.add(this.eyes)
    this.mesh.add(e2)
    this.mesh.frustumCulled = false
  }

  setPosition(x: number, y: number, z: number) {
    this.mesh.position.set(x, y, z)
  }

  setFar() {
    this.mode = 'far'
    this.pickFarTarget()
  }

  private pickFarTarget() {
    // stays well behind / beside the build area so it never blocks the hands
    const side = rng.sign()
    this.target.set(side * rng.range(5.0, 8.5), rng.range(1.4, 4.2), rng.range(-7.5, -3.2))
    this.speed = rng.range(0.7, 1.1)
  }

  approach(p: THREE.Vector3) {
    this.mode = 'approach'
    this.target.copy(p)
    this.speed = 1.05
  }

  pause(sec: number) {
    this.mode = 'pause'
    this.timer = sec
  }

  /** Sends the fish along an explicit path (used for the gate run). */
  follow(points: THREE.Vector3[], speed = 1.4) {
    this.path = points
    this.pathI = 0
    this.speed = speed
    this.mode = 'through'
  }

  orbit(centerY: number, radius: number, a0: number) {
    this.mode = 'orbit'
    this.orbitA = a0
    this.target.set(0, centerY, 0)
    this.speed = radius
  }

  wander() {
    this.mode = 'wander'
    this.pickWanderTarget()
  }

  private pickWanderTarget() {
    this.target.set(rng.range(-6, 6), rng.range(0.8, 4.6), rng.range(-6.5, 2.2))
    // don't hover right over the castle footprint
    if (Math.abs(this.target.x) < 3 && this.target.z > -1.5 && this.target.y < 3.4) this.target.z = -3.4
    this.speed = rng.range(0.6, 1.0)
  }

  get done(): boolean {
    return this.mode === 'through' && this.pathI >= this.path.length
  }

  update(dt: number, t: number, motion: number) {
    this.uTime.value = t + this.phase
    this.uSway.value = 0.35 + motion * 0.65
    const p = this.mesh.position

    switch (this.mode) {
      case 'far':
        if (p.distanceTo(this.target) < 0.7) this.pickFarTarget()
        this.steer(dt, this.target, this.speed)
        break
      case 'wander':
        if (p.distanceTo(this.target) < 0.7) this.pickWanderTarget()
        this.steer(dt, this.target, this.speed)
        break
      case 'approach':
        this.steer(dt, this.target, this.speed)
        break
      case 'pause': {
        this.timer -= dt
        const bob = Math.sin(t * 1.8 + this.phase) * 0.12 * dt
        p.y += bob
        this.vel.multiplyScalar(0.9)
        break
      }
      case 'through': {
        if (this.pathI < this.path.length) {
          const tgt = this.path[this.pathI]
          this.steer(dt, tgt, this.speed)
          if (p.distanceTo(tgt) < 0.42) this.pathI++
        }
        break
      }
      case 'orbit': {
        this.orbitA += dt * 0.55
        const r = this.speed
        this.target.set(Math.cos(this.orbitA) * r, this.target.y + Math.sin(t * 0.6) * 0.004, Math.sin(this.orbitA) * r * 0.75)
        this.steer(dt, this.target, 2.0)
        break
      }
    }

    // heading
    if (this.vel.lengthSq() > 1e-5) {
      const yaw = Math.atan2(this.vel.x, this.vel.z)
      const pitch = -Math.asin(THREE.MathUtils.clamp(this.vel.y / (this.vel.length() || 1), -0.8, 0.8))
      // model faces +X, so add a quarter turn
      let dy = yaw + Math.PI / 2 - this.mesh.rotation.y
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this.mesh.rotation.y += dy * Math.min(1, dt * 5)
      this.mesh.rotation.z += (pitch * 0.7 - this.mesh.rotation.z) * Math.min(1, dt * 4)
    }
  }

  get paused(): boolean {
    return this.mode === 'pause' && this.timer <= 0
  }

  private steer(dt: number, target: THREE.Vector3, speed: number) {
    const p = this.mesh.position
    const dx = target.x - p.x
    const dy = target.y - p.y
    const dz = target.z - p.z
    const d = Math.hypot(dx, dy, dz) || 1
    const acc = 3.2
    this.vel.x += (dx / d) * acc * dt
    this.vel.y += (dy / d) * acc * dt
    this.vel.z += (dz / d) * acc * dt
    const vl = this.vel.length()
    if (vl > speed) this.vel.multiplyScalar(speed / vl)
    p.addScaledVector(this.vel, dt)
  }

  dispose() {
    this.mat.dispose()
  }
}

/** Small school with shared choreography for the finale. */
export class FishSchool {
  readonly group = new THREE.Group()
  readonly fish: Fish[] = []

  constructor(count: number) {
    const palette = [0xffd280, 0xff9fb8, 0x8fe3ff, 0xffe9a3, 0xb9a8ff, 0x9ff0c8]
    for (let i = 0; i < count; i++) {
      const f = new Fish(palette[i % palette.length], i * 1.3)
      f.setPosition(rng.range(-9, 9), rng.range(1.5, 4), rng.range(-8, -4))
      f.setFar()
      this.fish.push(f)
      this.group.add(f.mesh)
    }
  }

  update(dt: number, t: number, motion: number) {
    for (const f of this.fish) f.update(dt, t, motion)
  }

  setAllFar() {
    for (const f of this.fish) f.setFar()
  }
  setAllWander() {
    for (const f of this.fish) f.wander()
  }
}
