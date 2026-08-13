/**
 * ちいさな音あそび。
 * 縞（フリンジ）が1本増えるたびに「ぽろん」と鳴る＝力が増えた合図。
 * 失敗音・警告音はひとつも作らない。
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** 最初のタッチで初期化する（モバイルの自動再生制限のため）。 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (globalThis as WithWebkit).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
  }

  private tone(freq: number, when: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 縞が1本増えた合図。order が上がるほど高い音。 */
  fringe(order: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7];
    const f = scale[Math.min(scale.length - 1, Math.max(0, order - 1))];
    this.tone(f, 0, 0.5, 0.22, 'triangle');
    this.tone(f * 2, 0.01, 0.24, 0.06);
  }

  /** 触った瞬間のやわらかい音。 */
  touch(): void {
    this.tone(392, 0, 0.22, 0.12, 'sine');
  }

  /** できた！ */
  success(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, i * 0.11, 0.7, 0.24, 'triangle');
      this.tone(f * 2, i * 0.11 + 0.01, 0.35, 0.07);
    });
  }

  /** 重りがことん、と乗る音。 */
  thud(): void {
    this.tone(120, 0, 0.24, 0.3, 'sine');
    this.tone(180, 0.02, 0.14, 0.12, 'triangle');
  }
}
