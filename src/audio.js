// ミニマルなWebAudio効果音（初回ジェスチャで初期化・失敗しても無音で続行）
let ctx = null;

function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function initAudio() { ac(); }

function env(gain, t0, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

export function popSound() {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(520, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);
  env(g, c.currentTime, 0.005, 0.12, 0.14);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.2);
}

let hissNode = null, hissGain = null;
export function hissOn() {
  const c = ac(); if (!c || hissNode) return;
  const len = c.sampleRate * 1;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  hissNode = c.createBufferSource();
  hissNode.buffer = buf; hissNode.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.7;
  hissGain = c.createGain();
  hissGain.gain.value = 0.0001;
  hissNode.connect(f).connect(hissGain).connect(c.destination);
  hissNode.start();
  hissGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.15);
}
export function hissOff() {
  const c = ac(); if (!c || !hissNode) return;
  const n = hissNode, g = hissGain;
  hissNode = null; hissGain = null;
  g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.2);
  setTimeout(() => { try { n.stop(); } catch (e) {} }, 320);
}

export function igniteSound() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  // ビリッ（点灯前の放電）
  const o1 = c.createOscillator(), g1 = c.createGain();
  o1.type = 'sawtooth';
  o1.frequency.setValueAtTime(90, t);
  o1.frequency.exponentialRampToValueAtTime(48, t + 0.25);
  env(g1, t, 0.01, 0.06, 0.3);
  o1.connect(g1).connect(c.destination);
  o1.start(t); o1.stop(t + 0.4);
  // パッ（きらめくコード）
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    env(g, t + 0.42 + i * 0.06, 0.01, 0.09, 1.1);
    o.connect(g).connect(c.destination);
    o.start(t + 0.42 + i * 0.06); o.stop(t + 1.8);
  });
  // 通電後のかすかなハム
  const hum = c.createOscillator(), hg = c.createGain();
  hum.type = 'sine'; hum.frequency.value = 100;
  hg.gain.setValueAtTime(0.0001, t + 0.5);
  hg.gain.linearRampToValueAtTime(0.015, t + 1.2);
  hg.gain.linearRampToValueAtTime(0.0001, t + 6);
  hum.connect(hg).connect(c.destination);
  hum.start(t + 0.5); hum.stop(t + 6.2);
}

// 安全マイクロレッスン: 「あぶない」を怖くなく伝えるやさしい2音（下降）
export function cautionSound() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  [440, 330].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    env(g, t + i * 0.14, 0.015, 0.09, 0.12);
    o.connect(g).connect(c.destination);
    o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.3);
  });
}

export function chime() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  [659.25, 880].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    env(g, t + i * 0.09, 0.01, 0.08, 0.5);
    o.connect(g).connect(c.destination);
    o.start(t + i * 0.09); o.stop(t + 1);
  });
}
