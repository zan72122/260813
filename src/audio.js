// やさしい音（外部素材なし・WebAudio のみ）。
// 大きな音や刺さる高音を出さないように、全体をローパスと控えめな音量で包む。

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.pad = null;
    this.enabled = true;
    this.padGain = null;
  }

  start() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
    } catch { this.enabled = false; return; }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    this.master.connect(lp).connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);

    // ふんわりした持続音
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 700;
    this.padGain.connect(padFilter).connect(this.master);

    for (const [f, d] of [[110, 0], [110.6, 0.3], [164.8, 0.6], [220.9, 0.9]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.24 - d * 0.12;
      o.connect(g).connect(this.padGain);
      o.start();
    }
    this.padGain.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 4.0);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** やわらかいベル */
  chime(freq = 660, dur = 1.6, vol = 0.10, type = 'sine') {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 音階の一粒（近づくほど高い音） */
  step(index) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = scale[Math.max(0, Math.min(scale.length - 1, index))];
    this.chime(261.63 * Math.pow(2, n / 12) * 2, 1.4, 0.075);
  }

  sparkle() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.chime(880 * Math.pow(2, i / 12 * 2), 1.9, 0.055), i * 90);
    }
  }

  swell() {
    const ctx = this.ctx;
    if (!ctx || !this.padGain) return;
    const t = ctx.currentTime;
    this.padGain.gain.cancelScheduledValues(t);
    this.padGain.gain.setValueAtTime(this.padGain.gain.value, t);
    this.padGain.gain.linearRampToValueAtTime(0.22, t + 2.2);
    this.padGain.gain.linearRampToValueAtTime(0.11, t + 7.0);
  }
}
