// おと。ファイルは使わず WebAudio で合成する（読み込み 0 バイト）。
// iOS では最初のタップまで音が出せないので unlock() を必ず通す。

export function createAudio() {
  let ctx = null;
  let master = null;
  let rainGain = null;
  let noiseBuf = null;
  let muted = false;
  let ready = false;

  function makeNoise(c) {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      ch[i] = (s / 0x3fffffff - 1) * 0.5;
    }
    return buf;
  }

  function unlock() {
    if (ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);

    // 雨のホワイトノイズ
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 0.6;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    src.connect(bp); bp.connect(rainGain); rainGain.connect(master);
    src.start();
    ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setRain(v) {
    if (!ready) return;
    rainGain.gain.setTargetAtTime(Math.min(0.28, v * 0.028), ctx.currentTime, 0.4);
  }

  function blip(freq, dur, type = 'sine', vol = 0.25, slide = 1) {
    if (!ready || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, f0, f1, vol = 0.3) {
    if (!ready || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f0, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(); src.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    unlock,
    setRain,
    get ready() { return ready; },
    pop() { blip(660, 0.12, 'triangle', 0.22, 1.6); },
    // 排水口が吸いこむ「ごぼごぼ」
    suck() {
      noiseBurst(0.9, 1800, 180, 0.34);
      blip(240, 0.7, 'sine', 0.18, 0.35);
      setTimeout(() => blip(180, 0.5, 'sine', 0.14, 0.4), 180);
    },
    splash() { noiseBurst(0.25, 2600, 700, 0.16); },
    thud() { blip(150, 0.18, 'square', 0.14, 0.7); },
    chime() {
      blip(784, 0.35, 'sine', 0.2, 1);
      setTimeout(() => blip(1046, 0.4, 'sine', 0.18, 1), 130);
    },
    setMuted(v) {
      muted = v;
      if (master) master.gain.setTargetAtTime(v ? 0 : 0.85, ctx.currentTime, 0.05);
    },
    get muted() { return muted; },
  };
}
