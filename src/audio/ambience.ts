// 園内環境音ループ: そよ風(フィルタノイズがゆっくりゆらぐ)+時々鳥の短いさえずり(装飾音)。
// 外部音源ファイルは使わず、WebAudio合成のみ。seedは不要(装飾音なので厳密な再現性は求めない)。
import type { AudioEngine } from "./engine";

export interface Ambience {
  start(): void;
  stop(): void;
  setVolume(v: number): void; // 0..1
}

const AMBIENCE_MIX = 0.35; // sfxより控えめな相対音量

export function createAmbience(engine: AudioEngine): Ambience {
  let ambienceGain: GainNode | null = null;
  let windSource: AudioBufferSourceNode | null = null;
  let windLfo: OscillatorNode | null = null;
  let birdTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let volume = 0.6;

  function loopNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function playBirdChirp(ctx: AudioContext, dest: AudioNode): void {
    const t0 = ctx.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      const start = t0 + i * 0.09;
      const base = 1800 + Math.random() * 900;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.3, start + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0006, start + 0.1);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.14);
    }
  }

  function scheduleBird(ctx: AudioContext, dest: AudioNode): void {
    const delay = 3500 + Math.random() * 6000;
    birdTimer = setTimeout(() => {
      if (!running) return;
      try {
        playBirdChirp(ctx, dest);
      } catch {
        // 装飾音の失敗は無視して次回スケジュールへ進む(throw禁止)。
      }
      scheduleBird(ctx, dest);
    }, delay);
  }

  function start(): void {
    if (running) return;
    const ctx = engine.getContext();
    const dest = engine.getMasterGain();
    if (!ctx || !dest) return; // unlock()未実行: 次にstartAmbience()が呼ばれた時に再試行される想定
    running = true;
    try {
      const gain = ctx.createGain();
      gain.gain.value = volume * AMBIENCE_MIX;
      gain.connect(dest);
      ambienceGain = gain;

      const src = ctx.createBufferSource();
      src.buffer = loopNoiseBuffer(ctx, 4);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      filter.Q.value = 0.6;
      const filterLfo = ctx.createOscillator();
      filterLfo.type = "sine";
      filterLfo.frequency.value = 0.07; // ゆっくりゆらぐ風の強弱
      const filterLfoGain = ctx.createGain();
      filterLfoGain.gain.value = 220;
      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(filter.frequency);
      src.connect(filter);
      filter.connect(gain);
      src.start();
      filterLfo.start();
      windSource = src;
      windLfo = filterLfo;

      scheduleBird(ctx, gain);
    } catch {
      running = false;
    }
  }

  function stop(): void {
    running = false;
    if (birdTimer) {
      clearTimeout(birdTimer);
      birdTimer = null;
    }
    try {
      windSource?.stop();
    } catch {
      // 既に停止済み等は無視
    }
    try {
      windLfo?.stop();
    } catch {
      // 既に停止済み等は無視
    }
    windSource = null;
    windLfo = null;
    ambienceGain?.disconnect();
    ambienceGain = null;
  }

  function setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v));
    if (ambienceGain) ambienceGain.gain.value = volume * AMBIENCE_MIX;
  }

  return { start, stop, setVolume };
}
