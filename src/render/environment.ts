import {
  AmbientLight,
  BoxGeometry,
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
import { SAND_SIZE, SOURCE_X, SOURCE_Z } from '../core/config'
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
    const hemi = new HemisphereLight(0xdff2ff, 0xc9a875, 0.72)
    scene.add(hemi)
    const amb = new AmbientLight(0xffffff, 0.24)
    scene.add(amb)

    const sun = new DirectionalLight(0xfff2d8, 1.65)
    sun.position.set(-5.5, 9.5, 4.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 26
    sun.shadow.camera.left = -8
    sun.shadow.camera.right = 8
    sun.shadow.camera.top = 8
    sun.shadow.camera.bottom = -8
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
    const half = SAND_SIZE / 2
    const railW = 0.62
    const railH = 0.5
    const woodA = mat('#c98d55', 0.92)
    const woodB = mat('#b3773f', 0.92)
    const railGeo = geo(new BoxGeometry(SAND_SIZE + railW * 2, railH, railW))
    for (const s of [-1, 1]) {
      const r = new Mesh(railGeo, s < 0 ? woodA : woodB)
      r.position.set(0, 0.12, s * (half + railW / 2))
      r.castShadow = true
      r.receiveShadow = true
      frame.add(r)
    }
    const railGeo2 = geo(new BoxGeometry(railW, railH, SAND_SIZE))
    for (const s of [-1, 1]) {
      const r = new Mesh(railGeo2, s < 0 ? woodB : woodA)
      r.position.set(s * (half + railW / 2), 0.12, 0)
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
        c.position.set(sx * (half + railW / 2), 0.16, sz * (half + railW / 2))
        c.castShadow = true
        c.receiveShadow = true
        frame.add(c)
      }
    }
    // inner walls so you never see through the sand at the edges
    const wallGeo = geo(new BoxGeometry(SAND_SIZE, 1.4, 0.08))
    const wallMat = mat('#8d5f33', 1)
    for (const s of [-1, 1]) {
      const w = new Mesh(wallGeo, wallMat)
      w.position.set(0, -0.42, s * half)
      frame.add(w)
    }
    const wallGeo2 = geo(new BoxGeometry(0.08, 1.4, SAND_SIZE))
    for (const s of [-1, 1]) {
      const w = new Mesh(wallGeo2, wallMat)
      w.position.set(s * half, -0.42, 0)
      frame.add(w)
    }
    const floor = new Mesh(geo(new PlaneGeometry(SAND_SIZE, SAND_SIZE)), wallMat)
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

    // ---- wooden duck who looks where you should look -------------------
    const duck = new Group()
    duck.position.set(-half - 0.62, 0.42, half - 1.5)
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
