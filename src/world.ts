import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  INNER_X,
  INNER_Z,
  WALL,
  FLOOR_Y,
  RIM_Y,
  BISCUIT_LEN,
  BISCUIT_W,
  BISCUIT_H,
  CREAM_H,
  SLOTS,
  biscuitBaseY,
  biscuitTopY,
  CONTENT_TOP,
  CUT_X,
  CUT_Z,
  TRAY_POS,
  TRAY_R,
  COFFEE_Y,
  FRIDGE_POS,
} from './metrics'
import {
  makeNoiseTexture,
  makeBiscuitMaterial,
  makeStripeMaterial,
  makeGlassMaterial,
  makeDotTexture,
  DISH_TINTS,
  BiscuitMat,
} from './materials'
import { CreamLayer, CocoaSurface } from './cream'
import { randRange } from './rng'
import { sfx } from './audio'
import { clamp } from './tween'

export interface Biscuit {
  mesh: THREE.Mesh
  uniforms: BiscuitMat['uniforms']
  soak: number
}

interface Drip {
  mesh: THREE.Mesh
  vy: number
  active: boolean
  landY: number
}

interface Ripple {
  mesh: THREE.Mesh
  t: number
  active: boolean
}

const COCOA_N = 420

export class World {
  scene = new THREE.Scene()
  containerGroup = new THREE.Group()
  contents = new THREE.Group()
  noiseTex: THREE.Texture
  biscuitGeo: THREE.BufferGeometry
  creamLayers: CreamLayer[] = []
  cocoaSurface = new CocoaSurface()
  placed: (Biscuit | null)[][] = [
    [null, null, null, null],
    [null, null, null, null],
  ]

  // tools
  bag = new THREE.Group()
  spatula = new THREE.Group()
  sieve = new THREE.Group()
  knife = new THREE.Group()
  server = new THREE.Group()

  // fridge
  fridge = new THREE.Group()
  private fridgeDoor = new THREE.Group()

  // slice
  sliceGroup = new THREE.Group()
  private sliceWalls: THREE.Mesh[] = []
  private seam!: THREE.Mesh
  private stripeMat: THREE.MeshStandardMaterial

  slotGhost: THREE.Mesh
  wobbleAmp = 0
  private time = 0

  private ripples: Ripple[] = []
  private drips: Drip[] = []
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()

  // cocoa particles
  private cocoaPts: THREE.Points
  private cocoaPos: Float32Array
  private cocoaVel: Float32Array
  private cocoaAlive: Uint8Array
  private cocoaLandY = CONTENT_TOP + 0.13

  // sparkles
  private sparkPts: THREE.Points
  private sparkPos: Float32Array
  private sparkVel: Float32Array
  private sparkLife: Float32Array

  private glassMats: THREE.MeshPhysicalMaterial[] = []

