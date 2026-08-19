/**
 * Every sound in the game is synthesised in the Web Audio graph.
 *
 * Nothing is downloaded, which matters twice over: the game starts instantly on
 * a phone, and Safari's autoplay rules only need one unlock on the start tap.
 * The palette is deliberately soft - a 4-year-old is holding this close to their face.
 */

type Maybe<T> = T | null;

export class Audio {
  /** exposed so the automated playtest can confirm the graph exists */
  ctx: Maybe<AudioContext> = null;
  private master: Maybe<GainNode> = null;
  private wet: Maybe<GainNode> = null;
  private waterGain: Maybe<GainNode> = null;
  private windGain: Maybe<GainNode> = null;
  private padGain: Maybe<GainNode> = null;
  private noiseBuf: Maybe<AudioBuffer> = null;
  private birdTimer = 0;
  private birdNext = 4;
  enabled = true;

  /** Must be called from a real user gesture (Safari). */
  async unlock() {
    if (this.ctx) { await this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      const ctx = new AC();
      this.ctx = ctx;
      await ctx.resume().catch(() => {});

      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      this.master = master;

      // small warm room; keeps the pops from sounding like a UI beep
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(1.5, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.30;
      wet.connect(conv);
      conv.connect(master);
      this.wet = wet;

      this.noiseBuf = this.noise(2.5);
      this.buildLoops();
    } catch {
      this.enabled = false;
    }
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private noise(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;   // gently pink
      d[i] = last * 3.2;
    }
    return buf;
  }

  private loopSource(buf: AudioBuffer) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    return s;
  }

  private buildLoops() {
    const ctx = this.ctx!, master = this.master!;

    // ---- water: band-passed noise with a slow wander --------------------
    const wsrc = this.loopSource(this.noiseBuf!);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 420;
    const wg = ctx.createGain(); wg.gain.value = 0;
    wsrc.connect(bp); bp.connect(hp); hp.connect(wg); wg.connect(master); wg.connect(this.wet!);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lg = ctx.createGain(); lg.gain.value = 620;
    lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    this.waterGain = wg;

    // ---- wind: low noise, very slow movement ----------------------------
    const nsrc = this.loopSource(this.noiseBuf!);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0;
    nsrc.connect(lp); lp.connect(ng); ng.connect(master);
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.09;
    const wlg = ctx.createGain(); wlg.gain.value = 210;
    wlfo.connect(wlg); wlg.connect(lp.frequency); wlfo.start();
    const alfo = ctx.createOscillator(); alfo.frequency.value = 0.13;
    const alg = ctx.createGain(); alg.gain.value = 0.30;
    alfo.connect(alg); alg.connect(ng.gain); alfo.start();
    this.windGain = ng;

    // ---- pad: two detuned triangles, only used for the final vista ------
    const pg = ctx.createGain(); pg.gain.value = 0;
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 900;
    pg.connect(plp); plp.connect(master); plp.connect(this.wet!);
    for (const f of [174.6, 261.6, 349.2, 392.0]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = ctx.createGain(); g.gain.value = 0.16;
      o.connect(g); g.connect(pg); o.start();
    }
    this.padGain = pg;
  }

  private env(node: AudioNode, t0: number, a: number, d: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    g.connect(this.master!);
    g.connect(this.wet!);
    return g;
  }

  private tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this.env(o, t0, at, dur, peak);
    o.start(t0);
    o.stop(t0 + at + dur + 0.12);
  }

  private noiseBurst(freq: number, q: number, dur: number, peak: number, delay = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.enabled || !this.noiseBuf) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.45), t0 + dur);
    s.connect(f);
    this.env(f, t0, 0.012, dur, peak);
    s.start(t0);
    s.stop(t0 + dur + 0.2);
  }

  // ------------------------------------------------------------------ SFX --
  /** bulb dropping into the hole */
  plop() {
    this.tone('sine', 520, 120, 0.006, 0.22, 0.55);
    this.noiseBurst(900, 1.2, 0.16, 0.28, 0.005);
  }
  /** soil folding back over the bulb */
  fluff() {
    this.noiseBurst(1500, 0.7, 0.34, 0.16, 0.02, 'lowpass');
    this.tone('sine', 190, 110, 0.03, 0.28, 0.12, 0.02);
  }
  /** the gate handle clunking open */
  clack() {
    this.tone('triangle', 340, 150, 0.004, 0.13, 0.42);
    this.tone('square', 1100, 700, 0.003, 0.05, 0.10);
    this.noiseBurst(2600, 2.0, 0.09, 0.22);
  }
  /** roots reaching down - low, soft, almost felt rather than heard */
  rootGrow() {
    this.tone('sine', 90, 200, 0.35, 0.9, 0.16);
    this.noiseBurst(340, 1.4, 0.9, 0.07, 0.0, 'lowpass');
  }
  /** a sprout breaking the surface */
  pop(pitch = 1) {
    this.tone('sine', 300 * pitch, 900 * pitch, 0.004, 0.13, 0.34);
    this.noiseBurst(2200 * pitch, 1.6, 0.07, 0.13);
  }
  /** a single flower opening */
  bloom(pitch = 1) {
    this.tone('triangle', 880 * pitch, 1320 * pitch, 0.02, 0.55, 0.16);
    this.tone('sine', 1760 * pitch, 2200 * pitch, 0.02, 0.35, 0.07, 0.03);
  }
  /** the far-away half of the bloom wave: one soft swell, never a thousand pops */
  bloomSwell(level = 1) {
    this.noiseBurst(1900, 0.5, 1.5, 0.10 * level, 0, 'lowpass');
    this.tone('sine', 523, 784, 0.6, 1.6, 0.09 * level);
    this.tone('sine', 659, 988, 0.7, 1.8, 0.07 * level, 0.12);
  }
  sparkle() {
    const n = [1046, 1318, 1568, 2093];
    n.forEach((f, i) => this.tone('sine', f, f * 1.02, 0.02, 0.7, 0.10, i * 0.09));
  }
  /** gentle nudge when the child hesitates */
  hint() {
    this.tone('sine', 660, 880, 0.02, 0.18, 0.10);
    this.tone('sine', 880, 990, 0.02, 0.2, 0.07, 0.12);
  }

  // --------------------------------------------------------------- loops ---
  private ramp(g: Maybe<GainNode>, v: number, time = 0.6) {
    if (!g || !this.ctx) return;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.linearRampToValueAtTime(v, t + time);
  }
  water(level: number, time = 0.5) { this.ramp(this.waterGain, level * 0.28, time); }
  wind(level: number, time = 1.6) { this.ramp(this.windGain, level * 0.16, time); }
  pad(level: number, time = 3.0) { this.ramp(this.padGain, level * 0.11, time); }

  /** occasional birds once the field is alive */
  birds = false;
  tick(dt: number) {
    if (!this.ctx || !this.enabled || !this.birds) return;
    this.birdTimer += dt;
    if (this.birdTimer < this.birdNext) return;
    this.birdTimer = 0;
    this.birdNext = 3.5 + Math.random() * 6;
    const base = 1800 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + Math.random() * 0.4);
      this.tone('sine', f, f * (1.2 + Math.random() * 0.5), 0.01, 0.07, 0.045, i * 0.1);
    }
  }

  stopAll() {
    this.water(0, 0.4); this.wind(0, 0.8); this.pad(0, 0.8); this.birds = false;
  }
}
