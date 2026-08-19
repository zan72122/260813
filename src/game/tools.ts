import { TAU } from '../core/math'

type C = CanvasRenderingContext2D

/**
 * Every tool is drawn with its *working tip* at (x, y) and its body trailing
 * away toward the finger, so a small hand never covers the material it is
 * working on.
 */
function begin(ctx: C, x: number, y: number, a: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(a)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

function shadow(ctx: C) {
  ctx.shadowColor = 'rgba(50,30,10,0.35)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 6
}

function wood(ctx: C, x: number, y: number, w: number, h: number, r = 6) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, '#8a5a2c')
  g.addColorStop(0.35, '#c28b4c')
  g.addColorStop(0.7, '#a8703a')
  g.addColorStop(1, '#7a4d24')
  ctx.fillStyle = g
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
}

function roundRect(ctx: C, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** splitting tool: a small blade in a wooden grip */
export function drawSplitter(ctx: C, x: number, y: number, s: number, a = 0.62) {
  begin(ctx, x, y, a, s)
  shadow(ctx)
  // blade
  const bg = ctx.createLinearGradient(-8, 0, 8, 0)
  bg.addColorStop(0, '#e8eef2'); bg.addColorStop(0.5, '#fbfdff'); bg.addColorStop(1, '#aab8c2')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-6, 14)
  ctx.lineTo(-6, 40)
  ctx.lineTo(6, 40)
  ctx.lineTo(6, 14)
  ctx.closePath()
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(90,110,124,0.7)'; ctx.lineWidth = 1.2; ctx.stroke()
  wood(ctx, -11, 38, 22, 52, 9)
  ctx.fillStyle = 'rgba(255,236,190,0.25)'
  roundRect(ctx, -7, 44, 5, 40, 3); ctx.fill()
  ctx.restore()
}

/** wide glue brush */
export function drawBrush(ctx: C, x: number, y: number, s: number, a = 0.5) {
  begin(ctx, x, y, a, s)
  shadow(ctx)
  // bristles
  const bg = ctx.createLinearGradient(0, 0, 0, 26)
  bg.addColorStop(0, '#d9c08a'); bg.addColorStop(1, '#a98449')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineTo(20, 26); ctx.lineTo(-20, 26); ctx.closePath()
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(120,92,44,0.45)'; ctx.lineWidth = 1
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath(); ctx.moveTo(i * 4.6, 2); ctx.lineTo(i * 3.6, 24); ctx.stroke()
  }
  // ferrule
  ctx.fillStyle = '#8d8f92'
  roundRect(ctx, -21, 24, 42, 12, 4); ctx.fill()
  wood(ctx, -13, 34, 26, 62, 10)
  ctx.restore()
}

/** wooden mallet */
export function drawMallet(ctx: C, x: number, y: number, s: number, a = 0.35) {
  begin(ctx, x, y, a, s)
  shadow(ctx)
  const g = ctx.createLinearGradient(-30, 0, 30, 0)
  g.addColorStop(0, '#8a5a2c'); g.addColorStop(0.4, '#cf9c5c'); g.addColorStop(1, '#7d4f26')
  ctx.fillStyle = g
  roundRect(ctx, -32, -4, 64, 32, 9); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(90,58,24,0.5)'; ctx.lineWidth = 1.6
  roundRect(ctx, -32, -4, 64, 32, 9); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,235,190,0.35)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-26, 3); ctx.lineTo(26, 3); ctx.stroke()
  wood(ctx, -9, 26, 18, 74, 8)
  ctx.restore()
}

/** paper roller */
export function drawRoller(ctx: C, x: number, y: number, s: number, a = 0) {
  begin(ctx, x, y, a, s)
  shadow(ctx)
  const g = ctx.createLinearGradient(0, -2, 0, 22)
  g.addColorStop(0, '#f0f2f4'); g.addColorStop(0.4, '#cfd6db'); g.addColorStop(1, '#8f9aa2')
  ctx.fillStyle = g
  roundRect(ctx, -38, -2, 76, 24, 12); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(90,104,116,0.6)'; ctx.lineWidth = 1.4
  roundRect(ctx, -38, -2, 76, 24, 12); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(-30, 4); ctx.lineTo(30, 4); ctx.stroke()
  // yoke
  ctx.strokeStyle = '#7b818a'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 32); ctx.stroke()
  wood(ctx, -8, 30, 16, 62, 8)
  ctx.restore()
}

/** thread bobbin */
export function drawSpool(ctx: C, x: number, y: number, s: number, col: string, a = 0.2) {
  begin(ctx, x, y, a, s)
  shadow(ctx)
  ctx.fillStyle = '#b9854a'
  roundRect(ctx, -16, 0, 32, 6, 3); ctx.fill()
  roundRect(ctx, -16, 30, 32, 6, 3); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = col
  roundRect(ctx, -13, 5, 26, 26, 3); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(-13, 7 + i * 4); ctx.lineTo(13, 7 + i * 4); ctx.stroke()
  }
  ctx.restore()
}

/** soft hand hint glyph */
export function drawHandHint(ctx: C, x: number, y: number, s: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.strokeStyle = 'rgba(120,80,40,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.quadraticCurveTo(6, -14, 6, -6)
  ctx.lineTo(6, 6)
  ctx.quadraticCurveTo(14, 4, 16, 10)
  ctx.quadraticCurveTo(18, 22, 10, 30)
  ctx.quadraticCurveTo(2, 38, -8, 32)
  ctx.quadraticCurveTo(-14, 26, -14, 14)
  ctx.lineTo(-14, 2)
  ctx.quadraticCurveTo(-12, -4, -6, -2)
  ctx.lineTo(-6, -6)
  ctx.quadraticCurveTo(-6, -14, 0, -14)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.restore()
}

/** pulsing ring used to point at the next thing to touch */
export function drawPulse(ctx: C, x: number, y: number, r: number, t: number, alpha = 1) {
  for (let i = 0; i < 2; i++) {
    const k = (t * 0.9 + i * 0.5) % 1
    ctx.save()
    ctx.globalAlpha = alpha * (1 - k) * 0.65
    ctx.strokeStyle = '#fff8dc'
    ctx.lineWidth = Math.max(2, r * 0.09)
    ctx.beginPath(); ctx.arc(x, y, r * (0.55 + k * 0.75), 0, TAU); ctx.stroke()
    ctx.restore()
  }
}

/** soft chevrons showing a direction to move the finger */
export function drawChevrons(ctx: C, x: number, y: number, dx: number, dy: number, size: number, t: number, alpha = 1) {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  const px = -uy, py = ux
  for (let i = 0; i < 3; i++) {
    const k = ((t * 0.8 + i * 0.33) % 1)
    const d = (k - 0.15) * size * 2.2
    ctx.save()
    ctx.globalAlpha = alpha * Math.sin(Math.PI * k) * 0.85
    ctx.strokeStyle = '#fffbe8'
    ctx.lineWidth = size * 0.17
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const cx = x + ux * d, cy = y + uy * d
    ctx.beginPath()
    ctx.moveTo(cx - ux * size * 0.3 + px * size * 0.42, cy - uy * size * 0.3 + py * size * 0.42)
    ctx.lineTo(cx + ux * size * 0.3, cy + uy * size * 0.3)
    ctx.lineTo(cx - ux * size * 0.3 - px * size * 0.42, cy - uy * size * 0.3 - py * size * 0.42)
    ctx.stroke()
    ctx.restore()
  }
}
