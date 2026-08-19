import * as THREE from 'three'
import { SAND } from '../core/config'
import { rng } from '../core/rng'

const GROW_TIME = 0.3
const DIE_TIME = 0.4
const CELL = 0.5

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _c = new THREE.Color()

export interface BlobInfo {
  x: number
  y: number
  z: number
  r: number
}

/**
 * All player-made sand lives here: one InstancedMesh of rounded blobs.
 * Growth ("モコッ"), lumpiness and grain are done in the vertex/fragment
 * shader from a per-instance birth time, so the CPU never touches an
 * instance again after it is placed.
 */
export class SandSystem {
  readonly mesh: THREE.InstancedMesh
  readonly capacity: number

  private px: Float32Array
  private py: Float32Array
  private pz: Float32Array
  private pr: Float32Array
  private stroke: Int32Array
  private state: Uint8Array // 0 free, 1 alive, 2 dying
  private aBirth: THREE.InstancedBufferAttribute
  private aSeed: THREE.InstancedBufferAttribute
  private aDie: THREE.InstancedBufferAttribute
  private aSpark: THREE.InstancedBufferAttribute
  private aGrow: THREE.InstancedBufferAttribute
  private freeList: number[] = []
  private dying: { i: number; t: number }[] = []
  private hash = new Map<number, number[]>()
  private uniforms: { uTime: { value: number }; uGrain: { value: number }; uPop: { value: number } }
  private liveCount = 0
  private dirty = false
  private highWater = 0 // highest slot ever used -> instanced draw range

