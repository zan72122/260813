import { Rng, TAU } from './math'

export type Tex = HTMLCanvasElement

function make(w: number, h: number): { c: Tex; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  return { c, g }
}

/* ---------------- bamboo ---------------- */

/** vertical fibre streaks, drawn as a translucent overlay on rib fills */
export const bambooFiber = (() => {
  let cache: Tex | null = null
  return () => {
    if (cache) return cache
    const { c, g } = make(128, 128)
    const r = new Rng(7717)
    g.clearRect(0, 0, 128, 128)
    for (let i = 0; i < 190; i++) {
      const x = r.range(0, 128)
      const a = r.range(0.03, 0.13)
      const w = r.range(0.5, 1.9)
      g.strokeStyle = r.next() > 0.5 ? `rgba(255,250,215,${a})` : `rgba(96,80,40,${a})`
      g.lineWidth = w
      g.beginPath()
      g.moveTo(x, -4)
      g.bezierCurveTo(x + r.range(-2, 2), 40, x + r.range(-2, 2), 90, x + r.range(-1.5, 1.5), 132)
      g.stroke()
    }
    cache = c
    return c
  }
})()

/* ---------------- washi ---------------- */

/** cream paper with visible short fibres (kozo) */
export const washiFiber = (() => {
  let cache: Tex | null = null
  return () => {
    if (cache) return cache
    const { c, g } = make(180, 180)
    const r = new Rng(30311)
    g.clearRect(0, 0, 180, 180)
    for (let i = 0; i < 340; i++) {
      const x = r.range(0, 180), y = r.range(0, 180)
      const ang = r.range(0, TAU)
      const l = r.range(3, 16)
      g.strokeStyle = r.next() > 0.45
        ? `rgba(255,255,255,${r.range(0.06, 0.22)})`
        : `rgba(150,130,100,${r.range(0.03, 0.1)})`
      g.lineWidth = r.range(0.4, 1.3)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l)
      g.stroke()
    }
    // faint blotches so light grazes unevenly
    for (let i = 0; i < 26; i++) {
      const x = r.range(0, 180), y = r.range(0, 180), rad = r.range(10, 40)
      const grd = g.createRadialGradient(x, y, 0, x, y, rad)
      grd.addColorStop(0, `rgba(255,252,240,${r.range(0.02, 0.06)})`)
      grd.addColorStop(1, 'rgba(255,252,240,0)')
      g.fillStyle = grd
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    cache = c
    return c
  }
})()

/* ---------------- washi motifs ---------------- */

export type PatternId = 'kingyo' | 'asagao' | 'hanabi' | 'mizutama' | 'hoshi' | 'seigaiha'

export type PatternDef = {
  id: PatternId
  label: string
  base: string        // paper base colour
  accent: string      // swatch accent
}

export const PATTERNS: PatternDef[] = [
  { id: 'kingyo',   label: 'きんぎょ',   base: '#fdf6e6', accent: '#e8604c' },
  { id: 'asagao',   label: 'あさがお',   base: '#fbf7ee', accent: '#7d8fd6' },
  { id: 'hanabi',   label: 'はなび',     base: '#fdf3e2', accent: '#e2a33c' },
  { id: 'mizutama', label: 'みずたま',   base: '#fdf1f2', accent: '#ef9bb0' },
  { id: 'hoshi',    label: 'ほし',       base: '#fdf2f5', accent: '#f0a6c0' },
  { id: 'seigaiha', label: 'せいがいは', base: '#f7f4e8', accent: '#8fb9c4' }
]

const motifCache = new Map<PatternId, Tex>()

