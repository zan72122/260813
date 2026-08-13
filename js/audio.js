/* =========================================================
 * audio.js — WebAudio による短い効果音（外部アセット不要）
 * SND.play('scan'|'coin'|'basket'|'can'|'cant'|'sparkle'|'register'|'pop'|'tada')
 * ========================================================= */
(function () {
  'use strict';

  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, t0, dur, type, vol, freqEnd) {
    const c = ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, hp) {
    const c = ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp || 3000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  const sounds = {
    // スキャナー・レジの「ピッ」
    scan(t) { tone(1245, t, 0.09, 'square', 0.08); },
    register(t) { tone(1245, t, 0.08, 'square', 0.08); tone(1660, t + 0.1, 0.1, 'square', 0.07); },
    // 硬貨「チャリン」
    coin(t) {
      tone(2093, t, 0.18, 'triangle', 0.12, 1568);
      tone(2637, t + 0.03, 0.22, 'sine', 0.08, 2093);
      noise(t, 0.05, 0.06, 6000);
    },
    // カゴ「コトン」
    basket(t) { tone(196, t, 0.1, 'sine', 0.25, 130); tone(392, t + 0.02, 0.06, 'triangle', 0.1); },
    // 買える「ポン♪」
    can(t) { tone(659, t, 0.12, 'sine', 0.18); tone(988, t + 0.11, 0.18, 'sine', 0.18); },
    // まだたりない（柔らかい下降音・失敗音にしない）
    cant(t) { tone(494, t, 0.16, 'sine', 0.1); tone(392, t + 0.16, 0.22, 'sine', 0.09); },
    // 発見「キラッ」
    sparkle(t) { [880, 1175, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.055, 0.14, 'sine', 0.09)); },
    // タップ小音
    pop(t) { tone(740, t, 0.06, 'sine', 0.08); },
    // 支払い完了ファンファーレ（短い）
    tada(t) {
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.16, 'triangle', 0.12));
      tone(1047, t + 0.28, 0.34, 'triangle', 0.14);
    },
    /* ---- ここからシアター用 ---- */
    // 自動ドア「ウィーン」
    door(t) {
      tone(220, t, 0.9, 'sawtooth', 0.03, 330);
      noise(t, 0.9, 0.04, 900);
    },
    // カートの車輪「コロコロ」（歩行中に繰り返し呼ぶ）
    cart(t) {
      noise(t, 0.09, 0.035, 500);
      tone(90 + Math.random() * 30, t, 0.08, 'triangle', 0.05, 70);
    },
    // 足音（ぺた）
    step(t) { tone(150, t, 0.05, 'sine', 0.05, 100); },
    // 商品を取る「シュポ」
    take(t) { tone(392, t, 0.09, 'sine', 0.12, 587); },
    // 袋のカサッ
    rustle(t) { noise(t, 0.16, 0.1, 2500); noise(t + 0.08, 0.1, 0.06, 4000); },
    // カゴ返却「カコン」
    kakon(t) {
      tone(523, t, 0.07, 'square', 0.07, 392);
      tone(330, t + 0.07, 0.1, 'square', 0.08, 262);
    },
    // レシート印字「ジジジ」
    receipt(t) {
      for (let i = 0; i < 7; i++) noise(t + i * 0.05, 0.03, 0.05, 5000);
      tone(1319, t + 0.4, 0.1, 'sine', 0.07);
    },
    // カゴをレジ台へ「コトッ」
    koto(t) { tone(230, t, 0.09, 'sine', 0.2, 160); }
  };

  window.SND = {
    play(name) {
      if (!enabled) return;
      const c = ensureCtx();
      if (!c) return;
      const fn = sounds[name];
      if (fn) { try { fn(c.currentTime); } catch (e) { /* 音は失敗しても遊べる */ } }
    },
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    unlock() { ensureCtx(); }
  };
})();
