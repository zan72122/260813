// SfxId全11種をWebAudio合成のみで実装(外部音源ファイル禁止)。各行動に合う音色を個別設計する
// (「クリック音の使い回し」を避け、隠す/開ける/めくる/折れる等の質感をそれぞれ別の波形・フィルタで表現)。
// 音色設計の一覧はops/reports/S5.mdを参照。
import type { SfxId } from "../core/types";
import type { AudioEngine } from "./engine";

export interface Sfx {
  /** volumeScale(既定1)で個別の一発を少し控えめに鳴らせる(例: probe-gapの「小さめ」演出)。 */
  play(id: SfxId, volumeScale?: number): void;
  /** high-branchの「滑車のキュッ」専用。SfxId契約には無い装飾音のためplay()経由では公開しない。 */
  playPulleySqueak(volumeScale?: number): void;
}

function whiteNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envGain(ctx: AudioContext, dest: AudioNode, t0: number, peak: number, attack: number, release: number): GainNode {
  const gain = ctx.createGain();
  const g = gain.gain;
  g.setValueAtTime(0, t0);
  g.linearRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.001, attack));
  g.exponentialRampToValueAtTime(0.0008, t0 + Math.max(0.001, attack) + Math.max(0.02, release));
  gain.connect(dest);
  return gain;
}

interface NoiseOpts {
  t0: number;
  duration: number;
  peak: number;
  attack?: number;
  filterType?: BiquadFilterType;
  freq: number;
  q?: number;
}
function noiseBurst(ctx: AudioContext, dest: AudioNode, opts: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = whiteNoiseBuffer(ctx, opts.duration + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? "bandpass";
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 1;
  const gain = envGain(ctx, dest, opts.t0, opts.peak, opts.attack ?? 0.008, opts.duration);
  src.connect(filter);
  filter.connect(gain);
  src.start(opts.t0);
  src.stop(opts.t0 + opts.duration + 0.08);
}

interface ToneOpts {
  t0: number;
  duration: number;
  peak: number;
  attack?: number;
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
}
function tone(ctx: AudioContext, dest: AudioNode, opts: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(1, opts.freq), opts.t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), opts.t0 + opts.duration);
  }
  const gain = envGain(ctx, dest, opts.t0, opts.peak, opts.attack ?? 0.01, opts.duration);
  osc.connect(gain);
  osc.start(opts.t0);
  osc.stop(opts.t0 + opts.duration + 0.05);
}

type Synth = (ctx: AudioContext, dest: AudioNode, t0: number) => void;

// food-tuck: 柔らかいポン(サイン波の短い下降+こもったノイズを一瞬混ぜる)。
const foodTuck: Synth = (ctx, dest, t0) => {
  tone(ctx, dest, { t0, duration: 0.1, peak: 0.5, type: "sine", freq: 340, freqEnd: 175, attack: 0.006 });
  noiseBurst(ctx, dest, { t0, duration: 0.05, peak: 0.22, filterType: "lowpass", freq: 900, attack: 0.004 });
};

// sand-cover: ザッ、ザッ(帯域を変えたフィルタノイズburstを2回)。
const sandCover: Synth = (ctx, dest, t0) => {
  noiseBurst(ctx, dest, { t0, duration: 0.13, peak: 0.36, filterType: "bandpass", freq: 2200, q: 0.7 });
  noiseBurst(ctx, dest, { t0: t0 + 0.12, duration: 0.11, peak: 0.24, filterType: "bandpass", freq: 1500, q: 0.7 });
};

// gate-open: 低いゴロゴロ(ローパスの鋸波sweep+同時に低いノイズの唸り)。
const gateOpen: Synth = (ctx, dest, t0) => {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(72, t0);
  osc.frequency.exponentialRampToValueAtTime(36, t0 + 1.0);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(480, t0);
  filter.frequency.exponentialRampToValueAtTime(130, t0 + 1.0);
  const gain = envGain(ctx, dest, t0, 0.42, 0.06, 1.0);
  osc.connect(filter);
  filter.connect(gain);
  osc.start(t0);
  osc.stop(t0 + 1.15);
  noiseBurst(ctx, dest, { t0, duration: 1.0, peak: 0.16, attack: 0.08, filterType: "lowpass", freq: 220, q: 0.5 });
};

// trunk-pipe: こもったフーッ(バンドパスノイズ、鼻息のように立ち上がりを緩やかに)。
const trunkPipe: Synth = (ctx, dest, t0) => {
  noiseBurst(ctx, dest, { t0, duration: 0.48, peak: 0.3, attack: 0.06, filterType: "bandpass", freq: 480, q: 1.4 });
};

// leaf-rustle: シャラシャラ(ハイパスノイズの短い粒を複数、間隔と音量をランダムに散らす)。
const leafRustle: Synth = (ctx, dest, t0) => {
  const grains = 6;
  for (let i = 0; i < grains; i++) {
    const dt = i * 0.045 + Math.random() * 0.02;
    noiseBurst(ctx, dest, {
      t0: t0 + dt,
      duration: 0.05,
      peak: 0.12 + Math.random() * 0.06,
      filterType: "highpass",
      freq: 2800 + Math.random() * 1600,
      q: 0.8
    });
  }
};

