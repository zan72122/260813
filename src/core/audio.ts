import { settings } from './settings'

/**
 * Fully procedural audio (no asset files) so the game boots instantly on mobile.
 * Everything above water is bright; underwater everything runs through a
 * low-pass "muffle" filter, which is the audible half of the dive moment.
 */
class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private muffle!: BiquadFilterNode
  private noiseBuf!: AudioBuffer
  private ambientGain!: GainNode
  private ambientSrc: AudioBufferSourceNode | null = null
  private emitGain!: GainNode
  private emitFilter!: BiquadFilterNode
  private emitSrc: AudioBufferSourceNode | null = null
  private ready = false
  private lastBlob = 0

  /** Must be called from inside a user gesture (iOS unlock). */
  unlock() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    type WinAudio = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctor = window.AudioContext || (window as WinAudio).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx

    this.muffle = ctx.createBiquadFilter()
    this.muffle.type = 'lowpass'
    this.muffle.frequency.value = 18000
    this.muffle.Q.value = 0.4

    this.master = ctx.createGain()
    this.master.gain.value = settings.volume

    this.muffle.connect(this.master)
    this.master.connect(ctx.destination)

    // shared noise buffer
    const len = Math.floor(ctx.sampleRate * 2)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02 // a little brown noise mixed in
      d[i] = w * 0.5 + last * 3.2
    }
    this.noiseBuf = buf

    this.ambientGain = ctx.createGain()
    this.ambientGain.gain.value = 0
    this.ambientGain.connect(this.muffle)

    this.emitFilter = ctx.createBiquadFilter()
    this.emitFilter.type = 'bandpass'
    this.emitFilter.frequency.value = 900
    this.emitFilter.Q.value = 1.1
    this.emitGain = ctx.createGain()
    this.emitGain.gain.value = 0
    this.emitFilter.connect(this.emitGain)
    this.emitGain.connect(this.muffle)

    this.ready = true
    ;(window as unknown as { __audioProbe: AudioContext; __audioMaster: GainNode }).__audioProbe = ctx
    ;(window as unknown as { __audioMaster: GainNode }).__audioMaster = this.master
    void ctx.resume()
  }

  setVolume(v: number) {
    if (!this.ready || !this.ctx) return
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  /** 0 = above water (bright), 1 = fully submerged (muffled). */
  setSubmersion(t: number) {
    if (!this.ready || !this.ctx) return
    const f = 18000 * Math.pow(0.045, t) // 18k -> ~800Hz
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.12)
  }

  startAmbient() {
    if (!this.ready || !this.ctx || this.ambientSrc) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    src.connect(lp)
    lp.connect(this.ambientGain)
    src.start()
    this.ambientSrc = src
    this.ambientGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 1.2)

    // slow swell so the water feels alive
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = 0.08
    const lfoGain = this.ctx.createGain()
    lfoGain.gain.value = 160
    lfo.connect(lfoGain)
    lfoGain.connect(lp.frequency)
    lfo.start()
  }

  /** Dry sand trickling, used on the surface intro. */
  drySand(dur = 1.1) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2600
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.18, t + 0.12)
    g.gain.setValueAtTime(0.18, t + dur * 0.55)
    g.gain.linearRampToValueAtTime(0, t + dur)
    // grain flutter
    const trem = this.ctx.createOscillator()
    trem.frequency.value = 17
    const tg = this.ctx.createGain()
    tg.gain.value = 0.07
    trem.connect(tg)
    tg.connect(g.gain)
    trem.start(t)
    trem.stop(t + dur)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.muffle)
    src.start(t)
    src.stop(t + dur)
  }

  /** Crossing the water surface. */
  splash() {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(9000, t)
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.85)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master) // bypass muffle: this IS the transition
    src.start(t)
    src.stop(t + 1.05)
    for (let i = 0; i < 6; i++) this.bubble(0.2 + i * 0.09, 0.5)
  }

  /** Soft continuous "sand pushing out of the nozzle" while pressing. */
  emitStart() {
    if (!this.ready || !this.ctx || this.emitSrc) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.connect(this.emitFilter)
    src.start()
    this.emitSrc = src
    this.emitGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05)
  }

  emitStop() {
    if (!this.ready || !this.ctx || !this.emitSrc) return
    const src = this.emitSrc
    this.emitSrc = null
    this.emitGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    const s = src
    setTimeout(() => {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }, 260)
  }

  /** Pitch follows how fast the nozzle is moving. */
  emitTone(speed01: number) {
    if (!this.ready || !this.ctx || !this.emitSrc) return
    this.emitFilter.frequency.setTargetAtTime(700 + speed01 * 900, this.ctx.currentTime, 0.08)
  }

  /** A blob landing / merging. Rate limited so a fast drag doesn't machine-gun. */
  blob(pitch = 1) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    if (t - this.lastBlob < 0.055) return
    this.lastBlob = t
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(210 * pitch, t)
    o.frequency.exponentialRampToValueAtTime(96 * pitch, t + 0.13)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(g)
    g.connect(this.muffle)
    o.start(t)
    o.stop(t + 0.22)
  }

  bubble(delay = 0, amp = 1) {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime + delay
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    const f = 520 + Math.random() * 700
    o.frequency.setValueAtTime(f * 0.6, t)
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.11)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.055 * amp, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    o.connect(g)
    g.connect(this.muffle)
    o.start(t)
    o.stop(t + 0.17)
  }

  /** Small reward chime; `big` for stage completion. */
  chime(big = false) {
    if (!this.ready || !this.ctx) return
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77]
    notes.forEach((f, i) => {
      const t = this.ctx!.currentTime + i * (big ? 0.12 : 0.09)
      const o = this.ctx!.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const o2 = this.ctx!.createOscillator()
      o2.type = 'sine'
      o2.frequency.value = f * 2
      const g = this.ctx!.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(big ? 0.16 : 0.1, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.0 : 0.55))
      const g2 = this.ctx!.createGain()
      g2.gain.value = 0.3
      o.connect(g)
      o2.connect(g2)
      g2.connect(g)
      g.connect(this.muffle)
      o.start(t)
      o2.start(t)
      o.stop(t + 1.1)
      o2.stop(t + 1.1)
    })
  }

  /** Vacuum / suction loop tick. */
  suck() {
    if (!this.ready || !this.ctx) return
    const t = this.ctx.currentTime
    if (t - this.lastBlob < 0.07) return
    this.lastBlob = t
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(340, t)
    bp.frequency.exponentialRampToValueAtTime(1300, t + 0.18)
    bp.Q.value = 3
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.muffle)
    src.start(t)
    src.stop(t + 0.24)
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }
}

export const audio = new AudioEngine()
