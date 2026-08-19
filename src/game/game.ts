import { Camera, CamSpec } from '../core/camera'
import { Input } from '../core/input'
import { Uchiwa } from './uchiwa'
import { Layout, makeLayout } from './framing'
import { Particles, Words } from './fx'
import { Scene } from './render'
import { initAudio, unlockAudio, sfx, setMuted, isMuted } from '../core/audio'
import { Btn, hitBtn, drawButton } from './ui'

export type HintKind = 'tap' | 'swipeH' | 'swipeV' | 'drag' | 'trace' | 'none'

export type Hint = {
  kind: HintKind
  x: number
  y: number
  dx?: number
  dy?: number
  r?: number
}

export interface Stage {
  id: string
  enter(g: Game, from?: string): void
  update(g: Game, dt: number): void
  draw(g: Game): void
  exit?(g: Game): void
}

export class Game {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  cam = new Camera()
  input: Input
  u = new Uchiwa(1234)
  particles = new Particles()
  words = new Words()
  layout: Layout
  time = 0
  dpr = 1
  stages = new Map<string, Stage>()
  cur: Stage | null = null
  curId = ''
  hint: Hint = { kind: 'none', x: 0, y: 0 }
  hintDelay = 3.2
  buttons: Btn[] = []
  camTarget: CamSpec | null = null
  camRate = 3.6
  stageIndex = 0
  totalSteps = 10
  flash = 0
  /** screen-space impact shake */
  shakeAmt = 0
  shakeT = 0
  /** brief slow-motion, used to let the big moments land */
  timeScale = 1
  private timeScaleT = 0
  /** counts finished uchiwa this session so the gallery grows */
  made: number[] = []
  seedCounter = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const c = canvas.getContext('2d', { alpha: false })
    if (!c) throw new Error('2d context unavailable')
    this.ctx = c
    this.input = new Input(canvas)
    this.layout = makeLayout(1, 1, { t: 0, b: 0, l: 0, r: 0 })
    this.resize()
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120))
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize())
    initAudio()
  }

  get scene(): Scene {
    return { ctx: this.ctx, cam: this.cam, w: this.layout.w, h: this.layout.h, time: this.time }
  }

  register(s: Stage) { this.stages.set(s.id, s) }

  goto(id: string) {
    const next = this.stages.get(id)
    if (!next) return
    const from = this.curId
    this.cur?.exit?.(this)
    this.buttons = []
    this.hint = { kind: 'none', x: 0, y: 0 }
    this.cur = next
    this.curId = id
    this.input.block()
    this.input.resetIdle()
    next.enter(this, from)
  }

  resize() {
    const w = Math.max(1, window.innerWidth)
    const h = Math.max(1, window.innerHeight)
    // keep internal resolution sane on high-dpi phones
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    const budget = 2_600_000
    let dpr = this.dpr
    while (w * h * dpr * dpr > budget && dpr > 1) dpr -= 0.1
    this.dpr = Math.max(1, dpr)
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'
    const cs = getComputedStyle(document.documentElement)
    const px = (v: string) => parseFloat(cs.getPropertyValue(v) || '0') || 0
    this.layout = makeLayout(w, h, {
      t: px('--sat') || 0, b: px('--sab') || 0, l: px('--sal') || 0, r: px('--sar') || 0
    })
    this.cam.setViewport(w, h)
    this.cam.update()
  }

  say(text: string, x?: number, y?: number, scale = 1) {
    const L = this.layout
    this.words.say(text, x ?? L.w * 0.5, y ?? L.h * 0.26, scale)
  }

  setCam(spec: CamSpec, rate = 3.6, snap = false) {
    this.camTarget = spec
    this.camRate = rate
    if (snap) this.cam.snapTo(spec)
  }

  /** pointer position in CSS px */
  get px() { return this.input.p.x }
  get py() { return this.input.p.y }

  /** tool tip offset: keeps the working point above the finger */
  tipOffset() {
    return Math.max(34, Math.min(this.layout.w, this.layout.h) * 0.11)
  }

  addButton(b: Btn) { this.buttons.push(b); return b }

  pickButton(): Btn | null {
    const p = this.input.p
    if (!p.tapped) return null
    let best: Btn | null = null
    let bestD = Infinity
    for (const b of this.buttons) {
      const d = Math.hypot(p.x - b.x, p.y - b.y)
      if (hitBtn(b, p.x, p.y) && d < bestD) { best = b; bestD = d }
    }
    return best
  }

  unlock() { unlockAudio() }
  toggleMute() { setMuted(!isMuted()); if (!isMuted()) sfx.tap() }
  muted() { return isMuted() }

  /** small always-on system control (sound toggle) */
  private muteBtn(): Btn {
    const L = this.layout
    const r = Math.max(16, Math.min(L.w, L.h) * 0.042)
    return {
      id: '__mute',
      x: L.w - r * 1.5 - L.safeRight,
      y: r * 1.5 + L.safeTop,
      r,
      icon: this.muted() ? 'soundoff' : 'sound',
      tint: '#f4ead6'
    }
  }

  /** punch the camera — impacts only, never as decoration */
  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount)
    this.shakeT = 0
  }

  /** slow the world down briefly so a big change is readable */
  slowmo(scale: number, seconds: number) {
    this.timeScale = scale
    this.timeScaleT = seconds
  }

  frameStep(realDt: number) {
    if (this.timeScaleT > 0) {
      this.timeScaleT -= realDt
      if (this.timeScaleT <= 0) this.timeScale = 1
    }
    const dt = realDt * this.timeScale
    this.time += dt
    this.shakeT += realDt
    this.shakeAmt *= Math.exp(-7 * realDt)
    if (this.shakeAmt < 0.02) this.shakeAmt = 0
    this.input.begin(dt)
    const mb = this.muteBtn()
    if (this.input.p.tapped && hitBtn(mb, this.input.p.x, this.input.p.y, 1.2)) {
      this.unlock()
      this.toggleMute()
      this.input.p.tapped = false
    }
    if (this.camTarget) this.cam.approachSpec(this.camTarget, this.camRate, dt)
    this.cur?.update(this, dt)
    this.idleNudge(dt)
    this.particles.update(dt)
    this.words.update(dt)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4)
  }

  /**
   * When nothing has been touched for a while the workpiece itself asks to be
   * played with — no sentence ever appears telling the child what to do.
   */
  private idleNudge(_dt: number) {
    if (this.input.idle < this.hintDelay) return
    if (this.curId === 'title' || this.curId === 'finish') return
    const k = Math.min(1, (this.input.idle - this.hintDelay) / 0.8)
    if (this.u.paperOn > 0.5) {
      this.u.xf.rotZ = Math.sin(this.time * 2.1) * 0.022 * k
    } else if (!this.curId.startsWith('fluff') && this.u.progress > 0.5) {
      this.u.twist = Math.sin(this.time * 3.1) * 0.17 * k
    }
  }

  render() {
    const { ctx } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    if (this.shakeAmt > 0) {
      const a = this.shakeAmt * Math.min(this.layout.w, this.layout.h) * 0.02
      ctx.translate(
        Math.sin(this.shakeT * 61) * a,
        Math.cos(this.shakeT * 47) * a * 0.8
      )
    }
    ctx.clearRect(-40, -40, this.layout.w + 80, this.layout.h + 80)
    this.cur?.draw(this)
    ctx.save()
    ctx.globalAlpha = 0.72
    drawButton(ctx, this.muteBtn(), this.time)
    ctx.restore()
    this.particles.draw(ctx)
    this.words.draw(ctx, Math.min(this.layout.w, this.layout.h) * 0.085)
    if (this.flash > 0) {
      ctx.save()
      ctx.globalAlpha = this.flash * 0.55
      ctx.fillStyle = '#fffdf2'
      ctx.fillRect(0, 0, this.layout.w, this.layout.h)
      ctx.restore()
    }
  }

  newUchiwaSeed() {
    this.seedCounter = (this.seedCounter * 1103515245 + 12345) >>> 0
    return this.seedCounter || 7
  }
}
