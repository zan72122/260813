// WebAudio シンセ — 外部アセットなしで効果音を合成する。
// iOS では最初のタッチで resume が必要なので、lazy に初期化する。

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() { ensure(); }

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(freq0, freq1, dur, { type = 'sine', vol = 0.3, attack = 0.008, delay = 0 } = {}) {
  if (muted || !ensure()) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq0, t0);
  if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t0 + dur);
  env(g, t0, vol, attack, dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noise(dur, { vol = 0.2, freq = 900, q = 1.2, freqEnd = 0, delay = 0 } = {}) {
  if (muted || !ensure()) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq, t0);
  if (freqEnd) bp.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  bp.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, vol, 0.01, dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// --- ゲーム用効果音 ---

// ギューッ（押し潰し中、段階ごと）: progress 0..1
export function sfxSquish(step) {
  const f = 340 - step * 45;
  tone(f, f * 0.55, 0.14, { type: 'triangle', vol: 0.22 });
  noise(0.12, { vol: 0.1, freq: 700 - step * 60, q: 2 });
}

// ペタッ（完全にぺちゃんこ）
export function sfxFlat() {
  tone(170, 80, 0.16, { type: 'sine', vol: 0.3 });
  noise(0.1, { vol: 0.16, freq: 420, q: 1.4, freqEnd: 180 });
  tone(880, 1320, 0.1, { type: 'sine', vol: 0.06, delay: 0.05 });
}

// ポン！（復元）
export function sfxPon() {
  tone(240, 520, 0.13, { type: 'sine', vol: 0.4 });
  tone(480, 1040, 0.12, { type: 'triangle', vol: 0.12, delay: 0.02 });
  noise(0.06, { vol: 0.1, freq: 1800, q: 1 });
}

// コツン（壁でブロックされた）
export function sfxBlocked() {
  tone(150, 95, 0.12, { type: 'triangle', vol: 0.2 });
  noise(0.05, { vol: 0.08, freq: 300, q: 1.5 });
}

// スルッ（隙間を通過した）
export function sfxSlide() {
  noise(0.25, { vol: 0.12, freq: 1600, q: 0.8, freqEnd: 3200 });
  tone(520, 900, 0.22, { type: 'sine', vol: 0.1 });
}

// キラキラ（お届け完了）
export function sfxDeliver() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => tone(n, n, 0.28, { type: 'sine', vol: 0.22, delay: i * 0.09 }));
  notes.forEach((n, i) => tone(n * 2, n * 2, 0.2, { type: 'sine', vol: 0.06, delay: i * 0.09 + 0.02 }));
}

// ファンファーレ（ステージクリア）
export function sfxFanfare() {
  const seq = [[523, 0], [523, 0.12], [659, 0.24], [784, 0.4], [1047, 0.62]];
  seq.forEach(([n, d]) => {
    tone(n, n, 0.3, { type: 'triangle', vol: 0.22, delay: d });
    tone(n * 1.5, n * 1.5, 0.22, { type: 'sine', vol: 0.07, delay: d + 0.02 });
  });
}

// シュワーッ（フィールド成長）
export function sfxGrow() {
  tone(200, 900, 0.6, { type: 'sine', vol: 0.16 });
  noise(0.6, { vol: 0.08, freq: 800, q: 0.7, freqEnd: 4000 });
}

// ポワン（フィールドタッチ）
export function sfxTouch() {
  tone(700, 980, 0.08, { type: 'sine', vol: 0.1 });
}
