import * as THREE from 'three'
import { rng } from '../core/rng'

/**
 * Dry sand grains for the above-water intro: they fall, scatter and vanish —
 * the exact opposite of how the same sand behaves once it is underwater.
 */
export class DryGrains {
  readonly points: THREE.Points
  private cap: number
  private pos: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private alive: Uint8Array
  private free: number[] = []
  private geo: THREE.BufferGeometry
  private aLife: THREE.BufferAttribute

  constructor(capacity = 140) {
    this.cap = capacity
    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.alive = new Uint8Array(capacity)
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i)
      this.pos[i * 3 + 1] = -999
    }
    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.aLife = new THREE.BufferAttribute(this.life, 1)
    this.geo.setAttribute('aLife', this.aLife)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: `
        attribute float aLife;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.6 * (26.0 / max(-mv.z, 0.4));
          gl_Position = projectionMatrix * mv;
          vA = clamp(aLife, 0.0, 1.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          if (length(c) > 0.5) discard;
          gl_FragColor = vec4(0.98, 0.83, 0.52, vA);
        }`,
    })
    this.points = new THREE.Points(this.geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 14
  }

  spawn(x: number, y: number, z: number) {
    const i = this.free.pop()
    if (i === undefined) return
    const j = i * 3
    this.pos[j] = x + rng.range(-0.07, 0.07)
    this.pos[j + 1] = y
    this.pos[j + 2] = z + rng.range(-0.07, 0.07)
    this.vel[j] = rng.range(-0.35, 0.35)
    this.vel[j + 1] = rng.range(-0.2, 0.25)
    this.vel[j + 2] = rng.range(-0.3, 0.3)
    this.life[i] = 1
    this.alive[i] = 1
  }

  /** Grains vanish when they hit the water; set by the game. */
  waterY = 1e9

  update(dt: number) {
    let dirty = false
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue
      dirty = true
      const j = i * 3
      this.vel[j + 1] -= 5.2 * dt
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      this.life[i] -= dt * 0.75
      if (this.pos[j + 1] < this.waterY) this.life[i] = Math.min(this.life[i], 0.0)
      if (this.life[i] <= 0) {
        this.alive[i] = 0
        this.life[i] = 0
        this.pos[j + 1] = -999
        this.free.push(i)
      }
    }
    if (dirty) {
      ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      this.aLife.needsUpdate = true
    }
  }

  clear() {
    for (let i = 0; i < this.cap; i++) {
      if (this.alive[i]) {
        this.alive[i] = 0
        this.life[i] = 0
        this.pos[i * 3 + 1] = -999
        this.free.push(i)
      }
    }
  }
}
