/**
 * AudioManager — すべての効果音を WebAudio でプロシージャル合成する。
 * 将来サンプル音源へ差し替えられるよう、名前付き API のみを公開する。
 * iOS Safari 対策: 最初のユーザー入力で resume() を呼ぶ。
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  volume = 0.8;
  /** 継続音チャンネル (pour, cream など) */
  private channels = new Map<string, { gain: GainNode; stop: () => void }>();
  private lastPlay = new Map<string, number>();
  voiceEnabled = true;

  /** 最初のユーザージェスチャで呼ぶ */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      // 2秒のホワイトノイズバッファ
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    if (m) window.speechSynthesis?.cancel();
  }

  private throttled(name: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(name) ?? -1e9;
    if (now - last < ms) return true;
    this.lastPlay.set(name, now);
    return false;
  }

  private env(dur: number, peak = 1, attack = 0.01): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  private osc(type: OscillatorType, freq: number, dur: number, dest: AudioNode): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx!.currentTime);
    o.connect(dest);
    o.start();
    o.stop(this.ctx!.currentTime + dur + 0.05);
    return o;
  }

  private noise(dur: number, dest: AudioNode, filterFreq = 1200, q = 1): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    s.connect(f); f.connect(dest);
    s.start();
    s.stop(this.ctx.currentTime + dur + 0.05);
    return s;
  }

  // ---------- ワンショット ----------

  /** びよーん: 伸ばし。speed 0..1 でピッチと長さが変わる */
  boing(stretch = 0.5, speed = 0.5) {
    if (!this.ctx || this.throttled('boing', 90)) return;
    const dur = 0.25 + speed * 0.15;
    const g = this.env(dur, 0.25 + speed * 0.2, 0.02); if (!g) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const f0 = 180 + stretch * 160;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.6 + speed), t + dur * 0.8);
    // ビブラート
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 9; lg.gain.value = 12;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(); lfo.stop(t + dur);
    o.connect(g); o.start(); o.stop(t + dur + 0.05);
  }

  /** むにゅ: 柔らかタッチ音 */
  squish(pitch = 1) {
    if (!this.ctx || this.throttled('squish', 120)) return;
    const g = this.env(0.16, 0.22, 0.01); if (!g) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(240 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(110 * pitch, t + 0.14);
    o.connect(g); o.start(); o.stop(t + 0.2);
    this.noise(0.1, this.env(0.1, 0.06)!, 900);
  }

  /** ぺたん: 折り畳み */
  petan() {
    if (!this.ctx || this.throttled('petan', 150)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.22, 0.35, 0.005); if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    o.connect(g); o.start(); o.stop(t + 0.25);
    this.noise(0.08, this.env(0.08, 0.1)!, 700);
  }

  /** キュッ: 口を閉じる */
  kyu() {
    if (!this.ctx || this.throttled('kyu', 200)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.18, 0.25, 0.01); if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(1350, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    o.connect(g); o.start(); o.stop(t + 0.22);
  }

  /** ポチャン: 水へ落ちる */
  splash(big = 1) {
    if (!this.ctx || this.throttled('splash', 250)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.5, 0.4 * big, 0.005); if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    o.connect(g); o.start(); o.stop(t + 0.4);
    this.noise(0.35, this.env(0.35, 0.22 * big)!, 2400, 0.6);
  }

  /** 水滴 */
  drip() {
    if (!this.ctx || this.throttled('drip', 100)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.14, 0.14, 0.004); if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(900 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    o.connect(g); o.start(); o.stop(t + 0.18);
  }

  /** ころころ: カードが集まる */
  gather() {
    if (!this.ctx || this.throttled('gather', 180)) return;
    const g = this.env(0.2, 0.12, 0.01); if (!g) return;
    this.noise(0.18, g, 500 + Math.random() * 300);
  }

  /** トロッ: 中身を注ぐ・落とす */
  plop(pitch = 1) {
    if (!this.ctx || this.throttled('plop', 130)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.24, 0.3, 0.01); if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(300 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(200 * pitch, t + 0.2);
    o.connect(g); o.start(); o.stop(t + 0.28);
  }

  /** 成功チャイム(控えめ) */
  chime() {
    if (!this.ctx || this.throttled('chime', 400)) return;
    const notes = [523.25, 659.25, 784];
    notes.forEach((f, i) => {
      const t = this.ctx!.currentTime + i * 0.09;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      g.connect(this.master!);
      const o = this.ctx!.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 0.55);
    });
  }

  /** さく: 裂く音 */
  tear() {
    if (!this.ctx || this.throttled('tear', 150)) return;
    const t = this.ctx.currentTime;
    const g = this.env(0.2, 0.2, 0.005); if (!g) return;
    const s = this.noise(0.2, g, 3000, 1.2);
    if (s) { /* sweep */ }
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const g2 = this.env(0.15, 0.08); if (!g2) return;
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.13);
    o.connect(g2); o.start(); o.stop(t + 0.2);
  }

  // ---------- 継続チャンネル ----------

  /** 継続音を開始 (pour: お湯 / cream: クリーム / steam / flow: 中身流出) */
  startChannel(name: 'pour' | 'cream' | 'flow' | 'stir') {
    if (!this.ctx || !this.master || this.channels.has(name)) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = name === 'pour' ? 1600 : name === 'stir' ? 800 : 500;
    f.Q.value = 0.8;
    f.connect(g);
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf!;
    s.loop = true;
    s.connect(f);
    s.start();
    // クリーム/流出には低いうねり
    let lfo: OscillatorNode | null = null;
    if (name !== 'pour') {
      lfo = this.ctx.createOscillator();
      lfo.frequency.value = name === 'stir' ? 1.2 : 2.2;
      const lg = this.ctx.createGain();
      lg.gain.value = 200;
      lfo.connect(lg); lg.connect(f.frequency);
      lfo.start();
    }
    this.channels.set(name, {
      gain: g,
      stop: () => { try { s.stop(); lfo?.stop(); } catch { /* noop */ } },
    });
  }

  /** 継続音の強さ 0..1 */
  setChannel(name: string, level: number) {
    const c = this.channels.get(name);
    if (c && this.ctx) {
      const base = name === 'pour' ? 0.22 : 0.16;
      c.gain.gain.setTargetAtTime(level * base, this.ctx.currentTime, 0.08);
    }
  }

  stopChannel(name: string) {
    const c = this.channels.get(name);
    if (c && this.ctx) {
      c.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const stop = c.stop;
      setTimeout(stop, 400);
      this.channels.delete(name);
    }
  }

  stopAllChannels() {
    for (const name of [...this.channels.keys()]) this.stopChannel(name);
  }

  /** 短い音声ガイド。speechSynthesis が無い/オフなら無音でスキップ。
   *  サンプル音声に差し替える場合はここを置き換える。 */
  voice(text: string) {
    if (this.muted || !this.voiceEnabled) return;
    const ss = window.speechSynthesis;
    if (!ss) return;
    if (this.throttled('voice', 1500)) return;
    try {
      ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.95;
      u.pitch = 1.35;
      u.volume = 0.85;
      const v = ss.getVoices().find(v => v.lang.startsWith('ja'));
      if (v) u.voice = v;
      ss.speak(u);
    } catch { /* 無視 */ }
  }
}
