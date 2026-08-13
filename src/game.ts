import { Audio } from './audio'
import { Fx } from './fx'
import { Renderer, type SceneUniforms } from './renderer'

export type Phase = 'title' | 'place' | 'light' | 'play'
export type Mode = 'free' | 'challenge'

/** 斜め上から見たときの縦のつぶれ具合。1.0 で真上から。 */
const SQUASH = 0.82
const SIZE_STEPS = [0.52, 0.64, 0.76, 0.88, 1.0]
/**
 * チャレンジの目標。「押した輪をこの線まで届かせる」だけ。
 * ちょんと触れば 1 つめ、ぎゅっと長く押せば 3 つめ、という段差にしてある。
 */
const CHALLENGE_TARGETS = [0.44, 0.52, 0.585]
const STAR_GOAL = CHALLENGE_TARGETS.length

interface Options {
  fast: boolean
  test: boolean
  seed: number
}

interface Layout {
  /** CSS ピクセルでの 1 単位 */
  pxCss: number
  wCss: number
  hCss: number
  centerY: number
  plateHX: number
  plateHY: number
  maxLensR: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

export class Game {
  private r: Renderer
  private fx: Fx
  private audio = new Audio()
  private opts: Options

  // --- 進行 ---
  phase: Phase = 'title'
  mode: Mode = 'free'
  sizeStep = 2
  stars = 0
  challengeIndex = 0

  // --- 見た目の状態 ---
  private time = 0
  private light = 0
  private lightOn = false
  private reveal = 0
  private lensOn = 0
  private lensX = 0
  private lensY = 0
  private lensTargetX = 0
  private lensTargetY = 0
  private placing = false
  private placeTween = -1
  private placeFromX = 0
  private placeFromY = 0
  private flash = 0

  // --- 押す ---
  private pressing = false
  private holdT = 0
  private pressValue = 0
  private pressVel = 0
  private pressOffset = 0
  private pointerId: number | null = null
  private everPressed = false
  private idleT = 0

  // --- チャレンジ ---
  private needRelease = false
  private attemptT = 0
  private lockUntil = 0

  // --- 音 ---
  private lastFringe = 0
  private fringeCooldown = 0

  private layout: Layout = {
    pxCss: 1,
    wCss: 1,
    hCss: 1,
    centerY: 0,
    plateHX: 1,
    plateHY: 1,
    maxLensR: 0.5,
  }

  // --- DOM ---
  private el: {
    lamp: HTMLElement
    hint: HTMLElement
    hintText: HTMLElement
    stars: HTMLElement
    modes: HTMLElement
    sizeBar: HTMLElement
    sizeFill: HTMLElement
    toast: HTMLElement
    title: HTMLElement
    start: HTMLElement
    again: HTMLElement
    scene: HTMLCanvasElement
  }

  private toastTimer = 0
  private raf = 0
  private lastNow = 0
  /** テスト時は rAF で時間を進めず、step() だけで進める */
  private manual: boolean

