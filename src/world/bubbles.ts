import * as THREE from 'three'
import { WORLD } from '../core/config'
import { rng } from '../core/rng'

/** Pooled rising bubbles drawn as one Points draw call. */
export class Bubbles {
  readonly points: THREE.Points
  private cap: number
  private pos: Float32Array
  private vel: Float32Array
  private size: Float32Array
  private phase: Float32Array
  private life: Float32Array
  private alive: Uint8Array
  private free: number[] = []
  private geo: THREE.BufferGeometry
  private mat: THREE.ShaderMaterial
  private uTime = { value: 0 }

  constructor(capacity = 150) {
    this.cap = capacity
    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity)
    this.size = new Float32Array(capacity)
    this.phase = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.alive = new Uint8Array(capacity)
    for (let i = capacity - 1; i >= 0; i--) {
      this.free.push(i)
      this.pos[i * 3 + 1] = -999
    }

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(this.phase, 1))

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: this.uTime, uScale: { value: 1 } },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uScale;
        varying float vPhase;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (52.0 / max(-mv.z, 0.4));
          gl_Position = projectionMatrix * mv;
          vPhase = aPhase;
        }`,
      fragmentShader: `
        varying float vPhase;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float edge = smoothstep(0.5, 0.34, d);
          float rim = smoothstep(0.30, 0.47, d) * smoothstep(0.5, 0.46, d);
          vec2 hl = c + vec2(0.16, 0.16);
          float spec = smoothstep(0.16, 0.0, length(hl));
          vec3 col = vec3(0.78, 0.94, 0.98);
          float a = edge * 0.16 + rim * 0.6 + spec * 0.75;
          gl_FragColor = vec4(col + spec * 0.3, a * 0.9);
        }`,
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 12
  }

  spawn(x: number, y: number, z: number, size = 1, spread = 0.12) {
    const i = this.free.pop()
    if (i === undefined) return
    this.pos[i * 3] = x + rng.range(-spread, spread)
    this.pos[i * 3 + 1] = y + rng.range(-spread, spread) * 0.5
    this.pos[i * 3 + 2] = z + rng.range(-spread, spread)
    this.vel[i] = rng.range(0.55, 1.15) * (0.7 + size * 0.4)
    this.size[i] = rng.range(0.5, 1.25) * size
    this.phase[i] = rng.range(0, 6.28)
    this.life[i] = 0
    this.alive[i] = 1
  }

  burst(x: number, y: number, z: number, n: number, size = 1, spread = 0.25) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, size, spread)
  }

  get activeCount(): number {
    return this.cap - this.free.length
  }

  update(dt: number, t: number, motion: number) {
    this.uTime.value = t
    let dirty = false
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue
      dirty = true
      const j = i * 3
      this.life[i] += dt
      this.pos[j + 1] += this.vel[i] * dt
      this.pos[j] += Math.sin(t * 2.4 + this.phase[i]) * 0.32 * dt * motion
      this.pos[j + 2] += Math.cos(t * 1.9 + this.phase[i]) * 0.2 * dt * motion
      if (this.pos[j + 1] > WORLD.waterY - 0.05 || this.life[i] > 14) {
        this.alive[i] = 0
        this.pos[j + 1] = -999
        this.size[i] = 0
        this.free.push(i)
      }
    }
    if (dirty) {
      ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
      ;(this.geo.attributes.aPhase as THREE.BufferAttribute).needsUpdate = true
    }
  }

  setScale(s: number) {
    this.mat.uniforms.uScale.value = s
  }

  clear() {
    for (let i = 0; i < this.cap; i++) {
      if (this.alive[i]) {
        this.alive[i] = 0
        this.pos[i * 3 + 1] = -999
        this.size[i] = 0
        this.free.push(i)
      }
    }
  }
}
