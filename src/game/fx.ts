import { Rng, TAU, clamp01 } from '../core/math'

export type P = {
  x: number; y: number; vx: number; vy: number
  life: number; max: number
  size: number; rot: number; vr: number
  kind: 'chip' | 'spark' | 'dust' | 'petal'
  hue: string
  g: number
}

/** screen-space particles: cheap, capped, and always readable on a phone */
export class Particles {
  list: P[] = []
  cap = 90
  rng = new Rng(9182)

  spawn(p: Partial<P> & { x: number; y: number }) {
    if (this.list.length >= this.cap) this.list.shift()
    this.list.push({
      vx: 0, vy: 0, life: 0, max: 0.9, size: 6, rot: 0, vr: 0,
      kind: 'spark', hue: '#fff3c4', g: 900,
      ...p
    } as P)
  }

  burstChips(x: number, y: number, n: number, scale: number, hue = '#e6d4a4') {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(-Math.PI * 0.9, -Math.PI * 0.1)
      const sp = this.rng.range(60, 200) * scale
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: this.rng.range(0.5, 1.1), size: this.rng.range(3, 8) * scale,
        rot: this.rng.range(0, TAU), vr: this.rng.range(-9, 9),
        kind: 'chip', hue, g: 1500
      })
    }
  }

  burstSpark(x: number, y: number, n: number, scale: number, hue = '#fff6cf') {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, TAU)
      const sp = this.rng.range(30, 170) * scale
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: this.rng.range(0.35, 0.8), size: this.rng.range(2.4, 6) * scale,
        rot: 0, vr: 0, kind: 'spark', hue, g: -60
      })
    }
  }

  dust(x: number, y: number, n: number, scale: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, TAU)
      const sp = this.rng.range(10, 70) * scale
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20 * scale,
        life: 0, max: this.rng.range(0.6, 1.4), size: this.rng.range(3, 9) * scale,
        rot: 0, vr: 0, kind: 'dust', hue: 'rgba(255,246,220,0.6)', g: 40
      })
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      p.life += dt
      if (p.life >= p.max) { this.list.splice(i, 1); continue }
      p.vy += p.g * dt
      p.vx *= 1 - 1.2 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const k = 1 - p.life / p.max
      ctx.save()
      ctx.globalAlpha = clamp01(k) * (p.kind === 'dust' ? 0.5 : 1)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.hue
      if (p.kind === 'chip') {
        ctx.fillRect(-p.size * 0.5, -p.size * 0.22, p.size, p.size * 0.44)
      } else if (p.kind === 'spark') {
        ctx.beginPath(); ctx.arc(0, 0, p.size * k, 0, TAU); ctx.fill()
      } else {
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill()
      }
      ctx.restore()
    }
  }

  clear() { this.list.length = 0 }
}

/* ---------------- floating onomatopoeia ---------------- */

export type Word = { text: string; x: number; y: number; life: number; max: number; scale: number; hue: string }

export class Words {
  list: Word[] = []
  say(text: string, x: number, y: number, scale = 1, hue = '#ffffff') {
    // never stack two copies of the same shout on top of each other
    for (const w of this.list) if (w.text === text && w.life < 0.4) return
    if (this.list.length > 4) this.list.shift()
    this.list.push({ text, x, y, life: 0, max: 1.25, scale, hue })
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i]
      w.life += dt
      if (w.life >= w.max) this.list.splice(i, 1)
      else w.y -= 26 * dt
    }
  }
  draw(ctx: CanvasRenderingContext2D, base: number) {
    for (const w of this.list) {
      const t = w.life / w.max
      const pop = t < 0.18 ? 0.6 + 0.4 * (t / 0.18) * 1.7 : 1 + 0.05 * Math.sin(t * 9)
      ctx.save()
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
      ctx.translate(w.x, w.y)
      ctx.scale(pop * w.scale, pop * w.scale)
      ctx.font = `700 ${base}px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      ctx.lineWidth = base * 0.28
      ctx.strokeStyle = 'rgba(94,58,24,0.9)'
      ctx.strokeText(w.text, 0, 0)
      ctx.fillStyle = w.hue
      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    }
  }
  clear() { this.list.length = 0 }
}
