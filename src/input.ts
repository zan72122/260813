import { sfx } from './audio'

export interface PointerPos {
  x: number
  y: number
  dx: number
  dy: number
}

/**
 * Single-pointer input. First touch wins; extra fingers are ignored so a
 * child resting a palm on the screen cannot break a gesture.
 */
export class Input {
  down = false
  x = 0
  y = 0
  downX = 0
  downY = 0
  downTime = 0

  onDown: ((p: PointerPos) => void) | null = null
  onMove: ((p: PointerPos) => void) | null = null
  onUp: ((p: PointerPos) => void) | null = null

  private id: number | null = null

  constructor(private el: HTMLElement) {
    el.addEventListener(
      'pointerdown',
      (e) => {
        sfx.unlock()
        if (this.id !== null) return
        e.preventDefault()
        this.id = e.pointerId
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* older Safari */
        }
        this.down = true
        this.x = this.downX = e.clientX
        this.y = this.downY = e.clientY
        this.downTime = performance.now()
        this.onDown?.({ x: this.x, y: this.y, dx: 0, dy: 0 })
      },
      { passive: false },
    )

    el.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId !== this.id) return
        e.preventDefault()
        const dx = e.clientX - this.x
        const dy = e.clientY - this.y
        this.x = e.clientX
        this.y = e.clientY
        this.onMove?.({ x: this.x, y: this.y, dx, dy })
      },
      { passive: false },
    )

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return
      this.id = null
      this.down = false
      this.onUp?.({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
    }
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)

    // Stop browser gestures interfering with play.
    window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
    window.addEventListener('gesturestart' as any, (e: Event) => e.preventDefault())
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('dblclick', (e) => e.preventDefault())
  }

  clearHandlers() {
    this.onDown = null
    this.onMove = null
    this.onUp = null
  }
}