  constructor(opts: Options) {
    this.opts = opts
    this.manual = opts.test

    const q = <T extends HTMLElement>(id: string): T => {
      const e = document.getElementById(id)
      if (!e) throw new Error(`missing #${id}`)
      return e as T
    }
    this.el = {
      lamp: q('lamp'),
      hint: q('hint'),
      hintText: q('hintText'),
      stars: q('stars'),
      modes: q('modes'),
      sizeBar: q('sizeBar'),
      sizeFill: q('sizeFill'),
      toast: q('toast'),
      title: q('title'),
      start: q('start'),
      again: q('again'),
      scene: q<HTMLCanvasElement>('scene'),
    }

    const dprCap = opts.fast ? 1 : 2
    this.r = new Renderer(this.el.scene, dprCap)
    this.fx = new Fx(
      document.getElementById('fx') as HTMLCanvasElement,
      opts.seed,
      opts.fast ? 90 : 240,
    )

    for (let i = 0; i < STAR_GOAL; i++) this.el.stars.appendChild(document.createElement('i'))

    this.bindUI()
    this.resize()
    this.applyMode()
    this.updateSizeGauge()

    window.addEventListener('resize', () => this.resize())
    window.addEventListener('orientationchange', () => {
      // iOS はサイズ確定が一拍おくれる
      setTimeout(() => this.resize(), 120)
      setTimeout(() => this.resize(), 420)
    })

    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ---------------------------------------------------------------- レイアウト
  resize(): void {
    this.r.resize()
    this.fx.resize(this.opts.fast ? 1 : 2)

    const wCss = window.innerWidth
    const hCss = window.innerHeight
    const pxCss = 0.5 * Math.min(wCss, hCss)

    // ランプと おおきさボタンの ぶんを よけた たての すきま
    const lampBottom = this.el.lamp.getBoundingClientRect().bottom || hCss * 0.18
    const barRect = this.el.sizeBar.getBoundingClientRect()
    const barTop = barRect.height > 0 ? barRect.top : hCss * 0.86
    const top = clamp(lampBottom + hCss * 0.012, 0, hCss * 0.5)
    const bottom = clamp(barTop - hCss * 0.012, hCss * 0.5, hCss)

    const bandMidCss = (top + bottom) / 2
    const bandH = Math.max(hCss * 0.28, bottom - top)

    const centerY = (hCss / 2 - bandMidCss) / pxCss
    const availH = bandH / pxCss
    const availW = wCss / pxCss

    const plateHY = (availH / 2 / SQUASH) * 0.97
    const plateHX = Math.min(availW * 0.47, plateHY * 1.18)
    const maxLensR = Math.min(plateHX * 0.74, plateHY * 0.72)

    this.layout = { pxCss, wCss, hCss, centerY, plateHX, plateHY, maxLensR }

    if (this.phase === 'title' || this.phase === 'place') {
      if (!this.placing && this.placeTween < 0) {
        this.lensX = 0
        this.lensY = this.restingLensY()
      }
    } else {
      this.lensX = 0
      this.lensY = centerY
    }
    this.syncHintPosition()
  }

  /** 置く前にレンズが待っている位置 (ガラスの手前) */
  private restingLensY(): number {
    const L = this.layout
    return L.centerY - L.plateHY * SQUASH - this.lensR() * SQUASH * 0.75
  }

  private lensR(): number {
    return this.layout.maxLensR * SIZE_STEPS[this.sizeStep]
  }

  private unitToCss(ux: number, uy: number): { x: number; y: number } {
    const L = this.layout
    return { x: L.wCss / 2 + ux * L.pxCss, y: L.hCss / 2 - uy * L.pxCss }
  }

  private cssToUnit(x: number, y: number): { x: number; y: number } {
    const L = this.layout
    return { x: (x - L.wCss / 2) / L.pxCss, y: (L.hCss / 2 - y) / L.pxCss }
  }

  // ---------------------------------------------------------------- 干渉のかたち
  /** レンズいっぱいに見える赤い縞の本数 (押すと減る = 輪が広がる) */
  private baseRings(): number {
    return 5.5 + 9.0 * (this.sizeStep / (SIZE_STEPS.length - 1))
  }

  private ringK(): number {
    return this.baseRings() / (1 + 1.55 * clamp(this.pressValue, 0, 1.2))
  }

  private contactR(): number {
    return 0.36 * Math.pow(clamp(this.pressValue, 0, 1), 0.75)
  }

  /** いちばん内側の虹の輪の半径 (レンズ内 0..1)。押すほど大きくなる。 */
  ringRadius(): number {
    const rc = this.contactR()
    return Math.min(1, Math.sqrt(1 / this.ringK() + rc * rc))
  }

  private fringesAtRim(): number {
    const rc = this.contactR()
    return this.ringK() * Math.max(0, 1 - rc * rc)
  }

  /**
   * 目標の輪の半径。届かないまま時間が経つと、こっそり手前に寄ってくる。
   * 4 歳児に「できない」を作らないための保険。
   */
  private target(): number {
    const base = CHALLENGE_TARGETS[Math.min(this.challengeIndex, CHALLENGE_TARGETS.length - 1)]
    return base - Math.min(0.055, this.attemptT * 0.007)
  }

  // ---------------------------------------------------------------- 入力
  private bindUI(): void {
    const scene = this.el.scene

    const down = (e: PointerEvent) => {
      if (this.pointerId !== null) return // 一指だけ
      this.pointerId = e.pointerId
      scene.setPointerCapture?.(e.pointerId)
      this.audio.unlock()
      this.onDown(e.clientX, e.clientY)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return
      this.onMove(e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return
      this.pointerId = null
      this.onUp()
    }

    scene.addEventListener('pointerdown', down)
    scene.addEventListener('pointermove', move)
    scene.addEventListener('pointerup', up)
    scene.addEventListener('pointercancel', up)
    scene.addEventListener('lostpointercapture', up)
    scene.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
    scene.addEventListener('contextmenu', (e) => e.preventDefault())

    this.el.start.addEventListener('click', () => {
      this.audio.unlock()
      this.begin()
    })

    this.el.lamp.addEventListener('click', () => {
      this.audio.unlock()
      this.toggleLight()
    })

    this.el.modes.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.unlock()
        this.setMode(btn.dataset.mode === 'challenge' ? 'challenge' : 'free')
      })
    })

