// Small onomatopoeia synth: every sound is generated with WebAudio,
// no assets required. Each maps to one of the game's sound words.
type AC = AudioContext

class SFX {
  private ctx: AC | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private lastAt: Record<string, number> = {}

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate * 1.2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private ok(key?: string, minGap = 0): boolean {
    if (!this.ctx || !this.master) return false
    if (key && minGap > 0) {
      const t = this.ctx.currentTime
      if ((this.lastAt[key] ?? -10) + minGap > t) return false
      this.lastAt[key] = t
    }
    return true
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(this.master!)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  private noise(opts: {
    dur: number
    gain: number
    delay?: number
    bp?: [number, number] // frequency sweep for a bandpass
    lp?: [number, number]
    hp?: number
    q?: number
  }) {
    const ctx = this.ctx!
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf!
    src.loop = true
    let node: AudioNode = src
    if (opts.bp) {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.Q.value = opts.q ?? 1.2
      f.frequency.setValueAtTime(opts.bp[0], t0)
      f.frequency.exponentialRampToValueAtTime(opts.bp[1], t0 + opts.dur)
      node.connect(f)
      node = f
    }
    if (opts.lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(opts.lp[0], t0)
      f.frequency.exponentialRampToValueAtTime(opts.lp[1], t0 + opts.dur)
      node.connect(f)
      node = f
    }
    if (opts.hp) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = opts.hp
      node.connect(f)
      node = f
    }
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
    node.connect(g).connect(this.master!)
    src.start(t0)
    src.stop(t0 + opts.dur + 0.05)
  }

  /** サッ！ quick swish when the biscuit dives */
  sa() {
    if (!this.ok('sa', 0.08)) return
    this.noise({ dur: 0.14, gain: 0.4, bp: [2200, 500] })
  }

  /** ジュワー soaking into coffee */
  juwa() {
    if (!this.ok('juwa', 0.25)) return
    this.noise({ dur: 0.6, gain: 0.32, lp: [900, 260] })
    this.tone(340, 160, 0.4, 'sine', 0.1)
    for (let i = 0; i < 4; i++) {
      this.tone(300 + Math.random() * 400, 200, 0.05, 'sine', 0.06, 0.08 + i * 0.09)
    }
  }

  /** ことん settle into place */
  koton() {
    if (!this.ok('koton', 0.05)) return
    this.tone(280, 150, 0.1, 'sine', 0.5)
    this.noise({ dur: 0.03, gain: 0.14, hp: 2500 })
  }

  /** ぽたっ coffee drip */
  drip() {
    if (!this.ok('drip', 0.07)) return
    this.tone(950 + Math.random() * 250, 380, 0.08, 'sine', 0.2)
  }

  /** むにゅー cream squeeze */
  munyu() {
    if (!this.ok('munyu', 0.12)) return
    this.tone(210, 125, 0.18, 'triangle', 0.2)
    this.noise({ dur: 0.14, gain: 0.08, lp: [500, 300] })
  }

  /** すーっ spatula glide */
  suu() {
    if (!this.ok('suu', 0.2)) return
    this.noise({ dur: 0.4, gain: 0.16, hp: 900, lp: [4500, 2500] })
  }

  /** さらさら cocoa falling */
  sara() {
    if (!this.ok('sara', 0.09)) return
    this.noise({ dur: 0.18, gain: 0.1, hp: 3800 })
  }

  /** スパッ！ knife cut */
  spa() {
    if (!this.ok('spa', 0.1)) return
    this.noise({ dur: 0.09, gain: 0.5, bp: [3200, 900], q: 0.8 })
    this.tone(1300, 220, 0.06, 'square', 0.12)
  }

  /** パカッ！ the reveal */
  paka() {
    this.tone(520, 640, 0.1, 'sine', 0.4)
    this.tone(780, 900, 0.14, 'sine', 0.3, 0.1)
  }

  /** small fanfare after the reveal */
  tada() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => this.tone(n, n, 0.16, 'triangle', 0.22, i * 0.09))
  }

  /** きらーん fridge finished / layer complete */
  chime() {
    if (!this.ok('chime', 0.2)) return
    this.tone(880, 880, 0.2, 'sine', 0.18)
    this.tone(1320, 1320, 0.26, 'sine', 0.14, 0.07)
  }

  /** fridge hum */
  hum(dur: number) {
    if (!this.ok('hum', 0.4)) return
    this.tone(85, 80, dur, 'sawtooth', 0.07)
    this.noise({ dur, gain: 0.05, lp: [300, 200] })
  }

  /** UI tap */
  pop() {
    if (!this.ok('pop', 0.05)) return
    this.tone(420, 620, 0.08, 'sine', 0.25)
  }
}

export const sfx = new SFX()
