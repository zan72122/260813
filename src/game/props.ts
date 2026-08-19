import { Game } from './game'
import { TAU, clamp01, lerp } from '../core/math'
import { PATTERNS } from '../core/textures'

type C = CanvasRenderingContext2D

export type WindProp = { x: number; y: number; z: number }

/** hanging wind chime — the classic summer sound, and a wind meter */
export function drawFurin(ctx: C, x: number, y: number, s: number, sway: number, patternIdx: number) {
  ctx.save()
  ctx.translate(x, y)
  // cord
  ctx.strokeStyle = 'rgba(120,86,44,0.8)'
  ctx.lineWidth = Math.max(1.5, s * 0.05)
  ctx.beginPath()
  ctx.moveTo(0, -s * 3.2)
  ctx.quadraticCurveTo(sway * s * 0.3, -s * 1.6, sway * s * 0.5, -s * 0.2)
  ctx.stroke()
  ctx.translate(sway * s * 0.5, 0)
  ctx.rotate(sway * 0.42)
  // glass bell
  const g = ctx.createLinearGradient(-s, -s, s, s)
  g.addColorStop(0, 'rgba(226,246,250,0.95)')
  g.addColorStop(0.45, 'rgba(190,228,240,0.85)')
  g.addColorStop(1, 'rgba(150,200,220,0.9)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-s * 0.72, 0)
  ctx.bezierCurveTo(-s * 0.78, -s * 0.95, s * 0.78, -s * 0.95, s * 0.72, 0)
  ctx.quadraticCurveTo(0, s * 0.28, -s * 0.72, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(110,160,180,0.6)'
  ctx.lineWidth = Math.max(1, s * 0.045)
  ctx.stroke()
  // painted band
  ctx.fillStyle = PATTERNS[patternIdx % PATTERNS.length].accent
  ctx.globalAlpha = 0.75
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.1, s * 0.66, s * 0.18, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.45, s * 0.12, s * 0.28, 0.3, 0, TAU); ctx.fill()
  // clapper + paper strip
  ctx.strokeStyle = 'rgba(120,86,44,0.75)'
  ctx.lineWidth = Math.max(1.2, s * 0.04)
  ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(sway * s * 0.5, s * 1.5); ctx.stroke()
  ctx.save()
  ctx.translate(sway * s * 0.5, s * 1.5)
  ctx.rotate(sway * 0.5)
  ctx.fillStyle = '#fdf6e6'
  ctx.fillRect(-s * 0.26, 0, s * 0.52, s * 1.5)
  ctx.strokeStyle = 'rgba(150,110,60,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(-s * 0.26, 0, s * 0.52, s * 1.5)
  ctx.fillStyle = PATTERNS[patternIdx % PATTERNS.length].accent
  ctx.globalAlpha = 0.6
  ctx.fillRect(-s * 0.26, s * 0.5, s * 0.52, s * 0.16)
  ctx.restore()
  ctx.restore()
}

/** little pinwheel that spins with the wind */
export function drawPinwheel(ctx: C, x: number, y: number, s: number, spin: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#b7864a'
  ctx.lineWidth = Math.max(2, s * 0.14)
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 2.6); ctx.stroke()
  ctx.rotate(spin)
  const cols = ['#f2a0b8', '#f7d47a', '#a8d8e8', '#b8e0a8']
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.rotate((i / 4) * TAU)
    ctx.fillStyle = cols[i]
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(s * 0.35, -s * 0.5, s * 1.0, -s * 0.28)
    ctx.quadraticCurveTo(s * 0.6, s * 0.12, 0, 0)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#8a5a2c'
  ctx.beginPath(); ctx.arc(0, 0, s * 0.17, 0, TAU); ctx.fill()
  ctx.restore()
}

