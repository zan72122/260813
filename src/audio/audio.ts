import { clamp } from '../core/util'

type Ctx = AudioContext & { resume: () => Promise<void> }

/**
 * All sound is synthesised — no downloads, no decode stalls on mobile Safari.
 * Nothing here is required to understand the game; it only reinforces it.
 */
export class Audio {
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  private pourGain: GainNode | null = null
  private streamGain: GainNode | null = null
  private streamFilter: BiquadFilterNode | null = null

  private lastDig = 0
  private lastTick = 0
  private unlocked = false
  private volumeLevel = 2
  private muted = false

  /** Called from the first real touch — Safari requires a gesture. */
  unlock(): void {
    if (this.unlocked) return
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      const ctx = new AC() as Ctx
      this.ctx = ctx
      const master = ctx.createGain()
      master.gain.value = this.gainForLevel(this.volumeLevel)
      master.connect(ctx.destination)
      this.master = master

      // One shared noise buffer for every sandy / watery texture.
      const len = Math.floor(ctx.sampleRate * 2)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = white * 0.7 + last * 3.2
      }
      this.noiseBuf = buf

      this.pourGain = this.makeLoop(700, 'bandpass', 1.1)
      this.streamGain = this.makeLoop(1500, 'bandpass', 2.4)
      this.streamFilter = null

      this.unlocked = true
      void ctx.resume()
    } catch {
      this.unlocked = false
    }
  }

  private makeLoop(freq: number, type: BiquadFilterType, q: number): GainNode | null {
    const ctx = this.ctx
    if (!ctx || !this.noiseBuf || !this.master) return null
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const filt = ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.value = freq
    filt.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(filt)
    filt.connect(g)
    g.connect(this.master)
    src.start()
    if (type === 'bandpass' && freq > 1000) this.streamFilter = filt
    return g
  }

  private gainForLevel(level: number): number {
    if (level <= 0) return 0
    return level === 1 ? 0.32 : 0.85
  }

  setVolume(level: number): void {
    this.volumeLevel = clamp(Math.round(level), 0, 2)
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.gainForLevel(this.volumeLevel),
        this.ctx.currentTime,
        0.05,
      )
    }
  }

  setMuted(m: boolean): void {
    this.muted = m
    this.setVolume(this.volumeLevel)
  }

  suspend(): void {
    this.setPour(0)
    this.setStream(0, 0)
    void this.ctx?.suspend()
  }

  resume(): void {
    void this.ctx?.resume()
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  private burst(
    freq: number,
    q: number,
    gain: number,
    attack: number,
    decay: number,
    type: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.noiseBuf || !this.master || this.volumeLevel === 0) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = 0.8 + Math.random() * 0.5
    const filt = ctx.createBiquadFilter()
    filt.type = type
    filt.frequency.value = freq
    filt.Q.value = q
    const g = ctx.createGain()
    const t0 = this.t
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
    src.connect(filt)
    filt.connect(g)
    g.connect(this.master)
    const offset = Math.random() * 1.4
    src.start(t0, offset)
    src.stop(t0 + attack + decay + 0.05)
  }

  private tone(
    freq: number,
    gain: number,
    dur: number,
    type: OscillatorType = 'sine',
    delay = 0,
    glide = 0,
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.master || this.volumeLevel === 0) return
    const osc = ctx.createOscillator()
    osc.type = type
    const t0 = this.t + delay
    osc.frequency.setValueAtTime(freq, t0)
    if (glide) osc.frequency.exponentialRampToValueAtTime(freq * glide, t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  // ---------------------------------------------------------------- events

  /** Dry sand: a short "zaku" with sandy tail. Rate-limited while dragging. */
  dig(intensity: number): void {
    const t = this.t
    if (t - this.lastDig < 0.075) return
    this.lastDig = t
    const i = clamp(intensity, 0, 1)
    this.burst(1500 + Math.random() * 900, 0.9, 0.16 + i * 0.2, 0.006, 0.1)
    this.burst(4200 + Math.random() * 1800, 0.6, 0.05 + i * 0.07, 0.004, 0.19, 'highpass')
  }

  /** Wet-ish sand being patted into place: lower, softer, rounder. */
  mound(intensity: number): void {
    const t = this.t
    if (t - this.lastDig < 0.09) return
    this.lastDig = t
    const i = clamp(intensity, 0, 1)
    this.burst(420 + Math.random() * 180, 1.4, 0.2 + i * 0.16, 0.01, 0.15)
    this.tone(150 + Math.random() * 40, 0.05 + i * 0.04, 0.1, 'sine')
  }

  setPour(level: number): void {
    if (!this.pourGain || !this.ctx) return
    this.pourGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.3, this.t, 0.05)
  }

  /** Continuous running-water bed, driven by how much water is moving. */
  setStream(level: number, brightness: number): void {
    if (!this.streamGain || !this.ctx) return
    this.streamGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.18, this.t, 0.12)
    if (this.streamFilter) {
      this.streamFilter.frequency.setTargetAtTime(900 + brightness * 1600, this.t, 0.2)
    }
  }

  droplet(): void {
    this.tone(760 + Math.random() * 260, 0.1, 0.16, 'sine', 0, 1.9)
  }

  /** Rising blips as the moat fills — the pitch is the progress bar. */
  fillTick(progress: number): void {
    const t = this.t
    if (t - this.lastTick < 0.26) return
    this.lastTick = t
    const scale = [0, 2, 4, 7, 9, 12, 14, 16]
    const step = scale[Math.min(scale.length - 1, Math.floor(progress * scale.length))]
    this.tone(392 * Math.pow(2, step / 12), 0.11, 0.24, 'sine')
  }

  /** Water arriving in the moat for the very first time. */
  splash(): void {
    this.burst(900, 0.8, 0.3, 0.008, 0.36)
    this.tone(520, 0.1, 0.3, 'sine', 0.02, 1.5)
  }

  fanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => {
      this.tone(f, 0.15, 0.6, 'triangle', i * 0.11)
      this.tone(f * 2, 0.05, 0.5, 'sine', i * 0.11 + 0.02)
    })
    this.tone(261.63, 0.1, 1.1, 'sine', 0.44)
    this.burst(2400, 0.5, 0.1, 0.02, 0.9, 'highpass')
  }

  /** Mechanism starting up: wheel, bridge, flags. */
  clank(pitch = 1): void {
    this.tone(180 * pitch, 0.11, 0.22, 'square')
    this.burst(760 * pitch, 2.2, 0.12, 0.006, 0.2)
  }

  tap(): void {
    this.tone(880, 0.09, 0.11, 'triangle')
    this.tone(1320, 0.045, 0.08, 'sine', 0.02)
  }

  get isUnlocked(): boolean {
    return this.unlocked
  }
}
