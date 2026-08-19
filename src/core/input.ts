import * as THREE from 'three'

export interface PointerSample {
  /** normalised device coords */
  nx: number
  ny: number
  /** css pixels, for the DOM hint layer */
  cx: number
  cy: number
}

/**
 * One-finger pointer handling. Extra touches are ignored on purpose: the game
 * must never need two fingers, pinch, or tilt.
 */
export class Input {
  down = false
  readonly sample: PointerSample = { nx: 0, ny: 0, cx: 0, cy: 0 }
  onDown: ((s: PointerSample) => void) | null = null
  onMove: ((s: PointerSample) => void) | null = null
  onUp: (() => void) | null = null
  /** set by the game to stop drawing while a menu is open */
  enabled = true

  private el: HTMLElement
  private activeId: number | null = null
  private rect = { left: 0, top: 0, width: 1, height: 1 }

  constructor(el: HTMLElement) {
    this.el = el
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', this.handleDown, { passive: false })
    el.addEventListener('pointermove', this.handleMove, { passive: false })
    el.addEventListener('pointerup', this.handleUp, { passive: false })
    el.addEventListener('pointercancel', this.handleUp, { passive: false })
    el.addEventListener('lostpointercapture', this.handleUp, { passive: false })
    // belt and braces against iOS Safari page gestures
    el.addEventListener('touchstart', this.prevent, { passive: false })
    el.addEventListener('touchmove', this.prevent, { passive: false })
    el.addEventListener('gesturestart', this.prevent as EventListener, { passive: false })
    el.addEventListener('contextmenu', this.prevent, { passive: false })
    this.measure()
  }

  private prevent = (e: Event) => {
    e.preventDefault()
  }

  measure() {
    const r = this.el.getBoundingClientRect()
    this.rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 }
  }

  private read(e: PointerEvent) {
    const x = e.clientX - this.rect.left
    const y = e.clientY - this.rect.top
    this.sample.cx = x
    this.sample.cy = y
    this.sample.nx = (x / this.rect.width) * 2 - 1
    this.sample.ny = -(y / this.rect.height) * 2 + 1
  }

  private handleDown = (e: PointerEvent) => {
    e.preventDefault()
    if (!this.enabled) return
    if (this.activeId !== null) return // ignore the second finger
    this.activeId = e.pointerId
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      /* not supported */
    }
    this.read(e)
    this.down = true
    this.onDown?.(this.sample)
  }

  private handleMove = (e: PointerEvent) => {
    if (this.activeId !== null && e.pointerId !== this.activeId) return
    e.preventDefault()
    this.read(e)
    this.onMove?.(this.sample)
  }

  private handleUp = (e: PointerEvent) => {
    if (this.activeId !== null && e.pointerId !== this.activeId) return
    e.preventDefault()
    this.activeId = null
    if (!this.down) return
    this.down = false
    this.onUp?.()
  }

  /** Force-release, e.g. when the tab goes to the background. */
  release() {
    this.activeId = null
    if (this.down) {
      this.down = false
      this.onUp?.()
    }
  }
}

const _ray = new THREE.Raycaster()
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const _ndc = new THREE.Vector2()

/** Projects a pointer sample onto the vertical construction plane at z = planeZ. */
export function projectToPlane(
  s: PointerSample,
  camera: THREE.Camera,
  planeZ: number,
  out: THREE.Vector3
): boolean {
  _plane.set(new THREE.Vector3(0, 0, 1), -planeZ)
  _ndc.set(s.nx, s.ny)
  _ray.setFromCamera(_ndc, camera)
  const hit = _ray.ray.intersectPlane(_plane, out)
  return hit !== null
}

/** Projects onto the horizontal seabed plane at y = planeY. */
const _hplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
export function projectToGround(
  s: PointerSample,
  camera: THREE.Camera,
  planeY: number,
  out: THREE.Vector3
): boolean {
  _hplane.set(new THREE.Vector3(0, 1, 0), -planeY)
  _ndc.set(s.nx, s.ny)
  _ray.setFromCamera(_ndc, camera)
  return _ray.ray.intersectPlane(_hplane, out) !== null
}
