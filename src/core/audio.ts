/**
 * All sound is synthesised at runtime with WebAudio — zero audio assets,
 * so the whole game stays a few hundred KB and loads instantly on mobile.
 */
type Ctx = AudioContext

let ctx: Ctx | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let ambientGain: GainNode | null = null
let unlocked = false
let muted = false

const now = () => (ctx ? ctx.currentTime : 0)

export function initAudio() {
  if (ctx) return
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
  if (!AC) return
  try { ctx = new AC() } catch { return }
  master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  const sr = ctx.sampleRate
  noiseBuf = ctx.createBuffer(1, sr * 2, sr)
  const d = noiseBuf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    last = last * 0.2 + w * 0.8
    d[i] = last
  }
}

/** must be called from a real user gesture on iOS */
export function unlockAudio() {
  initAudio()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  if (!unlocked) {
    unlocked = true
    startAmbient()
  }
}

export function setMuted(m: boolean) {
  muted = m
  if (master) master.gain.value = m ? 0 : 0.9
}
export function isMuted() { return muted }
export function audioReady() { return !!ctx && unlocked }

function noiseSource(): AudioBufferSourceNode | null {
  if (!ctx || !noiseBuf) return null
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  s.playbackRate.value = 0.8 + Math.random() * 0.4
  return s
}

function env(g: GainNode, t0: number, peak: number, a: number, d: number) {
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d)
}

/** short filtered-noise burst — the base of most craft sounds */
function burst(o: {
  t?: number; freq: number; q?: number; gain?: number; attack?: number; decay?: number
  sweepTo?: number; type?: BiquadFilterType
}) {
  if (!ctx || !master || muted) return
  const t0 = (o.t ?? 0) + now()
  const src = noiseSource()
  if (!src) return
  const bp = ctx.createBiquadFilter()
  bp.type = o.type ?? 'bandpass'
  bp.frequency.setValueAtTime(o.freq, t0)
  if (o.sweepTo) bp.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + (o.attack ?? 0.005) + (o.decay ?? 0.1))
  bp.Q.value = o.q ?? 4
  const g = ctx.createGain()
  env(g, t0, o.gain ?? 0.3, o.attack ?? 0.005, o.decay ?? 0.1)
  src.connect(bp); bp.connect(g); g.connect(master)
  src.start(t0)
  src.stop(t0 + (o.attack ?? 0.005) + (o.decay ?? 0.1) + 0.05)
}

function tone(o: {
  t?: number; freq: number; to?: number; gain?: number; attack?: number; decay?: number
  type?: OscillatorType
}) {
  if (!ctx || !master || muted) return
  const t0 = (o.t ?? 0) + now()
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + (o.attack ?? 0.004) + (o.decay ?? 0.2))
  const g = ctx.createGain()
  env(g, t0, o.gain ?? 0.2, o.attack ?? 0.004, o.decay ?? 0.2)
  osc.connect(g); g.connect(master)
  osc.start(t0)
  osc.stop(t0 + (o.attack ?? 0.004) + (o.decay ?? 0.2) + 0.05)
}

/* ---------- named game sounds ---------- */

