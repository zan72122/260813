/**
 * 音（WebAudio でその場で作る。音ファイルなし）。
 * iOS では最初のタッチまで鳴らせないので、resume() を必ず通す。
 */

type Voice = 'tap' | 'star' | 'rainbowOn' | 'rainbowOff' | 'clear' | 'click' | 'soft';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** 最初のユーザー操作で呼ぶ */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.3 : 0;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  play(voice: Voice): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    switch (voice) {
      case 'tap':
        this.tone(880, 0, 0.13, 'sine', 0.22);
        break;
      case 'soft':
        this.tone(420, 0, 0.1, 'sine', 0.1);
        break;
      case 'click':
        this.tone(1500, 0, 0.045, 'triangle', 0.05);
        break;
      case 'star':
        this.tone(1046, 0, 0.18, 'sine', 0.24);
        this.tone(1568, 0.07, 0.22, 'sine', 0.18);
        this.tone(2093, 0.14, 0.3, 'sine', 0.12);
        break;
      case 'rainbowOn':
        [523, 659, 784, 1046, 1318].forEach((f, i) => {
          this.tone(f, i * 0.07, 0.36, 'triangle', 0.18);
        });
        break;
      case 'rainbowOff':
        [880, 698, 587, 440].forEach((f, i) => {
          this.tone(f, i * 0.05, 0.2, 'sine', 0.12);
        });
        break;
      case 'clear':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => {
          this.tone(f, i * 0.11, 0.5, 'triangle', 0.2);
        });
        this.tone(2093, 0.66, 0.9, 'sine', 0.14);
        break;
    }
  }
}

export const sound = new Sound();