// banana-peel: ミリミリッ(ノコギリ波の粒列がピッチ上昇しつつ、擦れノイズを添える)。
const bananaPeel: Synth = (ctx, dest, t0) => {
  const grains = 5;
  for (let i = 0; i < grains; i++) {
    const dt = i * 0.065;
    tone(ctx, dest, { t0: t0 + dt, duration: 0.05, peak: 0.22, type: "sawtooth", freq: 260 + i * 38, freqEnd: 340 + i * 42, attack: 0.004 });
    noiseBurst(ctx, dest, { t0: t0 + dt, duration: 0.04, peak: 0.1, filterType: "highpass", freq: 2500, attack: 0.003 });
  }
};

// branch-creak: ギィィ(低いのこぎり波にゆっくりしたピッチ揺らぎ、ローパスで丸める)。
const branchCreak: Synth = (ctx, dest, t0) => {
  const duration = 0.9;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(88, t0);
  osc.frequency.linearRampToValueAtTime(66, t0 + 0.28);
  osc.frequency.linearRampToValueAtTime(102, t0 + 0.55);
  osc.frequency.linearRampToValueAtTime(64, t0 + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 480;
  filter.Q.value = 5;
  const gain = envGain(ctx, dest, t0, 0.3, 0.05, duration - 0.05);
  osc.connect(filter);
  filter.connect(gain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
};

// branch-snap: バキッ(短いノイズ+矩形波アタックでピッチが急降下)。
const branchSnap: Synth = (ctx, dest, t0) => {
  noiseBurst(ctx, dest, { t0, duration: 0.03, peak: 0.5, attack: 0.002, filterType: "bandpass", freq: 1200, q: 0.9 });
  tone(ctx, dest, { t0, duration: 0.06, peak: 0.38, type: "square", freq: 220, freqEnd: 75, attack: 0.002 });
};

// found-chime: 優しい2音チャイム(五度、サイン中心+わずかなトライアングルで温かみ、キラキラさせすぎない)。
const foundChime: Synth = (ctx, dest, t0) => {
  tone(ctx, dest, { t0, duration: 0.32, peak: 0.28, type: "sine", freq: 523.25, attack: 0.02 });
  tone(ctx, dest, { t0: t0 + 0.15, duration: 0.5, peak: 0.26, type: "sine", freq: 783.99, attack: 0.03 });
  tone(ctx, dest, { t0: t0 + 0.15, duration: 0.5, peak: 0.06, type: "triangle", freq: 783.99 * 2, attack: 0.03 });
};

// ui-tap: 小さなタップ音(短いサイン、控えめ)。
const uiTap: Synth = (ctx, dest, t0) => {
  tone(ctx, dest, { t0, duration: 0.05, peak: 0.16, type: "sine", freq: 640, attack: 0.003 });
};

// elephant-rumble: 超低周波の穏やかな鳴き(サイン2発+LFOでゆっくりゆらぐ)。
const elephantRumble: Synth = (ctx, dest, t0) => {
  const duration = 1.6;
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 38;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 41;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 4.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 3.5;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.3, t0 + 0.3);
  gain.gain.linearRampToValueAtTime(0.2, t0 + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  gain.connect(dest);
  osc1.connect(gain);
  osc2.connect(gain);
  osc1.start(t0);
  osc2.start(t0);
  lfo.start(t0);
  osc1.stop(t0 + duration + 0.05);
  osc2.stop(t0 + duration + 0.05);
  lfo.stop(t0 + duration + 0.05);
};

// pulleySqueak(内部専用): high-branchの餌隠し時に添える「滑車のキュッ」。短い甲高いbandpassノイズ+
// わずかにピッチが上がる矩形波(ui-tapとは中心周波数/波形とも違う質感にして流用感を避ける)。
const pulleySqueak: Synth = (ctx, dest, t0) => {
  noiseBurst(ctx, dest, { t0, duration: 0.06, peak: 0.16, attack: 0.004, filterType: "bandpass", freq: 2600, q: 5 });
  tone(ctx, dest, { t0, duration: 0.07, peak: 0.09, type: "square", freq: 1500, freqEnd: 2100, attack: 0.004 });
};

const SYNTHS: Record<SfxId, Synth> = {
  "food-tuck": foodTuck,
  "sand-cover": sandCover,
  "gate-open": gateOpen,
  "trunk-pipe": trunkPipe,
  "leaf-rustle": leafRustle,
  "banana-peel": bananaPeel,
  "branch-creak": branchCreak,
  "branch-snap": branchSnap,
  "found-chime": foundChime,
  "ui-tap": uiTap,
  "elephant-rumble": elephantRumble
};

export function createSfx(engine: AudioEngine): Sfx {
  function run(synth: Synth, volumeScale: number): void {
    const ctx = engine.getContext();
    const master = engine.getMasterGain();
    if (!ctx || !master) return; // unlock()未実行、または生成不能な環境: 無音で諦める(throw禁止)。
    try {
      if (volumeScale === 1) {
        synth(ctx, master, ctx.currentTime);
        return;
      }
      const scaled = ctx.createGain();
      scaled.gain.value = Math.max(0, Math.min(1, volumeScale));
      scaled.connect(master);
      synth(ctx, scaled, ctx.currentTime);
    } catch {
      // 合成失敗時も無音で継続する(throw禁止の方針を音でも踏襲)。
    }
  }

  return {
    play(id: SfxId, volumeScale = 1): void {
      run(SYNTHS[id], volumeScale);
    },
    playPulleySqueak(volumeScale = 1): void {
      run(pulleySqueak, volumeScale);
    }
  };
}