export const sfx = {
  /** tool sliding along the bamboo, cutting a notch: シュッ */
  shu(p = 0) {
    burst({ freq: 1600 + p * 900, sweepTo: 3400 + p * 1200, q: 1.2, gain: 0.16, attack: 0.006, decay: 0.1 })
  },
  /** one bamboo rib splitting free: パラッ */
  para(i = 0, energy = 1) {
    const f = 900 + (i % 7) * 130 + Math.random() * 120
    burst({ freq: f, sweepTo: f * 2.1, q: 6, gain: 0.16 * energy, attack: 0.002, decay: 0.075 })
    tone({ freq: f * 1.5, to: f * 0.85, gain: 0.05 * energy, attack: 0.002, decay: 0.09, type: 'triangle' })
  },
  /** the whole fan blooming open: ファサッ */
  fasa() {
    burst({ freq: 700, sweepTo: 5200, q: 0.8, gain: 0.34, attack: 0.02, decay: 0.6 })
    burst({ t: 0.05, freq: 2200, sweepTo: 900, q: 1.6, gain: 0.2, attack: 0.02, decay: 0.5 })
    for (let i = 0; i < 7; i++) sfx.para(i, 0.5)
  },
  /** bow bamboo sliding through: スーーッ */
  slide(p = 0) {
    burst({ freq: 500 + p * 1500, q: 2.5, gain: 0.09, attack: 0.02, decay: 0.13 })
  },
  /** locking into place: カチッ */
  click(pitch = 1) {
    burst({ freq: 2600 * pitch, q: 9, gain: 0.22, attack: 0.001, decay: 0.045 })
    tone({ freq: 1300 * pitch, to: 700 * pitch, gain: 0.12, attack: 0.001, decay: 0.07, type: 'triangle' })
  },
  /** thread picking up one rib: チッ */
  chi(i = 0) {
    burst({ freq: 3100 + (i % 5) * 220, q: 13, gain: 0.1, attack: 0.001, decay: 0.035 })
  },
  /** brushing glue / stroking paper: サラッ */
  sara(v = 1) {
    burst({ freq: 1100 + v * 1400, q: 0.9, gain: 0.06 * Math.min(1.4, v), attack: 0.02, decay: 0.16, type: 'highpass' })
  },
  /** wooden mallet: トン */
  ton() {
    tone({ freq: 210, to: 70, gain: 0.42, attack: 0.002, decay: 0.28, type: 'sine' })
    burst({ freq: 800, q: 1.5, gain: 0.2, attack: 0.001, decay: 0.09 })
    tone({ freq: 520, to: 300, gain: 0.1, attack: 0.002, decay: 0.13, type: 'triangle' })
  },
  /** roller: コロコロ */
  koro(v = 1) {
    burst({ freq: 260 + Math.random() * 160, q: 3, gain: 0.09 * v, attack: 0.006, decay: 0.1 })
  },
  /** wind chime: チリーン */
  chirin(pitch = 1) {
    const base = 1480 * pitch
    tone({ freq: base, gain: 0.14, attack: 0.003, decay: 1.5, type: 'sine' })
    tone({ freq: base * 2.76, gain: 0.06, attack: 0.003, decay: 1.1, type: 'sine' })
    tone({ freq: base * 5.4, gain: 0.025, attack: 0.003, decay: 0.7, type: 'sine' })
  },
  /** fanning air: パタ */
  pata(v = 1) {
    burst({ freq: 220 + v * 260, sweepTo: 90 + v * 120, q: 0.7, gain: 0.1 + 0.22 * Math.min(1, v), attack: 0.03, decay: 0.22 })
  },
  /** small positive confirmation */
  ok(step = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]
    const n = scale[step % scale.length]
    tone({ freq: n, gain: 0.16, attack: 0.005, decay: 0.42, type: 'triangle' })
    tone({ t: 0.06, freq: n * 1.5, gain: 0.09, attack: 0.005, decay: 0.35, type: 'sine' })
  },
  /** stage complete fanfare (short, gentle) */
  done() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((n, i) => {
      tone({ t: i * 0.09, freq: n, gain: 0.15, attack: 0.006, decay: 0.5, type: 'triangle' })
      tone({ t: i * 0.09, freq: n * 2, gain: 0.05, attack: 0.006, decay: 0.4, type: 'sine' })
    })
  },
  /** UI blip */
  tap() {
    tone({ freq: 880, to: 1320, gain: 0.1, attack: 0.003, decay: 0.1, type: 'triangle' })
  },
  /** paper sticking down */
  pon() {
    tone({ freq: 330, to: 160, gain: 0.2, attack: 0.003, decay: 0.2, type: 'sine' })
    burst({ freq: 1500, q: 1.2, gain: 0.1, attack: 0.004, decay: 0.14 })
  }
}

/* ---------- continuous ambience ---------- */

let ambientLfo: OscillatorNode | null = null
function startAmbient() {
  if (!ctx || !master) return
  const src = noiseSource()
  if (!src) return
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 420
  const g = ctx.createGain()
  g.gain.value = 0.028
  ambientGain = g
  // slow breathing so the room tone never feels static
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.016
  lfo.connect(lfoGain); lfoGain.connect(g.gain)
  src.connect(lp); lp.connect(g); g.connect(master)
  src.start()
  lfo.start()
  ambientLfo = lfo
}

export function setAmbientWind(amount: number) {
  if (!ambientGain || !ctx) return
  const target = 0.028 + amount * 0.075
  ambientGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2)
}

export function stopAmbient() {
  ambientLfo?.stop()
  ambientLfo = null
}
