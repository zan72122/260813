// WebAudio による効果音の合成。音声アセットは持たない（読み込み待ちゼロ）。
import { clamp } from './util.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.loops = {};
    this.muted = false;
    this._lastCrackle = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // 2秒ぶんのホワイトノイズ（使い回し）
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  ok() { return !!this.ctx && !this.muted; }

  _noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  // フィルタ付きノイズ一発
  burst({ dur = 0.2, f0 = 900, f1 = 400, q = 3, gain = 0.3, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ok()) return;
    const t = this.t + delay;
    const src = this._noiseSrc();
    const flt = this.ctx.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  tone({ f0 = 440, f1 = 440, dur = 0.25, gain = 0.18, type = 'sine', delay = 0 } = {}) {
    if (!this.ok()) return;
    const t = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ぺちゃっ（粘い液を触る）
  squish(v = 1) {
    this.burst({ dur: 0.16 + 0.1 * v, f0: 500 + 500 * v, f1: 160, q: 1.4, gain: 0.14 * v, type: 'lowpass' });
    this.tone({ f0: 190 * (0.9 + v * 0.3), f1: 70, dur: 0.14, gain: 0.07 * v, type: 'sine' });
  }

  // ぽたっ（水滴）
  drip() {
    const f = 700 + Math.random() * 900;
    this.tone({ f0: f, f1: f * 2.2, dur: 0.09, gain: 0.055, type: 'sine' });
  }

  // ぎゅっ（プレス）
  press(v = 1) {
    this.burst({ dur: 0.34, f0: 1500, f1: 240, q: 0.9, gain: 0.16 * v, type: 'lowpass' });
    this.tone({ f0: 120, f1: 55, dur: 0.26, gain: 0.1 * v, type: 'triangle' });
  }

  // ぺりっ（剥離）— このゲームの主役の音
  crackle(speed = 1) {
    if (!this.ok()) return;
    const now = this.t;
    const minGap = 0.035 + 0.09 * (1 - clamp(speed, 0, 1));
    if (now - this._lastCrackle < minGap) return;
    this._lastCrackle = now;
    const s = clamp(speed, 0.15, 1);
    this.burst({ dur: 0.05 + 0.03 * s, f0: 2600 + 2600 * Math.random(), f1: 1100, q: 6, gain: 0.1 + 0.16 * s });
  }

  peelPop() {
    this.burst({ dur: 0.22, f0: 4200, f1: 700, q: 2.5, gain: 0.3 });
    this.tone({ f0: 320, f1: 620, dur: 0.18, gain: 0.1, type: 'triangle' });
  }

  whoosh() {
    this.burst({ dur: 0.45, f0: 300, f1: 1800, q: 0.8, gain: 0.11, type: 'bandpass' });
  }

  // きらん（ごほうび）
  chime(step = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const f = scale[step % scale.length] * (step >= scale.length ? 2 : 1);
    this.tone({ f0: f, f1: f, dur: 0.5, gain: 0.13, type: 'triangle' });
    this.tone({ f0: f * 2, f1: f * 2, dur: 0.32, gain: 0.05, type: 'sine' });
  }

  pop() { this.tone({ f0: 420, f1: 900, dur: 0.12, gain: 0.11, type: 'sine' }); }

  // ループ音（流し込み・送風）
  loop(name, on, { f = 700, q = 1, gain = 0.1, type = 'bandpass' } = {}) {
    if (!this.ok()) return;
    let L = this.loops[name];
    if (on) {
      if (!L) {
        const src = this._noiseSrc(true);
        const flt = this.ctx.createBiquadFilter();
        flt.type = type; flt.Q.value = q; flt.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        src.connect(flt); flt.connect(g); g.connect(this.master);
        src.start();
        L = this.loops[name] = { src, flt, g };
      }
      L.flt.frequency.setTargetAtTime(f, this.t, 0.08);
      L.g.gain.setTargetAtTime(gain, this.t, 0.06);
    } else if (L) {
      L.g.gain.setTargetAtTime(0.0001, this.t, 0.12);
    }
  }

  stopAllLoops() { for (const k in this.loops) this.loop(k, false); }
}

export const sfx = new Sfx();
