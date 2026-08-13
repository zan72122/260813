const PENTA = [0, 2, 4, 7, 9]

function penta(i: number): number {
  const n = ((i % PENTA.length) + PENTA.length) % PENTA.length
  const oct = Math.floor(i / PENTA.length)
  return 523.25 * Math.pow(2, PENTA[n] / 12 + oct)
}

type Ctor = typeof AudioContext

/**
 * やさしい音だけを鳴らす小さな音源。素材ファイルを持たず、
 * すべてオシレータで作るのでビルドが軽い。
 */
export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private pressOsc: OscillatorNode | null = null
  private pressGain: GainNode | null = null
  private pressFilter: BiquadFilterNode | null = null
  enabled = true

  /** iOS は必ずユーザー操作の中で呼ぶこと。 */
  unlock(): void {
    if (!this.enabled) return
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
      if (!AC) {
        this.enabled = false
        return
      }
      try {
        this.ctx = new AC()
      } catch {
        this.enabled = false
        return
      }
      const g = this.ctx.createGain()
      g.gain.value = 0.28
      const comp = this.ctx.createDynamicsCompressor()
      g.connect(comp)
      comp.connect(this.ctx.destination)
      this.master = g
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  private blip(
    freq: number,
    dur: number,
    vol = 0.5,
    type: OscillatorType = 'sine',
    delay = 0,
    slideTo?: number,
  ): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t0 = this.t + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  place(): void {
    this.blip(220, 0.16, 0.35, 'triangle', 0, 130)
    this.blip(660, 0.1, 0.12, 'sine', 0.01)
  }

  lightOn(): void {
    ;[0, 4, 7, 12].forEach((s, i) => {
      this.blip(523.25 * Math.pow(2, s / 12), 0.7, 0.3, 'sine', i * 0.075)
    })
  }

  /** 押しはじめ: ぽん、という手ごたえ + うっすら鳴り続ける音 */
  pressStart(): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    this.blip(330, 0.14, 0.3, 'triangle', 0, 520)
    this.stopPressTone(0.02)
    const osc = ctx.createOscillator()
    const filt = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 110
    filt.type = 'lowpass'
    filt.frequency.value = 420
    filt.Q.value = 6
    g.gain.setValueAtTime(0.0001, this.t)
    g.gain.exponentialRampToValueAtTime(0.09, this.t + 0.12)
    osc.connect(filt)
    filt.connect(g)
    g.connect(master)
    osc.start()
    this.pressOsc = osc
    this.pressGain = g
    this.pressFilter = filt
  }

  /** 押しぐあいに合わせて鳴り続ける音の明るさを変える */
  pressMove(p: number): void {
    if (!this.ctx || !this.pressFilter || !this.pressOsc) return
    const t = this.t
    this.pressFilter.frequency.setTargetAtTime(380 + 1500 * p, t, 0.05)
    this.pressOsc.frequency.setTargetAtTime(104 + 42 * p, t, 0.08)
  }

  pressEnd(): void {
    this.blip(520, 0.2, 0.22, 'triangle', 0, 300)
    this.stopPressTone(0.18)
  }

  private stopPressTone(fade: number): void {
    const osc = this.pressOsc
    const g = this.pressGain
    if (!osc || !g || !this.ctx) return
    const t = this.t
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade)
    osc.stop(t + fade + 0.05)
    this.pressOsc = null
    this.pressGain = null
    this.pressFilter = null
  }

  /** リングが 1 本ぶん動くたびに、ペンタトニックの粒を鳴らす */
  fringe(index: number): void {
    this.blip(penta(index), 0.32, 0.12, 'sine')
    this.blip(penta(index) * 2, 0.18, 0.05, 'sine', 0.005)
  }

  success(): void {
    ;[0, 4, 7, 12, 16].forEach((s, i) => {
      this.blip(523.25 * Math.pow(2, s / 12), 0.55, 0.32, 'triangle', i * 0.085)
    })
  }

  celebrate(): void {
    ;[0, 2, 4, 7, 9, 12, 16, 19].forEach((s, i) => {
      this.blip(523.25 * Math.pow(2, s / 12), 0.75, 0.3, 'sine', i * 0.1)
    })
  }
}
