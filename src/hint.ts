export interface GesturePoint {
  x: number
  y: number
}

export interface GestureSpec {
  type: 'tap' | 'drag'
  points: GesturePoint[]
  holdMs?: number
}

/**
 * Wordless idle hint: an animated hand that repeats the expected gesture.
 * The gesture provider is re-queried every loop so it survives rotation
 * and camera moves.
 */
export class Hint {
  private el = document.getElementById('hint')!
  private raf = 0
  private playing = false

  play(provider: () => GestureSpec | null) {
    if (this.playing) return
    this.playing = true
    this.el.classList.remove('hidden')
    const t0 = performance.now()
    const loop = () => {
      if (!this.playing) return
      const g = provider()
      if (!g || g.points.length === 0) {
        this.stop()
        return
      }
      const period = g.type === 'tap' ? 1100 : 1600
      const t = ((performance.now() - t0) % period) / period
      let x = g.points[0].x
      let y = g.points[0].y
      if (g.type === 'drag' && g.points.length > 1) {
        // ease along the polyline, with a pause at the start
        const k = Math.min(1, Math.max(0, (t - 0.18) / 0.68))
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        const segs = g.points.length - 1
        const f = e * segs
        const i = Math.min(segs - 1, Math.floor(f))
        const fr = f - i
        x = g.points[i].x + (g.points[i + 1].x - g.points[i].x) * fr
        y = g.points[i].y + (g.points[i + 1].y - g.points[i].y) * fr
      } else {
        // tap bounce
        y += t < 0.5 ? Math.sin(t * Math.PI * 2) * -10 : 0
      }
      const press = g.type === 'tap' ? (t % 0.5 < 0.25 ? 0.85 : 1) : t > 0.14 && t < 0.9 ? 0.85 : 1
      this.el.style.transform = `translate(${x}px, ${y}px) scale(${press})`
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    if (!this.playing) return
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.el.classList.add('hidden')
  }
}

export const hint = new Hint()
