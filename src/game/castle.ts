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
import { CASTLE_X, CASTLE_Z, MOAT_INNER, MOAT_OUTER } from '../core/config'
import { clamp, damp, smoothstep } from '../core/util'

const STONE = '#e0d6c2'
const STONE_MID = '#c6b99f'
const STONE_DARK = '#a3947a'
const WOOD = '#b4794c'
const WOOD_DARK = '#8a5c37'
const ROOF_PINK = '#f2799f'
const ROOF_BLUE = '#5fbde2'
const ROOF_GOLD = '#ffc84d'

/** Height of the castle island's flat top, matching Terrain.carveMoat. */
const ISLAND_Y = 0.6

/**
 * The reward object. Everything on it is driven by one number — how full the
 * moat is — so cause and effect stay legible.
 */
export class Castle {
  readonly group = new Group()
  private readonly wheel = new Group()
  private readonly bridge = new Group()
  private readonly flags: Group[] = []
  private readonly flagCloth: Mesh[] = []
  private readonly fountain: Points
  private readonly fountainPos: Float32Array
  private readonly fountainVel: Float32Array
  private readonly fountainLife: Float32Array
  private readonly disposables: Array<{ dispose: () => void }> = []

  private wheelSpeed = 0
  private bridgeAngle = -Math.PI / 2
  private flagRaise = 0
  private fountainPower = 0
  private t = 0

  /** 0..1 — set by the game from moat fill. */
  activation = 0

  static readonly FOUNTAIN_MAX = 90

  constructor() {
    this.group.position.set(CASTLE_X, 0, CASTLE_Z)

    const mat = (c: string, rough = 0.86, flat = false) => {
      const m = new MeshStandardMaterial({
        color: new Color(c),
        roughness: rough,
        metalness: 0,
        flatShading: flat,
      })
      this.disposables.push(m)
      return m
    }
    const stone = mat(STONE)
    const stoneMid = mat(STONE_MID)
    const stoneDark = mat(STONE_DARK)
    const wood = mat(WOOD, 0.92)
    const woodDark = mat(WOOD_DARK, 0.92)

    const add = (geo: BufferGeometry, m: MeshStandardMaterial, parent: Object3D = this.group) => {
      this.disposables.push(geo)
      const mesh = new Mesh(geo, m)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    // --- island courtyard ------------------------------------------------
    const yard = add(new CircleGeometry(MOAT_INNER + 0.1, 32), mat('#d9c7a1', 0.99))
    yard.rotation.x = -Math.PI / 2
    yard.position.y = ISLAND_Y + 0.012
    yard.castShadow = false

    const plinth = add(new CylinderGeometry(1.12, 1.24, 0.2, 28), stoneMid)
    plinth.position.y = ISLAND_Y + 0.1

    // --- curtain wall with crenellations ---------------------------------
    const wall = add(new CylinderGeometry(1.04, 1.09, 0.52, 28, 1, true), stoneMid)
    wall.position.y = ISLAND_Y + 0.44
    const wallTop = add(new CylinderGeometry(1.12, 1.12, 0.08, 28), stoneDark)
    wallTop.position.y = ISLAND_Y + 0.72
    const merlonGeo = new BoxGeometry(0.16, 0.17, 0.14)
    this.disposables.push(merlonGeo)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      // leave the gate side open
      if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.45) continue
      const m = new Mesh(merlonGeo, stone)
      m.position.set(Math.cos(a) * 1.08, ISLAND_Y + 0.84, Math.sin(a) * 1.08)
      m.rotation.y = -a
      m.castShadow = true
      this.group.add(m)
    }

    // --- central keep ----------------------------------------------------
    const keep = add(new BoxGeometry(0.86, 0.9, 0.86), stone)
    keep.position.y = ISLAND_Y + 0.82
    const keepBand = add(new BoxGeometry(0.98, 0.11, 0.98), stoneDark)
    keepBand.position.y = ISLAND_Y + 1.29
    const keepRoof = add(new ConeGeometry(0.72, 1.12, 4), mat(ROOF_PINK, 0.7, true))
    keepRoof.position.y = ISLAND_Y + 1.86
    keepRoof.rotation.y = Math.PI / 4
    const finial = add(new SphereGeometry(0.075, 10, 8), mat(ROOF_GOLD, 0.5))
    finial.position.y = ISLAND_Y + 2.46

    // windows so the keep does not read as a plain box
    const winGeo = new BoxGeometry(0.13, 0.24, 0.04)
    this.disposables.push(winGeo)
    const winMat = mat('#5b4a34', 0.9)
    for (const [wx, wz, ry] of [
      [-0.44, 0.2, -Math.PI / 2],
      [-0.44, -0.2, -Math.PI / 2],
      [0.2, 0.44, 0],
    ] as Array<[number, number, number]>) {
      const wmesh = new Mesh(winGeo, winMat)
      wmesh.position.set(wx, ISLAND_Y + 0.92, wz)
      wmesh.rotation.y = ry
      this.group.add(wmesh)
    }

