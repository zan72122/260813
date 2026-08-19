import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointsMaterial,
  Points,
  SphereGeometry,
} from 'three'
import { CASTLE_X, CASTLE_Z } from '../core/config'
import { clamp, damp, smoothstep } from '../core/util'

const STONE = new Color('#cfc3ad')
const STONE_DARK = new Color('#a99b83')
const WOOD = new Color('#a9754a')
const WOOD_DARK = new Color('#8a5c37')
const ROOF_A = new Color('#f48fb1')
const ROOF_B = new Color('#7fc8e8')
const ROOF_C = new Color('#ffd166')

/**
 * The reward object. Everything on it is driven by one number — how full the
 * moat is — so cause and effect stay legible.
 */
export class Castle {
  readonly group = new Group()
  private readonly wheel = new Group()
  private readonly bridge = new Group()
  private readonly flags: Object3D[] = []
  private readonly flagCloth: Mesh[] = []
  private readonly fountain: Points
  private readonly fountainPos: Float32Array
  private readonly fountainVel: Float32Array
  private readonly fountainLife: Float32Array
  private readonly disposables: Array<{ dispose: () => void }> = []

  private wheelSpeed = 0
  private bridgeAngle = 0
  private flagRaise = 0
  private fountainPower = 0
  private t = 0

  /** 0..1 — set by the game from moat fill. */
  activation = 0

  static readonly FOUNTAIN_MAX = 90

