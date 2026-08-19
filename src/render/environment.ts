import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { SAND_X, SAND_Z, SOURCE_X, SOURCE_Z } from '../core/config'
import { makeRng } from '../core/rng'
import { damp } from '../core/util'

/**
 * Everything around the play surface: the wooden sandbox frame, the stone
 * water spout that anchors "the water starts here", the lights, and a small
 * wooden duck that looks at whatever the child should touch next.
 */
export class Environment {
  readonly sun: DirectionalLight
  readonly guide: Group
  private readonly duckHead: Object3D
  private readonly spoutRing: Mesh
  private readonly disposables: Array<{ dispose: () => void }> = []
  private lookTarget = new Vector3(0, 0.6, 0)
  private t = 0
  private ringPulse = 0

  constructor(scene: Scene) {
    const mat = (c: string, rough = 0.9, metal = 0) => {
      const m = new MeshStandardMaterial({ color: new Color(c), roughness: rough, metalness: metal })
      this.disposables.push(m)
      return m
    }
    const geo = <T extends { dispose: () => void }>(g: T): T => {
      this.disposables.push(g)
      return g
    }

    scene.background = new Color('#bfe4f2')

    // ---- lights --------------------------------------------------------
    const hemi = new HemisphereLight(0xdaf0ff, 0xc9a875, 0.5)
    scene.add(hemi)
    const amb = new AmbientLight(0xffffff, 0.13)
    scene.add(amb)

    const sun = new DirectionalLight(0xfff4dc, 1.55)
    sun.position.set(-6.5, 9.0, 5.5)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 26
    sun.shadow.camera.left = -9.5
    sun.shadow.camera.right = 9.5
    sun.shadow.camera.top = 7
    sun.shadow.camera.bottom = -7
    sun.shadow.bias = -0.0016
    sun.shadow.normalBias = 0.022
    scene.add(sun)
    scene.add(sun.target)
    sun.target.position.set(0.5, 0, 0)
    this.sun = sun

    // ---- ground outside the box (grass-ish mat) ------------------------
    const ground = new Mesh(geo(new PlaneGeometry(60, 60)), mat('#9ec97f', 1))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.36
    ground.receiveShadow = true
    scene.add(ground)

    // ---- wooden sandbox frame -----------------------------------------
    const frame = new Group()
    const halfX = SAND_X / 2
    const halfZ = SAND_Z / 2
    const railW = 0.56
    const railH = 0.5
    const woodA = mat('#c98d55', 0.92)
    const woodB = mat('#b3773f', 0.92)
    const railGeo = geo(new BoxGeometry(SAND_X + railW * 2, railH, railW))
    for (const s of [-1, 1]) {
      const r = new Mesh(railGeo, s < 0 ? woodA : woodB)
      r.position.set(0, 0.12, s * (halfZ + railW / 2))
      r.castShadow = true
      r.receiveShadow = true
      frame.add(r)
    }
    const railGeo2 = geo(new BoxGeometry(railW, railH, SAND_Z))
    for (const s of [-1, 1]) {
      const r = new Mesh(railGeo2, s < 0 ? woodB : woodA)
      r.position.set(s * (halfX + railW / 2), 0.12, 0)
      r.castShadow = true
      r.receiveShadow = true
      frame.add(r)
    }
    // corner caps to read as a real toy box
    const capGeo = geo(new BoxGeometry(railW * 1.25, railH * 1.2, railW * 1.25))
    const capMat = mat('#e0a86a', 0.9)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const c = new Mesh(capGeo, capMat)
        c.position.set(sx * (halfX + railW / 2), 0.16, sz * (halfZ + railW / 2))
        c.castShadow = true
        c.receiveShadow = true
        frame.add(c)
      }
    }
    // inner walls so you never see through the sand at the edges
    const wallGeo = geo(new BoxGeometry(SAND_X, 1.4, 0.08))
    const wallMat = mat('#8d5f33', 1)
    for (const s of [-1, 1]) {
      const w = new Mesh(wallGeo, wallMat)
      w.position.set(0, -0.42, s * halfZ)
      frame.add(w)
    }
    const wallGeo2 = geo(new BoxGeometry(0.08, 1.4, SAND_Z))
    for (const s of [-1, 1]) {
      const w = new Mesh(wallGeo2, wallMat)
      w.position.set(s * halfX, -0.42, 0)
      frame.add(w)
    }
    const floor = new Mesh(geo(new PlaneGeometry(SAND_X, SAND_Z)), wallMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.34
    frame.add(floor)
    scene.add(frame)

    // ---- stone spout at the source -------------------------------------
    const spout = new Group()
    spout.position.set(SOURCE_X - 0.05, 0, SOURCE_Z)
    const stone = mat('#b9b2a4', 0.95)
    const base = new Mesh(geo(new CylinderGeometry(0.5, 0.62, 0.34, 16)), stone)
    base.position.y = 0.98
    base.castShadow = true
    base.receiveShadow = true
    spout.add(base)
    const lip = new Mesh(geo(new TorusGeometry(0.5, 0.06, 8, 20)), mat('#cfc7b6', 0.9))
    lip.rotation.x = Math.PI / 2
    lip.position.y = 1.14
    lip.castShadow = true
    spout.add(lip)
    const ring = new Mesh(
      geo(new RingGeometry(0.62, 0.86, 28)),
      mat('#ffffff', 0.6),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 1.17
    ;(ring.material as MeshStandardMaterial).transparent = true
    ;(ring.material as MeshStandardMaterial).opacity = 0
    ;(ring.material as MeshStandardMaterial).emissive = new Color('#8fe3ff')
    ;(ring.material as MeshStandardMaterial).emissiveIntensity = 1.2
    spout.add(ring)
    this.spoutRing = ring
    scene.add(spout)

    // ---- garden dressing -------------------------------------------------
    // Wide screens leave grass above and below the sandbox; these props make
    // that space read as a garden rather than as empty margin.
    this.buildGarden(scene, mat, geo)

    // ---- wooden duck who looks where you should look -------------------
    const duck = new Group()
    duck.position.set(-halfX + 1.1, 0.42, halfZ + 0.62)
    duck.scale.setScalar(1.05)
    const body = new Mesh(geo(new SphereGeometry(0.3, 16, 12)), mat('#ffd166', 0.75))
    body.scale.set(1.25, 0.92, 1)
    body.castShadow = true
    duck.add(body)
    const tail = new Mesh(geo(new ConeGeometry(0.14, 0.24, 8)), mat('#ffd166', 0.75))
    tail.rotation.z = Math.PI / 2 + 0.5
    tail.position.set(-0.34, 0.08, 0)
    tail.castShadow = true
    duck.add(tail)
    const head = new Group()
    head.position.set(0.2, 0.24, 0)
    const skull = new Mesh(geo(new SphereGeometry(0.19, 14, 12)), mat('#ffd968', 0.75))
    skull.castShadow = true
    head.add(skull)
    const beak = new Mesh(geo(new ConeGeometry(0.09, 0.22, 10)), mat('#f4813f', 0.7))
    beak.rotation.z = -Math.PI / 2
    beak.position.set(0.2, -0.02, 0)
    head.add(beak)
    const eyeGeo = geo(new SphereGeometry(0.032, 8, 6))
    const eyeMat = mat('#3a2a18', 0.4)
    for (const s of [-1, 1]) {
      const e = new Mesh(eyeGeo, eyeMat)
      e.position.set(0.1, 0.06, s * 0.11)
      head.add(e)
    }
    duck.add(head)
    this.duckHead = head
    scene.add(duck)
    this.guide = duck
  }

  private buildGarden(
    scene: Scene,
    mat: (c: string, rough?: number, metal?: number) => MeshStandardMaterial,
    geo: <T extends { dispose: () => void }>(g: T) => T,
  ): void {
    const halfX = SAND_X / 2
    const halfZ = SAND_Z / 2
    const rng = makeRng(20250819)
    const garden = new Group()
    const GROUND = -0.355

    // Soft patches of a slightly different green break up the flat lawn.
    const patchGeo = geo(new CircleGeometry(1, 18))
    const patchMats = [mat('#93c176', 1), mat('#a6cf87', 1), mat('#88b96d', 1)]
    for (let i = 0; i < 16; i++) {
      const x = (rng() - 0.5) * (SAND_X + 14)
      const z = (rng() - 0.5) * (SAND_Z + 13)
      if (Math.abs(x) < halfX + 1.2 && Math.abs(z) < halfZ + 1.2) continue
      const p = new Mesh(patchGeo, patchMats[i % 3])
      p.rotation.x = -Math.PI / 2
      p.position.set(x, GROUND + 0.002 + i * 0.0004, z)
      p.scale.set(1.6 + rng() * 2.6, 1.2 + rng() * 1.8, 1)
      garden.add(p)
    }

    // Low rounded clumps hugging the outside of the rails.
    const clumpGeo = geo(new SphereGeometry(0.3, 10, 7))
    const clumpMats = [mat('#8cc06f', 0.98), mat('#9ecd80', 0.98), mat('#7cb463', 0.98)]
    for (let i = 0; i < 34; i++) {
      const alongRail = rng() < 0.62
      let x: number
      let z: number
      if (alongRail) {
        x = (rng() - 0.5) * (SAND_X + 2.4)
        z = (halfZ + 0.95 + rng() * 1.5) * (rng() < 0.5 ? -1 : 1)
      } else {
        x = (halfX + 0.95 + rng() * 1.8) * (rng() < 0.5 ? -1 : 1)
        z = (rng() - 0.5) * (SAND_Z + 4.5)
      }
      const c = new Mesh(clumpGeo, clumpMats[i % 3])
      const sc = 0.55 + rng() * 0.7
      c.position.set(x, GROUND + 0.06 * sc, z)
      c.scale.set(sc * 1.3, sc * 0.72, sc * 1.15)
      c.castShadow = true
      c.receiveShadow = true
      garden.add(c)
    }

    // A striped ball and a bucket: familiar sandbox company.
    const ball = new Mesh(geo(new SphereGeometry(0.46, 18, 14)), mat('#ff9ec4', 0.5))
    ball.position.set(halfX + 1.35, GROUND + 0.46, halfZ + 1.0)
    ball.castShadow = true
    garden.add(ball)
    const ballBand = new Mesh(
      geo(new SphereGeometry(0.466, 18, 8, 0, Math.PI * 2, 1.2, 0.45)),
      mat('#fffdf5', 0.5),
    )
    ballBand.position.copy(ball.position)
    garden.add(ballBand)

    const bucket = new Group()
    bucket.position.set(-halfX - 1.3, GROUND, -halfZ - 1.0)
    bucket.rotation.y = 0.5
    const bucketBody = new Mesh(geo(new CylinderGeometry(0.4, 0.31, 0.58, 16)), mat('#6fc7ea', 0.5))
    bucketBody.position.y = 0.29
    bucketBody.castShadow = true
    bucket.add(bucketBody)
    const bucketRim = new Mesh(geo(new TorusGeometry(0.4, 0.045, 8, 18)), mat('#3f9fca', 0.5))
    bucketRim.rotation.x = Math.PI / 2
    bucketRim.position.y = 0.58
    bucket.add(bucketRim)
    const bucketHandle = new Mesh(
      geo(new TorusGeometry(0.38, 0.035, 6, 16, Math.PI)),
      mat('#3f9fca', 0.5),
    )
    bucketHandle.position.y = 0.58
    bucketHandle.rotation.y = Math.PI / 2
    bucketHandle.castShadow = true
    bucket.add(bucketHandle)
    garden.add(bucket)

    // A few pebbles so the lawn has some grain of its own.
    const pebbleGeo = geo(new SphereGeometry(0.14, 8, 6))
    const pebbleMat = mat('#c6bfae', 0.98)
    for (let i = 0; i < 14; i++) {
      const x = (rng() - 0.5) * (SAND_X + 9)
      const z = (rng() - 0.5) * (SAND_Z + 9)
      if (Math.abs(x) < halfX + 1 && Math.abs(z) < halfZ + 1) continue
      const p = new Mesh(pebbleGeo, pebbleMat)
      p.position.set(x, GROUND + 0.05, z)
      p.scale.set(1 + rng() * 0.6, 0.55, 1 + rng() * 0.5)
      p.castShadow = true
      garden.add(p)
    }

    scene.add(garden)
  }

  /** Point the duck's head (and interest) at a world position. */
  lookAt(x: number, y: number, z: number): void {
    this.lookTarget.set(x, y, z)
  }

  /** Glow the source ring — used while we are inviting the first pour. */
  setSourceHint(on: boolean): void {
    this.ringPulse = on ? 1 : 0
  }

  update(dt: number, calmMotion: boolean): void {
    this.t += dt
    const head = this.duckHead
    const world = this.guide.position
    const dx = this.lookTarget.x - world.x
    const dz = this.lookTarget.z - world.z
    const want = Math.atan2(-dz, dx)
    head.rotation.y = damp(head.rotation.y, want, 4, dt)
    const bob = calmMotion ? 0.01 : 0.03
    this.guide.position.y = 0.42 + Math.sin(this.t * 1.7) * bob

    const m = this.spoutRing.material as MeshStandardMaterial
    const targetOpacity = this.ringPulse > 0 ? 0.32 + Math.sin(this.t * 3.4) * 0.22 : 0
    m.opacity = damp(m.opacity, Math.max(0, targetOpacity), 6, dt)
    this.spoutRing.visible = m.opacity > 0.01
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
  }
}
