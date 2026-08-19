import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
} from 'three'
import { ToolId, ToolModel, createTool } from './toolModels'
import { CASTLE_X, CASTLE_Z, MOAT_OUTER, SOURCE_X, SOURCE_Z } from '../core/config'
import { Terrain } from '../game/terrain'
import { clamp, damp } from '../core/util'

/**
 * The tool the child is actually holding, shown in the sand at the contact
 * point. It appears on touch and settles away on release, so the sand is never
 * permanently covered by a floating object.
 */
export class WorldTool {
  private readonly models = new Map<ToolId, ToolModel>()
  private readonly holder = new Group()
  private readonly ring: Mesh
  private current: ToolId = 'dig'
  private show = 0
  private x = 0
  private z = 0
  private y = 0
  private tilt = 0
  private wobble = 0
  private t = 0

  constructor(scene: Scene) {
    for (const id of ['dig', 'mound', 'pour'] as ToolId[]) {
      const m = createTool(id)
      m.group.visible = false
      m.group.scale.setScalar(0.95)
      this.holder.add(m.group)
      this.models.set(id, m)
    }
    scene.add(this.holder)

    this.ring = new Mesh(
      new RingGeometry(0.2, 0.3, 28),
      new MeshBasicMaterial({
        color: new Color('#ffffff'),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.renderOrder = 5
    scene.add(this.ring)
  }

  setTool(id: ToolId): void {
    this.current = id
  }

  /** Place the tool at a sand contact point. */
  place(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    this.x = x
    this.z = z
    this.y = y
    this.show = 1
    const speed = Math.hypot(dirX, dirZ)
    this.tilt = clamp(speed * 2.4, 0, 0.55)
    this.wobble = Math.atan2(dirX, -dirZ)
  }

  release(): void {
    this.show = 0
  }

  update(dt: number, terrain: Terrain, calmMotion: boolean): void {
    this.t += dt
    for (const [id, m] of this.models) {
      const active = id === this.current
      m.group.visible = active && this.holder.scale.x > 0.02
    }
    const s = damp(this.holder.scale.x, this.show, 11, dt)
    this.holder.scale.setScalar(Math.max(0.001, s))
    this.holder.visible = s > 0.02

    const ground = terrain.heightAt(this.x, this.z)
    const model = this.models.get(this.current)
    if (model) {
      // Sit the tool so its tip touches the sand, tilted along the drag.
      const g = model.group
      const lift = this.current === 'pour' ? 0.55 : 0.16
      g.position.set(this.x, Math.max(ground, this.y) + lift, this.z)
      const bob = calmMotion ? 0 : Math.sin(this.t * 14) * 0.012 * this.show
      g.position.y += bob
      g.rotation.set(0, this.wobble, 0)
      g.rotateX(this.current === 'pour' ? -0.5 - this.tilt * 0.4 : -0.55 - this.tilt)
      g.rotateZ(this.current === 'pour' ? 0.75 : 0.12)
    }

    const rm = this.ring.material as MeshBasicMaterial
    rm.opacity = damp(rm.opacity, this.show * 0.4, 10, dt)
    this.ring.visible = rm.opacity > 0.01
    this.ring.position.set(this.x, ground + 0.02, this.z)
    const pulse = 1 + (calmMotion ? 0 : Math.sin(this.t * 9) * 0.08)
    this.ring.scale.setScalar(pulse)
  }

  dispose(): void {
    for (const m of this.models.values()) m.dispose()
    this.ring.geometry.dispose()
    ;(this.ring.material as MeshBasicMaterial).dispose()
  }
}

/**
 * A soft trail of glowing beads from the spout to the castle gate. It is the
 * only "instruction" in the game and it is entirely non-verbal.
 */
export class HintPath {
  private readonly group = new Group()
  private readonly beads: Mesh[] = []
  private readonly mats: MeshBasicMaterial[] = []
  private strength = 0
  private want = 0
  private t = 0
  private readonly geo: SphereGeometry

  constructor(scene: Scene, private readonly terrain: Terrain) {
    this.geo = new SphereGeometry(0.088, 10, 8)
    const gateX = CASTLE_X - MOAT_OUTER - 0.18
    const n = 16
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const x = SOURCE_X + 0.75 + (gateX - SOURCE_X - 0.75) * t
      const z = SOURCE_Z + Math.sin(t * Math.PI) * 0.32 + CASTLE_Z * t
      const mat = new MeshBasicMaterial({
        color: new Color('#8fe6ff'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      })
      const m = new Mesh(this.geo, mat)
      m.position.set(x, 0, z)
      m.renderOrder = 5
      this.group.add(m)
      this.beads.push(m)
      this.mats.push(mat)
    }
    scene.add(this.group)
  }

  setVisible(on: boolean): void {
    this.want = on ? 1 : 0
  }

  update(dt: number, calmMotion: boolean): void {
    this.t += dt
    this.strength = damp(this.strength, this.want, 3.4, dt)
    this.group.visible = this.strength > 0.01
    if (!this.group.visible) return
    const n = this.beads.length
    for (let i = 0; i < n; i++) {
      const b = this.beads[i]
      b.position.y = this.terrain.heightAt(b.position.x, b.position.z) + 0.09
      const phase = (this.t * 0.85 - i / n) % 1
      const wave = phase > 0 && phase < 0.34 ? Math.sin((phase / 0.34) * Math.PI) : 0
      const base = calmMotion ? 0.34 : 0.16
      this.mats[i].opacity = this.strength * (base + wave * 0.62)
      const sc = 1 + (calmMotion ? 0 : wave * 0.55)
      b.scale.setScalar(sc)
    }
  }

  dispose(): void {
    this.geo.dispose()
    for (const m of this.mats) m.dispose()
  }
}