export function motifTile(id: PatternId): Tex {
  const hit = motifCache.get(id)
  if (hit) return hit
  const S = 160
  const { c, g } = make(S, S)
  const r = new Rng(id.length * 9173 + 31)
  g.clearRect(0, 0, S, S)

  const drawTiled = (fn: (x: number, y: number, k: number) => void, pts: [number, number][]) => {
    pts.forEach((p, i) => {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        fn(p[0] + ox * S, p[1] + oy * S, i)
      }
    })
  }

  if (id === 'kingyo') {
    const pts: [number, number][] = [[40, 44], [116, 96], [70, 126], [130, 26]]
    drawTiled((x, y, k) => {
      const s = k % 2 ? 0.8 : 1.05
      const ang = (k * 1.7) % TAU
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s)
      // body
      g.fillStyle = k % 3 === 0 ? '#f0806a' : '#e2543f'
      g.beginPath(); g.ellipse(0, 0, 14, 9, 0, 0, TAU); g.fill()
      // tail
      g.fillStyle = 'rgba(233,110,88,0.72)'
      g.beginPath()
      g.moveTo(-11, 0)
      g.quadraticCurveTo(-26, -13, -30, -3)
      g.quadraticCurveTo(-24, 0, -30, 5)
      g.quadraticCurveTo(-25, 12, -11, 2)
      g.fill()
      // eye
      g.fillStyle = '#3b2418'
      g.beginPath(); g.arc(8, -2.4, 1.7, 0, TAU); g.fill()
      g.restore()
    }, pts)
    // water ripples
    g.strokeStyle = 'rgba(140,180,196,0.35)'
    g.lineWidth = 1.2
    for (let i = 0; i < 6; i++) {
      const y = r.range(0, S)
      g.beginPath()
      for (let x = -10; x <= S + 10; x += 8) g.lineTo(x, y + Math.sin(x * 0.09 + i) * 3)
      g.stroke()
    }
  } else if (id === 'asagao') {
    const pts: [number, number][] = [[38, 40], [110, 100], [128, 30], [56, 118]]
    drawTiled((x, y, k) => {
      g.save(); g.translate(x, y); g.rotate((k * 0.9) % TAU)
      const col = k % 2 ? '#8e9fdd' : '#b393d4'
      g.fillStyle = col
      g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.fill()
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.6
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU
        g.beginPath(); g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6)
        g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); g.stroke()
      }
      g.fillStyle = '#f6e58d'
      g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill()
      g.restore()
    }, pts)
    // vines
    g.strokeStyle = 'rgba(120,160,110,0.5)'; g.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      const x0 = r.range(0, S)
      g.beginPath(); g.moveTo(x0, -6)
      g.bezierCurveTo(x0 + 30, 50, x0 - 30, 110, x0 + 8, S + 6)
      g.stroke()
    }
  } else if (id === 'hanabi') {
    const pts: [number, number][] = [[44, 46], [118, 104], [124, 24], [40, 122]]
    drawTiled((x, y, k) => {
      const cols = ['#e2a33c', '#e56f8a', '#78b6d4', '#a2cf8c']
      const col = cols[k % cols.length]
      const rad = 20 - (k % 2) * 6
      g.save(); g.translate(x, y)
      g.strokeStyle = col; g.lineWidth = 1.5; g.lineCap = 'round'
      const spokes = 14
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * TAU + k
        g.globalAlpha = 0.85
        g.beginPath(); g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4)
        g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); g.stroke()
        g.globalAlpha = 1
        g.fillStyle = col
        g.beginPath(); g.arc(Math.cos(a) * rad, Math.sin(a) * rad, 1.9, 0, TAU); g.fill()
      }
      g.restore()
    }, pts)
  } else if (id === 'mizutama') {
    const cols = ['#ef9bb0', '#f6c6a8', '#a8cfe0', '#f4e0a0']
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const x = gx * 40 + (gy % 2 ? 20 : 0) + 20
        const y = gy * 40 + 20
        const rad = 8 + (gx + gy) % 3 * 2.4
        g.fillStyle = cols[(gx + gy * 2) % cols.length]
        g.globalAlpha = 0.9
        g.beginPath(); g.arc(x % S, y, rad, 0, TAU); g.fill()
        g.globalAlpha = 0.35
        g.beginPath(); g.arc((x % S) - rad * 0.3, y - rad * 0.3, rad * 0.35, 0, TAU)
        g.fillStyle = '#fff'; g.fill()
        g.globalAlpha = 1
      }
    }
  } else if (id === 'hoshi') {
    const star = (x: number, y: number, rad: number, col: string, rot: number) => {
      g.save(); g.translate(x, y); g.rotate(rot)
      g.fillStyle = col
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? rad * 0.44 : rad
        const a = (i / 10) * TAU - Math.PI / 2
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.closePath(); g.fill(); g.restore()
    }
    const heart = (x: number, y: number, s: number, col: string) => {
      g.save(); g.translate(x, y); g.scale(s, s)
      g.fillStyle = col
      g.beginPath()
      g.moveTo(0, 4)
      g.bezierCurveTo(-7, -3, -4.5, -9, 0, -5.4)
      g.bezierCurveTo(4.5, -9, 7, -3, 0, 4)
      g.fill(); g.restore()
    }
    for (let i = 0; i < 16; i++) {
      const x = r.range(0, S), y = r.range(0, S)
      if (i % 3 === 0) heart(x, y, r.range(0.9, 1.5), '#f08cae')
      else star(x, y, r.range(4, 9), i % 2 ? '#f6d27a' : '#f4a8c4', r.range(0, TAU))
    }
  } else {
    // seigaiha — traditional wave scales
    const R = 26
    g.lineWidth = 1.5
    for (let row = -1; row < 5; row++) {
      for (let col = -1; col < 6; col++) {
        const x = col * R * 1.4 + (row % 2 ? R * 0.7 : 0)
        const y = row * R * 0.62
        for (let k = 0; k < 4; k++) {
          g.strokeStyle = k === 0 ? 'rgba(120,160,175,0.85)' : `rgba(143,185,196,${0.7 - k * 0.13})`
          g.beginPath()
          g.arc(x, y, R - k * 6, Math.PI, 0)
          g.stroke()
        }
      }
    }
  }
  motifCache.set(id, c)
  return c
}

/* ---------------- wood workbench ---------------- */

export const woodTex = (() => {
  let cache: Tex | null = null
  return () => {
    if (cache) return cache
    const { c, g } = make(256, 256)
    const r = new Rng(4242)
    g.fillStyle = '#a8763f'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 70; i++) {
      const y = r.range(0, 256)
      g.strokeStyle = r.next() > 0.5
        ? `rgba(255,225,180,${r.range(0.03, 0.12)})`
        : `rgba(90,55,25,${r.range(0.04, 0.14)})`
      g.lineWidth = r.range(1, 6)
      g.beginPath()
      g.moveTo(-10, y)
      g.bezierCurveTo(70, y + r.range(-7, 7), 170, y + r.range(-7, 7), 266, y + r.range(-5, 5))
      g.stroke()
    }
    for (let i = 0; i < 4; i++) {
      const x = r.range(0, 256), y = r.range(0, 256)
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = `rgba(85,50,22,${0.14 - k * 0.02})`
        g.lineWidth = 1.6
        g.beginPath(); g.ellipse(x, y, 4 + k * 4, 2.4 + k * 2.4, r.range(0, 3), 0, TAU); g.stroke()
      }
    }
    cache = c
    return c
  }
})()

export function patternOf(ctx: CanvasRenderingContext2D, tex: Tex): CanvasPattern {
  return ctx.createPattern(tex, 'repeat')!
}