    this.el.sizeBar.querySelectorAll<HTMLButtonElement>('.sizebtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.unlock()
        this.nudgeSize(Number(btn.dataset.size) || 0)
      })
    })

    this.el.again.addEventListener('click', () => {
      this.audio.unlock()
      this.restart()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releasePress()
    })
  }

  private onDown(cx: number, cy: number): void {
    this.idleT = 0
    if (this.phase === 'title') {
      this.begin()
      return
    }
    if (this.phase === 'place') {
      const u = this.cssToUnit(cx, cy)
      this.placing = true
      this.lensTargetX = u.x
      this.lensTargetY = u.y
      this.lensOn = 1
      return
    }
    if (this.phase === 'light') {
      // ライトがまだ。ランプを ちょっと 強調するだけ (失敗にはしない)
      this.el.lamp.classList.remove('is-wanted')
      void this.el.lamp.offsetWidth
      this.el.lamp.classList.add('is-wanted')
      return
    }
    // play
    this.pressing = true
    this.holdT = 0
    this.pressOffset = this.pressureFalloff(cx, cy)
    this.everPressed = true
    this.setHint(false)
    this.audio.pressStart()
    const c = this.unitToCss(this.lensX, this.lensY)
    this.fx.burst(c.x, c.y, this.lensR() * this.layout.pxCss * 0.9, this.opts.fast ? 6 : 16, SQUASH)
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12)
      } catch {
        /* iOS Safari は未対応。無視してよい */
      }
    }
  }

  private onMove(cx: number, cy: number): void {
    this.idleT = 0
    if (this.phase === 'place' && this.placing) {
      const u = this.cssToUnit(cx, cy)
      this.lensTargetX = u.x
      this.lensTargetY = u.y
      return
    }
    if (this.pressing) this.pressOffset = this.pressureFalloff(cx, cy)
  }

  private onUp(): void {
    if (this.phase === 'place' && this.placing) {
      this.placing = false
      this.placeFromX = this.lensX
      this.placeFromY = this.lensY
      this.placeTween = 0
      return
    }
    this.releasePress()
  }

  private releasePress(): void {
    if (!this.pressing) return
    this.pressing = false
    this.holdT = 0
    this.needRelease = false
    this.audio.pressEnd()
  }

  /** レンズの中心から離れるほど、押しの効きを少しだけ弱める */
  private pressureFalloff(cx: number, cy: number): number {
    const u = this.cssToUnit(cx, cy)
    const dx = u.x - this.lensX
    const dy = (u.y - this.lensY) / SQUASH
    const r = Math.sqrt(dx * dx + dy * dy) / Math.max(1e-4, this.lensR())
    return 1 - 0.15 * clamp(r, 0, 1)
  }

  // ---------------------------------------------------------------- 進行
  begin(): void {
    if (this.phase !== 'title') return
    this.phase = 'place'
    this.el.title.classList.add('is-gone')
    this.lensX = 0
    this.lensY = this.restingLensY()
    this.lensOn = 1
    this.setHint(true, 'おいてね')
    this.syncHintPosition()
  }

  toggleLight(): void {
    if (this.phase === 'place') return
    this.lightOn = !this.lightOn
    this.el.lamp.classList.toggle('is-on', this.lightOn)
    this.el.lamp.classList.remove('is-wanted')
    if (this.lightOn) {
      this.reveal = 0
      this.audio.lightOn()
      const c = this.unitToCss(this.lensX, this.lensY)
      this.fx.twinkle(c.x, c.y, this.lensR() * this.layout.pxCss, this.opts.fast ? 8 : 22)
      if (this.phase === 'light') {
        this.phase = 'play'
        this.setHint(true, 'おして')
        this.syncHintPosition()
      }
    }
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return
    this.mode = mode
    if (mode === 'challenge') {
      this.sizeStep = 2
      this.stars = 0
      this.challengeIndex = 0
      this.attemptT = 0
      this.needRelease = false
      this.updateSizeGauge()
    }
    this.applyMode()
  }

  private applyMode(): void {
    this.el.modes.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.mode === this.mode)
    })
    const challenge = this.mode === 'challenge'
    this.el.stars.classList.toggle('is-on', challenge)
    this.el.sizeBar.classList.toggle('is-on', !challenge && this.phase === 'play')
    this.renderStars()
  }

  nudgeSize(dir: number): void {
    const next = clamp(this.sizeStep + Math.sign(dir), 0, SIZE_STEPS.length - 1)
    if (next === this.sizeStep) {
      this.audio.fringe(1)
      return
    }
    this.sizeStep = next
    this.updateSizeGauge()
    this.audio.fringe(next + 2)
    const c = this.unitToCss(this.lensX, this.lensY)
    this.fx.twinkle(c.x, c.y, this.lensR() * this.layout.pxCss, this.opts.fast ? 5 : 10)
  }

  private updateSizeGauge(): void {
    const pct = 18 + (this.sizeStep / (SIZE_STEPS.length - 1)) * 82
    this.el.sizeFill.style.width = `${pct}%`
  }

  restart(): void {
    this.releasePress()
    this.phase = 'place'
    this.lightOn = false
    this.light = 0
    this.reveal = 0
    this.el.lamp.classList.remove('is-on', 'is-wanted')
    this.lensX = 0
    this.lensY = this.restingLensY()
    this.lensOn = 1
    this.placing = false
    this.placeTween = -1
    this.pressValue = 0
    this.pressVel = 0
    this.everPressed = false
    this.stars = 0
    this.challengeIndex = 0
    this.attemptT = 0
    this.fx.clear()
    this.applyMode()
    this.setHint(true, 'おいてね')
    this.syncHintPosition()
    this.audio.place()
  }

  private renderStars(): void {
    const items = this.el.stars.querySelectorAll('i')
    items.forEach((s, i) => s.classList.toggle('is-lit', i < this.stars))
  }

  private setHint(on: boolean, text?: string): void {
    if (text) this.el.hintText.textContent = text
    this.el.hint.classList.toggle('is-on', on)
  }

  private syncHintPosition(): void {
    let ux = this.lensX
    let uy = this.lensY
    if (this.phase === 'place') {
      ux = 0
      uy = this.layout.centerY
    }
    const c = this.unitToCss(ux, uy)
    this.el.hint.style.left = `${c.x}px`
    this.el.hint.style.top = `${c.y + this.lensR() * this.layout.pxCss * 0.35}px`
  }

  private toast(text: string): void {
    const t = this.el.toast
    t.textContent = text
    t.classList.remove('is-pop')
    void t.offsetWidth
    t.classList.add('is-pop')
    this.toastTimer = 1.5
  }

  // ---------------------------------------------------------------- ループ
  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = clamp((now - this.lastNow) / 1000, 0, 0.05)
    this.lastNow = now
    if (!this.manual) this.update(dt)
    this.render()
  }

  /** テストから決められた時間だけ進める */
  step(seconds: number, fixed = 1 / 60): void {
    let left = seconds
    while (left > 1e-6) {
      const dt = Math.min(fixed, left)
      this.update(dt)
      left -= dt
    }
    this.render()
  }

  update(dt: number): void {
    this.time += dt
    this.idleT += dt
    if (this.toastTimer > 0) this.toastTimer -= dt

    // ライト
    const lightTarget = this.lightOn ? 1 : 0
    this.light += (lightTarget - this.light) * Math.min(1, dt * 6)
    if (this.lightOn && this.reveal < 1.6) this.reveal = Math.min(1.6, this.reveal + dt * 2.2)
    if (!this.lightOn) this.reveal = 0

    // レンズを置く
    if (this.phase === 'place') {
      if (this.placing) {
        const k = Math.min(1, dt * 12)
        this.lensX += (this.lensTargetX - this.lensX) * k
        this.lensY += (this.lensTargetY - this.lensY) * k
      } else if (this.placeTween >= 0) {
        this.placeTween = Math.min(1, this.placeTween + dt * 2.0)
        const t = easeOutCubic(this.placeTween)
        this.lensX = this.placeFromX * (1 - t)
        this.lensY = this.placeFromY + (this.layout.centerY - this.placeFromY) * t
        if (this.placeTween >= 1) {
          this.placeTween = -1
          this.phase = 'light'
          this.lensX = 0
          this.lensY = this.layout.centerY
          this.audio.place()
          this.setHint(false)
          this.el.lamp.classList.add('is-wanted')
          const c = this.unitToCss(this.lensX, this.lensY)
          this.fx.twinkle(c.x, c.y, this.lensR() * this.layout.pxCss * 0.7, this.opts.fast ? 5 : 12)
        }
      } else {
        // ぷかぷか待っている
        this.lensY = this.restingLensY() + Math.sin(this.time * 2.2) * 0.012
      }
      this.syncHintPosition()
    }

    // 押しぐあい (ばね)
    if (this.pressing) this.holdT += dt
    const ramp = 0.34 + 0.66 * easeOutCubic(clamp(this.holdT / 0.55, 0, 1))
    const target = this.pressing ? ramp * this.pressOffset : 0
    const stiff = 190
    const damp = 15
    this.pressVel += ((target - this.pressValue) * stiff - this.pressVel * damp) * dt
    this.pressValue += this.pressVel * dt
    if (!this.pressing && Math.abs(this.pressValue) < 0.0008 && Math.abs(this.pressVel) < 0.004) {
      this.pressValue = 0
      this.pressVel = 0
    }
    if (this.pressing) this.audio.pressMove(clamp(this.pressValue, 0, 1))

    // リングが 1 本ぶん動くたびに 音の粒
    this.fringeCooldown -= dt
    if (this.phase === 'play' && this.light > 0.4) {
      const n = Math.floor(this.fringesAtRim())
      if (n !== this.lastFringe) {
        if (this.fringeCooldown <= 0 && Math.abs(n - this.lastFringe) >= 1) {
          this.audio.fringe(n)
          this.fringeCooldown = 0.035
        }
        this.lastFringe = n
      }
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4)

    if (this.phase === 'play') this.updateChallenge(dt)

    // しばらく さわっていなければ もういちど さそう
    if (this.phase === 'play' && !this.pressing && this.idleT > 8 && this.light > 0.5) {
      this.setHint(true, 'おして')
      this.syncHintPosition()
    } else if (this.pressing || (this.everPressed && this.idleT < 8)) {
      if (this.phase === 'play' && this.idleT < 8) this.setHint(false)
    }

    this.fx.update(dt)
    this.el.sizeBar.classList.toggle('is-on', this.mode === 'free' && this.phase === 'play')
  }

  private updateChallenge(dt: number): void {
    if (this.mode !== 'challenge' || this.light < 0.5) return
    if (this.lockUntil > 0) {
      this.lockUntil -= dt
      return
    }
    if (this.pressing) this.attemptT += dt
    // 1 回の「押す」で 1 つだけ。指を離すまで次は数えない。
    if (this.needRelease || !this.pressing) return
    if (this.ringRadius() >= this.target()) this.succeed()
  }

  private succeed(): void {
    this.needRelease = true
    this.attemptT = 0
    this.stars = Math.min(STAR_GOAL, this.stars + 1)
    this.renderStars()
    this.flash = 1
    this.lockUntil = 1.1
    const c = this.unitToCss(this.lensX, this.lensY)
    this.fx.twinkle(c.x, c.y, this.lensR() * this.layout.pxCss, this.opts.fast ? 10 : 30)

    if (this.stars >= STAR_GOAL) {
      this.audio.celebrate()
      this.toast('すごい!')
      this.fx.confetti(this.layout.wCss, this.layout.hCss, this.opts.fast ? 20 : 80)
      this.challengeIndex = 0
      this.stars = 0
      this.lockUntil = 2.0
      window.setTimeout(() => this.renderStars(), 1400)
    } else {
      this.audio.success()
      this.toast('できた!')
      this.challengeIndex = Math.min(this.challengeIndex + 1, CHALLENGE_TARGETS.length - 1)
    }
  }

  render(): void {
    const L = this.layout
    const showChallenge = this.mode === 'challenge' && this.phase === 'play' && this.light > 0.3
    const reach = showChallenge ? clamp(this.ringRadius() / Math.max(1e-4, this.target()), 0, 1) : 0
    const u: SceneUniforms = {
      time: this.time,
      squash: SQUASH,
      plateCX: 0,
      plateCY: L.centerY,
      plateHX: L.plateHX,
      plateHY: L.plateHY,
      centerX: this.lensX,
      centerY: this.lensY,
      lensR: this.lensR() * (1 + 0.045 * clamp(this.pressValue, 0, 1.2)),
      lensOn: this.lensOn,
      light: this.light,
      reveal: this.reveal,
      press: this.pressValue,
      contact: this.contactR(),
      k: this.ringK(),
      ghostR: showChallenge ? this.target() : 0,
      ghostHit: showChallenge ? reach * reach : 0,
      ringR: showChallenge ? this.ringRadius() : 0,
      flash: this.flash,
    }
    this.r.draw(u)
    this.fx.draw()
  }

  // ---------------------------------------------------------------- テスト用
  snapshot(): Record<string, number | string | boolean> {
    return {
      phase: this.phase,
      mode: this.mode,
      light: Number(this.light.toFixed(4)),
      lightOn: this.lightOn,
      press: Number(this.pressValue.toFixed(4)),
      pressing: this.pressing,
      k: Number(this.ringK().toFixed(4)),
      contact: Number(this.contactR().toFixed(4)),
      ringR: Number(this.ringRadius().toFixed(4)),
      lensR: Number(this.lensR().toFixed(4)),
      sizeStep: this.sizeStep,
      stars: this.stars,
      target: this.target(),
      fxCount: this.fx.count,
      glFailed: this.r.failed,
      pxCss: Number(this.layout.pxCss.toFixed(2)),
    }
  }

  /** テストから指の代わりに押す。x,y は CSS ピクセル (省略時はレンズの中心) */
  setPressing(on: boolean, x?: number, y?: number): void {
    if (on) {
      const c = this.unitToCss(this.lensX, this.lensY)
      this.onDown(x ?? c.x, y ?? c.y)
    } else {
      this.onUp()
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.r.dispose()
  }
}
