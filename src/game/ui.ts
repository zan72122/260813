import { TAU, clamp01, lerp } from '../core/math'
import { PATTERNS, motifTile } from '../core/textures'

type C = CanvasRenderingContext2D

export type IconId = 'again' | 'para' | 'wind' | 'sound' | 'soundoff' | 'next' | 'home' | 'check' | 'start'

export type Btn = {
  id: string
  x: number; y: number; r: number
  icon?: IconId
  label?: string
  tint?: string
  selected?: boolean
  patternIndex?: number
  threadColor?: string
  scale?: number
}

export function hitBtn(b: Btn, x: number, y: number, slack = 1.35) {
  return Math.hypot(x - b.x, y - b.y) <= b.r * slack
}

export function drawButton(ctx: C, b: Btn, t: number) {
  const r = b.r * (b.scale ?? 1)
  const pulse = b.selected ? 1 + 0.03 * Math.sin(t * 4) : 1
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.scale(pulse, pulse)
  // shadow
  ctx.fillStyle = 'rgba(70,42,16,0.28)'
  ctx.beginPath(); ctx.ellipse(0, r * 0.16, r, r, 0, 0, TAU); ctx.fill()
  // body
  const g = ctx.createLinearGradient(0, -r, 0, r)
  const tint = b.tint ?? '#fff3d6'
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.35, tint)
  g.addColorStop(1, shadeHex(tint, 0.86))
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill()
  ctx.lineWidth = Math.max(2, r * 0.075)
  ctx.strokeStyle = b.selected ? '#f2934f' : 'rgba(150,108,58,0.55)'
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke()
  ctx.restore()

  if (b.patternIndex !== undefined) {
    drawPatternSwatch(ctx, b.x, b.y, r * 0.74, b.patternIndex)
  } else if (b.threadColor) {
    drawThreadSwatch(ctx, b.x, b.y, r * 0.66, b.threadColor)
  } else if (b.icon) {
    drawIcon(ctx, b.icon, b.x, b.y, r * 0.62, t)
  }

  if (b.label) {
    ctx.save()
    ctx.font = `700 ${Math.max(11, r * 0.36)}px "Hiragino Maru Gothic ProN", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(3, r * 0.2)
    ctx.strokeStyle = 'rgba(255,252,240,0.95)'
    ctx.strokeText(b.label, b.x, b.y + r * 1.12)
    ctx.fillStyle = '#6b4526'
    ctx.fillText(b.label, b.x, b.y + r * 1.12)
    ctx.restore()
  }
}

function shadeHex(hex: string, k: number) {
  const p = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((p >> 16) & 255) * k) | 0
  const g = Math.min(255, ((p >> 8) & 255) * k) | 0
  const b = Math.min(255, (p & 255) * k) | 0
  return `rgb(${r},${g},${b})`
}

export function drawPatternSwatch(ctx: C, x: number, y: number, r: number, idx: number) {
  const def = PATTERNS[idx % PATTERNS.length]
  ctx.save()
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip()
  ctx.fillStyle = def.base
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  const pat = ctx.createPattern(motifTile(def.id), 'repeat')
  if (pat) {
    const k = (r * 2.1) / 160
    ctx.save()
    ctx.transform(k, 0, 0, k, x - r, y - r)
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, 400, 400)
    ctx.restore()
  } else {
    // a blank swatch would make the choice meaningless
    ctx.fillStyle = def.accent
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.16, 0, TAU)
      ctx.fill()
    }
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(140,100,54,0.5)'
  ctx.lineWidth = Math.max(1, r * 0.09)
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke()
}

function drawThreadSwatch(ctx: C, x: number, y: number, r: number, col: string) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = r * 0.42
  if (col === 'rainbow') {
    const g = ctx.createLinearGradient(x - r, y, x + r, y)
    g.addColorStop(0, '#f6b8c8'); g.addColorStop(0.35, '#f8e3a6')
    g.addColorStop(0.7, '#aee3c6'); g.addColorStop(1, '#c2c0ee')
    ctx.strokeStyle = g
  } else ctx.strokeStyle = col
  ctx.beginPath()
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const px = lerp(x - r, x + r, t)
    const py = y + Math.sin(t * Math.PI * 3) * r * 0.42
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()
}

/** small stylised finished uchiwa, used for icons and background props */
export function drawUchiwaGlyph(ctx: C, x: number, y: number, r: number, patternIdx: number, rot = 0, alpha = 1) {
  const def = PATTERNS[patternIdx % PATTERNS.length]
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rot)
  // green bamboo handle, so the promise matches the object the child builds
  ctx.strokeStyle = '#8ba55f'
  ctx.lineWidth = r * 0.17
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(0, r * 0.55); ctx.lineTo(0, r * 1.5); ctx.stroke()
  ctx.strokeStyle = 'rgba(96,74,34,0.45)'
  ctx.lineWidth = Math.max(1, r * 0.035)
  ctx.beginPath(); ctx.moveTo(-r * 0.09, r * 1.12); ctx.lineTo(r * 0.09, r * 1.12); ctx.stroke()
  // paper
  ctx.beginPath()
  ctx.ellipse(0, -r * 0.08, r * 0.9, r * 0.92, 0, 0, TAU)
  ctx.closePath()
  ctx.fillStyle = def.base
  ctx.fill()
  ctx.save()
  ctx.clip()
  const pat = ctx.createPattern(motifTile(def.id), 'repeat')
  if (pat) {
    const k = (r * 1.4) / 160
    ctx.save()
    ctx.transform(k, 0, 0, k, -r, -r)
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, 400, 400)
    ctx.restore()
  }
  // ribs (clipped to the paper so nothing pokes out)
  ctx.strokeStyle = 'rgba(120,92,50,0.32)'
  ctx.lineWidth = Math.max(0.8, r * 0.028)
  for (let i = -4; i <= 4; i++) {
    const a = (i / 4) * 1.15
    ctx.beginPath()
    ctx.moveTo(0, r * 0.55)
    ctx.lineTo(Math.sin(a) * r * 0.86, r * 0.55 - Math.cos(a) * r * 1.5)
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = def.accent
  ctx.lineWidth = Math.max(1.4, r * 0.075)
  ctx.beginPath()
  ctx.ellipse(0, -r * 0.08, r * 0.9, r * 0.92, 0, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

export function drawIcon(ctx: C, id: IconId, x: number, y: number, r: number, t: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#7a5230'
  ctx.fillStyle = '#7a5230'
  ctx.lineWidth = Math.max(2.4, r * 0.16)
  if (id === 'start') {
    // one pole of bamboo turning into a fan: exactly what the game is
    ctx.strokeStyle = '#7ba14e'
    ctx.lineWidth = Math.max(3.4, r * 0.26)
    ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.9); ctx.lineTo(-r * 0.45, -r * 0.75); ctx.stroke()
    ctx.strokeStyle = 'rgba(120,150,80,0.7)'
    ctx.lineWidth = Math.max(1.4, r * 0.07)
    ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.15); ctx.lineTo(-r * 0.28, r * 0.15); ctx.stroke()
    for (let i = 0; i < 5; i++) {
      const a = 0.28 + (i / 4) * 1.1
      ctx.strokeStyle = i % 2 ? '#c9a15c' : '#d9b877'
      ctx.lineWidth = Math.max(2.4, r * 0.15)
      ctx.beginPath()
      ctx.moveTo(r * 0.05, r * 0.85)
      ctx.lineTo(r * 0.05 + Math.sin(a) * r * 1.15, r * 0.85 - Math.cos(a) * r * 1.15)
      ctx.stroke()
    }
  } else if (id === 'again') {
    drawUchiwaGlyph(ctx, 0, -r * 0.08, r * 0.72, 0, -0.25)
    ctx.strokeStyle = '#e08a3c'
    ctx.lineWidth = Math.max(2.6, r * 0.17)
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.95, -0.5, 4.2)
    ctx.stroke()
    ctx.beginPath()
    const a = 4.2
    const px = Math.cos(a) * r * 0.95, py = Math.sin(a) * r * 0.95
    ctx.moveTo(px, py)
    ctx.lineTo(px - r * 0.3, py - r * 0.12)
    ctx.moveTo(px, py)
    ctx.lineTo(px + r * 0.05, py - r * 0.33)
    ctx.stroke()
  } else if (id === 'para') {
    // a burst of bamboo ribs
    for (let i = -4; i <= 4; i++) {
      const a = (i / 4) * 1.1 + Math.sin(t * 2 + i) * 0.04
      ctx.strokeStyle = i % 2 ? '#c9a15c' : '#a8bf72'
      ctx.lineWidth = Math.max(2.4, r * 0.15)
      ctx.beginPath()
      ctx.moveTo(0, r * 0.85)
      ctx.lineTo(Math.sin(a) * r * 0.95, r * 0.85 - Math.cos(a) * r * 1.45)
      ctx.stroke()
    }
    ctx.fillStyle = '#8a5a2c'
    ctx.beginPath(); ctx.arc(0, r * 0.9, r * 0.16, 0, TAU); ctx.fill()
  } else if (id === 'wind') {
    drawUchiwaGlyph(ctx, -r * 0.35, 0, r * 0.66, 2, -0.35)
    ctx.strokeStyle = '#6fa8c4'
    ctx.lineWidth = Math.max(2.4, r * 0.15)
    for (let i = 0; i < 3; i++) {
      const yy = -r * 0.5 + i * r * 0.52
      const ph = Math.sin(t * 3 + i) * r * 0.08
      ctx.beginPath()
      ctx.moveTo(r * 0.2, yy)
      ctx.quadraticCurveTo(r * 0.7 + ph, yy - r * 0.2, r * 1.05, yy)
      ctx.stroke()
    }
  } else if (id === 'sound' || id === 'soundoff') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.6, -r * 0.25); ctx.lineTo(-r * 0.2, -r * 0.25)
    ctx.lineTo(r * 0.15, -r * 0.7); ctx.lineTo(r * 0.15, r * 0.7)
    ctx.lineTo(-r * 0.2, r * 0.25); ctx.lineTo(-r * 0.6, r * 0.25)
    ctx.closePath(); ctx.fill()
    if (id === 'sound') {
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath(); ctx.arc(r * 0.2, 0, r * (0.25 + i * 0.28), -0.9, 0.9); ctx.stroke()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(r * 0.45, -r * 0.35); ctx.lineTo(r * 1.0, r * 0.35)
      ctx.moveTo(r * 1.0, -r * 0.35); ctx.lineTo(r * 0.45, r * 0.35)
      ctx.stroke()
    }
  } else if (id === 'next') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.25, -r * 0.6); ctx.lineTo(r * 0.42, 0); ctx.lineTo(-r * 0.25, r * 0.6)
    ctx.stroke()
  } else if (id === 'home') {
    ctx.beginPath()
    ctx.moveTo(-r * 0.75, 0); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r * 0.75, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 0.5, r * 0.66); ctx.lineTo(r * 0.5, r * 0.66); ctx.lineTo(r * 0.5, 0)
    ctx.stroke()
  } else if (id === 'check') {
    ctx.strokeStyle = '#4f9a52'
    ctx.beginPath()
    ctx.moveTo(-r * 0.55, 0); ctx.lineTo(-r * 0.12, r * 0.45); ctx.lineTo(r * 0.62, -r * 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

/** unobtrusive progress beads — no score, no stars, just "where am I" */
export function drawProgress(ctx: C, x: number, y: number, step: number, total: number, unit: number, vertical = false) {
  ctx.save()
  const gap = unit * 0.52
  for (let i = 0; i < total; i++) {
    const px = vertical ? x : x + (i - (total - 1) / 2) * gap
    const py = vertical ? y + (i - (total - 1) / 2) * gap : y
    const done = i < step
    const cur = i === step
    ctx.globalAlpha = done ? 0.9 : cur ? 1 : 0.42
    ctx.fillStyle = done ? '#e0a45c' : cur ? '#fff6dc' : 'rgba(255,255,255,0.75)'
    ctx.beginPath()
    ctx.arc(px, py, unit * (cur ? 0.19 : 0.12), 0, TAU)
    ctx.fill()
    if (cur) {
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = '#e59a45'
      ctx.lineWidth = Math.max(1.5, unit * 0.05)
      ctx.beginPath(); ctx.arc(px, py, unit * 0.28, 0, TAU); ctx.stroke()
    }
  }
  ctx.restore()
}

/** rounded translucent panel behind choosers */
export function drawPanel(ctx: C, x: number, y: number, w: number, h: number, r: number, alpha = 0.7) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(66,40,18,0.55)'
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function bigText(ctx: C, text: string, x: number, y: number, size: number, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = clamp01(alpha)
  ctx.font = `700 ${size}px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.32
  ctx.strokeStyle = 'rgba(88,50,18,0.92)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = '#fffaf0'
  ctx.fillText(text, x, y)
  ctx.restore()
}