  constructor(public tintIndex: number, fast: boolean) {
    const bg = new THREE.Color('#f6e7d3')
    this.scene.background = bg
    this.scene.fog = new THREE.Fog(bg, 14, 30)

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0xb98a5e, 1.15)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff2df, 2.2)
    key.position.set(2.5, 6, 3.4)
    key.castShadow = !fast
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -5
    key.shadow.camera.right = 5.5
    key.shadow.camera.top = 5
    key.shadow.camera.bottom = -4
    key.shadow.camera.far = 20
    key.shadow.bias = -0.0006
    key.shadow.radius = 4
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5)
    fill.position.set(-3.5, 2.5, -2.5)
    this.scene.add(fill)

    // ---------- table ----------
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: 0xc9a06d, roughness: 0.92 }),
    )
    table.rotation.x = -Math.PI / 2
    table.receiveShadow = true
    this.scene.add(table)
    const mat1 = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 40),
      new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.85 }),
    )
    mat1.rotation.x = -Math.PI / 2
    mat1.position.y = 0.005
    mat1.receiveShadow = true
    this.scene.add(mat1)
    const mat2 = mat1.clone()
    mat2.scale.setScalar(0.62)
    mat2.position.set(TRAY_POS.x, 0.005, TRAY_POS.z)
    this.scene.add(mat2)

    this.noiseTex = makeNoiseTexture()
    this.stripeMat = makeStripeMaterial(this.noiseTex)
    this.biscuitGeo = new RoundedBoxGeometry(BISCUIT_LEN, BISCUIT_H, BISCUIT_W, 3, 0.09)

    // ---------- coffee tray ----------
    const tray = new THREE.Group()
    tray.position.set(TRAY_POS.x, 0, TRAY_POS.z)
    // open bowl so the dark coffee inside is always visible
    const dishWall = new THREE.Mesh(
      new THREE.CylinderGeometry(TRAY_R + 0.16, TRAY_R - 0.02, 0.32, 36, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.5, side: THREE.DoubleSide }),
    )
    dishWall.position.y = 0.16
    dishWall.castShadow = true
    tray.add(dishWall)
    const dishBottom = new THREE.Mesh(
      new THREE.CircleGeometry(TRAY_R + 0.0, 36),
      new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.55 }),
    )
    dishBottom.rotation.x = -Math.PI / 2
    dishBottom.position.y = 0.02
    tray.add(dishBottom)
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(TRAY_R + 0.05, 36),
      new THREE.MeshStandardMaterial({ color: 0x2c1a0d, roughness: 0.14, metalness: 0.1 }),
    )
    coffee.rotation.x = -Math.PI / 2
    coffee.position.y = COFFEE_Y
    tray.add(coffee)
    this.scene.add(tray)

    // ripple pool
    const ripGeo = new THREE.RingGeometry(0.09, 0.13, 28)
    ripGeo.rotateX(-Math.PI / 2)
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        ripGeo,
        new THREE.MeshBasicMaterial({ color: 0x8a6a48, transparent: true, opacity: 0, depthWrite: false }),
      )
      m.position.y = COFFEE_Y + 0.005
      m.visible = false
      tray.add(m)
      this.ripples.push({ mesh: m, t: 0, active: false })
    }

    // drip pool
    const dripGeo = new THREE.SphereGeometry(0.022, 8, 8)
    const dripMat = new THREE.MeshStandardMaterial({ color: 0x3a2413, roughness: 0.2 })
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(dripGeo, dripMat)
      m.visible = false
      this.scene.add(m)
      this.drips.push({ mesh: m, vy: 0, active: false, landY: COFFEE_Y })
    }

    // ---------- glass container ----------
    this.scene.add(this.containerGroup)
    const tint = DISH_TINTS[this.tintIndex % DISH_TINTS.length]
    const glass = makeGlassMaterial(tint)
    this.glassMats.push(glass)
    const wallH = RIM_Y
    const mkWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass)
      m.position.set(x, y, z)
      m.renderOrder = 6
      this.containerGroup.add(m)
      return m
    }
    const ox = INNER_X / 2 + WALL / 2
    const oz = INNER_Z / 2 + WALL / 2
    mkWall(INNER_X + WALL * 2, wallH, WALL, 0, wallH / 2, oz)
    mkWall(INNER_X + WALL * 2, wallH, WALL, 0, wallH / 2, -oz)
    mkWall(WALL, wallH, INNER_Z, ox, wallH / 2, 0)
    mkWall(WALL, wallH, INNER_Z, -ox, wallH / 2, 0)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(INNER_X + WALL * 2, FLOOR_Y, INNER_Z + WALL * 2),
      new THREE.MeshPhysicalMaterial({
        color: tint,
        transparent: true,
        opacity: 0.22,
        roughness: 0.15,
      }),
    )
    floor.position.y = FLOOR_Y / 2
    floor.receiveShadow = true
    this.containerGroup.add(floor)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(INNER_X + WALL * 2, wallH, INNER_Z + WALL * 2)),
      new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.55 }),
    )
    edges.position.y = wallH / 2
    this.containerGroup.add(edges)

    this.containerGroup.add(this.contents)

    // ---------- cream layers ----------
    const cl0 = new CreamLayer(biscuitTopY(0), null)
    const cl1 = new CreamLayer(biscuitTopY(1), this.cocoaSurface.texture)
    this.creamLayers = [cl0, cl1]
    this.contents.add(cl0.group, cl1.group)

    // ---------- slot ghost ----------
    const ghostGeo = new RoundedBoxGeometry(BISCUIT_LEN + 0.1, BISCUIT_H + 0.04, BISCUIT_W + 0.08, 2, 0.1)
    this.slotGhost = new THREE.Mesh(
      ghostGeo,
      new THREE.MeshBasicMaterial({ color: 0xffc75e, transparent: true, opacity: 0.3, depthWrite: false }),
    )
    this.slotGhost.rotation.y = Math.PI / 2
    this.slotGhost.visible = false
    this.slotGhost.renderOrder = 7
    this.contents.add(this.slotGhost)

    // ---------- slice (pre-split corner piece, hidden until the cut) ----------
    this.buildSlice()

    // ---------- tools ----------
    this.buildTools()

    // ---------- fridge ----------
    this.buildFridge()

    // ---------- cocoa particles ----------
    this.cocoaPos = new Float32Array(COCOA_N * 3)
    this.cocoaVel = new Float32Array(COCOA_N * 3)
    this.cocoaAlive = new Uint8Array(COCOA_N)
    const cGeo = new THREE.BufferGeometry()
    cGeo.setAttribute('position', new THREE.BufferAttribute(this.cocoaPos, 3))
    this.cocoaPts = new THREE.Points(
      cGeo,
      new THREE.PointsMaterial({
        size: 0.05,
        map: makeDotTexture('#6b4a2e'),
        color: 0x6b4a2e,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    this.cocoaPts.frustumCulled = false
    this.cocoaPts.visible = false
    this.scene.add(this.cocoaPts)
    for (let i = 0; i < COCOA_N; i++) this.cocoaPos[i * 3 + 1] = -10

    // ---------- sparkles ----------
    const SP = 90
    this.sparkPos = new Float32Array(SP * 3)
    this.sparkVel = new Float32Array(SP * 3)
    this.sparkLife = new Float32Array(SP)
    const sGeo = new THREE.BufferGeometry()
    sGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3))
    this.sparkPts = new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({
        size: 0.09,
        map: makeDotTexture('#ffe9a8'),
        color: 0xffd975,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.sparkPts.frustumCulled = false
    this.sparkPts.visible = false
    this.scene.add(this.sparkPts)
    for (let i = 0; i < SP; i++) this.sparkPos[i * 3 + 1] = -10
  }

  // ================================================================
  private buildSlice() {
    const w = 1.145 - 0.585
    const d = 0.82 - 0.01
    const boxGeo = new THREE.BoxGeometry(w, CONTENT_TOP - FLOOR_Y, d)
    boxGeo.translate(0, (CONTENT_TOP - FLOOR_Y) / 2, 0)
    const box = new THREE.Mesh(boxGeo, this.stripeMat)
    box.position.set((0.585 + 1.145) / 2, FLOOR_Y, (0.01 + 0.82) / 2)
    box.castShadow = true

    const topTex = this.cocoaSurface.texture.clone()
    topTex.colorSpace = THREE.SRGBColorSpace
    topTex.offset.set(0.754, 0.003)
    topTex.repeat.set(0.243, 0.491)
    const topGeo = new THREE.PlaneGeometry(w - 0.005, d - 0.005)
    topGeo.rotateX(-Math.PI / 2)
    const top = new THREE.Mesh(
      topGeo,
      new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.75 }),
    )
    top.position.set(box.position.x, CONTENT_TOP + 0.004, box.position.z)

    this.sliceGroup.add(box, top)
    this.sliceGroup.visible = false
    this.contents.add(this.sliceGroup)

    // striped faces of the void left behind
    const h = CONTENT_TOP - FLOOR_Y
    const wallXGeo = new THREE.PlaneGeometry(d, h)
    wallXGeo.rotateY(Math.PI / 2)
    wallXGeo.translate(0, h / 2, 0)
    const wallX = new THREE.Mesh(wallXGeo, this.stripeMat)
    wallX.position.set(CUT_X + 0.004, FLOOR_Y, (0.01 + 0.82) / 2)
    const wallZGeo = new THREE.PlaneGeometry(w, h)
    wallZGeo.translate(0, h / 2, 0)
    const wallZ = new THREE.Mesh(wallZGeo, this.stripeMat)
    wallZ.position.set((0.585 + 1.145) / 2, FLOOR_Y, CUT_Z + 0.004)
    wallX.visible = wallZ.visible = false
    this.sliceWalls = [wallX, wallZ]
    this.contents.add(wallX, wallZ)

    // cut seam that grows down the front face while the knife moves
    const seamGeo = new THREE.PlaneGeometry(0.035, 1)
    seamGeo.translate(0, -0.5, 0)
    this.seam = new THREE.Mesh(
      seamGeo,
      new THREE.MeshBasicMaterial({ color: 0x2a180c, transparent: true, opacity: 0.85 }),
    )
    this.seam.position.set(CUT_X, CONTENT_TOP + 0.01, INNER_Z / 2 + 0.005)
    this.seam.scale.y = 0.001
    this.seam.visible = false
    this.contents.add(this.seam)
  }

  private buildTools() {
    // piping bag
    const bagBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.78, 20),
      new THREE.MeshStandardMaterial({ color: 0xf2b8c6, roughness: 0.55 }),
    )
    bagBody.rotation.x = Math.PI
    bagBody.position.y = 0.62
    const bagTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      bagBody.material,
    )
    bagTop.position.y = 1.05
    bagTop.scale.set(1, 0.72, 1)
    const nozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.3, metalness: 0.7 }),
    )
    nozzle.rotation.x = Math.PI
    nozzle.position.y = 0.14
    this.bag.add(bagBody, bagTop, nozzle)
    this.bag.rotation.z = 0.22

    // spatula
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.025, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.28, metalness: 0.35 }),
    )
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 }),
    )
    handle.rotation.z = Math.PI / 2 - 0.35
    handle.position.set(0.62, 0.16, 0)
    this.spatula.add(blade, handle)

    // sieve
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.16, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xe4e6ea,
        roughness: 0.35,
        metalness: 0.4,
        side: THREE.DoubleSide,
      }),
    )
    const meshDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 24),
      new THREE.MeshStandardMaterial({ color: 0xbfbfc4, roughness: 0.6, metalness: 0.5 }),
    )
    meshDisc.rotation.x = -Math.PI / 2
    meshDisc.position.y = -0.07
    const powder = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }),
    )
    powder.rotation.x = -Math.PI / 2
    powder.position.y = 0.02
    const sHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.35, metalness: 0.75 }),
    )
    sHandle.rotation.z = Math.PI / 2
    sHandle.position.set(0.58, 0, 0)
    this.sieve.add(rim, meshDisc, powder, sHandle)

    // knife (seen edge-on from the cut camera)
    const kBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 1.05, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.25, metalness: 0.4 }),
    )
    const kHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.36, 10),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.55 }),
    )
    kHandle.position.y = 0.7
    this.knife.add(kBlade, kHandle)

    // cake server
    const sBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.022, 0.86),
      new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.28, metalness: 0.35 }),
    )
    const svHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 }),
    )
    svHandle.rotation.x = Math.PI / 2 - 0.3
    svHandle.position.set(0, 0.12, 0.62)
    this.server.add(sBlade, svHandle)

    for (const t of [this.bag, this.spatula, this.sieve, this.knife, this.server]) {
      t.visible = false
      t.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true
      })
      this.scene.add(t)
    }
  }

  private buildFridge() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.4, metalness: 0.15 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 1.4), bodyMat)
    body.position.y = 1.3
    body.castShadow = true
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 2.4, 1.15),
      new THREE.MeshStandardMaterial({ color: 0xf4f8fa, roughness: 0.8 }),
    )
    inner.position.set(0, 1.3, 0.1)
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.04, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xcfd8dd, roughness: 0.5 }),
    )
    shelf.position.set(0, 0.75, 0.12)
    const shelf2 = shelf.clone()
    shelf2.position.y = 1.75
    this.fridge.add(body, inner, shelf, shelf2)

    // door hinged on its left edge
    this.fridgeDoor.position.set(-0.9, 0, 0.72)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.1), bodyMat)
    door.position.set(0.9, 1.3, 0.05)
    door.castShadow = true
    const dHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.3, metalness: 0.6 }),
    )
    dHandle.position.set(1.65, 1.5, 0.14)
    this.fridgeDoor.add(door, dHandle)
    this.fridge.add(this.fridgeDoor)

    this.fridge.position.set(FRIDGE_POS.x, 0, FRIDGE_POS.z)
    this.fridge.rotation.y = Math.atan2(0 - FRIDGE_POS.x, 0 - FRIDGE_POS.z)
    this.fridge.visible = false // only shown for the chilling beat
    this.scene.add(this.fridge)
  }

  // ================================================================
  setFridgeDoor(open01: number) {
    this.fridgeDoor.rotation.y = -1.9 * open01
  }

  fridgeInsidePos(): THREE.Vector3 {
    return this.fridge.localToWorld(new THREE.Vector3(0, 0.79, 0.15))
  }

  spawnBiscuit(): Biscuit {
    const { mat, uniforms } = makeBiscuitMaterial(this.noiseTex)
    const mesh = new THREE.Mesh(this.biscuitGeo, mat)
    mesh.castShadow = true
    this.scene.add(mesh)
    return { mesh, uniforms, soak: 0 }
  }

  setSoak(b: Biscuit, v: number) {
    b.soak = clamp(v, 0, 1)
    b.uniforms.uSoak.value = b.soak
  }

  setBend(b: Biscuit, v: number) {
    b.uniforms.uBend.value = v
  }

  slotPos(layer: number, slot: number): THREE.Vector3 {
    return new THREE.Vector3(SLOTS[slot], biscuitBaseY(layer) + BISCUIT_H / 2, 0)
  }

  /** Move a placed biscuit into the container's content group. */
  adoptBiscuit(b: Biscuit, layer: number, slot: number) {
    this.scene.remove(b.mesh)
    this.contents.add(b.mesh)
    b.mesh.position.copy(this.slotPos(layer, slot))
    b.mesh.rotation.set(0, Math.PI / 2, 0)
    this.placed[layer][slot] = b
    this.setBend(b, b.soak * 0.2)
  }

  showSlotGhost(layer: number, slot: number, on: boolean) {
    this.slotGhost.visible = on
    if (on) this.slotGhost.position.copy(this.slotPos(layer, slot))
  }

  ripple(worldX: number, worldZ: number) {
    const r = this.ripples.find((r) => !r.active)
    if (!r) return
    r.active = true
    r.t = 0
    r.mesh.visible = true
    r.mesh.position.x = worldX - TRAY_POS.x
    r.mesh.position.z = worldZ - TRAY_POS.z
    const maxR = TRAY_R - 0.15
    const d = Math.hypot(r.mesh.position.x, r.mesh.position.z)
    if (d > maxR) {
      r.mesh.position.x *= maxR / d
      r.mesh.position.z *= maxR / d
    }
  }

  dripAt(x: number, y: number, z: number, landY = COFFEE_Y) {
    const d = this.drips.find((d) => !d.active)
    if (!d) return
    d.active = true
    d.mesh.visible = true
    d.mesh.position.set(x, y, z)
    d.vy = 0
    d.landY = landY
  }

  emitCocoa(cx: number, cz: number, n: number) {
    this.cocoaPts.visible = true
    let emitted = 0
    for (let i = 0; i < COCOA_N && emitted < n; i++) {
      if (this.cocoaAlive[i]) continue
      this.cocoaAlive[i] = 1
      const a = randRange(0, Math.PI * 2)
      const rr = Math.sqrt(randRange(0, 1)) * 0.45
      this.cocoaPos[i * 3] = cx + Math.cos(a) * rr
      this.cocoaPos[i * 3 + 1] = 1.75 + randRange(-0.05, 0.05)
      this.cocoaPos[i * 3 + 2] = cz + Math.sin(a) * rr
      this.cocoaVel[i * 3] = randRange(-0.06, 0.06)
      this.cocoaVel[i * 3 + 1] = randRange(-0.25, -0.05)
      this.cocoaVel[i * 3 + 2] = randRange(-0.06, 0.06)
      emitted++
    }
  }

  burstSparkles(center: THREE.Vector3) {
    this.sparkPts.visible = true
    const n = this.sparkLife.length
    for (let i = 0; i < n; i++) {
      this.sparkLife[i] = randRange(0.7, 1.3)
      this.sparkPos[i * 3] = center.x + randRange(-0.15, 0.15)
      this.sparkPos[i * 3 + 1] = center.y + randRange(-0.1, 0.15)
      this.sparkPos[i * 3 + 2] = center.z + randRange(-0.15, 0.15)
      const a = randRange(0, Math.PI * 2)
      const sp = randRange(0.5, 1.6)
      this.sparkVel[i * 3] = Math.cos(a) * sp
      this.sparkVel[i * 3 + 1] = randRange(0.6, 2.0)
      this.sparkVel[i * 3 + 2] = Math.sin(a) * sp
    }
  }

  /** Swap the corner into the pre-split slice + void walls. */
  prepareSlice() {
    for (const layer of [0, 1]) {
      const b = this.placed[layer][3]
      if (b) {
        b.mesh.scale.x = 0.485
        b.mesh.position.z = -0.377
      }
    }
    for (const cl of this.creamLayers) cl.setVoid(true)
    this.sliceGroup.visible = true
    for (const w of this.sliceWalls) w.visible = true
    this.seam.visible = true
    this.seam.scale.y = 0.001
  }

  setSeamProgress(p: number) {
    this.seam.scale.y = Math.max(0.001, p * (CONTENT_TOP - FLOOR_Y + 0.02))
  }

  openSliceGap() {
    this.sliceGroup.position.x += 0.018
    this.sliceGroup.position.z += 0.02
    this.seam.visible = false
  }

  // ================================================================
  pickPlane(
    camera: THREE.Camera,
    clientX: number,
    clientY: number,
    plane: THREE.Plane,
    out: THREE.Vector3,
  ): boolean {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, camera)
    return this.raycaster.ray.intersectPlane(plane, out) !== null
  }

  toScreen(v: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } {
    const p = v.clone().project(camera)
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    }
  }

  /** Screen-up direction mapped onto a horizontal world plane. */
  screenUpOnGround(camera: THREE.Camera): THREE.Vector3 {
    const fwd = new THREE.Vector3()
    camera.getWorldDirection(fwd)
    const up = new THREE.Vector3(0, 1, 0)
    const upScreen = up.clone().addScaledVector(fwd, -up.dot(fwd))
    upScreen.y = 0
    if (upScreen.lengthSq() < 1e-6) upScreen.set(0, 0, -1)
    return upScreen.normalize()
  }

  // ================================================================
  update(dt: number) {
    this.time += dt

    // ripples
    for (const r of this.ripples) {
      if (!r.active) continue
      r.t += dt
      const k = r.t / 0.9
      if (k >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      const s = 1 + k * 5
      r.mesh.scale.set(s, 1, s)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k)
    }

    // drips
    for (const d of this.drips) {
      if (!d.active) continue
      d.vy -= 9.5 * dt
      d.mesh.position.y += d.vy * dt
      if (d.mesh.position.y <= d.landY) {
        d.active = false
        d.mesh.visible = false
        const dx = d.mesh.position.x - TRAY_POS.x
        const dz = d.mesh.position.z - TRAY_POS.z
        if (Math.hypot(dx, dz) < TRAY_R) {
          this.ripple(d.mesh.position.x, d.mesh.position.z)
          sfx.drip()
        }
      }
    }

    // cocoa particles
    let anyCocoa = false
    for (let i = 0; i < COCOA_N; i++) {
      if (!this.cocoaAlive[i]) continue
      anyCocoa = true
      this.cocoaVel[i * 3 + 1] -= 2.1 * dt
      this.cocoaPos[i * 3] += this.cocoaVel[i * 3] * dt + Math.sin(this.time * 16 + i) * 0.008 * dt * 60
      this.cocoaPos[i * 3 + 1] += this.cocoaVel[i * 3 + 1] * dt
      this.cocoaPos[i * 3 + 2] += this.cocoaVel[i * 3 + 2] * dt
      if (this.cocoaPos[i * 3 + 1] <= this.cocoaLandY) {
        this.cocoaAlive[i] = 0
        this.cocoaPos[i * 3 + 1] = -10
        const x = this.cocoaPos[i * 3]
        const z = this.cocoaPos[i * 3 + 2]
        if (Math.abs(x) < INNER_X / 2 && Math.abs(z) < INNER_Z / 2) {
          this.cocoaSurface.dust(x, z)
        }
      }
    }
    if (anyCocoa) {
      ;(this.cocoaPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    }

    // sparkles
    let anySpark = false
    for (let i = 0; i < this.sparkLife.length; i++) {
      if (this.sparkLife[i] <= 0) continue
      anySpark = true
      this.sparkLife[i] -= dt
      this.sparkVel[i * 3 + 1] -= 2.5 * dt
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -10
    }
    if (anySpark) {
      ;(this.sparkPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    } else {
      this.sparkPts.visible = false
    }

    // ghost pulse
    if (this.slotGhost.visible) {
      const m = this.slotGhost.material as THREE.MeshBasicMaterial
      m.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(this.time * 5))
    }

    // soft jelly wobble before chilling
    if (this.wobbleAmp > 0.0001) {
      const s = Math.sin(this.time * 9)
      this.contents.scale.set(1 - this.wobbleAmp * 0.5 * s, 1 + this.wobbleAmp * s, 1 - this.wobbleAmp * 0.5 * s)
    } else {
      this.contents.scale.set(1, 1, 1)
    }

    for (const cl of this.creamLayers) {
      cl.updateSlab()
      cl.flushTexture()
    }
    this.cocoaSurface.flushTexture()
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.LineSegments).isLineSegments) {
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const mat of mats) {
          if (!mat) continue
          for (const key of Object.keys(mat)) {
            const val = (mat as any)[key]
            if (val && val.isTexture) val.dispose()
          }
          mat.dispose()
        }
      }
    })
    this.scene.clear()
  }
}