  constructor(capacity: number, quality: 'high' | 'low') {
    this.capacity = capacity
    const geo =
      quality === 'high' ? new THREE.SphereGeometry(1, 10, 7) : new THREE.SphereGeometry(1, 7, 5)

    const mat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 26,
      specular: new THREE.Color(0x5c7f88),
      flatShading: false,
    })

    this.uniforms = { uTime: { value: 0 }, uGrain: { value: 0.3 }, uPop: { value: 1 } }
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime
      shader.uniforms.uGrain = this.uniforms.uGrain
      shader.uniforms.uPop = this.uniforms.uPop
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aBirth;
           attribute float aSeed;
           attribute float aDie;
           attribute float aSpark;
           attribute float aGrow;
           uniform float uTime;
           uniform float uPop;
           varying float vSeed;
           varying float vSpark;
           varying vec3 vLocal;`
        )
        .replace(
          '#include <begin_vertex>',
          `float age = max(uTime - aBirth, 0.0);
           float gt = max(aGrow, 0.05);
           float g = clamp(age / gt, 0.0, 1.0);
           g = 1.0 - pow(1.0 - g, 3.0);
           float pop = 1.0 + 0.26 * uPop * sin(clamp(age / (gt * 1.45), 0.0, 1.0) * 3.14159265);
           float sc = g * pop;
           if (aDie > 0.0) {
             float d = clamp((uTime - aDie) / ${DIE_TIME.toFixed(2)}, 0.0, 1.0);
             sc *= 1.0 - d * d;
           }
           vec3 lp = position;
           float lump = sin(aSeed * 12.9 + lp.x * 3.4)
                      * sin(aSeed * 7.7 + lp.y * 3.1 + 1.3)
                      * sin(aSeed * 4.3 + lp.z * 2.8);
           lp *= 1.0 + 0.13 * lump;
           lp.y *= mix(0.60, 1.0, g);
           lp.xz *= mix(1.26, 1.0, g);
           vec3 transformed = lp * sc;
           vSeed = aSeed;
           vSpark = aSpark;
           vLocal = position;`
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uGrain;
           varying float vSeed;
           varying float vSpark;
           varying vec3 vLocal;
           float hash13(vec3 p) {
             p = fract(p * 0.1031);
             p += dot(p, p.yzx + 33.33);
             return fract((p.x + p.y) * p.z);
           }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           vec3 gp = vLocal * 26.0 + vSeed * 51.0;
           float n = hash13(floor(gp));
           float n2 = hash13(floor(gp * 2.7 + 11.0));
           diffuseColor.rgb *= 1.0 + (n * 0.65 + n2 * 0.35 - 0.5) * uGrain;
           float sp = step(0.93, n2) * vSpark;
           diffuseColor.rgb += sp * vec3(1.0, 0.96, 0.88) * 0.5;`
        )
    }

    this.mesh = new THREE.InstancedMesh(geo, mat, capacity)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.name = 'sand'
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false

    const colors = new Float32Array(capacity * 3).fill(1)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)

    this.aBirth = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(-99), 1)
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
    this.aDie = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(-1), 1)
    this.aSpark = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
    this.aGrow = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(GROW_TIME), 1)
    for (const a of [this.aBirth, this.aSeed, this.aDie, this.aSpark, this.aGrow]) {
      a.setUsage(THREE.DynamicDrawUsage)
    }
    geo.setAttribute('aBirth', this.aBirth)
    geo.setAttribute('aSeed', this.aSeed)
    geo.setAttribute('aDie', this.aDie)
    geo.setAttribute('aSpark', this.aSpark)
    geo.setAttribute('aGrow', this.aGrow)

    this.px = new Float32Array(capacity)
    this.py = new Float32Array(capacity)
    this.pz = new Float32Array(capacity)
    this.pr = new Float32Array(capacity)
    this.stroke = new Int32Array(capacity)
    this.state = new Uint8Array(capacity)
    for (let i = capacity - 1; i >= 0; i--) this.freeList.push(i)
  }

  get count(): number {
    return this.liveCount
  }

  /** 0..1 — how close we are to the segment budget. */
  get pressure(): number {
    return this.liveCount / this.capacity
  }

  get isFull(): boolean {
    return this.freeList.length === 0
  }

  // ---------------------------------------------------------------- hashing
  private key(x: number, y: number, z: number): number {
    const cx = Math.floor(x / CELL) + 512
    const cy = Math.floor(y / CELL) + 512
    const cz = Math.floor(z / CELL) + 512
    return (cx * 1024 + cy) * 1024 + cz
  }

  private hashAdd(i: number) {
    const k = this.key(this.px[i], this.py[i], this.pz[i])
    let arr = this.hash.get(k)
    if (!arr) {
      arr = []
      this.hash.set(k, arr)
    }
    arr.push(i)
  }

  private hashRemove(i: number) {
    const k = this.key(this.px[i], this.py[i], this.pz[i])
    const arr = this.hash.get(k)
    if (!arr) return
    const j = arr.indexOf(i)
    if (j >= 0) arr.splice(j, 1)
    if (arr.length === 0) this.hash.delete(k)
  }

  /** Visits every live blob within `radius` of the point. */
  forEachNear(x: number, y: number, z: number, radius: number, fn: (i: number) => void) {
    const r = Math.max(radius, 0.001)
    const x0 = Math.floor((x - r) / CELL)
    const x1 = Math.floor((x + r) / CELL)
    const y0 = Math.floor((y - r) / CELL)
    const y1 = Math.floor((y + r) / CELL)
    const z0 = Math.floor((z - r) / CELL)
    const z1 = Math.floor((z + r) / CELL)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cz = z0; cz <= z1; cz++) {
          const arr = this.hash.get(((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512))
          if (!arr) continue
          for (let n = 0; n < arr.length; n++) {
            const i = arr[n]
            if (this.state[i] !== 1) continue
            const dx = this.px[i] - x
            const dy = this.py[i] - y
            const dz = this.pz[i] - z
            if (dx * dx + dy * dy + dz * dz <= r * r) fn(i)
          }
        }
      }
    }
  }

  // ----------------------------------------------------------------- adding
  add(
    x: number,
    y: number,
    z: number,
    r: number,
    color: THREE.Color,
    sparkle: number,
    strokeId: number,
    now: number,
    growTime = GROW_TIME
  ): number {
    const i = this.freeList.pop()
    if (i === undefined) return -1

    this.px[i] = x
    this.py[i] = y
    this.pz[i] = z
    this.pr[i] = r
    this.stroke[i] = strokeId
    this.state[i] = 1
    this.liveCount++

    _p.set(x, y, z)
    _e.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28))
    _q.setFromEuler(_e)
    _s.set(r, r * rng.range(0.9, 1.06), r)
    _m.compose(_p, _q, _s)
    this.mesh.setMatrixAt(i, _m)
    this.mesh.setColorAt(i, color)
    this.aBirth.setX(i, now)
    this.aSeed.setX(i, rng.range(0, 10))
    this.aDie.setX(i, -1)
    this.aSpark.setX(i, sparkle)
    this.aGrow.setX(i, growTime)

    this.hashAdd(i)
    if (i >= this.highWater) this.highWater = i + 1
    this.mesh.count = this.highWater
    this.dirty = true
    return i
  }

  /** Marks a blob for its shrink-away animation. */
  remove(i: number, now: number) {
    if (this.state[i] !== 1) return
    this.state[i] = 2
    this.liveCount--
    this.aDie.setX(i, now)
    this.hashRemove(i)
    this.dying.push({ i, t: now + DIE_TIME + 0.05 })
    this.dirty = true
  }

  /** Removes everything inside a sphere. Returns how many went away. */
  removeSphere(x: number, y: number, z: number, radius: number, now: number): number {
    const hits: number[] = []
    this.forEachNear(x, y, z, radius, (i) => hits.push(i))
    for (const i of hits) this.remove(i, now)
    return hits.length
  }

  removeStroke(strokeId: number, now: number): number {
    let n = 0
    for (let i = 0; i < this.highWater; i++) {
      if (this.state[i] === 1 && this.stroke[i] === strokeId) {
        this.remove(i, now)
        n++
      }
    }
    return n
  }

  clear(now: number) {
    for (let i = 0; i < this.highWater; i++) if (this.state[i] === 1) this.remove(i, now)
  }

  // ------------------------------------------------------------ queries
  /** Top of the sand column near (x,z), or `floor` when there is nothing. */
  supportY(x: number, z: number, r: number, floor: number): number {
    let top = floor
    const rad = r * 1.5
    const x0 = Math.floor((x - rad) / CELL)
    const x1 = Math.floor((x + rad) / CELL)
    const z0 = Math.floor((z - rad) / CELL)
    const z1 = Math.floor((z + rad) / CELL)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        for (let cy = 0; cy < 24; cy++) {
          const arr = this.hash.get(((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512))
          if (!arr) continue
          for (let n = 0; n < arr.length; n++) {
            const i = arr[n]
            if (this.state[i] !== 1) continue
            const dx = this.px[i] - x
            const dz = this.pz[i] - z
            if (dx * dx + dz * dz > rad * rad) continue
            const t = this.py[i] + this.pr[i] * 0.72
            if (t > top) top = t
          }
        }
      }
    }
    return top
  }

  /** Nearest live blob within `radius`; -1 if none. */
  nearest(x: number, y: number, z: number, radius: number): number {
    let best = -1
    let bd = Infinity
    this.forEachNear(x, y, z, radius, (i) => {
      const dx = this.px[i] - x
      const dy = this.py[i] - y
      const dz = this.pz[i] - z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }

  hasNeighbor(x: number, y: number, z: number, radius: number): boolean {
    let found = false
    this.forEachNear(x, y, z, radius, () => {
      found = true
    })
    return found
  }

  countWhere(test: (x: number, y: number, z: number) => boolean): number {
    let n = 0
    for (let i = 0; i < this.highWater; i++) {
      if (this.state[i] === 1 && test(this.px[i], this.py[i], this.pz[i])) n++
    }
    return n
  }

  strokeOf(i: number): number {
    return this.stroke[i]
  }

  info(i: number, out: BlobInfo): BlobInfo {
    out.x = this.px[i]
    out.y = this.py[i]
    out.z = this.pz[i]
    out.r = this.pr[i]
    return out
  }

  /** Bounding box of the built castle (for the reveal camera). */
  bounds(box: THREE.Box3): THREE.Box3 {
    box.makeEmpty()
    for (let i = 0; i < this.highWater; i++) {
      if (this.state[i] !== 1) continue
      _p.set(this.px[i], this.py[i], this.pz[i])
      box.expandByPoint(_p)
    }
    return box
  }

  // ------------------------------------------------------------ per frame
  update(now: number) {
    this.uniforms.uTime.value = now
    while (this.dying.length && this.dying[0].t <= now) {
      const d = this.dying.shift()!
      if (this.state[d.i] === 2) {
        this.state[d.i] = 0
        this.aBirth.setX(d.i, -99)
        _m.makeScale(0, 0, 0)
        this.mesh.setMatrixAt(d.i, _m)
        this.freeList.push(d.i)
        this.dirty = true
      }
    }
    if (this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
      this.aBirth.needsUpdate = true
      this.aSeed.needsUpdate = true
      this.aDie.needsUpdate = true
      this.aSpark.needsUpdate = true
      this.aGrow.needsUpdate = true
      this.dirty = false
    }
  }

  setQuality(grain: number, pop: number) {
    this.uniforms.uGrain.value = grain
    this.uniforms.uPop.value = pop
  }

  /** Rainbow sand picks its hue from where it is placed. */
  static rainbowAt(x: number, y: number): THREE.Color {
    return _c.setHSL(((x * 0.09 + y * 0.13) % 1 + 1) % 1, 0.72, 0.76).clone()
  }
}

export { SAND }
