// 効果音はすべて WebAudio で合成する。音声ファイルを持たないので読み込み待ちがない。
// iOS は最初のタップまで音を出せないため、必ず指の操作で resume する。
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.flowGain = null;
    this.windGain = null;
    this.ready = false;
    this.enabled = true;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // 定常的な環境音（水の流れ・風）はノイズ源をフィルタして作る
    const noise = ctx.createBufferSource();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;

    const flowFilter = ctx.createBiquadFilter();
    flowFilter.type = 'bandpass';
    flowFilter.frequency.value = 900;
    flowFilter.Q.value = 0.7;
    this.flowGain = ctx.createGain();
    this.flowGain.gain.value = 0;
    noise.connect(flowFilter).connect(this.flowGain).connect(this.master);

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(windFilter).connect(this.windGain).connect(this.master);
    this.windFilter = windFilter;

    noise.start();
    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  setFlow(v) {
    if (!this.ready) return;
    this.flowGain.gain.setTargetAtTime(Math.min(v, 1) * 0.16, this.ctx.currentTime, 0.25);
  }

  setWind(v) {
    if (!this.ready) return;
    this.windGain.gain.setTargetAtTime(Math.min(v, 1) * 0.2, this.ctx.currentTime, 0.4);
    this.windFilter.frequency.setTargetAtTime(320 + v * 700, this.ctx.currentTime, 0.4);
  }

  _tone(freq, t0, dur, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // 何かが成功したときの、丸く短い和音
  chime(base = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const i = Math.min(scale.length - 1, base);
    this._tone(scale[i], t, 0.7, 0.16);
    this._tone(scale[Math.min(scale.length - 1, i + 2)], t + 0.07, 0.6, 0.1);
  }

  // 板が上がって水が落ちる音
  splash() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.7);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    f.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  // 木の板がゴトンと動く音
  wood() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(180, t, 0.16, 0.14, 'triangle');
    this._tone(96, t + 0.01, 0.22, 0.1, 'sine');
  }

  // 風がひと吹きする音
  gust() {
    if (!this.ready) return;
    this.setWind(0.95);
    setTimeout(() => this.setWind(0.22), 1400);
  }

  // クライマックスの、ひろがっていく音
  fanfare() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((n, i) => this._tone(n, t + i * 0.16, 1.5, 0.11));
    this._tone(261.63, t, 2.6, 0.07, 'triangle');
  }
}
