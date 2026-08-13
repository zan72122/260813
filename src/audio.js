// 手続き的な音。ファイルを読み込まないので起動が速い。
// 「シュワーッ」はフィルタしたノイズ、ごほうびは やわらかいベル。

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.sprayGain = null;
    this.noiseFilter = null;
    this._noise = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ctx.destination);

      // --- 霧の音 ---
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.03 * w) / 1.03;   // すこし低域よりのノイズ
        data[i] = last * 3.2 + w * 0.35;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.7;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.master);
      src.start();
      this._noise = src;
      this.noiseFilter = bp;
      this.sprayGain = g;
      this.ready = true;
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      this.ready = false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /** 噴霧の強さ（0..1）と、虹の帯に当たっている度合い（0..1）。 */
  setSpray(amount, banded) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const g = Math.min(0.16, amount * 0.16);
    this.sprayGain.gain.setTargetAtTime(g, t, 0.05);
    // 虹に当たっているとき、ほんの少し明るい音色になる
    this.noiseFilter.frequency.setTargetAtTime(2200 + banded * 1900 + amount * 500, t, 0.12);
  }

  _bell(freq, when, dur, vol, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.master);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  /** 小さな「ぽろん」。虹の粒が生まれた合図。 */
  drop(index = 0, vol = 0.06) {
    if (!this.ready || this.muted) return;
    const n = PENTA[index % PENTA.length];
    const f = 523.25 * Math.pow(2, n / 12);
    const t = this.ctx.currentTime;
    this._bell(f, t, 0.7, vol);
    this._bell(f * 2, t, 0.35, vol * 0.35, 'triangle');
  }

  /** 段階が上がったときのごほうび。 */
  fanfare(level) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = level >= 2 ? [0, 4, 7, 12, 16] : [0, 4, 7];
    notes.forEach((n, i) => {
      const f = 523.25 * Math.pow(2, (n + level * 2) / 12);
      this._bell(f, t + i * 0.09, 1.1, 0.085);
      this._bell(f * 2, t + i * 0.09, 0.5, 0.03, 'triangle');
    });
  }
}