  constructor() {
    this.group.position.set(CASTLE_X, 0, CASTLE_Z)

    const mat = (c: Color, rough = 0.85) => {
      const m = new MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 })
      this.disposables.push(m)
      return m
    }
    const stone = mat(STONE)
    const stoneDark = mat(STONE_DARK)
    const wood = mat(WOOD, 0.9)
    const woodDark = mat(WOOD_DARK, 0.9)

    const add = (geo: BufferGeometry, m: MeshStandardMaterial, parent: Object3D = this.group) => {
      this.disposables.push(geo)
      const mesh = new Mesh(geo, m)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    // --- keep -----------------------------------------------------------
    const baseY = 0.62
    const plinth = add(new CylinderGeometry(1.06, 1.16, 0.16, 24), stoneDark)
    plinth.position.y = baseY + 0.04

    const keep = add(new BoxGeometry(0.92, 0.72, 0.92), stone)
    keep.position.y = baseY + 0.48

    const keepTop = add(new BoxGeometry(1.04, 0.12, 1.04), stoneDark)
    keepTop.position.y = baseY + 0.9

    // crenellations
    for (let i = 0; i < 4; i++) {
      for (let s = -1; s <= 1; s += 2) {
        const c = add(new BoxGeometry(0.16, 0.14, 0.16), stone)
        const off = -0.39 + i * 0.26
        if (i % 2 === 0) c.position.set(off, baseY + 1.02, s * 0.44)
        else c.position.set(s * 0.44, baseY + 1.02, off)
      }
    }

    const roof = add(new ConeGeometry(0.78, 0.62, 4), mat(ROOF_A, 0.7))
    roof.position.y = baseY + 1.27
    roof.rotation.y = Math.PI / 4

    // --- corner towers --------------------------------------------------
    const towerSpots: Array<[number, number, Color]> = [
      [-0.62, -0.62, ROOF_B],
      [-0.62, 0.62, ROOF_C],
      [0.66, 0.0, ROOF_B],
    ]
    for (const [tx, tz, roofColor] of towerSpots) {
      const t = add(new CylinderGeometry(0.21, 0.24, 0.78, 14), stone)
      t.position.set(tx, baseY + 0.44, tz)
      const band = add(new CylinderGeometry(0.25, 0.25, 0.08, 14), stoneDark)
      band.position.set(tx, baseY + 0.8, tz)
      const cap = add(new ConeGeometry(0.29, 0.4, 14), mat(roofColor, 0.7))
      cap.position.set(tx, baseY + 1.02, tz)

      // Flag on a mast — rises when the moat is full.
      const flag = new Group()
      flag.position.set(tx, baseY + 1.2, tz)
      const mast = add(new CylinderGeometry(0.017, 0.017, 0.5, 6), woodDark, flag)
      mast.position.y = 0.25
      const clothGeo = new BoxGeometry(0.24, 0.14, 0.012)
      this.disposables.push(clothGeo)
      const cloth = new Mesh(clothGeo, mat(roofColor === ROOF_B ? ROOF_A : ROOF_B, 0.6))
      cloth.position.set(0.13, 0.4, 0)
      cloth.castShadow = true
      flag.add(cloth)
      this.flagCloth.push(cloth)
      flag.scale.y = 0.02
      this.group.add(flag)
      this.flags.push(flag)
    }

    // --- gatehouse, facing the incoming river (-X) ----------------------
    const gate = add(new BoxGeometry(0.34, 0.66, 0.72), stone)
    gate.position.set(-0.86, baseY + 0.36, 0)
    const arch = add(new CylinderGeometry(0.2, 0.2, 0.36, 14, 1, false, 0, Math.PI), stoneDark)
    arch.rotation.z = Math.PI / 2
    arch.rotation.y = Math.PI / 2
    arch.position.set(-0.86, baseY + 0.36, 0)

    // --- drawbridge -----------------------------------------------------
    this.bridge.position.set(-1.04, baseY + 0.06, 0)
    this.group.add(this.bridge)
    const plank = add(new BoxGeometry(1.16, 0.05, 0.6), wood, this.bridge)
    plank.position.set(-0.58, 0, 0)
    for (let i = 0; i < 4; i++) {
      const slat = add(new BoxGeometry(0.05, 0.07, 0.62), woodDark, this.bridge)
      slat.position.set(-0.16 - i * 0.3, 0.01, 0)
    }
    // start upright (closed)
    this.bridge.rotation.z = -Math.PI / 2

    // --- water wheel ----------------------------------------------------
    this.wheel.position.set(0.35, baseY + 0.12, -1.35)
    this.wheel.rotation.y = Math.PI / 2
    this.group.add(this.wheel)
    const hub = add(new CylinderGeometry(0.07, 0.07, 0.3, 10), woodDark, this.wheel)
    hub.rotation.z = Math.PI / 2
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const paddle = add(new BoxGeometry(0.045, 0.2, 0.26), i % 2 === 0 ? wood : mat(ROOF_C, 0.8), this.wheel)
      paddle.position.set(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0)
      paddle.rotation.z = a
      const spoke = add(new BoxGeometry(0.03, 0.62, 0.03), woodDark, this.wheel)
      spoke.rotation.z = a
    }
    const rimGeoA = new CylinderGeometry(0.38, 0.38, 0.02, 20, 1, true)
    this.disposables.push(rimGeoA)
    for (const zz of [-0.13, 0.13]) {
      const rim = new Mesh(rimGeoA, wood)
      rim.rotation.x = Math.PI / 2
      rim.position.z = zz
      rim.castShadow = true
      this.wheel.add(rim)
    }
    // wheel housing
    const post = add(new BoxGeometry(0.07, 0.6, 0.07), woodDark)
    post.position.set(0.35, baseY - 0.14, -1.05)
    const post2 = add(new BoxGeometry(0.07, 0.6, 0.07), woodDark)
    post2.position.set(0.35, baseY - 0.14, -1.62)

    // --- courtyard ring -------------------------------------------------
    const yard = add(new CircleGeometry(1.05, 28), mat(new Color('#d8c9a6'), 0.98))
    yard.rotation.x = -Math.PI / 2
    yard.position.y = baseY + 0.125
    yard.castShadow = false

    // --- fountain particles --------------------------------------------
    const n = Castle.FOUNTAIN_MAX
    this.fountainPos = new Float32Array(n * 3)
    this.fountainVel = new Float32Array(n * 3)
    this.fountainLife = new Float32Array(n)
    const fg = new BufferGeometry()
    fg.setAttribute('position', new BufferAttribute(this.fountainPos, 3))
    this.disposables.push(fg)
    const fm = new PointsMaterial({
      color: new Color('#bfe9ff'),
      size: 0.055,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.disposables.push(fm)
    this.fountain = new Points(fg, fm)
    this.fountain.frustumCulled = false
    this.fountain.position.set(0, baseY + 1.6, 0)
    this.fountain.visible = false
    this.group.add(this.fountain)
    for (let i = 0; i < n; i++) this.fountainPos[i * 3 + 1] = -999

    // small decorative stones round the island edge
    const pebbleGeo = new SphereGeometry(0.07, 6, 5)
    this.disposables.push(pebbleGeo)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2
      const p = new Mesh(pebbleGeo, i % 3 === 0 ? stoneDark : stone)
      p.position.set(Math.cos(a) * 1.03, baseY + 0.1, Math.sin(a) * 1.03)
      p.scale.set(1, 0.65, 1)
      p.castShadow = true
      p.receiveShadow = true
      this.group.add(p)
    }
  }

  update(dt: number, calmMotion: boolean): void {
    this.t += dt
    const a = clamp(this.activation, 0, 1)

    // The wheel starts turning as soon as the moat has any real water in it.
    const targetSpeed = smoothstep(0.12, 0.7, a) * (calmMotion ? 1.1 : 2.4)
    this.wheelSpeed = damp(this.wheelSpeed, targetSpeed, 2.2, dt)
    this.wheel.rotation.z -= this.wheelSpeed * dt

    // Bridge drops once the moat is nearly full.
    const targetAngle = -Math.PI / 2 * (1 - smoothstep(0.55, 0.98, a))
    this.bridgeAngle = damp(this.bridgeAngle, targetAngle, 3.4, dt)
    this.bridge.rotation.z = this.bridgeAngle

    // Flags run up their masts at the very end.
    this.flagRaise = damp(this.flagRaise, smoothstep(0.7, 1, a), 2.6, dt)
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].scale.y = Math.max(0.02, this.flagRaise)
      const cloth = this.flagCloth[i]
      const wave = calmMotion ? 0.04 : 0.13
      cloth.rotation.y = Math.sin(this.t * 3.1 + i) * wave
      cloth.scale.x = 1 + Math.sin(this.t * 4.2 + i * 1.7) * (calmMotion ? 0.03 : 0.1)
    }

    // Fountain last.
    this.fountainPower = damp(this.fountainPower, smoothstep(0.8, 1, a), 2.2, dt)
    this.updateFountain(dt, calmMotion)
  }

  private updateFountain(dt: number, calmMotion: boolean): void {
    const power = this.fountainPower
    this.fountain.visible = power > 0.02
    if (!this.fountain.visible) return
    const n = calmMotion ? Castle.FOUNTAIN_MAX >> 1 : Castle.FOUNTAIN_MAX
    const pos = this.fountainPos
    const vel = this.fountainVel
    const life = this.fountainLife
    const spawnPerFrame = power * (calmMotion ? 1 : 2)
    let spawned = 0

    for (let i = 0; i < n; i++) {
      if (life[i] > 0) {
        life[i] -= dt
        vel[i * 3 + 1] -= 3.2 * dt
        pos[i * 3] += vel[i * 3] * dt
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        if (life[i] <= 0) pos[i * 3 + 1] = -999
      } else if (spawned < spawnPerFrame) {
        spawned++
        const ang = Math.random() * Math.PI * 2
        const spread = 0.34 + Math.random() * 0.22
        pos[i * 3] = 0
        pos[i * 3 + 1] = 0
        pos[i * 3 + 2] = 0
        vel[i * 3] = Math.cos(ang) * spread
        vel[i * 3 + 1] = 1.15 + Math.random() * 0.4
        vel[i * 3 + 2] = Math.sin(ang) * spread
        life[i] = 0.9 + Math.random() * 0.4
      }
    }
    ;(this.fountain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }

  reset(): void {
    this.activation = 0
    this.wheelSpeed = 0
    this.bridgeAngle = -Math.PI / 2
    this.bridge.rotation.z = -Math.PI / 2
    this.flagRaise = 0
    this.fountainPower = 0
    this.fountainLife.fill(0)
    for (let i = 0; i < Castle.FOUNTAIN_MAX; i++) this.fountainPos[i * 3 + 1] = -999
    this.fountain.visible = false
    for (const f of this.flags) f.scale.y = 0.02
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
