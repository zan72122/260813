import {
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  RingGeometry,
  Scene,
  WebGLRenderer,
} from 'three'
import { ToolId, ToolModel, createTool } from './toolModels'
import { damp } from '../core/util'

type Slot = {
  id: ToolId
  root: Group
  model: ToolModel
  disc: Mesh
  ring: Mesh
  x: number
  y: number
  radius: number
  hint: number
  press: number
}

/**
 * The three tools live in their own orthographic overlay scene measured in
 * CSS pixels. That keeps the touch targets a guaranteed physical size on every
 * device, and keeps them out of the perspective camera's way.
 */
export class ToolTray {
  readonly scene = new Scene()
  readonly camera = new OrthographicCamera(0, 1, 0, 1, -1000, 1000)
  private readonly slots: Slot[] = []
  private readonly discGeo = new CircleGeometry(1, 32)
  private readonly ringGeo = new RingGeometry(0.86, 1, 36)
  private w = 1
  private h = 1
  private t = 0

  selected: ToolId = 'dig'
  /** Which tool the guidance system currently wants the child to notice. */
  hinted: ToolId | null = 'dig'
  visible = true

  constructor() {
    this.camera.position.set(0, 0, 400)
    this.scene.add(new HemisphereLight(0xffffff, 0x9a7f5c, 1.15))
    const key = new DirectionalLight(0xffffff, 1.5)
    key.position.set(-0.5, -1, 1.6)
    this.scene.add(key)
    const fill = new DirectionalLight(0xcfe6ff, 0.6)
    fill.position.set(1, 0.6, 0.7)
    this.scene.add(fill)

    for (const id of ['dig', 'mound', 'pour'] as ToolId[]) {
      const root = new Group()
      const disc = new Mesh(
        this.discGeo,
        new MeshBasicMaterial({ color: new Color('#fffaf0'), transparent: true, opacity: 0.9 }),
      )
      disc.position.z = -6
      root.add(disc)
      const ring = new Mesh(
        this.ringGeo,
        new MeshBasicMaterial({ color: new Color('#ff9ec4'), transparent: true, opacity: 0 }),
      )
      ring.position.z = -5
      root.add(ring)

      const model = createTool(id)
      root.add(model.group)

      this.scene.add(root)
      this.slots.push({ id, root, model, disc, ring, x: 0, y: 0, radius: 40, hint: 0, press: 0 })
    }
  }

  layout(w: number, h: number, safe: { top: number; right: number; bottom: number; left: number }): void {
    this.w = w
    this.h = h
    // Keep a right-handed, Y-up frustum so face winding stays correct;
    // pixel coordinates are converted on the way in.
    this.camera.left = 0
    this.camera.right = w
    this.camera.top = h
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()

    const portrait = h >= w
    // Targets stay at least ~88 px across on the smallest phone, and the
    // landscape row is shallower so it eats less of a short screen.
    const radius = portrait
      ? Math.min(w * 0.135, h * 0.085, 62)
      : Math.min(h * 0.118, w * 0.062, 54)
    const gap = radius * 2.42
    const n = this.slots.length
    const cx = w / 2 - gap
    const cy = h - safe.bottom - radius - Math.max(10, h * (portrait ? 0.022 : 0.018))

    for (let i = 0; i < n; i++) {
      const s = this.slots[i]
      s.radius = radius
      s.x = cx + i * gap
      s.y = cy
      s.root.position.set(s.x, h - s.y, 0)
      s.disc.scale.setScalar(radius)
      s.ring.scale.setScalar(radius * 1.06)
      // Fit the ~1.2-unit-tall models inside the disc.
      const inner = radius * 0.98
      s.model.group.scale.setScalar(inner)
      s.model.group.position.set(0, -inner * 0.36, 0)
    }
  }

  /** Returns the tool at a pixel position, or null. Targets are generous. */
  hitTest(px: number, py: number): ToolId | null {
    if (!this.visible) return null
    let best: ToolId | null = null
    let bestD = Infinity
    for (const s of this.slots) {
      const d = Math.hypot(px - s.x, py - s.y)
      if (d < s.radius * 1.28 && d < bestD) {
        bestD = d
        best = s.id
      }
    }
    return best
  }

  /** True when the pixel is inside the tray's band (so the sand ignores it). */
  isOverTray(px: number, py: number): boolean {
    return this.hitTest(px, py) !== null
  }

  press(id: ToolId): void {
    for (const s of this.slots) if (s.id === id) s.press = 1
  }

  update(dt: number, calmMotion: boolean): void {
    this.t += dt
    for (const s of this.slots) {
      const isSel = s.id === this.selected
      const isHint = s.id === this.hinted && !isSel
      s.hint = damp(s.hint, isHint ? 1 : 0, 6, dt)
      s.press = damp(s.press, 0, 9, dt)

      const lift = isSel ? 1.12 : 0.94
      const target = lift - s.press * 0.1
      s.root.scale.x = damp(s.root.scale.x, target, 12, dt)
      s.root.scale.y = damp(s.root.scale.y, target, 12, dt)

      const wiggleAmp = calmMotion ? 0.05 : 0.16
      const wig = s.hint * Math.sin(this.t * 6.4) * wiggleAmp
      const selBob = isSel && !calmMotion ? Math.sin(this.t * 2.4) * 0.03 : 0
      s.model.group.rotation.z = wig + selBob

      const ringMat = s.ring.material as MeshBasicMaterial
      const ringTarget = isSel ? 0.95 : s.hint * 0.85
      ringMat.opacity = damp(ringMat.opacity, ringTarget, 8, dt)
      ringMat.color.set(isSel ? '#ff7fb0' : '#ffd166')

      const discMat = s.disc.material as MeshBasicMaterial
      discMat.opacity = damp(discMat.opacity, isSel ? 0.98 : 0.82, 8, dt)
    }
  }

  render(renderer: WebGLRenderer): void {
    if (!this.visible) return
    renderer.render(this.scene, this.camera)
  }

  /** Pixel centre of a slot — used to fly hint bubbles from the tool. */
  slotPos(id: ToolId): { x: number; y: number; r: number } | null {
    const s = this.slots.find((v) => v.id === id)
    return s ? { x: s.x, y: s.y, r: s.radius } : null
  }

  /** Screen fractions the tray occupies, for the camera to stay clear of. */
  reserve(safe: { top: number; right: number; bottom: number; left: number }): {
    top: number
    right: number
    bottom: number
    left: number
  } {
    const portrait = this.h >= this.w
    const s = this.slots[0]
    const band = s ? s.radius * 2.4 : 100
    return {
      top: (safe.top + (portrait ? 74 : 12)) / this.h,
      right: (safe.right + 10) / this.w,
      bottom: (band + safe.bottom + 8) / this.h,
      left: (safe.left + 10) / this.w,
    }
  }

  get size(): { w: number; h: number } {
    return { w: this.w, h: this.h }
  }

  dispose(): void {
    this.discGeo.dispose()
    this.ringGeo.dispose()
    for (const s of this.slots) {
      s.model.dispose()
      ;(s.disc.material as MeshBasicMaterial).dispose()
      ;(s.ring.material as MeshBasicMaterial).dispose()
    }
  }
}