    // --- corner towers ---------------------------------------------------
    // Four towers placed off both sight lines: the game is only ever viewed
    // from -X (portrait) or +Z (landscape), and in each case the keep stays
    // framed between two towers instead of hidden behind one.
    const towerR = 1.02
    const towerAngles: Array<[number, string, string]> = [
      [0.96, ROOF_BLUE, ROOF_PINK],
      [2.18, ROOF_GOLD, ROOF_BLUE],
      [4.1, ROOF_BLUE, ROOF_GOLD],
      [5.32, ROOF_GOLD, ROOF_PINK],
    ]
    const towerSpots = towerAngles.map(
      ([a, r, f]) =>
        [Math.cos(a) * towerR, Math.sin(a) * towerR, r, f] as [number, number, string, string],
    )
    for (const [tx, tz, roofColor, flagColor] of towerSpots) {
      const t = add(new CylinderGeometry(0.23, 0.27, 1.06, 16), stone)
      t.position.set(tx, ISLAND_Y + 0.6, tz)
      const band = add(new CylinderGeometry(0.29, 0.29, 0.09, 16), stoneDark)
      band.position.set(tx, ISLAND_Y + 1.15, tz)
      // Tall, narrow spire: the shape has to survive being 40 px tall.
      const cap = add(new ConeGeometry(0.3, 0.8, 9), mat(roofColor, 0.72, true))
      cap.position.set(tx, ISLAND_Y + 1.56, tz)

      const flag = new Group()
      flag.position.set(tx, ISLAND_Y + 1.92, tz)
      const mast = add(new CylinderGeometry(0.02, 0.02, 0.5, 6), woodDark, flag)
      mast.position.y = 0.25
      const clothGeo = new BoxGeometry(0.3, 0.17, 0.014)
      this.disposables.push(clothGeo)
      const cloth = new Mesh(clothGeo, mat(flagColor, 0.6))
      cloth.position.set(0.16, 0.4, 0)
      cloth.castShadow = true
      flag.add(cloth)
      this.flagCloth.push(cloth)
      flag.scale.y = 0.02
      this.group.add(flag)
      this.flags.push(flag)
    }

    // --- gatehouse + drawbridge, facing the incoming river (-X) ----------
    const gate = add(new BoxGeometry(0.4, 0.98, 0.86), stone)
    gate.position.set(-1.0, ISLAND_Y + 0.5, 0)
    const gateRoof = add(new BoxGeometry(0.5, 0.12, 0.96), stoneDark)
    gateRoof.position.set(-1.0, ISLAND_Y + 1.05, 0)
    const doorway = add(new BoxGeometry(0.16, 0.5, 0.42), mat('#4d3b26', 0.95))
    doorway.position.set(-1.14, ISLAND_Y + 0.3, 0)

    const bridgeSpan = MOAT_OUTER - MOAT_INNER + 0.5
    this.bridge.position.set(-1.2, ISLAND_Y + 0.08, 0)
    this.group.add(this.bridge)
    const plank = add(new BoxGeometry(bridgeSpan, 0.07, 0.62), wood, this.bridge)
    plank.position.set(-bridgeSpan / 2, 0, 0)
    for (let i = 0; i < 5; i++) {
      const slat = add(new BoxGeometry(0.055, 0.09, 0.66), woodDark, this.bridge)
      slat.position.set(-0.18 - i * (bridgeSpan / 5.4), 0.01, 0)
    }
    this.bridge.rotation.z = -Math.PI / 2

