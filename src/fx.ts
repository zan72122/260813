interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  hue: number
  spin: number
  rot: number
  star: boolean
}

/** 種を固定できる小さな乱数 (テストで同じ絵にするため) */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** キラキラだけを描く 2D レイヤー。重い時は粒の数を減らす。 */
export class Fx {
  private ctx: CanvasRenderingContext2D | null
  private canvas: HTMLCanvasElement
  private parts: Particle[] = []
  private rnd: () => number
  private dpr = 1
  private budget: number

  constructor(canvas: HTMLCanvasElement, seed = 12345, budget = 220) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.rnd = makeRandom(seed)
    this.budget = budget
  }

  resize(dprCap: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    this.dpr = dpr
    const w = Math.max(1, Math.round((this.canvas.clientWidth || window.innerWidth) * dpr))
    const h = Math.max(1, Math.round((this.canvas.clientHeight || window.innerHeight) * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  get count(): number {
    return this.parts.length
  }

  clear(): void {
    this.parts.length = 0
  }

  private push(p: Particle): void {
    if (this.parts.length >= this.budget) return
    this.parts.push(p)
  }

  /** 押した瞬間、レンズのふちから外へ散る粒 */
  burst(cx: number, cy: number, radius: number, n = 14, squash = 0.82): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2
      const sp = 40 + this.rnd() * 150
      this.push({
        x: cx + Math.cos(a) * radius,
        y: cy + Math.sin(a) * radius * squash,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * squash - 30,
        life: 0,
        max: 0.5 + this.rnd() * 0.5,
        size: 2 + this.rnd() * 4,
        hue: this.rnd() * 360,
        spin: (this.rnd() - 0.5) * 8,
        rot: this.rnd() * 6.28,
        star: this.rnd() > 0.55,
      })
    }
  }

  /** ライト点灯やチャレンジ成功のときに、ふわっと上がる粒 */
  twinkle(cx: number, cy: number, radius: number, n = 18): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2
      const rr = radius * (0.3 + this.rnd() * 0.9)
      this.push({
        x: cx + Math.cos(a) * rr,
        y: cy + Math.sin(a) * rr * 0.8,
        vx: (this.rnd() - 0.5) * 30,
        vy: -20 - this.rnd() * 70,
        life: 0,
        max: 0.9 + this.rnd() * 0.8,
        size: 2.5 + this.rnd() * 4.5,
        hue: this.rnd() * 360,
        spin: (this.rnd() - 0.5) * 5,
        rot: this.rnd() * 6.28,
        star: true,
      })
    }
  }

  /** ごほうびの紙ふぶき */
  confetti(w: number, h: number, n = 70): void {
    for (let i = 0; i < n; i++) {
      this.push({
        x: this.rnd() * w,
        y: -20 - this.rnd() * h * 0.4,
        vx: (this.rnd() - 0.5) * 90,
        vy: 90 + this.rnd() * 170,
        life: 0,
        max: 1.8 + this.rnd() * 1.2,
        size: 4 + this.rnd() * 6,
        hue: this.rnd() * 360,
        spin: (this.rnd() - 0.5) * 12,
        rot: this.rnd() * 6.28,
        star: this.rnd() > 0.5,
      })
    }
  }

  update(dt: number): void {
    const parts = this.parts
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life += dt
      if (p.life >= p.max) {
        parts[i] = parts[parts.length - 1]
        parts.pop()
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 210 * dt
      p.vx *= 1 - 1.4 * dt
      p.rot += p.spin * dt
    }
  }

  draw(): void {
    const ctx = this.ctx
    if (!ctx) return
    const dpr = this.dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!this.parts.length) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.parts) {
      const k = 1 - p.life / p.max
      const a = k * k
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = `hsla(${p.hue}, 95%, ${62 + 25 * k}%, ${a})`
      if (p.star) {
        const s = p.size * (0.6 + k * 0.7)
        ctx.beginPath()
        ctx.moveTo(0, -s)
        ctx.lineTo(s * 0.3, -s * 0.3)
        ctx.lineTo(s, 0)
        ctx.lineTo(s * 0.3, s * 0.3)
        ctx.lineTo(0, s)
        ctx.lineTo(-s * 0.3, s * 0.3)
        ctx.lineTo(-s, 0)
        ctx.lineTo(-s * 0.3, -s * 0.3)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size * (0.5 + k * 0.6), 0, 6.2832)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