/** hanging paper garland */
export function drawStrips(ctx: C, x: number, y: number, s: number, phase: number, wind: number) {
  const cols = ['#f6b8c8', '#fbe7a6', '#b7dfe8', '#d9c2ea']
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = 'rgba(120,86,44,0.7)'
  ctx.lineWidth = Math.max(1.4, s * 0.06)
  ctx.beginPath(); ctx.moveTo(-s * 1.6, 0); ctx.lineTo(s * 1.6, 0); ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const px = lerp(-s * 1.3, s * 1.3, i / 3)
    ctx.save()
    ctx.translate(px, 0)
    ctx.fillStyle = cols[i]
    ctx.beginPath()
    ctx.moveTo(-s * 0.2, 0)
    const segs = 5
    const pts: [number, number][] = []
    for (let k = 0; k <= segs; k++) {
      const t = k / segs
      const bend = Math.sin(phase * 3.2 + i * 0.9 + t * 3.4) * s * 0.55 * wind * t
      pts.push([bend, t * s * 2.1])
    }
    for (const q of pts) ctx.lineTo(q[0] - s * 0.2, q[1])
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0] + s * 0.2, pts[k][1])
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/** drifting leaves */
export class Leaves {
  list: { x: number; y: number; vx: number; vy: number; r: number; s: number; vr: number; hue: string }[] = []
  spawnT = 0

  update(g: Game, dt: number, wind: number, dir: number) {
    const L = g.layout
    this.spawnT -= dt
    if (this.spawnT <= 0 && this.list.length < 12) {
      this.spawnT = 0.35 + Math.random() * 0.9
      const fromLeft = dir >= 0
      this.list.push({
        x: fromLeft ? -30 : L.w + 30,
        y: L.h * (0.12 + Math.random() * 0.55),
        vx: (fromLeft ? 1 : -1) * (30 + Math.random() * 40),
        vy: -6 + Math.random() * 24,
        r: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 2.4,
        s: Math.min(L.w, L.h) * (0.012 + Math.random() * 0.012),
        hue: Math.random() < 0.5 ? '#9dc47a' : '#c9b06a'
      })
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const l = this.list[i]
      l.x += (l.vx + dir * wind * 340) * dt
      l.y += (l.vy + Math.sin(g.time * 2 + l.r) * 16 - wind * 22) * dt
      l.r += (l.vr + wind * 3) * dt
      if (l.x < -80 || l.x > L.w + 80 || l.y > L.h + 60) this.list.splice(i, 1)
    }
  }

  draw(ctx: C) {
    for (const l of this.list) {
      ctx.save()
      ctx.translate(l.x, l.y)
      ctx.rotate(l.r)
      ctx.fillStyle = l.hue
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.ellipse(0, 0, l.s * 1.5, l.s * 0.62, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = 'rgba(80,90,50,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(-l.s * 1.5, 0); ctx.lineTo(l.s * 1.5, 0); ctx.stroke()
      ctx.restore()
    }
  }

  clear() { this.list.length = 0 }
}

/** soft moving air streaks in front of the fan */
export function drawWindStreaks(ctx: C, g: Game, wind: number, dir: number) {
  if (wind < 0.06) return
  const L = g.layout
  ctx.save()
  ctx.globalAlpha = clamp01(wind) * 0.3
  ctx.strokeStyle = '#ffffff'
  ctx.lineCap = 'round'
  const n = 5
  for (let i = 0; i < n; i++) {
    const t = (g.time * (0.5 + wind) + i / n) % 1
    const y = L.h * (0.2 + 0.42 * ((i * 0.37 + 0.13) % 1))
    const x0 = dir >= 0 ? L.w * (0.35 + t * 0.6) : L.w * (0.65 - t * 0.6)
    const len = L.w * (0.08 + 0.1 * wind)
    ctx.lineWidth = Math.max(1.5, L.h * 0.004)
    ctx.globalAlpha = clamp01(wind) * 0.28 * Math.sin(Math.PI * t)
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.quadraticCurveTo(x0 + dir * len * 0.5, y - L.h * 0.02, x0 + dir * len, y)
    ctx.stroke()
  }
  ctx.restore()
}