    // --- water wheel, standing in the moat --------------------------------
    const wheelZ = -(MOAT_INNER + MOAT_OUTER) / 2
    this.wheel.position.set(0.1, ISLAND_Y - 0.02, wheelZ)
    this.wheel.rotation.y = Math.PI / 2
    this.group.add(this.wheel)
    const hub = add(new CylinderGeometry(0.09, 0.09, 0.36, 10), woodDark, this.wheel)
    hub.rotation.z = Math.PI / 2
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const paddle = add(
        new BoxGeometry(0.06, 0.26, 0.34),
        i % 2 === 0 ? wood : mat(ROOF_GOLD, 0.8),
        this.wheel,
      )
      paddle.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0)
      paddle.rotation.z = a
      const spoke = add(new BoxGeometry(0.035, 0.8, 0.035), woodDark, this.wheel)
      spoke.rotation.z = a
    }
    const rimGeo = new CylinderGeometry(0.47, 0.47, 0.025, 22, 1, true)
    this.disposables.push(rimGeo)
    for (const zz of [-0.17, 0.17]) {
      const rim = new Mesh(rimGeo, wood)
      rim.rotation.x = Math.PI / 2
      rim.position.z = zz
      rim.castShadow = true
      this.wheel.add(rim)
    }
    for (const s of [-1, 1]) {
      const post = add(new BoxGeometry(0.09, 0.9, 0.09), woodDark)
      post.position.set(0.1 + s * 0.3, ISLAND_Y - 0.42, wheelZ)
    }
    const beam = add(new BoxGeometry(0.7, 0.09, 0.09), woodDark)
    beam.position.set(0.1, ISLAND_Y - 0.02, wheelZ)

    // --- fountain particles ----------------------------------------------
    const n = Castle.FOUNTAIN_MAX
    this.fountainPos = new Float32Array(n * 3)
    this.fountainVel = new Float32Array(n * 3)
    this.fountainLife = new Float32Array(n)
    const fg = new BufferGeometry()
    fg.setAttribute('position', new BufferAttribute(this.fountainPos, 3))
    this.disposables.push(fg)
    const fm = new PointsMaterial({
      color: new Color('#cdeeff'),
      size: 0.07,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.disposables.push(fm)
    this.fountain = new Points(fg, fm)
    this.fountain.frustumCulled = false
    this.fountain.position.set(0, ISLAND_Y + 2.52, 0)
    this.fountain.visible = false
    this.group.add(this.fountain)
    for (let i = 0; i < n; i++) this.fountainPos[i * 3 + 1] = -999

    // --- pebble ring so the island edge has texture ------------------------
    const pebbleGeo = new SphereGeometry(0.09, 7, 5)
    this.disposables.push(pebbleGeo)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.2
      const p = new Mesh(pebbleGeo, i % 3 === 0 ? stoneDark : stoneMid)
      p.position.set(Math.cos(a) * (MOAT_INNER + 0.02), ISLAND_Y + 0.02, Math.sin(a) * (MOAT_INNER + 0.02))
      p.scale.set(1, 0.6, 1)
      p.castShadow = true
      p.receiveShadow = true
      this.group.add(p)
    }

    // --- a ring of little banner poles round the moat's outer bank --------
    const poleGeo = new CylinderGeometry(0.022, 0.022, 0.44, 6)
    this.disposables.push(poleGeo)
    const pennantGeo = new ConeGeometry(0.07, 0.2, 3)
    this.disposables.push(pennantGeo)
    const pennantMats = [mat(ROOF_PINK, 0.6, true), mat(ROOF_BLUE, 0.6, true), mat(ROOF_GOLD, 0.6, true)]
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5
      if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.5) continue
      const r = MOAT_OUTER + 0.28
      const pole = new Mesh(poleGeo, woodDark)
      pole.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r)
      pole.castShadow = true
      this.group.add(pole)
      const pen = new Mesh(pennantGeo, pennantMats[i % 3])
      pen.position.set(Math.cos(a) * r, 0.76, Math.sin(a) * r)
      pen.rotation.z = Math.PI / 2
      pen.castShadow = true
      this.group.add(pen)
    }
  }

  update(dt: number, calmMotion: boolean): void {
    this.t += dt
    const a = clamp(this.activation, 0, 1)

    // The wheel starts turning as soon as the moat has any real water in it.
    const targetSpeed = smoothstep(0.1, 0.6, a) * (calmMotion ? 1.1 : 2.4)
    this.wheelSpeed = damp(this.wheelSpeed, targetSpeed, 2.2, dt)
    this.wheel.rotation.z -= this.wheelSpeed * dt

    // Bridge drops once the moat is nearly full.
    const targetAngle = (-Math.PI / 2) * (1 - smoothstep(0.5, 0.95, a))
    this.bridgeAngle = damp(this.bridgeAngle, targetAngle, 3.4, dt)
    this.bridge.rotation.z = this.bridgeAngle

    // Flags run up their masts at the very end.
    this.flagRaise = damp(this.flagRaise, smoothstep(0.68, 1, a), 2.6, dt)
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].scale.y = Math.max(0.02, this.flagRaise)
      const cloth = this.flagCloth[i]
      const wave = calmMotion ? 0.04 : 0.13
      cloth.rotation.y = Math.sin(this.t * 3.1 + i) * wave
      cloth.scale.x = 1 + Math.sin(this.t * 4.2 + i * 1.7) * (calmMotion ? 0.03 : 0.1)
    }

    this.fountainPower = damp(this.fountainPower, smoothstep(0.82, 1, a), 2.2, dt)
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
        vel[i * 3 + 1] = 1.25 + Math.random() * 0.45
        vel[i * 3 + 2] = Math.sin(ang) * spread
        life[i] = 0.95 + Math.random() * 0.4
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

