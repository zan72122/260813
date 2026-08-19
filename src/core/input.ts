export type PointerSample = { x: number; y: number; t: number }

export type PointerState = {
  down: boolean
  id: number
  x: number; y: number
  px: number; py: number     // previous frame position
  dx: number; dy: number     // delta since last frame
  startX: number; startY: number
  vx: number; vy: number     // px/sec smoothed
  travel: number             // total travel this gesture (px)
  downTime: number
  justDown: boolean
  justUp: boolean
  tapped: boolean            // released as a tap (short + small travel)
  moveDist: number           // distance moved this frame
}

/**
 * Single-finger pointer manager. Extra touches are ignored on purpose:
 * the game is designed for one finger only (no pinch / no 2-finger rotate).
 */
export class Input {
  p: PointerState = {
    down: false, id: -1, x: 0, y: 0, px: 0, py: 0, dx: 0, dy: 0,
    startX: 0, startY: 0, vx: 0, vy: 0, travel: 0, downTime: 0,
    justDown: false, justUp: false, tapped: false, moveDist: 0
  }
  /** seconds since last meaningful interaction (used for idle hints) */
  idle = 0
  /** a gesture that began before a stage change must not drive the new stage */
  private blocked = false
  private pendingDown = false
  private pendingUp = false
  private raw: { x: number; y: number } | null = null
  private el: HTMLElement

  constructor(el: HTMLElement) {
    this.el = el
    const opts = { passive: false } as AddEventListenerOptions
    el.addEventListener('pointerdown', this.onDown, opts)
    el.addEventListener('pointermove', this.onMove, opts)
    window.addEventListener('pointerup', this.onUp, opts)
    window.addEventListener('pointercancel', this.onUp, opts)
    el.addEventListener('touchstart', prevent, opts)
    el.addEventListener('touchmove', prevent, opts)
    el.addEventListener('gesturestart', prevent, opts)
    el.addEventListener('contextmenu', prevent, opts)
  }


  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault()
    if (this.p.down) return
    const l = this.local(e)
    this.p.id = e.pointerId
    this.raw = l
    this.pendingDown = true
  }

  private onMove = (e: PointerEvent) => {
    if (!this.p.down && !this.pendingDown) return
    if (e.pointerId !== this.p.id) return
    e.preventDefault()
    this.raw = this.local(e)
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.p.id) return
    this.pendingUp = true
  }

  /** ignore the current gesture until the finger is lifted */
  block() {
    if (this.p.down || this.pendingDown) {
      this.blocked = true
      this.p.down = false
      this.p.dx = 0; this.p.dy = 0; this.p.moveDist = 0
      this.p.vx = 0; this.p.vy = 0
      this.pendingDown = false
    }
  }

  /** call once per frame before stage update */
  begin(dt: number) {
    const p = this.p
    if (this.blocked) {
      p.justDown = false; p.justUp = false; p.tapped = false
      p.dx = 0; p.dy = 0; p.moveDist = 0; p.vx = 0; p.vy = 0
      p.down = false
      this.idle += dt
      if (this.pendingUp) { this.pendingUp = false; this.blocked = false; this.p.id = -1; this.raw = null }
      this.pendingDown = false
      return
    }
    p.justDown = false; p.justUp = false; p.tapped = false
    if (this.pendingDown) {
      this.pendingDown = false
      p.down = true
      p.justDown = true
      p.x = p.px = p.startX = this.raw!.x
      p.y = p.py = p.startY = this.raw!.y
      p.dx = p.dy = 0; p.vx = 0; p.vy = 0
      p.travel = 0
      p.downTime = 0
      p.moveDist = 0
      this.idle = 0
      return
    }
    if (p.down) {
      p.px = p.x; p.py = p.y
      if (this.raw) { p.x = this.raw.x; p.y = this.raw.y }
      p.dx = p.x - p.px
      p.dy = p.y - p.py
      p.moveDist = Math.hypot(p.dx, p.dy)
      p.travel += p.moveDist
      p.downTime += dt
      const k = dt > 0 ? 1 - Math.exp(-14 * dt) : 1
      p.vx += ((p.dx / Math.max(dt, 1 / 240)) - p.vx) * k
      p.vy += ((p.dy / Math.max(dt, 1 / 240)) - p.vy) * k
      if (p.moveDist > 0.4) this.idle = 0
      else this.idle += dt
    } else {
      p.dx = 0; p.dy = 0; p.moveDist = 0
      p.vx *= 0.8; p.vy *= 0.8
      this.idle += dt
    }
    if (this.pendingUp) {
      this.pendingUp = false
      if (p.down) {
        p.justUp = true
        p.tapped = p.downTime < 0.45 && p.travel < 22 * 1
      }
      p.down = false
      p.id = -1
      this.raw = null
    }
  }

  resetIdle() { this.idle = 0 }
}

function prevent(e: Event) {
  if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) { e.preventDefault(); return }
  e.preventDefault()
}
