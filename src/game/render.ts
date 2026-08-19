import { Camera } from '../core/camera'
import { Vec3, clamp, clamp01, lerp, smooth, TAU } from '../core/math'
import { Uchiwa, BINS } from './uchiwa'
import { PATTERNS, motifTile, washiFiber } from '../core/textures'

export type Scene = {
  ctx: CanvasRenderingContext2D
  cam: Camera
  w: number
  h: number
  time: number
}

const LIGHT: Vec3 = { x: -0.42, y: 0.72, z: 0.55 }
const tmpA: Vec3 = { x: 0, y: 0, z: 0 }
const tmpB: Vec3 = { x: 0, y: 0, z: 0 }

const SAMPLES = 13

export const THREAD_COLORS = [
  { id: 'white', label: 'しろ', css: '#fbf7ee', dark: '#cfc4ad' },
  { id: 'pink', label: 'ピンク', css: '#f4a0bb', dark: '#d3768f' },
  { id: 'sky', label: 'みずいろ', css: '#9fd0e8', dark: '#6ea7c4' },
  { id: 'yellow', label: 'きいろ', css: '#f7d97a', dark: '#d3b258' },
  { id: 'rainbow', label: 'にじいろ', css: '#eab9e0', dark: '#b98fd0' }
]

function rgb(r: number, g: number, b: number, a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`
}

/* ------------------------------------------------------------------ */
/* workshop                                                            */
/* ------------------------------------------------------------------ */

export function drawWorkshop(s: Scene, warmth = 0, windowSide = 0) {
  const { ctx, w, h } = s
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, lerpHex('#f6e7c6', '#ffe9c0', warmth))
  g.addColorStop(0.42, lerpHex('#eed9ae', '#fcdfae', warmth))
  g.addColorStop(0.62, '#d8bd8f')
  g.addColorStop(1, '#9e7b4e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // soft window light from one side
  const wx = windowSide < 0 ? w * 0.16 : w * 0.82
  const rad = Math.max(w, h) * 0.85
  const gl = ctx.createRadialGradient(wx, h * 0.13, 0, wx, h * 0.13, rad)
  gl.addColorStop(0, 'rgba(255,246,214,0.85)')
  gl.addColorStop(0.35, 'rgba(255,240,200,0.28)')
  gl.addColorStop(1, 'rgba(255,236,190,0)')
  ctx.fillStyle = gl
  ctx.fillRect(0, 0, w, h)

  // shoji lattice hint behind
  ctx.save()
  ctx.globalAlpha = 0.14
  ctx.strokeStyle = '#8a6134'
  ctx.lineWidth = Math.max(2, h * 0.004)
  const top = h * 0.02, bot = h * 0.4
  for (let i = 0; i <= 4; i++) {
    const x = wx - w * 0.24 + (i / 4) * w * 0.48
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke()
  }
  for (let i = 0; i <= 3; i++) {
    const y = top + (i / 3) * (bot - top)
    ctx.beginPath(); ctx.moveTo(wx - w * 0.24, y); ctx.lineTo(wx + w * 0.24, y); ctx.stroke()
  }
  ctx.restore()
}

/** the workbench slab, projected from the world plane */
export function drawBench(s: Scene, y = -1.62) {
  const { ctx, cam } = s
  const corners: Vec3[] = [
    { x: -6.0, y, z: -3.6 },
    { x: 6.0, y, z: -3.6 },
    { x: 16.0, y, z: 7.5 },
    { x: -16.0, y, z: 7.5 }
  ]
  const p = corners.map(c => cam.project(c))
  if (p.some(q => !q.ok)) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(p[0].x, p[0].y)
  for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y)
  ctx.closePath()
  const top = Math.max(0, Math.min(...p.map(q => q.y)))
  const bottom = Math.min(s.h * 1.02, Math.max(...p.map(q => q.y)))
  const g = ctx.createLinearGradient(0, top, 0, Math.max(bottom, top + s.h * 0.25))
  g.addColorStop(0, '#b98a51')
  g.addColorStop(0.35, '#ab7a44')
  g.addColorStop(1, '#8b5f31')
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  // grain
  ctx.globalAlpha = 0.16
  ctx.lineWidth = Math.max(1, s.h * 0.0035)
  for (let i = 0; i < 16; i++) {
    const t = i / 16
    const yy = lerp(top, bottom, t)
    ctx.strokeStyle = i % 3 === 0 ? '#5d3d1c' : '#e8c288'
    ctx.beginPath()
    ctx.moveTo(-20, yy)
    ctx.bezierCurveTo(s.w * 0.3, yy + Math.sin(i * 2.3) * s.h * 0.012, s.w * 0.7, yy - Math.sin(i * 1.7) * s.h * 0.012, s.w + 20, yy)
    ctx.stroke()
  }
  ctx.restore()
  // soft ambient occlusion where the bench meets the back wall
  ctx.save()
  const hz = Math.min(p[0].y, p[1].y)
  const gg = ctx.createLinearGradient(0, hz - s.h * 0.09, 0, hz + s.h * 0.02)
  gg.addColorStop(0, 'rgba(90,58,26,0)')
  gg.addColorStop(1, 'rgba(78,48,20,0.30)')
  ctx.fillStyle = gg
  ctx.fillRect(0, hz - s.h * 0.09, s.w, s.h * 0.11)
  ctx.restore()
}

export function drawContactShadow(s: Scene, at: Vec3, rx: number, ry: number, alpha = 0.28) {
  const { ctx, cam } = s
  const p = cam.project(at)
  if (!p.ok) return
  const sx = rx * p.s, sy = ry * p.s
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(sx, sy))
  g.addColorStop(0, `rgba(60,36,14,${alpha})`)
  g.addColorStop(1, 'rgba(60,36,14,0)')
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(1, sy / Math.max(sx, 0.001))
  ctx.translate(-p.x, -p.y)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(sx, sy), 0, TAU); ctx.fill()
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* bamboo                                                              */
/* ------------------------------------------------------------------ */

function shadeOf(n: Vec3) {
  const d = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z
  return clamp01(0.42 + 0.58 * (d * 0.5 + 0.5))
}

/** the un-split part of the pole: one solid piece of bamboo */
export function drawPole(s: Scene, u: Uchiwa, y0: number, y1: number, alpha = 1, r0 = 1.06, r1 = 1.0) {
  const { ctx, cam } = s
  const seg = 10
  // the silhouette is built perpendicular to the handle's own projected axis,
  // so it stays correct when the finished uchiwa is waved around
  const axis: { x: number; y: number; rad: number }[] = []
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    const y = lerp(y0, y1, t)
    u.toWorld({ x: 0, y, z: 0 }, tmpA)
    const p = cam.project(tmpA)
    if (!p.ok) return
    axis.push({ x: p.x, y: p.y, rad: u.R * lerp(r0, r1, t) * p.s })
  }
  const L: { x: number; y: number }[] = []
  const R: { x: number; y: number }[] = []
  for (let i = 0; i <= seg; i++) {
    const a = axis[Math.max(0, i - 1)]
    const b = axis[Math.min(seg, i + 1)]
    let dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    dx /= len; dy /= len
    const nx = -dy, ny = dx
    const r = axis[i].rad
    L.push({ x: axis[i].x - nx * r, y: axis[i].y - ny * r })
    R.push({ x: axis[i].x + nx * r, y: axis[i].y + ny * r })
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(L[0].x, L[0].y)
  for (const p of L) ctx.lineTo(p.x, p.y)
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y)
  ctx.closePath()
  const m = Math.floor(seg / 2)
  const g = ctx.createLinearGradient(L[m].x, L[m].y, R[m].x, R[m].y)
  const skin = bambooSkin(u.bambooHue)
  g.addColorStop(0, shade(skin, 0.52))
  g.addColorStop(0.34, shade(skin, 1.12))
  g.addColorStop(0.62, shade(skin, 0.92))
  g.addColorStop(1, shade(skin, 0.48))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  for (const ny of [-0.42, -0.95, 0.52, 1.15]) {
    const t = (ny - y0) / (y1 - y0)
    if (t < 0 || t > 1) continue
    const idx = clamp(Math.round(t * seg), 0, seg)
    ctx.strokeStyle = 'rgba(96,74,34,0.5)'
    ctx.lineWidth = Math.max(1.5, s.h * 0.004)
    ctx.beginPath(); ctx.moveTo(L[idx].x, L[idx].y); ctx.lineTo(R[idx].x, R[idx].y); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,244,208,0.45)'
    ctx.lineWidth = Math.max(1, s.h * 0.002)
    ctx.beginPath(); ctx.moveTo(L[idx].x, L[idx].y - 2); ctx.lineTo(R[idx].x, R[idx].y - 2); ctx.stroke()
  }
  ctx.restore()
}

export function drawHandle(s: Scene, u: Uchiwa, alpha = 1) {
  drawPole(s, u, -u.handleLen, 0.02, alpha, 1.06, 1.0)
}

function bambooSkin(hue: number) {
  // 0 = fresh green bamboo, 1 = dried amber
  return {
    r: lerp(163, 208, hue),
    g: lerp(180, 165, hue),
    b: lerp(112, 104, hue)
  }
}
const INNER = { r: 236, g: 222, b: 183 }

function shade(c: { r: number; g: number; b: number }, k: number, a = 1) {
  return rgb(clamp(c.r * k, 0, 255), clamp(c.g * k, 0, 255), clamp(c.b * k, 0, 255), a)
}

type RibDraw = {
  i: number
  depth: number
  L: { x: number; y: number }[]
  R: { x: number; y: number }[]
  mid: { x: number; y: number }
  shade: number
  t: number
}

export function buildRibs(s: Scene, u: Uchiwa): RibDraw[] {
  const { cam } = s
  const out: RibDraw[] = []
  for (let i = 0; i < u.N; i++) {
    const rib = u.ribs[i]
    // once the shape is hammered out, the ribs end inside the paper outline
    const maxU = lerp(1, u.paperRadius(u.ribFrac(i)) * 0.96, smooth(u.trim))
    const phi = ((i + 0.5) / u.N) * TAU
    const ang = u.ribAngle(i) + rib.sway
    const Ls: { x: number; y: number }[] = []
    const Rs: { x: number; y: number }[] = []
    let depth = 0
    let ok = true
    let mid = { x: 0, y: 0 }
    for (let k = 0; k < SAMPLES; k++) {
      const uu = (k / (SAMPLES - 1)) * maxU
      const b = smooth((uu - (1 - rib.t)) / 0.34)
      u.ribPointLocal(i, uu, tmpA)
      const hw = u.ribHalfWidth(i, uu)
      // width direction blends from "around the pole" to "across the fan"
      const wx = lerp(-Math.sin(phi), Math.cos(ang), b)
      const wy = lerp(0, -Math.sin(ang), b)
      const wz = lerp(Math.cos(phi), 0, b)
      const wl = Math.hypot(wx, wy, wz) || 1
      const lx = tmpA.x - (wx / wl) * hw, ly = tmpA.y - (wy / wl) * hw, lz = tmpA.z - (wz / wl) * hw
      const rx = tmpA.x + (wx / wl) * hw, ry = tmpA.y + (wy / wl) * hw, rz = tmpA.z + (wz / wl) * hw
      tmpB.x = lx; tmpB.y = ly; tmpB.z = lz
      const lp = cam.project(u.toWorld(tmpB, tmpB))
      tmpB.x = rx; tmpB.y = ry; tmpB.z = rz
      const rp = cam.project(u.toWorld(tmpB, tmpB))
      if (!lp.ok || !rp.ok) { ok = false; break }
      Ls.push({ x: lp.x, y: lp.y })
      Rs.push({ x: rp.x, y: rp.y })
      depth += lp.z
      if (k === Math.floor(SAMPLES / 2)) mid = { x: (lp.x + rp.x) / 2, y: (lp.y + rp.y) / 2 }
    }
    if (!ok) continue
    // lighting: normal blends from radial (pole) to fan-facing
    const b = smooth((0.6 - (1 - rib.t)) / 0.34)
    const nx = lerp(Math.cos(phi), -Math.sin(ang) * 0.34, b)
    const ny = lerp(0, 0.06, b)
    const nz = lerp(Math.sin(phi), 0.94, b)
    const nl = Math.hypot(nx, ny, nz) || 1
    out.push({
      i, depth: depth / SAMPLES, L: Ls, R: Rs, mid,
      shade: shadeOf({ x: nx / nl, y: ny / nl, z: nz / nl }),
      t: rib.t
    })
  }
  out.sort((a, b2) => b2.depth - a.depth)
  return out
}

export function drawRibs(s: Scene, u: Uchiwa, ribs: RibDraw[], opts: { glueAlpha?: number } = {}) {
  const { ctx } = s
  const skin = bambooSkin(u.bambooHue)
  const px = Math.max(1, s.h * 0.0016)
  for (const rd of ribs) {
    const i = rd.i
    ctx.beginPath()
    ctx.moveTo(rd.L[0].x, rd.L[0].y)
    for (let k = 1; k < rd.L.length; k++) ctx.lineTo(rd.L[k].x, rd.L[k].y)
    for (let k = rd.R.length - 1; k >= 0; k--) ctx.lineTo(rd.R[k].x, rd.R[k].y)
    ctx.closePath()

    const km = Math.floor(rd.L.length / 2)
    const g = ctx.createLinearGradient(rd.L[km].x, rd.L[km].y, rd.R[km].x, rd.R[km].y)
    // outer skin vs freshly-split inner face
    const mixT = clamp01(rd.t * 0.92)
    const col = {
      r: lerp(skin.r, INNER.r, mixT),
      g: lerp(skin.g, INNER.g, mixT),
      b: lerp(skin.b, INNER.b, mixT)
    }
    const sh = rd.shade
    g.addColorStop(0, shade(col, sh * 0.72))
    g.addColorStop(0.45, shade(col, sh * 1.16))
    g.addColorStop(1, shade(col, sh * 0.8))
    ctx.fillStyle = g
    ctx.fill()

    // longitudinal fibre
    ctx.save()
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = 'rgba(120,96,48,0.5)'
    ctx.lineWidth = px
    for (const f of [0.32, 0.68]) {
      ctx.beginPath()
      for (let k = 0; k < rd.L.length; k++) {
        const x = lerp(rd.L[k].x, rd.R[k].x, f)
        const y = lerp(rd.L[k].y, rd.R[k].y, f)
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()

    // split edge highlight — reads as a crisp freshly-cut edge
    // start past the hub: twenty highlights meeting at one point read as a
    // bright ring artefact rather than as bamboo
    const K0 = 3
    ctx.strokeStyle = `rgba(255,250,224,${0.28 + 0.4 * rd.t})`
    ctx.lineWidth = px * 1.2
    ctx.beginPath()
    for (let k = K0; k < rd.L.length; k++) {
      if (k === K0) ctx.moveTo(rd.L[k].x, rd.L[k].y); else ctx.lineTo(rd.L[k].x, rd.L[k].y)
    }
    ctx.stroke()
    ctx.strokeStyle = `rgba(90,66,30,${0.22 + 0.26 * rd.t})`
    ctx.beginPath()
    for (let k = K0; k < rd.R.length; k++) {
      if (k === K0) ctx.moveTo(rd.R[k].x, rd.R[k].y); else ctx.lineTo(rd.R[k].x, rd.R[k].y)
    }
    ctx.stroke()

    // glue sheen
    const gl = u.glue[u.binOf(i)] ?? 0
    if (gl > 0.01 && (opts.glueAlpha ?? 1) > 0) {
      ctx.save()
      ctx.globalAlpha = clamp01(gl) * 0.75 * (opts.glueAlpha ?? 1)
      ctx.beginPath()
      ctx.moveTo(rd.L[0].x, rd.L[0].y)
      for (let k = 1; k < rd.L.length; k++) ctx.lineTo(rd.L[k].x, rd.L[k].y)
      for (let k = rd.R.length - 1; k >= 0; k--) ctx.lineTo(rd.R[k].x, rd.R[k].y)
      ctx.closePath()
      ctx.fillStyle = 'rgba(196,176,120,0.55)'
      ctx.fill()
      // wet specular streak
      ctx.globalAlpha = clamp01(gl) * 0.5
      ctx.strokeStyle = 'rgba(255,255,236,0.8)'
      ctx.lineWidth = px * 1.6
      ctx.beginPath()
      for (let k = 0; k < rd.L.length; k++) {
        const x = lerp(rd.L[k].x, rd.R[k].x, 0.38)
        const y = lerp(rd.L[k].y, rd.R[k].y, 0.38)
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
}

/** the notch cuts made in module 2, drawn on the still-closed pole */
export function drawNotches(s: Scene, u: Uchiwa, ribs: RibDraw[]) {
  if (u.notch <= 0.001) return
  const { ctx } = s
  const px = Math.max(1.2, s.h * 0.0022)
  ctx.save()
  for (const rd of ribs) {
    if (rd.t > 0.02) continue
    const from = 1 - u.notch
    const pts: { x: number; y: number }[] = []
    for (let k = 0; k < rd.L.length; k++) {
      if (k / (rd.L.length - 1) < from) continue
      pts.push(rd.L[k])
    }
    if (pts.length < 2) continue
    // a fine dark score with a lit lip beside it: a cut, not a burn
    ctx.lineWidth = px * 0.9
    ctx.strokeStyle = 'rgba(72,52,22,0.3)'
    strokePoly(ctx, pts, 0)
    ctx.lineWidth = px * 0.7
    ctx.strokeStyle = 'rgba(255,250,222,0.34)'
    strokePoly(ctx, pts, -px * 0.9)
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* bow bamboo (module 4)                                               */
/* ------------------------------------------------------------------ */

export function drawBow(s: Scene, u: Uchiwa, insertion: number, ghost = false) {
  if (insertion <= 0 && !ghost) return
  const { ctx, cam } = s
  const uu = 0.30
  const pts: { x: number; y: number }[] = []
  const half = u.halfSpread
  const steps = 24
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    const ang = lerp(-half, half, f) * 0.96
    const rr = uu * u.L * 1.02
    const local: Vec3 = {
      x: Math.sin(ang) * rr,
      y: Math.cos(ang) * rr,
      z: u.dome * Math.sin(uu * Math.PI * 0.86) * Math.cos(ang * 1.05) + 0.045
    }
    const p = cam.project(u.toWorld(local, tmpA))
    if (!p.ok) return
    pts.push(p)
  }
  const shown = ghost ? steps : Math.max(1, Math.floor(steps * clamp01(insertion)))
  ctx.save()
  if (ghost) {
    ctx.globalAlpha = 0.5 + 0.18 * Math.sin(s.time * 3.4)
    ctx.setLineDash([s.h * 0.02, s.h * 0.016])
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const w = Math.max(3, s.h * 0.011)
  ctx.strokeStyle = ghost ? 'rgba(86,54,22,0.75)' : 'rgba(120,92,44,0.55)'
  ctx.lineWidth = w * (ghost ? 1.7 : 1.25)
  ctx.beginPath()
  for (let k = 0; k <= shown; k++) { if (k === 0) ctx.moveTo(pts[k].x, pts[k].y); else ctx.lineTo(pts[k].x, pts[k].y) }
  ctx.stroke()
  if (ghost) {
    ctx.strokeStyle = 'rgba(255,252,228,0.95)'
    ctx.lineWidth = w * 0.9
    ctx.beginPath()
    for (let k = 0; k <= shown; k++) { if (k === 0) ctx.moveTo(pts[k].x, pts[k].y); else ctx.lineTo(pts[k].x, pts[k].y) }
    ctx.stroke()
  }
  if (!ghost) {
    ctx.strokeStyle = '#c9a15c'
    ctx.lineWidth = w
    ctx.beginPath()
    for (let k = 0; k <= shown; k++) { if (k === 0) ctx.moveTo(pts[k].x, pts[k].y); else ctx.lineTo(pts[k].x, pts[k].y) }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,246,214,0.75)'
    ctx.lineWidth = w * 0.32
    ctx.beginPath()
    for (let k = 0; k <= shown; k++) {
      const y = pts[k].y - w * 0.28
      if (k === 0) ctx.moveTo(pts[k].x, y); else ctx.lineTo(pts[k].x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* thread (module 5)                                                   */
/* ------------------------------------------------------------------ */

export function drawThread(s: Scene, u: Uchiwa, pass: 'back' | 'front' = 'back') {
  if (u.thread <= 0.001) return
  const { ctx, cam } = s
  const col = THREAD_COLORS[u.threadColor % THREAD_COLORS.length]
  const uu = 0.62
  const pts: { x: number; y: number; i: number }[] = []
  for (let i = 0; i < u.N; i++) {
    if (!u.threadHit[i]) continue
    const ang = u.ribAngle(i) + u.ribs[i].sway
    const local: Vec3 = {
      x: Math.sin(ang) * uu * u.L,
      y: Math.cos(ang) * uu * u.L,
      z: u.dome * Math.sin(uu * Math.PI * 0.86) * Math.cos(ang * 1.05) + 0.055
    }
    const p = cam.project(u.toWorld(local, tmpA))
    if (p.ok) pts.push({ x: p.x, y: p.y, i })
  }
  if (pts.length < 2) return
  const w = Math.max(2, s.h * 0.005)
  const stroke = () => {
    if (col.id === 'rainbow') {
      const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y)
      g.addColorStop(0, '#f6b8c8'); g.addColorStop(0.3, '#f8e3a6')
      g.addColorStop(0.6, '#aee3c6'); g.addColorStop(1, '#c2c0ee')
      ctx.strokeStyle = g
    } else ctx.strokeStyle = col.css
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pass === 'back') {
    // the full run of thread, drawn under the ribs
    ctx.strokeStyle = 'rgba(70,50,26,0.22)'
    ctx.lineWidth = w * 1.55
    strokePoly(ctx, pts, 1.4)
    stroke()
    ctx.lineWidth = w
    strokePoly(ctx, pts, 0)
  } else {
    // every other rib the thread comes back over the top: that alternation is
    // what makes it read as woven rather than painted on
    for (let k = 0; k < pts.length; k++) {
      if (pts[k].i % 2 !== 0) continue
      const a = k > 0 ? mid(pts[k - 1], pts[k]) : pts[k]
      const b = k < pts.length - 1 ? mid(pts[k], pts[k + 1]) : pts[k]
      const seg = [a, pts[k], b]
      ctx.strokeStyle = 'rgba(70,50,26,0.22)'
      ctx.lineWidth = w * 1.55
      strokePoly(ctx, seg, 1.4)
      stroke()
      ctx.lineWidth = w
      strokePoly(ctx, seg, 0)
    }
  }
  ctx.restore()
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** rounded polyline — creases should never look like ruled lines */
function smoothPoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], dy: number) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y + dy)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2 + dy
    ctx.quadraticCurveTo(pts[i].x, pts[i].y + dy, mx, my)
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y + dy)
  ctx.stroke()
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], dy: number) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y + dy)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y + dy)
  ctx.stroke()
}

/* ------------------------------------------------------------------ */
/* washi paper (modules 8-10)                                          */
/* ------------------------------------------------------------------ */

/** a lifted sheet floats up and toward the viewer, so it visibly descends */
const paperY = (lift: number) => lift * 1.6
const paperZ = (lift: number) => 0.06 + lift * 0.35

function paperOutline(u: Uchiwa, cam: Camera, lift: number, scaleK = 1) {
  const N = 46
  const half = u.halfSpread
  const local: { x: number; y: number }[] = []
  for (let k = 0; k <= N; k++) {
    const f = k / N
    const ang = lerp(-half, half, f) * 1.05
    const rr = u.paperRadius(f) * u.L * scaleK
    local.push({ x: Math.sin(ang) * rr, y: Math.cos(ang) * rr })
  }
  // the bottom of the head wraps down around the top of the handle — this is
  // what makes the silhouette read as an uchiwa rather than a folding fan
  const a = local[local.length - 1]
  const b = local[0]
  const dip = -0.15 * u.L * scaleK
  const M = 14
  for (let k = 1; k < M; k++) {
    const t = k / M
    const mt = 1 - t
    const c1x = a.x * 0.52, c2x = b.x * 0.52
    local.push({
      x: mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * dip + 3 * mt * t * t * dip + t * t * t * b.y
    })
  }
  const pts: { x: number; y: number }[] = []
  for (const l of local) {
    const ang = Math.atan2(l.x, Math.max(0.001, l.y))
    const z = u.dome * Math.sin(0.8 * Math.PI * 0.86) * Math.cos(ang * 1.05) + paperZ(lift)
    const p = cam.project(u.toWorld({ x: l.x, y: l.y + paperY(lift), z }, tmpA))
    if (!p.ok) return null
    pts.push({ x: p.x, y: p.y })
  }
  return { outer: pts, rim: N }
}

function paperPath(ctx: CanvasRenderingContext2D, o: { outer: { x: number; y: number }[] }) {
  ctx.beginPath()
  ctx.moveTo(o.outer[0].x, o.outer[0].y)
  for (let i = 1; i < o.outer.length; i++) ctx.lineTo(o.outer[i].x, o.outer[i].y)
  ctx.closePath()
}

/** basis for mapping a repeating tile onto the fan plane */
function planeBasis(u: Uchiwa, cam: Camera, lift: number, tileWorld: number, tilePx: number) {
  const yo = paperY(lift), zo = paperZ(lift)
  const o = cam.project(u.toWorld({ x: 0, y: yo, z: zo }, tmpA))
  const px = cam.project(u.toWorld({ x: tileWorld, y: yo, z: zo }, tmpA))
  const py = cam.project(u.toWorld({ x: 0, y: tileWorld + yo, z: zo }, tmpA))
  if (!o.ok || !px.ok || !py.ok) return null
  return {
    a: (px.x - o.x) / tilePx, b: (px.y - o.y) / tilePx,
    c: (py.x - o.x) / tilePx, d: (py.y - o.y) / tilePx,
    e: o.x, f: o.y
  }
}

export function drawPaper(s: Scene, u: Uchiwa, lift: number, alpha = 1, scaleK = 1) {
  const { ctx, cam } = s
  const o = paperOutline(u, cam, lift, scaleK)
  if (!o) return
  const def = PATTERNS[u.paperPattern % PATTERNS.length]
  ctx.save()
  ctx.globalAlpha = alpha
  paperPath(ctx, o)
  // drop shadow onto the ribs while the sheet is still floating
  if (lift > 0.001) {
    ctx.save()
    ctx.translate(lift * 90, lift * 104)
    ctx.fillStyle = `rgba(52,32,12,${clamp01(lift * 4.5) * 0.26})`
    ctx.fill()
    ctx.restore()
    paperPath(ctx, o)
  }
  ctx.fillStyle = def.base
  ctx.fill()
  ctx.save()
  ctx.clip()

  // fibre + motif, mapped onto the fan plane
  const fib = planeBasis(u, cam, lift, 0.62, 180)
  if (fib) {
    const pat = ctx.createPattern(washiFiber(), 'repeat')
    if (pat) {
      ctx.save()
      ctx.globalAlpha = alpha * 0.85
      ctx.transform(fib.a, fib.b, fib.c, fib.d, fib.e, fib.f)
      ctx.fillStyle = pat
      ctx.fillRect(-4000, -4000, 8000, 8000)
      ctx.restore()
    }
  }
  const mb = planeBasis(u, cam, lift, 0.52, 160)
  if (mb) {
    const pat = ctx.createPattern(motifTile(def.id), 'repeat')
    if (pat) {
      ctx.save()
      ctx.globalAlpha = alpha * 0.92
      ctx.transform(mb.a, mb.b, mb.c, mb.d, mb.e, mb.f)
      ctx.fillStyle = pat
      ctx.fillRect(-4000, -4000, 8000, 8000)
      ctx.restore()
    }
  }

  // ribs showing through, revealed by the roller
  if (u.roller > 0.001) drawRibShowThrough(s, u, lift)

  // wrinkles that have not been smoothed away yet
  drawWrinkles(s, u, lift)

  // soft shading so the sheet is not flat
  const top = Math.min(...o.outer.map(p => p.y))
  const bot = Math.max(...o.outer.map(p => p.y))
  const gg = ctx.createLinearGradient(0, top, 0, bot)
  gg.addColorStop(0, 'rgba(255,255,255,0.16)')
  gg.addColorStop(0.55, 'rgba(255,248,225,0.0)')
  gg.addColorStop(1, 'rgba(120,84,40,0.16)')
  ctx.fillStyle = gg
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.restore()

  // rim
  paperPath(ctx, o)
  ctx.strokeStyle = 'rgba(120,90,50,0.35)'
  ctx.lineWidth = Math.max(1, s.h * 0.0018)
  ctx.stroke()
  ctx.restore()
}

function drawRibShowThrough(s: Scene, u: Uchiwa, lift: number) {
  const { ctx, cam } = s
  const px = Math.max(1, s.h * 0.0022)
  ctx.save()
  for (let i = 0; i < u.N; i++) {
    const f = u.ribFrac(i)
    // roller sweeps top -> bottom of the fan; reveal follows it
    const reveal = clamp01((u.roller * 1.25) - 0.0)
    if (reveal <= 0) continue
    const ang = u.ribAngle(i) + u.ribs[i].sway
    const maxU = u.paperRadius(f)
    const pts: { x: number; y: number }[] = []
    const steps = 9
    for (let k = 0; k <= steps; k++) {
      const uu = lerp(0.08, maxU * 0.99, k / steps)
      const z = u.dome * Math.sin(uu * Math.PI * 0.86) * Math.cos(ang * 1.05) + paperZ(lift) - 0.01
      const p = cam.project(u.toWorld({ x: Math.sin(ang) * uu * u.L, y: Math.cos(ang) * uu * u.L + paperY(lift), z }, tmpA))
      if (!p.ok) { pts.length = 0; break }
      pts.push(p)
    }
    if (pts.length < 2) continue
    // the roller travels from the rim toward the handle, and the ribs surface
    // exactly where it has passed
    const cut = Math.max(2, Math.floor(pts.length * clamp01(reveal)))
    const sub = pts.slice(pts.length - cut)
    ctx.globalAlpha = 0.24 * clamp01(u.roller * 1.4)
    ctx.strokeStyle = 'rgba(104,78,40,1)'
    ctx.lineWidth = px * 1.7
    strokePoly(ctx, sub, 0)
    ctx.globalAlpha = 0.32 * clamp01(u.roller * 1.4)
    ctx.strokeStyle = 'rgba(255,252,236,1)'
    ctx.lineWidth = px * 0.8
    strokePoly(ctx, sub, -px * 1.4)
  }
  ctx.restore()
}

function drawWrinkles(s: Scene, u: Uchiwa, lift: number) {
  const { ctx, cam } = s
  ctx.save()
  const half = u.halfSpread
  const step = (half * 2 * 1.05) / (BINS - 1)
  for (let b = 1; b < BINS; b += 3) {
    const smoothed = clamp01(u.wrinkle[b] ?? 0)
    const amt = 1 - smoothed
    if (amt < 0.03) continue
    const f = b / (BINS - 1)
    const ang = lerp(-half, half, f) * 1.05
    const rStart = lerp(0.26, 0.94, smoothed)
    const outer = u.paperRadius(f) * 0.96
    if (outer <= rStart) continue
    // creases run across the fan, never along it — so they can never be
    // mistaken for the rib lines the roller is about to reveal
    for (let j = 0; j < 2; j++) {
      const rr = lerp(rStart + 0.06, outer, (j + 0.5) / 2 + Math.sin(b * 1.7 + j) * 0.09)
      if (rr <= rStart || rr >= outer) continue
      const pts: { x: number; y: number }[] = []
      for (let k = 0; k <= 5; k++) {
        const a2 = ang + (k / 5 - 0.5) * step * 3.0
        const wob = Math.sin(k * 1.4 + b * 2.3 + j * 2.1) * 0.02 * amt
        const p = cam.project(u.toWorld({
          x: Math.sin(a2) * (rr + wob) * u.L,
          y: Math.cos(a2) * (rr + wob) * u.L + paperY(lift),
          z: paperZ(lift) + 0.002
        }, tmpA))
        if (!p.ok) { pts.length = 0; break }
        pts.push(p)
      }
      if (pts.length < 2) continue
      ctx.globalAlpha = amt * 0.2
      ctx.strokeStyle = 'rgba(126,100,60,1)'
      ctx.lineWidth = Math.max(2.2, s.h * 0.006)
      smoothPoly(ctx, pts, 0)
      ctx.globalAlpha = amt * 0.16
      ctx.strokeStyle = 'rgba(255,255,250,1)'
      ctx.lineWidth = Math.max(1.4, s.h * 0.003)
      smoothPoly(ctx, pts, -Math.max(2, s.h * 0.0042))
    }
  }
  ctx.restore()
}

/** the loose bow bamboo, lying beside the fan before it is pushed through */
export function drawLooseBow(s: Scene, x: number, y: number, len: number, tilt: number) {
  const { ctx } = s
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.lineCap = 'round'
  const w = Math.max(4, s.h * 0.014)
  ctx.strokeStyle = 'rgba(60,38,14,0.25)'
  ctx.lineWidth = w * 1.3
  ctx.beginPath()
  ctx.moveTo(-len * 0.5, w * 0.7)
  ctx.quadraticCurveTo(0, -len * 0.1 + w * 0.7, len * 0.5, w * 0.7)
  ctx.stroke()
  ctx.strokeStyle = '#c9a15c'
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(-len * 0.5, 0)
  ctx.quadraticCurveTo(0, -len * 0.1, len * 0.5, 0)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,246,214,0.8)'
  ctx.lineWidth = w * 0.28
  ctx.beginPath()
  ctx.moveTo(-len * 0.44, -w * 0.28)
  ctx.quadraticCurveTo(0, -len * 0.1 - w * 0.28, len * 0.44, -w * 0.28)
  ctx.stroke()
  ctx.restore()
}

/** the template outline the mallet is shaping the paper toward */
export function drawTrimGuide(s: Scene, u: Uchiwa, alpha: number) {
  const keep = u.trim
  u.trim = 1
  const o = paperOutline(u, s.cam, 0)
  u.trim = keep
  if (!o) return
  const { ctx } = s
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.setLineDash([s.h * 0.016, s.h * 0.013])
  ctx.strokeStyle = 'rgba(92,60,26,0.9)'
  ctx.lineWidth = Math.max(2, s.h * 0.005)
  paperPath(ctx, o)
  ctx.stroke()
  ctx.restore()
}

/** decorative edge strip glued around the rim (module 10) */
export function drawEdgeStrip(s: Scene, u: Uchiwa) {
  if (u.edge <= 0.001) return
  const o = paperOutline(u, s.cam, 0)
  if (!o) return
  const { ctx } = s
  const pts = o.outer
  const shown = Math.max(1, Math.floor((pts.length - 1) * clamp01(u.edge)))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const def = PATTERNS[u.paperPattern % PATTERNS.length]
  ctx.strokeStyle = def.accent
  ctx.lineWidth = Math.max(3, s.h * 0.0082)
  ctx.beginPath()
  for (let k = 0; k <= shown; k++) { if (k === 0) ctx.moveTo(pts[k].x, pts[k].y); else ctx.lineTo(pts[k].x, pts[k].y) }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.42)'
  ctx.lineWidth = Math.max(1, s.h * 0.0026)
  ctx.beginPath()
  for (let k = 0; k <= shown; k++) { if (k === 0) ctx.moveTo(pts[k].x, pts[k].y - 1.5); else ctx.lineTo(pts[k].x, pts[k].y - 1.5) }
  ctx.stroke()
  ctx.restore()
}

export function lerpHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const r = lerp((pa >> 16) & 255, (pb >> 16) & 255, t)
  const g = lerp((pa >> 8) & 255, (pb >> 8) & 255, t)
  const bl = lerp(pa & 255, pb & 255, t)
  return rgb(r, g, bl)
}
