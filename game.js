'use strict';
/* ==========================================================================
   かまくらつくろう — 4歳児向け かまくら作りゲーム (iPhone/iPad モバイルWeb)
   雪を集める → 固める → 入口を掘る → 中に入る → 中を削って広げる →
   ランタンを置く → 青白い部屋が暖色に変わる → 外観リビール
   Canvas 2D のみ / 一指操作 / 文字説明・点数・失敗・制限時間なし
   ========================================================================== */

/* ---------- 基本セットアップ ---------- */
const FAST = /[?&](fast|test)=1/.test(location.search); // E2E高速モード
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let cw = 0, ch = 0, DPR = 1;

function resize() {
  DPR = FAST ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width = Math.round(cw * DPR);
  canvas.height = Math.round(ch * DPR);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

/* ---------- 乱数（固定シード） ---------- */
let _seed = 20260816;
function rnd() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}
function rrange(a, b) { return a + (b - a) * rnd(); }

/* ---------- ユーティリティ ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TAU = Math.PI * 2;
function mix3(a, b, t) {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}
function rgb(c, a) { return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function dur(t) { return FAST ? Math.max(0.08, t * 0.25) : t; }

/* 開いた点列をなめらかな曲線で描く */
function smoothOpen(pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
/* 閉じたブロブ */
function blobPath(pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- パレット（昼 → 夕暮れを1本の補間で統一） ---------- */
const PALETTE = {
  skyTop:   [[118, 160, 208], [36, 48, 92]],
  skyMid:   [[176, 205, 234], [102, 94, 142]],
  skyLow:   [[230, 241, 250], [226, 152, 118]],
  farMt:    [[203, 219, 240], [90, 98, 144]],
  midMt:    [[181, 203, 232], [76, 84, 130]],
  haze:     [[238, 246, 253], [150, 128, 156]],
  snowHi:   [[249, 252, 255], [200, 190, 220]],
  snowMid:  [[226, 237, 248], [160, 154, 196]],
  snowSh:   [[188, 208, 234], [118, 116, 166]],
  snowDeep: [[146, 174, 214], [90, 92, 142]],
  ice:      [[170, 200, 234], [106, 110, 160]],
  wood:     [[138, 99, 72], [76, 60, 76]],
  woodDark: [[100, 70, 52], [56, 45, 60]],
  pine:     [[52, 88, 72], [32, 46, 68]],
  pineHi:   [[88, 126, 100], [50, 64, 90]],
  trunk:    [[94, 72, 55], [56, 48, 58]]
};
function C3(k) { const p = PALETTE[k]; return mix3(p[0], p[1], clamp(G.dusk, 0, 1)); }
function C(k, a) { return rgb(C3(k), a); }

/* ---------- ベイク済みテクスチャ（起動時に一度だけ生成） ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let texGrain = null, texClouds = null, patGrain = null;
function bakeTextures() {
  // 雪の粒状ノイズ：青い影の斑点と光る粒の混合
  texGrain = makeCanvas(256, 256);
  const g = texGrain.getContext('2d');
  for (let i = 0; i < 950; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = rrange(0.5, 2.1);
    g.fillStyle = rnd() < 0.55 ? 'rgba(146,176,216,0.15)' : 'rgba(255,255,255,0.20)';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 80; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = rrange(7, 22);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(168,194,228,0.09)');
    rg.addColorStop(1, 'rgba(168,194,228,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  patGrain = ctx.createPattern(texGrain, 'repeat');
  // やわらかい層雲（端で切れないよう中央帯にだけ描く）
  texClouds = makeCanvas(512, 170);
  const cg = texClouds.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = 50 + rnd() * 70, r = rrange(18, 52);
    const rg = cg.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.13)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = rg; cg.beginPath(); cg.ellipse(x, y, r * 1.7, r * 0.5, 0, 0, TAU); cg.fill();
  }
}

/* ---------- 永続地面レイヤー（足跡・押し跡・雪の痕跡が残る） ---------- */
const GX0 = -500, GY0 = 330, GW = 2000, GH = 540;
let groundCv = null, gctx = null;
function bakeGround() {
  if (!groundCv) { groundCv = makeCanvas(GW, GH); gctx = groundCv.getContext('2d'); }
  const g = gctx;
  g.clearRect(0, 0, GW, GH);
  // 基本の雪面（昼の色で焼き、夕方は描画時にティント）
  const base = g.createLinearGradient(0, 0, 0, GH);
  base.addColorStop(0, 'rgb(240,247,253)');
  base.addColorStop(0.25, 'rgb(248,251,254)');
  base.addColorStop(1, 'rgb(222,234,247)');
  g.fillStyle = base; g.fillRect(0, 0, GW, GH);
  // 青い影のむら（吹きだまりの起伏）
  for (let i = 0; i < 46; i++) {
    const x = rnd() * GW, y = 60 + rnd() * (GH - 80), rx = rrange(60, 220), ry = rx * rrange(0.14, 0.24);
    const rg = g.createRadialGradient(x, y, 0, x, y, rx);
    rg.addColorStop(0, 'rgba(164,190,224,0.20)');
    rg.addColorStop(1, 'rgba(164,190,224,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill();
    g.restore();
  }
  // 起伏の頂上の淡いハイライト
  for (let i = 0; i < 30; i++) {
    const x = rnd() * GW, y = 60 + rnd() * (GH - 90), rx = rrange(50, 160);
    g.save(); g.translate(x, y); g.scale(1, 0.16); g.translate(-x, -y);
    const rg = g.createRadialGradient(x, y, 0, x, y, rx);
    rg.addColorStop(0, 'rgba(255,255,255,0.30)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill();
    g.restore();
  }
  // 風紋（シュカブラ）：上辺が光り下辺が青い細い筋
  for (let i = 0; i < 90; i++) {
    const x = rnd() * GW, y = 80 + rnd() * (GH - 110), len = rrange(30, 130), bow = rrange(2, 9);
    g.strokeStyle = 'rgba(255,255,255,0.42)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - bow, x + len, y); g.stroke();
    g.strokeStyle = 'rgba(150,178,215,0.30)';
    g.beginPath(); g.moveTo(x, y + 1.6); g.quadraticCurveTo(x + len / 2, y + 1.6 - bow, x + len, y + 1.6); g.stroke();
  }
  // 雪の粒テクスチャを全体に薄く
  g.globalAlpha = 0.5;
  g.fillStyle = g.createPattern(texGrain, 'repeat');
  g.fillRect(0, 0, GW, GH);
  g.globalAlpha = 1;
}
/* 足あと（進行方向つき・左右交互） */
function stampFoot(x, y, ang, side, small) {
  const g = gctx, lx = x - GX0, ly = y - GY0;
  const off = (small ? 4.5 : 6) * side;
  const px = lx + Math.cos(ang + Math.PI / 2) * off, py = ly + Math.sin(ang + Math.PI / 2) * off * 0.5;
  g.save(); g.translate(px, py); g.rotate(ang * 0.3);
  g.fillStyle = 'rgba(122,152,196,0.5)';
  g.beginPath(); g.ellipse(0, 0, small ? 4.6 : 6.2, small ? 2.9 : 3.8, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(96,128,178,0.35)';
  g.beginPath(); g.ellipse(0.6, 0.7, small ? 3 : 4.2, small ? 1.8 : 2.4, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath(); g.ellipse(-1.6, -1.8, small ? 2.2 : 3, 1.1, 0, 0, TAU); g.fill();
  g.restore();
}
/* 雪を押した跡（圧雪の帯） */
function stampTrail(x, y, r) {
  const g = gctx, lx = x - GX0, ly = y - GY0;
  g.fillStyle = 'rgba(150,180,218,0.16)';
  g.beginPath(); g.ellipse(lx, ly, r * 1.25, r * 0.42, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(190,214,240,0.22)';
  g.beginPath(); g.ellipse(lx, ly, r * 0.7, r * 0.26, 0, 0, TAU); g.fill();
}
/* 小さな雪の山（落雪・掘り出した雪） */
function stampPile(x, y, r) {
  const g = gctx, lx = x - GX0, ly = y - GY0;
  g.fillStyle = 'rgba(160,188,222,0.35)';
  g.beginPath(); g.ellipse(lx, ly + r * 0.18, r * 1.2, r * 0.34, 0, 0, TAU); g.fill();
  const rg = g.createRadialGradient(lx - r * 0.25, ly - r * 0.3, 0, lx, ly, r);
  rg.addColorStop(0, 'rgba(255,255,255,0.98)');
  rg.addColorStop(1, 'rgba(214,230,246,0.9)');
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(lx, ly, r, r * 0.5, 0, Math.PI, TAU); g.closePath(); g.fill();
}

/* ---------- サウンド（WebAudio 合成・実火なし電子音） ---------- */
let AC = null, master = null, dryBus = null, revBus = null, rev = null;
let windSrc = null, windGain = null, windLP = null, windLfoT = 0, windTarget = 0.05;
let sceneMode = 'out';
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.5;
    master.connect(AC.destination);
    // 生成インパルスによる残響（かまくら内部の静けさ用）
    rev = AC.createConvolver();
    const len = Math.floor(AC.sampleRate * 1.6);
    const ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5;
    }
    rev.buffer = ir;
    revBus = AC.createGain(); revBus.gain.value = 0.0;
    revBus.connect(rev); rev.connect(master);
    dryBus = AC.createGain(); dryBus.gain.value = 1;
    dryBus.connect(master);
    startWind();
  } catch (e) { AC = null; }
}
/* 風の環境音：ろ過ノイズ＋ゆっくり変わる強弱 */
function startWind() {
  const buf = noiseBuffer();
  windSrc = AC.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
  windLP = AC.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 420; windLP.Q.value = 0.4;
  windGain = AC.createGain(); windGain.gain.value = 0.0001;
  windSrc.connect(windLP); windLP.connect(windGain); windGain.connect(master);
  windSrc.start();
}
function updateAudio(dt) {
  if (!AC || !windGain) return;
  windLfoT += dt;
  if (windLfoT > 2.2) { windLfoT = 0; windTarget = sceneMode === 'out' ? rrange(0.028, 0.085) : rrange(0.004, 0.012); }
  const cur = windGain.gain.value;
  windGain.gain.value = cur + (windTarget - cur) * Math.min(1, dt * 0.8);
}
/* 屋外⇔内部の音場切り替え（内部＝こもって残響） */
function setScene(mode) {
  sceneMode = mode;
  if (!AC) return;
  const t = AC.currentTime;
  try {
    windLP.frequency.linearRampToValueAtTime(mode === 'out' ? 420 : 130, t + 1.2);
    revBus.gain.linearRampToValueAtTime(mode === 'out' ? 0.0 : 0.5, t + 1.2);
  } catch (e) {}
}
let _noiseBuf = null;
function noiseBuffer() {
  if (!_noiseBuf) {
    _noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuf;
}
function outBus() { return dryBus || master; }
function tone(f0, f1, len, type, vol, delay, wet) {
  if (!AC) return;
  try {
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1 || f0), t0 + len);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g); g.connect(outBus());
    if (wet && revBus) g.connect(revBus);
    o.start(t0); o.stop(t0 + len + 0.05);
  } catch (e) {}
}
function noise(len, vol, freq, delay, opts) {
  if (!AC) return;
  try {
    const t0 = AC.currentTime + (delay || 0);
    const s = AC.createBufferSource(); s.buffer = noiseBuffer(); s.loop = true;
    s.playbackRate.value = (opts && opts.rate) || 1;
    const f = AC.createBiquadFilter();
    f.type = (opts && opts.type) || 'bandpass';
    f.frequency.setValueAtTime(freq || 900, t0);
    if (opts && opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + len);
    f.Q.value = (opts && opts.q) || 0.8;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + ((opts && opts.attack) || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    s.connect(f); f.connect(g); g.connect(outBus());
    if (opts && opts.wet && revBus) g.connect(revBus);
    s.start(t0); s.stop(t0 + len + 0.1);
  } catch (e) {}
}
/* 雪を踏む「ギュッ」：微細ノイズ粒の連なり */
function crunch(vol, delay, pitch) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    noise(0.035, (vol || 0.16) * rrange(0.5, 1), (pitch || 2600) * rrange(0.7, 1.3),
      (delay || 0) + i * rrange(0.008, 0.02), { q: 2.2, attack: 0.004 });
  }
  noise(0.08, (vol || 0.16) * 0.7, 300, delay || 0, { type: 'lowpass' });
}
/* オルゴール風の音色（基音＋淡い倍音） */
function musicNote(f, delay, len, vol) {
  tone(f, f, len || 1.1, 'sine', vol || 0.12, delay, true);
  tone(f * 2, f * 2, (len || 1.1) * 0.6, 'sine', (vol || 0.12) * 0.3, delay, true);
  tone(f * 4, f * 4, 0.18, 'sine', (vol || 0.12) * 0.12, delay, true);
}
const SFX = {
  tap() { tone(560, 760, 0.1, 'sine', 0.16); },
  step() { crunch(0.1, 0, 2200); },
  push() {
    noise(0.5, 0.16, 380, 0, { type: 'lowpass', attack: 0.08 });
    crunch(0.12, 0.05, 1800); crunch(0.1, 0.22, 1600);
    tone(150, 100, 0.4, 'sine', 0.08);
  },
  arrive() { tone(130, 80, 0.2, 'sine', 0.2); crunch(0.18, 0, 1400); noise(0.16, 0.1, 500, 0.02, { type: 'lowpass' }); },
  pat() {
    tone(170, 110, 0.12, 'sine', 0.26);
    noise(0.06, 0.2, 900, 0, { q: 0.6, attack: 0.004 });
    crunch(0.07, 0.01, 3000);
  },
  scoop() {
    crunch(0.2, 0, 2000);
    noise(0.22, 0.2, 700, 0.03, { freqTo: 300, attack: 0.01 });
    tone(240, 130, 0.16, 'triangle', 0.08, 0.02);
    // 飛び散った雪のパラパラ
    for (let i = 0; i < 4; i++) noise(0.03, 0.07, rrange(2400, 3800), 0.16 + i * rrange(0.03, 0.07), { q: 3 });
  },
  firstHole() {
    noise(0.5, 0.14, 240, 0, { type: 'lowpass', attack: 0.05 });
    musicNote(523, 0.1, 0.7, 0.1); musicNote(659, 0.24, 0.7, 0.1); musicNote(784, 0.38, 1.0, 0.12);
  },
  slide() {
    tone(600, 160, 0.55, 'sine', 0.16);
    noise(0.5, 0.14, 900, 0, { freqTo: 250, attack: 0.03 });
    crunch(0.08, 0.45, 1200);
  },
  wow() {
    tone(392, 392, 0.8, 'triangle', 0.08, 0, true); tone(494, 494, 0.8, 'triangle', 0.07, 0.07, true);
    tone(587, 587, 1.0, 'triangle', 0.07, 0.14, true);
  },
  scrape() {
    noise(0.14, 0.13, rrange(1100, 1900), 0, { q: 1.4, wet: true });
    noise(0.1, 0.06, 500, 0.02, { type: 'lowpass', wet: true });
  },
  sparkle() { tone(1200, 1600, 0.15, 'sine', 0.09, 0, true); tone(1600, 2100, 0.15, 'sine', 0.07, 0.08, true); },
  pickup() { tone(500, 700, 0.1, 'sine', 0.14, 0, true); },
  place() { tone(320, 240, 0.1, 'sine', 0.2, 0, true); tone(1200, 900, 0.05, 'square', 0.05, 0.02, true); },
  thump() { noise(0.3, 0.16, 200, 0, { type: 'lowpass', attack: 0.02 }); crunch(0.1, 0.05, 1000); },
  warmOn() {
    tone(1400, 1000, 0.04, 'square', 0.06, 0, true); // LEDスイッチ
    tone(262, 262, 1.6, 'triangle', 0.1, 0.15, true); tone(330, 330, 1.6, 'triangle', 0.08, 0.22, true);
    tone(392, 392, 1.8, 'triangle', 0.08, 0.3, true); tone(523, 523, 2.0, 'sine', 0.07, 0.4, true);
    tone(1568, 2093, 0.5, 'sine', 0.05, 0.5, true);
  },
  /* 完成のオルゴール（きらきら星の冒頭） */
  tada() {
    const seq = [[523, 0], [523, 0.32], [784, 0.64], [784, 0.96], [880, 1.28], [880, 1.6], [784, 1.92]];
    for (const [f, d] of seq) musicNote(f, d, 1.0, 0.11);
    musicNote(1047, 2.6, 1.6, 0.09);
  }
};

/* ---------- ゲーム定数 ---------- */
const PUSHES_NEED = FAST ? 2 : 6;   // 雪集め回数
const PATS_NEED = FAST ? 3 : 8;     // ペタペタ回数
const DIGS_NEED = FAST ? 3 : 8;     // 入口掘り回数
const CARVE_NEED = FAST ? 0.55 : 0.85; // 内部広げ達成率

/* ワールド座標（外の雪原） */
const HORIZON = 340;   // 地平線
const MX = 500;        // 雪山中心x
const MB = 598;        // 雪山ベースy
const MOUND_R = 175;   // 完成時の雪山半径

const SHOTS = {
  wide:  { x: 500, y: 430, w: 1080, h: 720 },
  mound: { x: 500, y: 495, w: 840, h: 570 },
  front: { x: 500, y: 512, w: 620, h: 440 },
  hole:  { x: 500, y: 556, w: 150, h: 110 }
};
/* 縦持ち用：被写体を大きく見せる構図 */
const SHOTS_PORTRAIT = {
  wide:  { x: 500, y: 462, w: 760, h: 900 },
  mound: { x: 500, y: 505, w: 600, h: 760 },
  front: { x: 500, y: 520, w: 470, h: 640 },
  hole:  { x: 500, y: 556, w: 150, h: 110 }
};
function shotSet() { return ch > cw * 1.15 ? SHOTS_PORTRAIT : SHOTS; }

/* ---------- ゲーム状態 ---------- */
const G = {
  phase: 'title',
  t: 0,              // フェーズ経過秒
  time: 0,           // 全体秒
  pushes: 0, leftSnow: 0, rightSnow: 0,
  moundS: 0,         // 表示中の雪山成長(0..1)
  pats: 0, patS: 0,
  digs: 0, holeS: 0,
  balls: [],         // 転がる雪玉
  chunks: [],        // 掘った雪の塊（ワールド）
  patMarks: [],
  kid: { x: 385, y: 604, pose: 'idle', flip: false, a: 1 },
  goinT: 0,
  trans: null,       // {t,dur,to,color}
  lastInput: 0,
  pointer: { down: false, x: 0, y: 0, id: null },
  camNow: { ...SHOTS.wide },
  dusk: 0,
  sparkles: [],      // スクリーン座標のキラキラ
  IN: null           // 内部状態
};

function makeInterior() {
  const N = 16;
  const grow = new Array(N).fill(0);
  const bump = [];
  for (let i = 0; i < N; i++) bump.push(rrange(0.4, 1));
  return {
    N, grow, bump,
    grooves: [],
    shavings: [],
    pileH: new Array(7).fill(0), // 床に積もる削りカス
    intro: 0,
    benchShown: false,
    lantern: { x: 0, y: 0, held: false, placed: false, homeSet: false },
    warm: 0,
    kidClap: 0
  };
}

function resetGame(toGather) {
  G.pushes = 0; G.leftSnow = Math.ceil(PUSHES_NEED / 2); G.rightSnow = Math.ceil(PUSHES_NEED / 2);
  G.moundS = 0; G.pats = 0; G.patS = 0; G.digs = 0; G.holeS = 0;
  G.balls = []; G.chunks = []; G.patMarks = []; G.sparkles = [];
  G.kid = { x: 385, y: 604, tx: 385, flip: false, stepAcc: 0, moving: false };
  G.breaths = []; G.drops = []; G.dropTimer = rrange(3, 6);
  G.goinT = 0; G.dusk = 0;
  G.IN = makeInterior();
  bakeGround();
  seedFootpaths();
  setPhase(toGather ? 'gather' : 'title');
}

/* 最初から雪原に生活の足あとの筋を残しておく */
function seedFootpaths() {
  let px = 252, py = 372;
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const nx = lerp(252, 400, t) + Math.sin(t * 5) * 14;
    const ny = lerp(372, 620, easeInOut(t));
    stampFoot(nx, ny, Math.atan2(ny - py, nx - px), i % 2 ? 1 : -1, false);
    px = nx; py = ny;
  }
  px = 792; py = 368;
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const nx = lerp(792, 700, t) + Math.sin(t * 4.2) * 12;
    const ny = lerp(368, 648, easeInOut(t));
    stampFoot(nx, ny, Math.atan2(ny - py, nx - px), i % 2 ? 1 : -1, true);
    px = nx; py = ny;
  }
}

function setPhase(p) {
  G.phase = p;
  G.t = 0;
  // 音場：かまくら内部はこもって静か、外は風
  setScene(p === 'carve' || p === 'lantern' || p === 'glow' ? 'in' : 'out');
}

/* フェーズ間フェード遷移 */
function fadeTo(phase, color, d) {
  G.trans = { t: 0, dur: dur(d || 0.9), to: phase, color: color || [10, 18, 36], done: false };
}

/* ---------- カメラ ---------- */
/* 現在のショットで見えるワールド範囲（人物が画面外に出ないように） */
function visibleWorldEdges() {
  const s = currentShot();
  const sc = Math.min(cw / s.w, ch / s.h);
  const hw = (cw / 2) / sc;
  return { l: s.x - hw, r: s.x + hw };
}
function currentShot() {
  const S = shotSet();
  switch (G.phase) {
    case 'title': case 'gather': return S.wide;
    case 'pat': return S.mound;
    case 'tofront': case 'dig': case 'enter': return S.front;
    case 'goin': return S.hole;
    case 'reveal': case 'toreveal': return S.wide;
    default: return S.wide;
  }
}
function camScale() { return Math.min(cw / G.camNow.w, ch / G.camNow.h); }
function worldToScreen(x, y) {
  const s = camScale();
  return { x: cw / 2 + (x - G.camNow.x) * s, y: ch / 2 + (y - G.camNow.y) * s };
}
function screenToWorld(x, y) {
  const s = camScale();
  return { x: G.camNow.x + (x - cw / 2) / s, y: G.camNow.y + (y - ch / 2) / s };
}
function updateCam(dt) {
  const t = currentShot();
  const k = 1 - Math.exp(-dt * (G.phase === 'goin' ? 2.2 : 3.5));
  G.camNow.x = lerp(G.camNow.x, t.x, k);
  G.camNow.y = lerp(G.camNow.y, t.y, k);
  G.camNow.w = lerp(G.camNow.w, t.w, k);
  G.camNow.h = lerp(G.camNow.h, t.h, k);
}

/* ---------- 降雪（スクリーン空間・遠中近3層＋地吹雪） ---------- */
const FLAKES = [];
const FLAKE_N = FAST ? 20 : 150;
function initFlakes() {
  FLAKES.length = 0;
  for (let i = 0; i < FLAKE_N; i++) {
    const depth = i / FLAKE_N; // 0=遠い 1=近い
    FLAKES.push({
      x: rnd(), y: rnd(), depth,
      r: lerp(0.8, 4.6, depth * depth) + rrange(0, 0.6),
      v: lerp(0.012, 0.075, depth) * rrange(0.8, 1.2),
      ph: rnd() * TAU, sway: rrange(0.008, 0.03)
    });
  }
}
initFlakes();
const DRIFTS = []; // 地面を這う雪煙
function initDrifts() {
  DRIFTS.length = 0;
  const n = FAST ? 4 : 14;
  for (let i = 0; i < n; i++) {
    DRIFTS.push({ x: rnd(), y: rrange(0.55, 0.95), w: rrange(0.08, 0.22), sp: rrange(0.05, 0.16), ph: rnd() * TAU });
  }
}
initDrifts();

/* ---------- 入力 ---------- */
let dragAcc = 0, dragStartX = 0, dragLastX = 0, dragLastY = 0, dragMoved = 0, carveSound = 0;

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  ensureAudio();
  if (G.pointer.down) return; // 一指のみ
  G.pointer.down = true; G.pointer.id = e.pointerId;
  G.pointer.x = e.clientX; G.pointer.y = e.clientY;
  G.lastInput = G.time;
  dragAcc = 0; dragStartX = e.clientX; dragLastX = e.clientX; dragLastY = e.clientY; dragMoved = 0;
  onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => {
  if (!G.pointer.down || e.pointerId !== G.pointer.id) return;
  e.preventDefault();
  const dx = e.clientX - dragLastX, dy = e.clientY - dragLastY;
  dragLastX = e.clientX; dragLastY = e.clientY;
  dragMoved += Math.hypot(dx, dy);
  G.pointer.x = e.clientX; G.pointer.y = e.clientY;
  G.lastInput = G.time;
  onDrag(e.clientX, e.clientY, dx, dy);
});
function endPointer(e) {
  if (e.pointerId !== G.pointer.id) return;
  G.pointer.down = false; G.pointer.id = null;
  onRelease(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

/* タップ処理 */
function onTap(x, y) {
  switch (G.phase) {
    case 'title': {
      const b = titleBtn();
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.6) {
        SFX.tap();
        fadeTo('gather', [235, 244, 252], 0.7);
      }
      break;
    }
    case 'pat': doPat(x, y); break;
    case 'dig': doDig(x, y); break;
    case 'enter': {
      const h = worldToScreen(MX, MB - 40);
      const s = camScale();
      if (Math.hypot(x - h.x, y - h.y) < Math.max(90, 130 * s)) startGoIn();
      break;
    }
    case 'lantern': {
      const L = G.IN.lantern, M = Math.min(cw, ch);
      if (!L.placed && Math.hypot(x - L.x, y - L.y) < M * 0.16) {
        L.held = true; SFX.pickup();
      }
      break;
    }
    case 'reveal': {
      const b = replayBtn();
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.7) {
        SFX.tap();
        fadeTo('restart', [235, 244, 252], 0.7);
      }
      break;
    }
  }
}

/* ドラッグ処理 */
function onDrag(x, y, dx, dy) {
  switch (G.phase) {
    case 'gather': {
      // 山の中心方向への横移動を蓄積 → 一定量で雪をひと押し
      const mound = worldToScreen(MX, MB);
      const toward = (dragStartX < mound.x) ? dx : -dx;
      if (toward > 0) dragAcc += toward;
      const step = Math.max(55, Math.min(cw, ch) * 0.16);
      if (dragAcc > step) {
        dragAcc -= step;
        doPush(dragStartX < mound.x ? 'L' : 'R');
      }
      break;
    }
    case 'dig': {
      dragAcc += Math.hypot(dx, dy);
      if (dragAcc > 110) { dragAcc = 0; doDig(x, y); }
      break;
    }
    case 'carve': doCarve(x, y, Math.hypot(dx, dy)); break;
    case 'lantern': {
      const L = G.IN.lantern;
      if (L.held) { L.x = x; L.y = y; }
      break;
    }
  }
}

function onRelease(x, y) {
  if (G.phase === 'lantern') {
    const L = G.IN.lantern;
    if (L.held) {
      L.held = false;
      const tgt = lanternTarget(), M = Math.min(cw, ch);
      if (Math.hypot(x - tgt.x, y - tgt.y) < M * 0.2) {
        L.placed = true; L.x = tgt.x; L.y = tgt.y;
        SFX.place();
        setPhase('glow');
        setTimeout(() => SFX.warmOn(), 150);
      }
    }
  }
}

/* ---------- 行動：雪あつめ ---------- */
function doPush(side) {
  if (G.pushes >= PUSHES_NEED) return;
  if (side === 'L' && G.leftSnow <= 0) side = 'R';
  if (side === 'R' && G.rightSnow <= 0) side = 'L';
  if (side === 'L') { if (G.leftSnow <= 0) return; G.leftSnow--; }
  else { if (G.rightSnow <= 0) return; G.rightSnow--; }
  SFX.push();
  const fromX = side === 'L' ? 195 : 805;
  G.balls.push({ t: 0, from: fromX, side, d: dur(0.7) });
  G.kid.flip = side === 'R';
}

/* ---------- 行動：ペタペタ ---------- */
function doPat(x, y) {
  const m = worldToScreen(MX, MB - 90 * (0.3 + G.moundS));
  const s = camScale();
  if (Math.hypot(x - m.x, y - m.y) > Math.max(180, MOUND_R * 2 * s)) return;
  if (G.pats >= PATS_NEED) return;
  G.pats++;
  SFX.pat();
  G.patPunch = 1; // 山がプルンと縮む
  const w = screenToWorld(x, y);
  const a = Math.atan2(w.y - MB, w.x - MX);
  G.patMarks.push({ a: a, r: rrange(0.5, 0.85), s: rrange(0.8, 1.2) });
  addSpark(x, y, 4, [200, 228, 255]);
  if (G.pats >= PATS_NEED) {
    setTimeout(() => { if (G.phase === 'pat') setPhase('tofront'); }, dur(0.7) * 1000);
  }
}

/* ---------- 行動：入口掘り ---------- */
function doDig(x, y) {
  const h = worldToScreen(MX, MB - 45);
  const s = camScale();
  if (Math.hypot(x - h.x, y - h.y) > Math.max(170, 200 * s)) return;
  if (G.digs >= DIGS_NEED) return;
  G.digs++;
  SFX.scoop();
  G.digSwing = 1;
  // 雪の塊が飛ぶ（ワールド座標）
  for (let i = 0; i < (FAST ? 2 : 5); i++) {
    G.chunks.push({
      x: MX + rrange(-20, 20), y: MB - rrange(10, 60),
      vx: rrange(-140, 140), vy: rrange(-260, -120),
      r: rrange(6, 15), life: 1
    });
  }
  if (G.digs === 1) {
    // ★もう一回点：最初の穴が開く
    SFX.firstHole();
    const p = worldToScreen(MX, MB - 50);
    addSpark(p.x, p.y, 10, [255, 240, 180]);
  }
  if (G.digs >= DIGS_NEED) {
    setTimeout(() => { if (G.phase === 'dig') { setPhase('enter'); SFX.sparkle(); } }, dur(0.8) * 1000);
  }
}

/* ---------- 行動：中へ入る ---------- */
function startGoIn() {
  SFX.slide();
  setPhase('goin');
}

/* ---------- 行動：内部を削る ---------- */
function interiorGeom() {
  const M = Math.min(cw, ch);
  return { cx: cw / 2, cy: ch * 0.45, M, baseR: M * 0.335, extraR: M * 0.29 };
}
function interiorAvg() {
  const IN = G.IN;
  let s = 0; for (let i = 0; i < IN.N; i++) s += IN.grow[i];
  return s / IN.N;
}
function sectorRadius(i) {
  const { M, baseR, extraR } = interiorGeom();
  const IN = G.IN;
  const g = IN.grow[i], avg = interiorAvg();
  const wob = 0.09 * IN.bump[i] * (1 - g);
  return (baseR + extraR * (0.4 * avg + 0.6 * g)) * (1 + wob);
}
function doCarve(x, y, d) {
  const IN = G.IN;
  if (!IN || IN.intro < 0.6) return;
  const { cx, cy, M } = interiorGeom();
  const ang = Math.atan2(y - cy, x - cx);
  const distR = Math.hypot(x - cx, y - cy);
  let i = Math.round(((ang + TAU) % TAU) / TAU * IN.N) % IN.N;
  const r = sectorRadius(i);
  if (distR < r * 0.4) return; // 中心すぎは無効（壁の近くをなぞる）
  const amount = (d / M) * (FAST ? 5.5 : 1.35);
  const before = interiorAvg();
  IN.grow[i] = clamp(IN.grow[i] + amount, 0, 1);
  IN.grow[(i + 1) % IN.N] = clamp(IN.grow[(i + 1) % IN.N] + amount * 0.55, 0, 1);
  IN.grow[(i + IN.N - 1) % IN.N] = clamp(IN.grow[(i + IN.N - 1) % IN.N] + amount * 0.55, 0, 1);
  // 削り跡と雪の粉
  if (dragMoved > 8) {
    IN.grooves.push({ a: ang, rr: clamp(distR / r, 0.6, 0.98), len: rrange(0.12, 0.3), life: 1 });
    if (IN.grooves.length > 50) IN.grooves.shift();
    for (let k = 0; k < (FAST ? 1 : 3); k++) {
      IN.shavings.push({ x, y, vx: rrange(-30, 30), vy: rrange(10, 60), r: rrange(1.5, 4), life: 1 });
    }
    // 削りカスが下の床に積もる
    const slot = clamp(Math.floor((x - cx + M * 0.7) / (M * 1.4) * 7), 0, 6);
    IN.pileH[slot] = Math.min(1, IN.pileH[slot] + amount * 0.55);
  }
  if (G.time - carveSound > 0.18) { carveSound = G.time; SFX.scrape(); }
  const after = interiorAvg();
  if (!IN.benchShown && after > 0.4) {
    IN.benchShown = true;
    SFX.sparkle();
    addSpark(cx + interiorGeom().baseR * 0.8, cy + interiorGeom().baseR * 0.5, 6, [220, 240, 255]);
  }
  if (before < CARVE_NEED && after >= CARVE_NEED) {
    setTimeout(() => {
      if (G.phase === 'carve') {
        setPhase('lantern');
        SFX.wow();
      }
    }, dur(0.6) * 1000);
  }
}

/* ランタンの置き場所（床の中央） */
function lanternTarget() {
  const { cx, cy, M } = interiorGeom();
  return { x: cx, y: cy + M * 0.21 };
}

/* ---------- キラキラ ---------- */
function addSpark(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    G.sparkles.push({
      x: x + rrange(-30, 30), y: y + rrange(-30, 30),
      life: 1, col, r: rrange(2, 5), ph: rnd() * TAU
    });
  }
}

/* ---------- UIボタン位置 ---------- */
function titleBtn() { return { x: cw / 2, y: ch * 0.68, r: Math.min(cw, ch) * 0.11 }; }
function replayBtn() { return { x: cw / 2, y: ch * 0.85, r: Math.min(cw, ch) * 0.085 }; }

/* ---------- 更新 ---------- */
function update(dt) {
  G.time += dt;
  G.t += dt;

  // フェード遷移
  if (G.trans) {
    G.trans.t += dt;
    if (!G.trans.done && G.trans.t >= G.trans.dur / 2) {
      G.trans.done = true;
      if (G.trans.to === 'restart') resetGame(true);
      else setPhase(G.trans.to);
    }
    if (G.trans.t >= G.trans.dur) G.trans = null;
  }

  updateCam(dt);
  updateAudio(dt);

  const walkerPhase = (G.phase === 'title' || G.phase === 'gather' || G.phase === 'pat' ||
    G.phase === 'tofront' || G.phase === 'dig' || G.phase === 'enter');
  const exteriorPhase = walkerPhase || G.phase === 'goin' || G.phase === 'toreveal' || G.phase === 'reveal';

  // 子どもは目的地まで歩いて移動し、雪に足あとを残す
  if (walkerPhase) {
    const R = moundGeom().R;
    let tx = 385;
    if (G.phase === 'pat' || G.phase === 'tofront') tx = MX - R - 42;
    else if (G.phase === 'dig') tx = MX - R - 50;
    else if (G.phase === 'enter') tx = MX - holeSize().hw - 38;
    tx = Math.max(tx, visibleWorldEdges().l + 36); // 縦持ちでも画面内に
    G.kid.tx = tx;
    const dx = tx - G.kid.x;
    G.kid.moving = Math.abs(dx) > 3 && G.balls.length === 0;
    if (G.kid.moving) {
      const step = clamp(dx, -1, 1) * 95 * dt;
      G.kid.x += step;
      G.kid.flip = dx < 0;
      G.kid.stepAcc += Math.abs(step);
      if (G.kid.stepAcc > 15) {
        G.kid.stepAcc = 0;
        G.kid.side = -(G.kid.side || 1);
        stampFoot(G.kid.x, G.kid.y + 2, dx > 0 ? 0 : Math.PI, G.kid.side, true);
        SFX.step();
      }
    }
  }

  // 白い息（寒さの表現）
  if (exteriorPhase) {
    G.breathT = (G.breathT || 0) - dt;
    if (G.breathT <= 0) {
      G.breathT = rrange(2.4, 3.9);
      const bx = G.phase === 'reveal' || G.phase === 'toreveal' ? MX - moundGeom().R - 60 : G.kid.x;
      G.breaths.push({
        x: bx + (G.kid.flip ? -9 : 9), y: G.kid.y - 78,
        vx: (G.kid.flip ? -7 : 7), r: 3.5, life: 1
      });
    }
    for (let i = G.breaths.length - 1; i >= 0; i--) {
      const b = G.breaths[i];
      b.x += b.vx * dt; b.y -= 9 * dt; b.r += 9 * dt; b.life -= dt * 0.85;
      if (b.life <= 0) G.breaths.splice(i, 1);
    }
    // 木からドサッと落ちる雪
    if (!FAST) {
      G.dropTimer -= dt;
      if (G.dropTimer <= 0) {
        G.dropTimer = rrange(5, 9);
        const trees = [[78, 350, 1.05], [925, 345, 0.9], [645, 332, 0.62]];
        const tr = trees[Math.floor(rnd() * 3) % 3];
        G.drops.push({
          x: tr[0] + rrange(-34, 34) * tr[2], y: tr[1] - rrange(55, 115) * tr[2],
          vy: 20, r: rrange(7, 12) * tr[2], land: tr[1] + rrange(-2, 8)
        });
      }
      for (let i = G.drops.length - 1; i >= 0; i--) {
        const d = G.drops[i];
        d.vy += 520 * dt; d.y += d.vy * dt;
        if (d.y >= d.land) {
          stampPile(d.x, d.land, d.r * 1.5);
          for (let k = 0; k < 4; k++) {
            G.chunks.push({
              x: d.x + rrange(-6, 6), y: d.land - 4,
              vx: rrange(-60, 60), vy: rrange(-120, -40), r: rrange(2.5, 6), life: 0.7
            });
          }
          SFX.thump();
          G.drops.splice(i, 1);
        }
      }
    }
  }

  // 表示値のなめらか追従
  G.moundS = lerp(G.moundS, G.pushes / PUSHES_NEED, 1 - Math.exp(-dt * 5));
  G.patS = lerp(G.patS, G.pats / PATS_NEED, 1 - Math.exp(-dt * 6));
  G.holeS = lerp(G.holeS, G.digs / DIGS_NEED, 1 - Math.exp(-dt * 6));
  if (G.patPunch) G.patPunch = Math.max(0, G.patPunch - dt * 5);
  if (G.digSwing) G.digSwing = Math.max(0, G.digSwing - dt * 5);

  // 雪玉（転がった跡が圧雪の帯として残る）
  for (const b of G.balls) {
    b.t += dt / b.d;
    const tt = easeInOut(clamp(b.t, 0, 1));
    const bx = lerp(b.from, MX + (b.side === 'L' ? -60 : 60), tt);
    if (b.lastX === undefined) b.lastX = b.from;
    if (Math.abs(bx - b.lastX) > 11) {
      stampTrail(bx, MB + 2, lerp(16, 30, tt) * 0.85);
      b.lastX = bx;
      SFX.step();
    }
  }
  for (let i = G.balls.length - 1; i >= 0; i--) {
    if (G.balls[i].t >= 1) {
      G.balls.splice(i, 1);
      G.pushes = Math.min(PUSHES_NEED, G.pushes + 1);
      SFX.arrive();
      const p = worldToScreen(MX, MB - 60);
      addSpark(p.x, p.y, 5, [230, 244, 255]);
      if (G.pushes >= PUSHES_NEED && G.phase === 'gather') {
        setTimeout(() => { if (G.phase === 'gather') { setPhase('pat'); SFX.sparkle(); } }, dur(0.8) * 1000);
      }
    }
  }

  // 掘り雪の塊
  for (let i = G.chunks.length - 1; i >= 0; i--) {
    const c = G.chunks[i];
    c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 700 * dt; c.life -= dt * 1.2;
    if (c.life <= 0 || c.y > MB + 40) G.chunks.splice(i, 1);
  }

  // キラキラ
  for (let i = G.sparkles.length - 1; i >= 0; i--) {
    const s = G.sparkles[i];
    s.life -= dt * 1.4; s.y -= 12 * dt;
    if (s.life <= 0) G.sparkles.splice(i, 1);
  }

  // フェーズ固有
  switch (G.phase) {
    case 'tofront':
      if (G.t > dur(1.3)) setPhase('dig');
      break;
    case 'goin': {
      G.goinT = clamp(G.t / dur(2.2), 0, 1);
      if (G.goinT >= 1) {
        setPhase('carve');
        SFX.wow();
      }
      break;
    }
    case 'carve': case 'lantern': case 'glow': {
      const IN = G.IN;
      IN.intro = clamp(IN.intro + dt / dur(0.9), 0, 1);
      for (let i = IN.shavings.length - 1; i >= 0; i--) {
        const s = IN.shavings[i];
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.life -= dt * 1.5;
        if (s.life <= 0) IN.shavings.splice(i, 1);
      }
      for (const g of IN.grooves) g.life = Math.max(0.35, g.life - dt * 0.12);
      if (G.phase === 'lantern' && !IN.lantern.homeSet) {
        IN.lantern.homeSet = true;
        IN.lantern.x = cw / 2;
        IN.lantern.y = ch * 0.88;
      }
      if (G.phase === 'glow') {
        // ★もう一回点：青白 → 暖色
        IN.warm = clamp(IN.warm + dt / dur(2.4), 0, 1);
        IN.kidClap += dt;
        if (IN.warm > 0.5 && rnd() < dt * 3) {
          const t = lanternTarget();
          addSpark(t.x + rrange(-cw * 0.2, cw * 0.2), t.y - rrange(0, ch * 0.3), 1, [255, 214, 140]);
        }
        if (G.t > dur(4.2) && !G.trans) {
          fadeTo('toreveal', [30, 26, 40], 1.2);
          setTimeout(() => SFX.tada(), dur(1.2) * 700);
        }
      }
      break;
    }
    case 'toreveal':
      G.dusk = clamp(G.dusk + dt * 1.5, 0, 1);
      if (G.t > dur(0.6)) setPhase('reveal');
      break;
    case 'reveal':
      G.dusk = clamp(G.dusk + dt * 1.5, 0, 1);
      break;
  }
}

/* ==========================================================================
   描画
   ========================================================================== */

/* ---------- 空（スクリーン空間・時刻で変化） ---------- */
function drawSky(dusk) {
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, C('skyTop'));
  g.addColorStop(0.55, C('skyMid'));
  g.addColorStop(1, C('skyLow'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  // 低い冬の太陽のにじみ（昼）／夕焼けの帯（夕）
  const sunX = cw * 0.72, sunY = ch * 0.30;
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(cw, ch) * 0.5);
  if (dusk < 0.5) {
    sg.addColorStop(0, `rgba(255,250,235,${0.5 * (1 - dusk * 2)})`);
    sg.addColorStop(0.25, `rgba(255,246,225,${0.16 * (1 - dusk * 2)})`);
    sg.addColorStop(1, 'rgba(255,246,225,0)');
  } else {
    sg.addColorStop(0, `rgba(255,180,120,${0.30 * (dusk - 0.5) * 2})`);
    sg.addColorStop(1, 'rgba(255,180,120,0)');
  }
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, cw, ch);
  // 流れる層雲（ベイク済み、2層パララックス）
  if (texClouds) {
    ctx.globalAlpha = 0.7 - dusk * 0.55;
    const w1 = cw * 1.6, h1 = ch * 0.34;
    const o1 = (G.time * 3.5) % w1;
    ctx.drawImage(texClouds, -o1, -ch * 0.04, w1, h1);
    ctx.drawImage(texClouds, w1 - o1, -ch * 0.04, w1, h1);
    ctx.globalAlpha = 0.45 - dusk * 0.36;
    const o2 = (G.time * 7) % (w1 * 1.3);
    ctx.drawImage(texClouds, -o2, ch * 0.1, w1 * 1.3, h1 * 0.9);
    ctx.drawImage(texClouds, w1 * 1.3 - o2, ch * 0.1, w1 * 1.3, h1 * 0.9);
    ctx.globalAlpha = 1;
  }
  if (dusk > 0.15) {
    ctx.fillStyle = `rgba(255,250,230,${0.8 * dusk})`;
    for (let i = 0; i < 34; i++) {
      const sx = ((i * 137.5) % 100) / 100 * cw;
      const sy = ((i * 91.7) % 52) / 100 * ch;
      const tw = 0.5 + 0.5 * Math.sin(G.time * 2 + i * 1.7);
      ctx.globalAlpha = dusk * (0.25 + 0.75 * tw);
      ctx.beginPath();
      ctx.arc(sx, sy, i % 5 === 0 ? 1.9 : 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 昇る月
    const mx = cw * 0.2, my = ch * 0.14;
    ctx.globalAlpha = dusk;
    const mg = ctx.createRadialGradient(mx, my, 2, mx, my, 60);
    mg.addColorStop(0, 'rgba(255,252,238,0.9)');
    mg.addColorStop(0.18, 'rgba(255,252,238,0.55)');
    mg.addColorStop(1, 'rgba(255,252,238,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 60, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,252,240,0.95)';
    ctx.beginPath(); ctx.arc(mx, my, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(214,214,206,0.5)';
    ctx.beginPath(); ctx.arc(mx - 3, my + 2, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 4, my - 3, 1.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- 遠景の山なみ（なだらかな2層＋大気の霞、ワールド空間） ---------- */
function ridgePath(y0, amp, seedOff) {
  const from = -900, to = 1900, step = 140;
  ctx.beginPath();
  let prevX = from, prevY = y0;
  ctx.moveTo(from, y0);
  for (let x = from + step; x <= to + step; x += step) {
    const k = x * 0.0052 + seedOff;
    const y = y0 - amp * (0.5 + 0.5 * Math.sin(k)) - amp * 0.3 * Math.sin(k * 2.17 + 1.3);
    ctx.quadraticCurveTo(prevX + step / 2, prevY, (prevX + step / 2 + x) / 2, (prevY + y) / 2);
    prevX = x; prevY = y;
  }
  ctx.lineTo(to, HORIZON + 60);
  ctx.lineTo(from, HORIZON + 60);
  ctx.closePath();
}
function drawHills(dusk) {
  // 最遠のなだらかな山
  ridgePath(HORIZON - 26, 92, 0.7);
  ctx.fillStyle = C('farMt');
  ctx.fill();
  // 中景の丘（雪面の柔らかい起伏の陰）
  ridgePath(HORIZON + 2, 66, 3.4);
  ctx.fillStyle = C('midMt');
  ctx.fill();
  ctx.save();
  ridgePath(HORIZON + 2, 66, 3.4);
  ctx.clip();
  for (let x = -820; x < 1900; x += 210) {
    const k = x * 0.0052 + 3.4;
    const py = HORIZON + 2 - 66 * (0.5 + 0.5 * Math.sin(k)) - 66 * 0.3 * Math.sin(k * 2.17 + 1.3);
    const sg = ctx.createRadialGradient(x, py + 20, 0, x, py + 20, 90);
    sg.addColorStop(0, C('snowHi', 0.35));
    sg.addColorStop(1, C('snowHi', 0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(x, py + 22, 95, 40, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 地平の霞
  const hz = ctx.createLinearGradient(0, HORIZON - 70, 0, HORIZON + 26);
  hz.addColorStop(0, C('haze', 0));
  hz.addColorStop(1, C('haze', 0.85));
  ctx.fillStyle = hz;
  ctx.fillRect(-900, HORIZON - 70, 2800, 96);
}

/* ---------- 雪面のダイヤモンドダスト（ワールド空間のきらめき） ---------- */
const SPARKS = [];
function initSparks() {
  SPARKS.length = 0;
  const n = FAST ? 30 : 130;
  for (let i = 0; i < n; i++) {
    SPARKS.push({ x: rrange(-350, 1350), y: rrange(360, 780), ph: rnd() * TAU, sp: rrange(1.5, 4) });
  }
}
function drawSparks(dusk) {
  for (const s of SPARKS) {
    const tw = Math.sin(G.time * s.sp + s.ph);
    if (tw < 0.55) continue;
    const a = (tw - 0.55) / 0.45 * (0.85 - dusk * 0.4);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.1, 0, TAU); ctx.fill();
    if (tw > 0.93) { // 強いきらめきは十字のフレア
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y); ctx.lineTo(s.x + 4, s.y);
      ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x, s.y + 4);
      ctx.stroke();
    }
  }
}

/* ---------- 地面（永続レイヤー＋時刻ティント） ---------- */
function drawGround(dusk) {
  ctx.fillStyle = 'rgb(222,234,247)';
  ctx.fillRect(-3000, HORIZON, 7000, 4000);
  if (groundCv) ctx.drawImage(groundCv, GX0, GY0);
  if (dusk > 0.01) {
    // 夕方の色へ：地面全体を紫青にティント
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(168,158,208,${0.55 * dusk})`;
    ctx.fillRect(-3000, HORIZON, 7000, 4000);
    ctx.globalCompositeOperation = 'source-over';
  }
  drawSparks(dusk);
}

/* ---------- 地面 ---------- */
function drawGround(dusk) {
  const snow = mix3([244, 249, 255], [156, 148, 190], dusk);
  ctx.fillStyle = rgb(snow);
  ctx.fillRect(-3000, HORIZON, 7000, 4000);
  // 青白い影のむら
  const sh = mix3([176, 200, 232], [96, 96, 150], dusk);
  ctx.fillStyle = rgb(sh, 0.28);
  const patches = [[180, 660, 220, 34], [700, 700, 260, 40], [420, 640, 150, 22], [900, 640, 180, 26], [80, 620, 120, 20]];
  for (const p of patches) {
    ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, TAU); ctx.fill();
  }
  // 足あと
  ctx.fillStyle = rgb(sh, 0.5);
  for (let i = 0; i < 9; i++) {
    const fx = 210 + i * 32, fy = 622 + Math.sin(i * 2.1) * 5 + (i % 2) * 7;
    ctx.beginPath(); ctx.ellipse(fx, fy, 7, 4.5, 0.2, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    const fx = 790 - i * 30, fy = 648 + Math.sin(i * 1.7) * 4 + (i % 2) * 7;
    ctx.beginPath(); ctx.ellipse(fx, fy, 7, 4.5, -0.2, 0, TAU); ctx.fill();
  }
}

/* ---------- 雪をかぶった民家（板張り・切妻・つらら・雪囲い） ---------- */
function drawHouse(x, y, s, bodyCol, dusk) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  const wallD = mix3(bodyCol, [58, 50, 78], dusk * 0.62);
  const wallDk = mix3(wallD, [0, 0, 0], 0.22);
  // 壁（横板張り）
  ctx.fillStyle = rgb(wallD);
  ctx.fillRect(-56, -58, 112, 62);
  ctx.strokeStyle = rgb(wallDk, 0.55);
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 7; i++) {
    ctx.beginPath(); ctx.moveTo(-56, -58 + i * 9); ctx.lineTo(56, -58 + i * 9); ctx.stroke();
  }
  // 妻側の陰（立体感）
  const wsh = ctx.createLinearGradient(-56, 0, 56, 0);
  wsh.addColorStop(0, 'rgba(0,0,20,0.30)');
  wsh.addColorStop(0.35, 'rgba(0,0,20,0)');
  wsh.addColorStop(1, 'rgba(255,240,220,0.10)');
  ctx.fillStyle = wsh;
  ctx.fillRect(-56, -58, 112, 62);
  // 切妻屋根
  ctx.fillStyle = rgb(mix3([88, 78, 84], [46, 42, 58], dusk * 0.6));
  ctx.beginPath();
  ctx.moveTo(-68, -54); ctx.lineTo(0, -102); ctx.lineTo(68, -54);
  ctx.lineTo(60, -50); ctx.lineTo(0, -94); ctx.lineTo(-60, -50);
  ctx.closePath(); ctx.fill();
  // 分厚い屋根雪（庇からせり出す）
  const snowTop = C3('snowHi'), snowSh = C3('snowSh');
  const rs = ctx.createLinearGradient(0, -128, 0, -50);
  rs.addColorStop(0, rgb(snowTop));
  rs.addColorStop(1, rgb(mix3(snowTop, snowSh, 0.55)));
  ctx.fillStyle = rs;
  ctx.beginPath();
  ctx.moveTo(-76, -52);
  ctx.quadraticCurveTo(-80, -66, -64, -70);
  ctx.quadraticCurveTo(-30, -104, 0, -112);
  ctx.quadraticCurveTo(30, -104, 64, -70);
  ctx.quadraticCurveTo(80, -66, 76, -52);
  ctx.quadraticCurveTo(72, -60, 62, -60);
  ctx.lineTo(0, -103);
  ctx.lineTo(-62, -60);
  ctx.quadraticCurveTo(-72, -60, -76, -52);
  ctx.closePath(); ctx.fill();
  // 雪庇の下端の青い影とつらら
  ctx.fillStyle = rgb(snowSh, 0.6);
  ctx.beginPath();
  ctx.moveTo(-76, -52); ctx.quadraticCurveTo(-40, -46, 0, -47);
  ctx.quadraticCurveTo(40, -46, 76, -52);
  ctx.quadraticCurveTo(40, -54, 0, -54);
  ctx.quadraticCurveTo(-40, -54, -76, -52);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C('ice', 0.85);
  for (let i = 0; i < 7; i++) {
    const ix = -62 + i * 21 + (i % 2) * 4;
    const il = 6 + ((i * 37) % 3) * 5;
    ctx.beginPath();
    ctx.moveTo(ix - 2.4, -51); ctx.lineTo(ix, -51 + il); ctx.lineTo(ix + 2.4, -51);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(ix - 1.6, -51, 1.1, il * 0.6);
    ctx.fillStyle = C('ice', 0.85);
  }
  // 暖かい窓（格子・にじむ光・雪面への映り）
  const glow = 0.5 + 0.5 * dusk;
  for (const [wx, ww] of [[-34, 26], [12, 24]]) {
    const wg = ctx.createRadialGradient(wx + ww / 2, -26, 2, wx + ww / 2, -26, 34);
    wg.addColorStop(0, `rgba(255,196,110,${0.4 * glow})`);
    wg.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.arc(wx + ww / 2, -26, 34, 0, TAU); ctx.fill();
    const win = ctx.createLinearGradient(wx, -40, wx, -12);
    win.addColorStop(0, 'rgb(255,224,150)');
    win.addColorStop(1, 'rgb(255,178,86)');
    ctx.fillStyle = win;
    roundRect(wx, -40, ww, 27, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(110,70,40,0.75)';
    ctx.lineWidth = 2;
    roundRect(wx, -40, ww, 27, 3); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, -40); ctx.lineTo(wx + ww / 2, -13);
    ctx.moveTo(wx, -27); ctx.lineTo(wx + ww, -27);
    ctx.stroke();
    // 窓下の桟に積もった雪
    ctx.fillStyle = C('snowHi', 0.95);
    roundRect(wx - 2, -14, ww + 4, 4, 2); ctx.fill();
    // 雪面への暖色の映り込み
    ctx.fillStyle = `rgba(255,190,100,${0.16 * glow})`;
    ctx.beginPath(); ctx.ellipse(wx + ww / 2, 8, ww * 1.1, 6, 0, 0, TAU); ctx.fill();
  }
  // 戸口
  ctx.fillStyle = rgb(wallDk);
  roundRect(-8, -34, 0, 0, 0);
  roundRect(38, -36, 14, 32, 2); ctx.fill();
  // 壁ぎわの雪の吹きだまり（雪囲い風）
  ctx.fillStyle = C('snowHi');
  ctx.beginPath();
  ctx.moveTo(-62, 6);
  ctx.quadraticCurveTo(-58, -14, -40, -8);
  ctx.quadraticCurveTo(-10, -2, 20, -7);
  ctx.quadraticCurveTo(50, -12, 62, 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C('snowSh', 0.4);
  ctx.beginPath(); ctx.ellipse(0, 4, 60, 5, 0, 0, TAU); ctx.fill();
  // 煙突と湯気
  ctx.fillStyle = rgb(mix3([150, 112, 96], [76, 62, 84], dusk * 0.6));
  ctx.fillRect(28, -118, 14, 26);
  ctx.fillStyle = C('snowHi');
  roundRect(26, -122, 18, 6, 3); ctx.fill();
  const st = G.time * 0.7 + x;
  for (let i = 0; i < 3; i++) {
    const ss = (st + i * 0.33) % 1;
    ctx.globalAlpha = (1 - ss) * (0.4 - 0.1 * dusk);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(36 + Math.sin(ss * 5 + i) * 7, -126 - ss * 44, 6 + ss * 9, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------- 雪をかぶった針葉樹（枝ごとの垂れ雪） ---------- */
function drawTree(x, y, s, dusk) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  // 根元の吹きだまりと影
  ctx.fillStyle = C('snowSh', 0.4);
  ctx.beginPath(); ctx.ellipse(4, 2, 34, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C('snowHi');
  ctx.beginPath(); ctx.ellipse(0, -2, 22, 9, 0, 0, TAU); ctx.fill();
  // 幹
  const tr = ctx.createLinearGradient(-6, 0, 6, 0);
  tr.addColorStop(0, C('trunk'));
  tr.addColorStop(0.6, rgb(mix3(C3('trunk'), [255, 255, 255], 0.18)));
  tr.addColorStop(1, C('trunk'));
  ctx.fillStyle = tr;
  ctx.beginPath();
  ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-3, -60, -1.6, -120);
  ctx.lineTo(1.6, -120); ctx.quadraticCurveTo(3, -60, 7, 0);
  ctx.closePath(); ctx.fill();
  const layers = 4;
  for (let L = 0; L < layers; L++) {
    const w = 58 - L * 12.5, hy = -26 - L * 30, hgt = 42 - L * 3;
    // 枝葉（ギザギザの垂れた針葉）
    const grad = ctx.createLinearGradient(0, hy - hgt, 0, hy + 8);
    grad.addColorStop(0, C('pineHi'));
    grad.addColorStop(1, C('pine'));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, hy - hgt);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, bx = w * t, by = hy - hgt + hgt * t;
      ctx.lineTo(bx, by + (i % 2 ? 7 : 2));
      if (i < 5) ctx.lineTo(bx + w * 0.07, by - 3);
    }
    ctx.quadraticCurveTo(w * 0.3, hy + 9, 0, hy + 6);
    ctx.quadraticCurveTo(-w * 0.3, hy + 9, -w, hy + (5 % 2 ? 7 : 2));
    for (let i = 5; i >= 0; i--) {
      const t = i / 5, bx = -w * t, by = hy - hgt + hgt * t;
      ctx.lineTo(bx, by + (i % 2 ? 7 : 2));
      if (i > 0) ctx.lineTo(bx - w * 0.05, by - 3);
    }
    ctx.closePath(); ctx.fill();
    // 枝の上に積もる厚い雪（塊ごとに丸く、下面は青い影）
    const snowT = C3('snowHi'), snowS = C3('snowSh');
    for (let i = 0; i < 4; i++) {
      const t = i / 3.2, bx = w * (0.12 + t * 0.72), by = hy - hgt + hgt * (0.15 + t * 0.72);
      for (const sgn of [-1, 1]) {
        const cxp = sgn * bx, r = (11 - L * 1.2) * (1 - t * 0.25);
        ctx.fillStyle = rgb(snowS, 0.55);
        ctx.beginPath(); ctx.ellipse(cxp, by - 1, r, r * 0.5, sgn * 0.22, 0, TAU); ctx.fill();
        const sg = ctx.createRadialGradient(cxp - r * 0.3, by - r * 0.6, 0, cxp, by - 3, r * 1.15);
        sg.addColorStop(0, 'rgba(255,255,255,1)');
        sg.addColorStop(1, rgb(snowT, 0.92));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(cxp, by - 4, r, r * 0.55, sgn * 0.22, 0, TAU); ctx.fill();
      }
    }
    // 中央の雪
    ctx.fillStyle = rgb(snowT);
    ctx.beginPath(); ctx.ellipse(0, hy - hgt * 0.55, w * 0.32, 8, 0, 0, TAU); ctx.fill();
  }
  // 天辺の雪帽子
  ctx.fillStyle = C('snowHi');
  ctx.beginPath(); ctx.ellipse(0, -146, 8, 10, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- 横の雪だまり（ふわふわの新雪） ---------- */
function drawSidePile(x, remain, total, dusk) {
  if (remain <= 0) return;
  const k = remain / total;
  const R = 62 * (0.45 + 0.55 * k);
  ctx.fillStyle = C('snowSh', 0.45);
  ctx.beginPath(); ctx.ellipse(x, MB + 6, R * 1.35, R * 0.26, 0, 0, TAU); ctx.fill();
  // ふんわりした重なり
  const lumps = [[-0.6, -0.35, 0.62], [0.05, -0.55, 0.78], [0.62, -0.28, 0.55], [-0.15, -0.2, 0.7]];
  for (const [lx, ly, lr] of lumps) {
    const px = x + lx * R, py = MB + ly * R, pr = lr * R;
    const g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.45, 0, px, py, pr * 1.15);
    g.addColorStop(0, C('snowHi'));
    g.addColorStop(0.7, C('snowMid'));
    g.addColorStop(1, C('snowSh'));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
  }
  // 粒テクスチャときらめき
  if (patGrain) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, MB - R * 0.35, R * 1.15, 0, TAU); ctx.clip();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = patGrain;
    ctx.fillRect(x - R * 1.4, MB - R * 1.6, R * 2.8, R * 2.2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/* ---------- 雪山（かまくら） ---------- */
const MOUND_BUMPS = [];
for (let i = 0; i < 15; i++) MOUND_BUMPS.push(rrange(-1, 1));

function moundGeom() {
  const s = 0.22 + 0.78 * easeOut(clamp(G.moundS, 0, 1));
  const punch = (G.patPunch || 0) * 0.05;
  return { R: MOUND_R * s * (1 - punch), H: MOUND_R * 1.18 * s * (1 - punch * 2), s };
}

function moundPath(R, H, smoothK) {
  const N = 15;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI - Math.PI * i / N;
    const wob = 1 + (1 - smoothK) * 0.09 * MOUND_BUMPS[Math.min(i, N - 1)];
    pts.push({ x: MX + Math.cos(a) * R * 1.12 * wob, y: MB - Math.sin(a) * H * wob });
  }
  ctx.beginPath();
  smoothOpen(pts);
  ctx.lineTo(MX + R * 1.12, MB + 4);
  ctx.lineTo(MX - R * 1.12, MB + 4);
  ctx.closePath();
}
function drawMound(dusk, lit) {
  const { R, H, s } = moundGeom();
  const smoothK = easeOut(G.patS); // 固めるほどなめらか
  const snowTop = C3('snowHi'), snowMid = C3('snowMid'), sh = C3('snowSh'), deep = C3('snowDeep');

  // 接地の青い影（右上からの光に合わせ左下へ）
  const shg = ctx.createRadialGradient(MX - R * 0.2, MB + 4, 0, MX - R * 0.2, MB + 4, R * 1.5);
  shg.addColorStop(0, rgb(deep, 0.5));
  shg.addColorStop(1, rgb(deep, 0));
  ctx.fillStyle = shg;
  ctx.beginPath(); ctx.ellipse(MX - R * 0.1, MB + 8, R * 1.5, R * 0.24, 0, 0, TAU); ctx.fill();

  // ドーム本体：上右のハイライト → 下左の青い陰
  moundPath(R, H, smoothK);
  const g = ctx.createLinearGradient(MX - R, MB - H * 0.2, MX + R * 0.6, MB - H * 1.05);
  g.addColorStop(0, rgb(mix3(snowMid, sh, 0.5)));
  g.addColorStop(0.45, rgb(snowMid));
  g.addColorStop(1, rgb(snowTop));
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  moundPath(R, H, smoothK);
  ctx.clip();
  // 面の丸みを出す内側の陰影
  const og = ctx.createRadialGradient(MX + R * 0.3, MB - H * 0.75, R * 0.1, MX, MB - H * 0.35, R * 1.35);
  og.addColorStop(0, 'rgba(255,255,255,0.55)');
  og.addColorStop(0.55, 'rgba(255,255,255,0)');
  og.addColorStop(0.8, rgb(sh, 0.18));
  og.addColorStop(1, rgb(deep, 0.42));
  ctx.fillStyle = og;
  ctx.fillRect(MX - R * 1.3, MB - H * 1.2, R * 2.6, H * 1.3);
  // 雪の粒テクスチャ
  if (patGrain) {
    ctx.globalAlpha = 0.5 - smoothK * 0.22;
    ctx.fillStyle = patGrain;
    ctx.fillRect(MX - R * 1.3, MB - H * 1.2, R * 2.6, H * 1.3);
    ctx.globalAlpha = 1;
  }
  // ふわふわ（固める前）：もこもこの塊影
  if (smoothK < 0.9) {
    for (let i = 0; i < 14; i++) {
      const a = 0.3 + (i / 14) * 2.5;
      const rr = R * (0.3 + (i % 4) * 0.17);
      const bx = MX + Math.cos(a) * rr * 0.92, by = MB - 12 - Math.abs(Math.sin(a)) * H * 0.58;
      ctx.fillStyle = rgb(sh, 0.20 * (1 - smoothK));
      ctx.beginPath(); ctx.ellipse(bx, by + 4, R * 0.11, R * 0.07, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.30 * (1 - smoothK)})`;
      ctx.beginPath(); ctx.ellipse(bx - 3, by - 3, R * 0.09, R * 0.055, 0, 0, TAU); ctx.fill();
    }
  }
  // 固めた後：締まった雪のつや筋
  if (smoothK > 0.15) {
    ctx.strokeStyle = `rgba(255,255,255,${0.45 * smoothK})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(MX - R * 0.15, MB - H * 0.24, R * 0.8, -2.35, -1.15); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(MX + R * 0.05, MB - H * 0.3, R * 0.62, -2.2, -1.3); ctx.stroke();
    ctx.strokeStyle = rgb(sh, 0.35 * smoothK);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(MX + R * 0.1, MB - H * 0.2, R * 0.94, -0.55, 0.55); ctx.stroke();
  }
  // ペタペタのミトン痕（2つの膨らみ＋light rim）
  for (const m of G.patMarks) {
    const px = MX + Math.cos(m.a) * R * m.r * 1.02;
    const py = MB - Math.abs(Math.sin(m.a)) * H * m.r * 0.9 - H * 0.08;
    const ms = m.s * s;
    ctx.fillStyle = rgb(sh, 0.34);
    ctx.beginPath(); ctx.ellipse(px, py, 9 * ms, 12 * ms, m.a * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + 8 * ms, py + 3 * ms, 4.5 * ms, 6 * ms, m.a * 0.2 + 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(px - 2 * ms, py + 9 * ms, 7 * ms, 2.5 * ms, 0.1, 0, TAU); ctx.fill();
  }
  // 山肌のきらめき
  for (let i = 0; i < 26; i++) {
    const a = (i * 0.83) % Math.PI;
    const rr = 0.35 + ((i * 53) % 40) / 66;
    const px = MX + Math.cos(a) * R * rr, py = MB - Math.sin(a) * H * rr * 0.95;
    const tw = Math.sin(G.time * 3 + i * 2.1);
    if (tw > 0.6) {
      ctx.fillStyle = `rgba(255,255,255,${(tw - 0.6) * 1.8})`;
      ctx.beginPath(); ctx.arc(px, py, 1.2, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  // 稜線のリムライト（夕方は控えめ）
  moundPath(R, H, smoothK);
  ctx.strokeStyle = `rgba(255,255,255,${(0.5 + smoothK * 0.3) * (1 - dusk * 0.55)})`;
  ctx.lineWidth = 2;
  ctx.save(); ctx.clip();
  ctx.stroke(); ctx.restore();

  drawDugPiles(dusk, R);
  drawMoundHole(dusk, lit, R, H);
}

/* 掘り出した雪が入口の両脇に積もる */
function drawDugPiles(dusk, R) {
  const k = easeOut(clamp(G.holeS, 0, 1));
  if (k < 0.05) return;
  for (const sgn of [-1, 1]) {
    const px = MX + sgn * (R * 0.72 + 26), py = MB + 2, pr = (14 + 26 * k);
    ctx.fillStyle = C('snowSh', 0.4);
    ctx.beginPath(); ctx.ellipse(px, py + 3, pr * 1.25, pr * 0.3, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.6, 0, px, py, pr * 1.1);
    g.addColorStop(0, C('snowHi'));
    g.addColorStop(1, C('snowMid'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(px - pr, py + 2);
    ctx.quadraticCurveTo(px - pr * 0.5, py - pr * 0.95, px + pr * 0.1, py - pr * 0.8);
    ctx.quadraticCurveTo(px + pr * 0.8, py - pr * 0.55, px + pr, py + 2);
    ctx.closePath(); ctx.fill();
    // スコップ痕
    ctx.strokeStyle = C('snowSh', 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(px, py - pr * 0.3, pr * 0.5, -2.6, -0.6); ctx.stroke();
  }
}

/* 入口の穴（雪の断面リム付き） */
function holeSize() {
  const k = easeOut(clamp(G.holeS, 0, 1));
  return { hw: 8 + 78 * k, hh: 12 + 128 * k, k };
}
function holePath(hw, hh, grow) {
  const w = hw * (grow || 1), h = hh * (grow || 1);
  ctx.beginPath();
  ctx.moveTo(MX - w, MB + 3);
  ctx.bezierCurveTo(MX - w, MB - h * 0.8, MX - w * 0.65, MB - h, MX, MB - h);
  ctx.bezierCurveTo(MX + w * 0.65, MB - h, MX + w, MB - h * 0.8, MX + w, MB + 3);
  ctx.closePath();
}
function drawMoundHole(dusk, lit, R, H) {
  if (G.holeS < 0.02) return;
  const { hw, hh } = holeSize();
  // 断面：外側=ふわっとした新雪層 → 内側=青白い圧雪層の2層リム
  holePath(hw + 11, hh + 10);
  ctx.fillStyle = C('snowHi');
  ctx.fill();
  holePath(hw + 7, hh + 7);
  ctx.fillStyle = C('snowMid');
  ctx.fill();
  holePath(hw + 3.5, hh + 3.5);
  ctx.fillStyle = C('ice');
  ctx.fill();
  // 断面のスコップ痕（縦の削り筋）
  ctx.save();
  holePath(hw + 11, hh + 10);
  ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) {
    const a = i / 3 * 1.1;
    ctx.beginPath();
    ctx.moveTo(MX + Math.sin(a) * (hw + 2), MB - (Math.cos(a)) * (hh + 2));
    ctx.lineTo(MX + Math.sin(a) * (hw + 11), MB - (Math.cos(a)) * (hh + 11));
    ctx.stroke();
  }
  ctx.restore();
  // 穴の中
  holePath(hw, hh);
  if (lit) {
    const flick = 1 + Math.sin(G.time * 1.3) * 0.02;
    const g = ctx.createRadialGradient(MX, MB - hh * 0.3, 4, MX, MB - hh * 0.3, hh * 1.15 * flick);
    g.addColorStop(0, 'rgb(255,228,158)');
    g.addColorStop(0.55, 'rgb(255,182,96)');
    g.addColorStop(1, 'rgb(196,108,50)');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, MB - hh, 0, MB);
    g.addColorStop(0, 'rgb(26,44,76)');
    g.addColorStop(0.7, 'rgb(14,27,50)');
    g.addColorStop(1, 'rgb(9,19,38)');
    ctx.fillStyle = g;
  }
  ctx.fill();
  if (!lit && G.holeS > 0.4) {
    // 穴の奥にうっすら見える床の反射
    ctx.fillStyle = 'rgba(120,160,210,0.18)';
    ctx.beginPath(); ctx.ellipse(MX, MB - 4, hw * 0.7, hh * 0.08, 0, 0, TAU); ctx.fill();
  }
  if (lit) {
    // 入口から雪面へこぼれる光だまり（雪のきらめき入り）
    const g2 = ctx.createRadialGradient(MX, MB + 4, 2, MX, MB + 4, R * 1.6);
    g2.addColorStop(0, 'rgba(255,196,110,0.6)');
    g2.addColorStop(0.5, 'rgba(255,180,96,0.22)');
    g2.addColorStop(1, 'rgba(255,180,96,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(MX, MB + 12, R * 1.6, R * 0.42, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 12; i++) {
      const px = MX + Math.sin(i * 2.4) * R * (0.3 + (i % 5) * 0.16);
      const py = MB + 8 + ((i * 29) % 20);
      const tw = Math.sin(G.time * 3.4 + i);
      if (tw > 0.4) {
        ctx.fillStyle = `rgba(255,226,170,${(tw - 0.4) * 1.1})`;
        ctx.beginPath(); ctx.arc(px, py, 1.3, 0, TAU); ctx.fill();
      }
    }
    // 薄い雪壁を透過する暖色（入口周辺ほど強く）
    ctx.save();
    moundPath(R, H, easeOut(G.patS));
    ctx.clip();
    const g3 = ctx.createRadialGradient(MX, MB - hh * 0.45, 4, MX, MB - hh * 0.45, R * 1.2);
    g3.addColorStop(0, 'rgba(255,186,104,0.5)');
    g3.addColorStop(0.35, 'rgba(255,176,108,0.2)');
    g3.addColorStop(0.75, 'rgba(255,170,110,0.06)');
    g3.addColorStop(1, 'rgba(255,170,110,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(MX - R * 1.3, MB - H * 1.2, R * 2.6, H * 1.3);
    ctx.restore();
  }
}

/* ---------- 転がる雪玉 ---------- */
function drawBalls(dusk) {
  for (const b of G.balls) {
    const t = easeInOut(clamp(b.t, 0, 1));
    const x = lerp(b.from, MX + (b.side === 'L' ? -60 : 60), t);
    const r = lerp(16, 30, t);
    const y = MB + 2 - r;
    ctx.fillStyle = rgb(mix3([252, 253, 255], [186, 180, 214], dusk));
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(170,196,230,0.6)';
    ctx.lineWidth = 2.5;
    const rot = t * 7 * (b.side === 'L' ? 1 : -1);
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, rot, rot + 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.85, rot + 2.5, rot + 3.8); ctx.stroke();
    // 押している子ども
    drawKid(x + (b.side === 'L' ? -r - 16 : r + 16), MB + 4, 0.95, 'push', b.side === 'R');
  }
}

/* ---------- 掘り雪の塊 ---------- */
function drawChunks(dusk) {
  ctx.fillStyle = rgb(mix3([250, 252, 255], [190, 184, 216], dusk));
  for (const c of G.chunks) {
    ctx.globalAlpha = clamp(c.life, 0, 1);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ==========================================================================
   人物（セミリアル頭身・関節アニメーション）
   ========================================================================== */
const KID = {
  h: 96, headR: 13.5,
  jacket: [225, 99, 84], jacketD: [168, 62, 58], jacketHi: [246, 142, 120],
  pants: [66, 84, 122], pantsD: [46, 60, 92],
  boots: [74, 60, 66], hat: [237, 230, 216], hatBand: [204, 82, 74],
  mitt: [204, 82, 74], skin: [255, 223, 199], skinD: [235, 186, 158],
  hair: [96, 64, 48], girl: true
};
const ADULT = {
  h: 138, headR: 15,
  jacket: [72, 128, 120], jacketD: [50, 94, 90], jacketHi: [104, 158, 148],
  pants: [70, 78, 100], pantsD: [50, 56, 76],
  boots: [54, 48, 56], hat: [58, 78, 106], hatBand: [42, 60, 86],
  mitt: [58, 78, 106], skin: [244, 212, 186], skinD: [222, 182, 152],
  hair: [72, 52, 42], girl: false
};
/* 手足のカプセル（上面ハイライト・下面の青い照り返し陰） */
function limb(x1, y1, x2, y2, w, col, colD) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgb(colD);
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = rgb(col);
  ctx.lineWidth = w * 0.72;
  ctx.beginPath(); ctx.moveTo(x1 + w * 0.1, y1 - w * 0.12); ctx.lineTo(x2 + w * 0.1, y2 - w * 0.12); ctx.stroke();
}
function drawPerson(cfg, pose, t, opt) {
  opt = opt || {};
  const u = cfg.h / 96;
  const P = { lean: 0, bob: 0, crouch: 0, armL: 0.12, armR: -0.12, armLBendX: 0, walk: 0, headTilt: 0 };
  switch (pose) {
    case 'idle': P.bob = Math.sin(t * 2.1 + (opt.ph || 0)) * 1.5 * u; P.armL = 0.15; P.armR = -0.15; break;
    case 'walk': P.walk = 1; P.bob = Math.abs(Math.sin(t * 7)) * -2.4 * u; break;
    case 'push': P.lean = 0.42; P.armL = 1.35; P.armR = 1.5; P.bob = Math.abs(Math.sin(t * 7)) * -2 * u; P.walk = 0.7; break;
    case 'duck': P.crouch = 0.55; P.lean = 0.55; P.armL = 1.1; P.armR = 1.25; break;
    case 'sit': P.crouch = 0.9; break;
    case 'clap': P.crouch = opt.sit ? 0.9 : 0; break;
    case 'wave': P.armR = -0.1; break;
    case 'pat': P.lean = 0.2; break;
  }
  const walkPh = (opt.walkPh || t * 7);
  const hipY = -(38 - P.crouch * 16) * u + P.bob;
  const shoulderRelY = -(28 - P.crouch * 4) * u;
  const legW = 9.5 * u, armW = 8 * u;

  // 落ち影
  ctx.fillStyle = C('snowDeep', 0.35);
  ctx.beginPath(); ctx.ellipse(2 * u, 2 * u, 19 * u, 5.5 * u, 0, 0, TAU); ctx.fill();

  // ---- 脚（回転しない骨盤基準） ----
  function leg(sideSgn, phase) {
    const hx = sideSgn * 6 * u, hy = hipY + 4 * u;
    let fx, fy;
    if (pose === 'sit') { fx = 16 * u; fy = -4 * u; }
    else if (P.walk > 0) {
      const sw = Math.sin(phase) * 13 * u * P.walk;
      const lift = Math.max(0, Math.sin(phase + Math.PI / 2)) * 5.5 * u * P.walk;
      fx = hx + sw; fy = -3.5 * u - lift;
    } else if (pose === 'push') { fx = hx - sideSgn * 6 * u - 8 * u; fy = -3.5 * u; }
    else { fx = hx + sideSgn * 1.5 * u; fy = -3.5 * u; }
    limb(hx, hy, fx, fy - 2 * u, legW, cfg.pants, cfg.pantsD);
    // スノーブーツ（雪の照り返しで下面が明るい）
    ctx.fillStyle = rgb(cfg.boots);
    roundRect(fx - 6 * u, fy - 5 * u, 13 * u, 7 * u, 3 * u); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(fx - 6 * u, fy - 0.5 * u, 13 * u, 2.4 * u, 1.2 * u); ctx.fill();
    ctx.fillStyle = rgb(cfg.pantsD, 0.9);
    roundRect(fx - 5 * u, fy - 7.5 * u, 10 * u, 3.4 * u, 1.6 * u); ctx.fill();
  }
  leg(-1, walkPh + Math.PI); // 奥の脚

  // ---- 胴体以降は腰で前傾 ----
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(P.lean);

  // 奥の腕
  arm(-1, P.armL, false);

  // 胴体（ダウンジャケット）
  const tw = 15 * u; // 半幅
  const bodyGrad = ctx.createLinearGradient(-tw, 0, tw, 0);
  bodyGrad.addColorStop(0, rgb(cfg.jacketD));
  bodyGrad.addColorStop(0.45, rgb(cfg.jacket));
  bodyGrad.addColorStop(1, rgb(cfg.jacketHi));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-tw, 6 * u);
  ctx.quadraticCurveTo(-tw - 2 * u, shoulderRelY + 8 * u, -tw * 0.76, shoulderRelY);
  ctx.quadraticCurveTo(0, shoulderRelY - 5 * u, tw * 0.76, shoulderRelY);
  ctx.quadraticCurveTo(tw + 2 * u, shoulderRelY + 8 * u, tw, 6 * u);
  ctx.quadraticCurveTo(0, 10.5 * u, -tw, 6 * u);
  ctx.closePath(); ctx.fill();
  // キルティングの縫い目
  ctx.strokeStyle = rgb(cfg.jacketD, 0.6);
  ctx.lineWidth = 1.1 * u;
  for (let i = 1; i <= 3; i++) {
    const sy = shoulderRelY + (6 * u - shoulderRelY) * (i / 3.6) + 3 * u;
    ctx.beginPath();
    ctx.moveTo(-tw * 0.94, sy);
    ctx.quadraticCurveTo(0, sy + 3.5 * u, tw * 0.94, sy);
    ctx.stroke();
  }
  // 前立て（ファスナー）
  ctx.strokeStyle = rgb(cfg.jacketD, 0.8);
  ctx.lineWidth = 1.6 * u;
  ctx.beginPath(); ctx.moveTo(2 * u, shoulderRelY - 2 * u); ctx.lineTo(2 * u, 8 * u); ctx.stroke();
  // 裾と襟のファー
  furLine(-tw * 0.95, 6.4 * u, tw * 0.95, 6.4 * u, 3.4 * u);
  furLine(-tw * 0.7, shoulderRelY + 1 * u, tw * 0.7, shoulderRelY + 1 * u, 3.8 * u);

  // ---- 頭 ----
  const hr = cfg.headR * u;
  const headY = shoulderRelY - hr - 2 * u;
  ctx.save();
  ctx.translate(0, headY);
  ctx.rotate(P.headTilt);
  // 顔
  const fg = ctx.createRadialGradient(hr * 0.25, -hr * 0.25, hr * 0.2, 0, 0, hr * 1.15);
  fg.addColorStop(0, rgb(cfg.skin));
  fg.addColorStop(1, rgb(cfg.skinD));
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fill();
  // 髪（前髪と横のおくれ毛）
  ctx.fillStyle = rgb(cfg.hair);
  ctx.beginPath();
  ctx.arc(0, -hr * 0.15, hr * 0.98, Math.PI + 0.35, -0.35);
  ctx.quadraticCurveTo(hr * 0.5, -hr * 0.55, 0, -hr * 0.42);
  ctx.quadraticCurveTo(-hr * 0.5, -hr * 0.55, -hr * 0.93, -hr * 0.28);
  ctx.closePath(); ctx.fill();
  if (cfg.girl) {
    ctx.strokeStyle = rgb(cfg.hair);
    ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-hr * 0.95, 0); ctx.quadraticCurveTo(-hr * 1.15, hr * 0.5, -hr * 0.85, hr * 0.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hr * 0.95, 0); ctx.quadraticCurveTo(hr * 1.15, hr * 0.5, hr * 0.85, hr * 0.95); ctx.stroke();
  }
  // ニット帽（リブ編み・折り返し・ポンポン）
  ctx.fillStyle = rgb(cfg.hat);
  ctx.beginPath();
  ctx.arc(0, -hr * 0.28, hr * 1.02, Math.PI + 0.12, -0.12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgb(cfg.hatBand, 0.5);
  ctx.lineWidth = 1.2 * u;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * hr * 0.26, -hr * 1.24 + Math.abs(i) * hr * 0.09);
    ctx.lineTo(i * hr * 0.3, -hr * 0.62);
    ctx.stroke();
  }
  ctx.fillStyle = rgb(cfg.hatBand);
  roundRect(-hr * 1.05, -hr * 0.75, hr * 2.1, hr * 0.42, hr * 0.2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(-hr * 1.05, -hr * 0.75, hr * 2.1, hr * 0.14, hr * 0.07); ctx.fill();
  // ポンポン
  ctx.fillStyle = rgb(cfg.hat);
  ctx.beginPath(); ctx.arc(0, -hr * 1.38, hr * 0.34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.4;
    ctx.beginPath(); ctx.arc(Math.cos(a) * hr * 0.18, -hr * 1.38 + Math.sin(a) * hr * 0.18, hr * 0.09, 0, TAU); ctx.fill();
  }
  // 目（虹彩＋光）・眉・鼻・口・頬
  const blink = (Math.sin(t * 0.9 + (opt.ph || 0) * 3) > 0.985);
  for (const sx of [-1, 1]) {
    if (blink) {
      ctx.strokeStyle = rgb(cfg.hair); ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.moveTo(sx * hr * 0.42 - 2 * u, hr * 0.08); ctx.lineTo(sx * hr * 0.42 + 2 * u, hr * 0.08); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgb(58,42,36)';
      ctx.beginPath(); ctx.ellipse(sx * hr * 0.42, hr * 0.08, 1.9 * u, 2.5 * u, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(sx * hr * 0.42 + 0.7 * u, hr * 0.02, 0.7 * u, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = rgb(cfg.hair, 0.65); ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.arc(sx * hr * 0.42, hr * 0.02, hr * 0.22, Math.PI + 0.5, TAU - 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(242,138,116,0.4)';
    ctx.beginPath(); ctx.ellipse(sx * hr * 0.62, hr * 0.42, 2.6 * u, 1.7 * u, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = rgb(cfg.skinD);
  ctx.beginPath(); ctx.ellipse(0, hr * 0.3, 1.1 * u, 1.5 * u, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgb(150,84,74)'; ctx.lineWidth = 1.3 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, hr * 0.5, hr * 0.2, 0.4, Math.PI - 0.4); ctx.stroke();
  ctx.restore();

  // 手前の腕
  arm(1, P.armR, true);
  ctx.restore();

  // 手前の脚
  leg(1, walkPh);

  /* --- 内部関数 --- */
  function arm(depth, angFwd, near) {
    // angFwd: 0=下ろす, 正=前へ上げる
    const sx = depth * 11 * u * 0.4, sy = shoulderRelY + 4 * u;
    let a = Math.PI / 2 - angFwd; // 下向き基準
    let hx, hy;
    if (pose === 'wave' && near) {
      a = -0.9 + Math.sin(t * 6) * 0.22;
      hx = sx + Math.cos(a) * 22 * u; hy = sy + Math.sin(a) * 22 * u;
    } else if (pose === 'clap') {
      const cl = Math.abs(Math.sin(t * 7));
      hx = depth * (4 + cl * 7) * u; hy = sy + 12 * u;
    } else if (P.walk > 0 && pose === 'walk') {
      a = Math.PI / 2 + Math.sin(walkPh + (near ? Math.PI : 0)) * 0.5;
      hx = sx + Math.cos(a) * 24 * u; hy = sy + Math.sin(a) * 24 * u;
    } else {
      hx = sx + Math.cos(a) * 24 * u; hy = sy + Math.sin(a) * 24 * u;
    }
    const jc = near ? cfg.jacket : cfg.jacketD;
    limb(sx, sy, hx, hy, armW, near ? cfg.jacketHi : cfg.jacket, jc);
    // ミトン
    ctx.fillStyle = rgb(cfg.mitt);
    ctx.beginPath(); ctx.ellipse(hx, hy, 5.4 * u, 4.6 * u, a, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(hx - 1 * u, hy - 1.4 * u, 3 * u, 2 * u, a, 0, TAU); ctx.fill();
  }
  function furLine(x1, y1, x2, y2, r) {
    ctx.fillStyle = 'rgba(250,250,252,0.95)';
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (r * 0.9));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      ctx.beginPath();
      ctx.arc(lerp(x1, x2, k), lerp(y1, y2, k) + Math.sin(i * 2.7) * r * 0.18, r * (0.8 + 0.25 * Math.sin(i * 1.7)), 0, TAU);
      ctx.fill();
    }
  }
}
/* ---------- 子ども ---------- */
function drawKid(x, y, s, pose, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  drawPerson(KID, pose, G.time, { ph: 0.7 });
  ctx.restore();
}

/* ---------- 大人（見守り） ---------- */
function drawAdult(x, y, s, pose, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  drawPerson(ADULT, pose, G.time, { ph: 2.3 });
  ctx.restore();
}

/* ---------- 大きな雪かきスコップ ---------- */
function drawShovel(x, y, swing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 - swing * 0.9);
  // 木の柄（木目）
  const hg = ctx.createLinearGradient(-5, 0, 5, 0);
  hg.addColorStop(0, '#8a6238'); hg.addColorStop(0.45, '#c29764'); hg.addColorStop(1, '#96703f');
  ctx.fillStyle = hg;
  roundRect(-5, -88, 10, 72, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(110,78,44,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-1.5, -84); ctx.lineTo(-1.5, -20); ctx.stroke();
  // D型グリップ
  ctx.strokeStyle = '#a1734a'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, -94, 11, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -94, 11, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  // 金属のブレード（湾曲・光沢）
  const bg = ctx.createLinearGradient(-22, 0, 22, 0);
  bg.addColorStop(0, '#4a76b8'); bg.addColorStop(0.35, '#7ba6de'); bg.addColorStop(0.55, '#a9c8ec'); bg.addColorStop(1, '#456ba6');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-21, -18);
  ctx.quadraticCurveTo(-25, 22, 0, 31);
  ctx.quadraticCurveTo(25, 22, 21, -18);
  ctx.quadraticCurveTo(0, -24, -21, -18);
  ctx.closePath(); ctx.fill();
  // 補強リブとエッジの摩耗光
  ctx.strokeStyle = 'rgba(30,54,96,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(0, 28); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,244,255,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-16, 22); ctx.quadraticCurveTo(0, 30, 16, 22); ctx.stroke();
  // 載っている雪
  ctx.fillStyle = C('snowHi', 0.95);
  ctx.beginPath(); ctx.ellipse(0, 6, 13, 6 + swing * 4, 0.1, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- 降雪（風にうねる3層） ---------- */
function drawSnowfall() {
  const wind = Math.sin(G.time * 0.22) * 0.35 + Math.sin(G.time * 0.07) * 0.3;
  for (const f of FLAKES) {
    const drift = Math.sin(G.time * 0.6 + f.ph) * f.sway + wind * f.v * 1.4;
    const x = ((f.x + G.time * drift) % 1.06 + 1.06) % 1.06 * cw;
    const y = ((f.y + G.time * f.v) % 1.06) * ch;
    const a = lerp(0.35, 0.9, f.depth) * (0.6 + 0.4 * Math.sin(f.ph + G.time * 1.4));
    if (f.depth > 0.82) {
      // 近景の大粒は柔らかくボケる
      ctx.fillStyle = `rgba(255,255,255,${a * 0.3})`;
      ctx.beginPath(); ctx.arc(x, y, f.r * 1.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(x, y, f.r, 0, TAU); ctx.fill();
  }
  // 地面近くを流れる雪煙
  for (const d of DRIFTS) {
    const x = ((d.x + G.time * d.sp * (1 + wind * 0.5)) % 1.3 - 0.15) * cw;
    const y = d.y * ch + Math.sin(G.time * 1.7 + d.ph) * ch * 0.006;
    const w = d.w * cw;
    const g = ctx.createLinearGradient(x - w, y, x + w, y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.10 + 0.05 * Math.sin(G.time + d.ph)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, w, ch * 0.011, 0, 0, TAU); ctx.fill();
  }
}

/* ---------- キラキラ（スクリーン） ---------- */
function drawSparkles() {
  for (const s of G.sparkles) {
    const a = clamp(s.life, 0, 1);
    const r = s.r * (0.6 + 0.4 * Math.sin(G.time * 8 + s.ph));
    ctx.fillStyle = rgb(s.col, a);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ph + G.time * 2);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.3 * Math.cos(i * Math.PI / 2 + 0.4), r * 0.3 * Math.sin(i * Math.PI / 2 + 0.4));
      ctx.lineTo(r * 1.6 * Math.cos(i * Math.PI / 2), r * 1.6 * Math.sin(i * Math.PI / 2));
      ctx.lineTo(r * 0.3 * Math.cos(i * Math.PI / 2 - 0.4), r * 0.3 * Math.sin(i * Math.PI / 2 - 0.4));
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------- 外の雪原シーン ---------- */
function drawExterior(dusk, lit) {
  drawSky(dusk);
  const s = camScale();
  ctx.save();
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (cw / 2 - G.camNow.x * s), DPR * (ch / 2 - G.camNow.y * s));
  drawHills(dusk);
  drawGround(dusk);
  drawTree(78, 350, 1.05, dusk);
  drawTree(925, 345, 0.9, dusk);
  drawTree(645, 332, 0.62, dusk);
  drawHouse(248, 332, 1, [186, 110, 88], dusk);
  drawHouse(775, 326, 0.85, [150, 118, 150], dusk);
  // 遠くの小さな雪山（雪国らしさ）
  ctx.fillStyle = rgb(mix3([240, 247, 254], [166, 160, 198], dusk));
  ctx.beginPath();
  ctx.moveTo(30, 640); ctx.quadraticCurveTo(95, 560, 165, 640); ctx.closePath(); ctx.fill();

  if (G.phase === 'gather' || G.phase === 'title') {
    drawSidePile(180, G.leftSnow, Math.ceil(PUSHES_NEED / 2), dusk);
    drawSidePile(820, G.rightSnow, Math.ceil(PUSHES_NEED / 2), dusk);
  }
  drawMound(dusk, lit);
  drawChunks(dusk);
  drawBalls(dusk);

  // キャラクター
  const kidPose = G.kid.moving ? 'walk' : 'idle';
  if (G.phase === 'title') {
    drawKid(G.kid.x, G.kid.y, 1, kidPose, G.kid.flip);
    drawAdult(828, 600, 1, 'idle', true);
  } else if (G.phase === 'gather') {
    if (G.balls.length === 0) drawKid(G.kid.x, G.kid.y, 1, kidPose, G.kid.flip);
    drawAdult(828, 598, 1, 'idle', true);
  } else if (G.phase === 'pat' || G.phase === 'tofront') {
    drawKid(G.kid.x, G.kid.y, 1, kidPose, G.kid.flip);
  } else if (G.phase === 'dig') {
    drawKid(G.kid.x, G.kid.y, 1, kidPose, G.kid.flip);
    drawAdult(Math.min(MX + moundGeom().R + 78, visibleWorldEdges().r - 40), 600, 1, 'idle', true);
  } else if (G.phase === 'enter') {
    const hop = G.kid.moving ? 0 : Math.abs(Math.sin(G.time * 3)) * 6;
    drawKid(G.kid.x, G.kid.y - hop, 1, kidPose, G.kid.flip);
    drawAdult(Math.min(MX + moundGeom().R + 78, visibleWorldEdges().r - 40), 600, 1, 'idle', true);
  } else if (G.phase === 'goin') {
    // スルッと入る演出（かがんで穴へ）
    const t = G.goinT;
    if (t < 0.45) {
      const k = t / 0.45;
      const kx = lerp(MX - holeSize().hw - 38, MX, easeInOut(k));
      drawKid(kx, 602, 1 - 0.25 * k, k > 0.4 ? 'duck' : 'walk', false);
    }
    drawAdult(MX + moundGeom().R + 78, 600, 1, 'idle', true);
  } else if (G.phase === 'reveal' || G.phase === 'toreveal') {
    drawKid(MX - moundGeom().R - 60, 606, 1, 'wave', false);
    drawAdult(MX - moundGeom().R - 112, 602, 1, 'wave', false);
  }

  // 白い息
  for (const b of G.breaths) {
    ctx.fillStyle = `rgba(255,255,255,${0.32 * clamp(b.life, 0, 1)})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }
  // 木から落ちる雪塊
  for (const d of G.drops) {
    ctx.fillStyle = C('snowHi', 0.95);
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    ctx.fillStyle = C('snowSh', 0.4);
    ctx.beginPath(); ctx.arc(d.x + d.r * 0.25, d.y + d.r * 0.3, d.r * 0.55, 0, TAU); ctx.fill();
  }

  // 掘り中の大スコップ（指に追従）
  if (G.phase === 'dig') {
    const p = G.pointer.down ? screenToWorld(G.pointer.x, G.pointer.y) : { x: MX + 130, y: MB - 40 };
    drawShovel(p.x, p.y, G.digSwing || 0);
  }
  ctx.restore();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* ---------- 内部シーン ---------- */
function drawInterior() {
  const IN = G.IN;
  const { cx, cy, M } = interiorGeom();
  const warm = IN.warm;

  // 雪の中の闇（壁の向こう）
  const outCool = [18, 30, 56], outWarm = [46, 32, 40];
  ctx.fillStyle = rgb(mix3(outCool, outWarm, warm));
  ctx.fillRect(0, 0, cw, ch);

  // 空洞の形（セクター半径からブロブ）
  const pts = [];
  for (let i = 0; i < IN.N; i++) {
    const a = i / IN.N * TAU;
    const r = sectorRadius(i);
    pts.push({ x: cx + Math.cos(a) * r * 1.06, y: cy + Math.sin(a) * r });
  }
  blobPath(pts);

  // 壁のグラデーション（Hero: 青白い雪壁 → 暖色に透ける）
  // 光源＝入口からの外光（点灯後はランタン位置）
  const inner = mix3([228, 242, 253], [255, 233, 196], warm);
  const mid = mix3([158, 192, 232], [244, 190, 130], warm);
  const edge = mix3([90, 124, 178], [188, 130, 86], warm);
  const lt = lanternTarget();
  const floorY0 = cy + M * 0.17;
  const exX = cx - M * 0.26; // 入口アーチは左寄り（中央の設置場所と重ねない）
  const lightX = warm > 0.02 ? lt.x : exX, lightY = warm > 0.02 ? lt.y - M * 0.05 : floorY0 - M * 0.02;
  const rg = ctx.createRadialGradient(lightX, lightY, M * 0.03, cx, cy, M * 0.66);
  rg.addColorStop(0, rgb(inner));
  rg.addColorStop(0.45, rgb(mid));
  rg.addColorStop(1, rgb(edge));
  ctx.fillStyle = rg;
  ctx.fill();

  ctx.save();
  blobPath(pts);
  ctx.clip();

  // 雪の粒テクスチャと、掘り進めた工具痕の同心リング
  if (patGrain) {
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = patGrain;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 5; i++) {
    const rr = M * (0.3 + i * 0.075);
    ctx.strokeStyle = i % 2 ?
      rgb(mix3([255, 255, 255], [255, 236, 200], warm), 0.06) :
      rgb(mix3([120, 156, 204], [210, 150, 100], warm), 0.07);
    ctx.lineWidth = M * (0.012 + (i % 3) * 0.004);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, TAU);
    ctx.stroke();
  }

  // 床
  const floorY = cy + M * 0.17;
  const fg = ctx.createLinearGradient(0, floorY, 0, floorY + M * 0.45);
  fg.addColorStop(0, rgb(mix3([224, 238, 250], [255, 226, 180], warm)));
  fg.addColorStop(1, rgb(mix3([185, 210, 238], [235, 178, 120], warm)));
  ctx.fillStyle = fg;
  ctx.fillRect(cx - M, floorY, M * 2, M);
  ctx.fillStyle = rgb(mix3([200, 222, 244], [246, 205, 152], warm), 0.8);
  ctx.beginPath(); ctx.ellipse(cx, floorY + 2, M * 0.55, M * 0.05, 0, 0, TAU); ctx.fill();
  // 床に積もった削りカスの小山
  for (let i = 0; i < 7; i++) {
    const hgt = IN.pileH[i];
    if (hgt < 0.04) continue;
    const px = cx + (i - 3) * M * 0.155, py = floorY + M * 0.055 + (i % 2) * M * 0.02;
    const pr = M * 0.058 * (0.4 + hgt);
    ctx.fillStyle = rgb(mix3([180, 204, 232], [228, 178, 126], warm), 0.35);
    ctx.beginPath(); ctx.ellipse(px, py + pr * 0.22, pr * 0.95, pr * 0.22, 0, 0, TAU); ctx.fill();
    const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, 0, px, py, pr);
    pg.addColorStop(0, rgb(mix3([250, 253, 255], [255, 240, 208], warm)));
    pg.addColorStop(1, rgb(mix3([206, 226, 246], [244, 196, 142], warm)));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.55, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  }

  // 入口（外の光が見える小さなアーチ）＋外光のグロー
  const exW = M * 0.075, exH = M * 0.12;
  const exY = floorY + M * 0.01;
  const eg = ctx.createRadialGradient(exX, exY - exH * 0.4, M * 0.01, exX, exY - exH * 0.4, M * 0.22);
  eg.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - warm * 0.6)})`);
  eg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(exX, exY - exH * 0.4, M * 0.22, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(exX - exW, exY);
  ctx.bezierCurveTo(exX - exW, exY - exH, exX + exW, exY - exH, exX + exW, exY);
  ctx.closePath();
  const dayCol = mix3([240, 250, 255], [150, 140, 185], G.dusk);
  ctx.fillStyle = rgb(dayCol);
  ctx.fill();
  ctx.strokeStyle = rgb(mix3([255, 255, 255], [255, 230, 200], warm), 0.85);
  ctx.lineWidth = M * 0.012;
  ctx.stroke();

  // 削り跡（Hero: 削った雪の断面）
  for (const g of IN.grooves) {
    const i = Math.round(((g.a + TAU) % TAU) / TAU * IN.N) % IN.N;
    const r = sectorRadius(i) * g.rr;
    ctx.strokeStyle = rgb(mix3([222, 238, 252], [255, 226, 186], warm), 0.55 * g.life);
    ctx.lineWidth = M * 0.014;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, g.a - g.len, g.a + g.len);
    ctx.stroke();
  }

  // 壁の縁のかげ（丸み）
  blobPath(pts);
  ctx.strokeStyle = rgb(mix3([100, 134, 184], [180, 120, 80], warm), 0.5);
  ctx.lineWidth = M * 0.035;
  ctx.stroke();

  // 雪のベンチ（掘り残し）
  if (IN.benchShown) {
    const bx = cx + M * 0.26, by = floorY + M * 0.015;
    ctx.fillStyle = rgb(mix3([214, 232, 248], [250, 214, 164], warm));
    roundRect(bx - M * 0.1, by - M * 0.075, M * 0.2, M * 0.085, M * 0.03); ctx.fill();
    ctx.fillStyle = rgb(mix3([238, 247, 254], [255, 236, 198], warm));
    roundRect(bx - M * 0.115, by - M * 0.095, M * 0.23, M * 0.045, M * 0.022); ctx.fill();
    ctx.fillStyle = rgb(mix3([170, 198, 230], [222, 168, 116], warm), 0.5);
    ctx.beginPath(); ctx.ellipse(bx, by + M * 0.012, M * 0.12, M * 0.02, 0, 0, TAU); ctx.fill();
  }

  // 雪の粉
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const s of IN.shavings) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.9;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ランタン設置ターゲット
  if (G.phase === 'lantern' && !IN.lantern.placed) {
    const pulse = 0.7 + 0.3 * Math.sin(G.time * 4);
    ctx.strokeStyle = `rgba(255,214,140,${0.65 * pulse})`;
    ctx.lineWidth = M * 0.012;
    ctx.setLineDash([M * 0.03, M * 0.025]);
    ctx.beginPath(); ctx.ellipse(lt.x, lt.y, M * 0.11 * pulse + M * 0.02, M * 0.055 * pulse + M * 0.012, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  // グロー中：子どもが座って拍手
  if (G.phase === 'glow') {
    // ランタンの光で伸びる柔らかい影 → ベンチに座って拍手
    if (warm > 0.05) {
      ctx.fillStyle = `rgba(60,40,40,${0.18 * warm})`;
      ctx.beginPath();
      ctx.ellipse(cx + M * 0.36, floorY + M * 0.035, M * 0.16, M * 0.028, 0.06, 0, TAU);
      ctx.fill();
    }
    drawKidScreen(cx + M * 0.26, floorY - M * 0.035, M / 340, 'clap');
  }

  ctx.restore();

  // ランタン本体（LED・電池式）
  if (G.phase === 'lantern' || G.phase === 'glow') {
    drawLantern(IN.lantern.x, IN.lantern.y, M / 250, IN.lantern.placed, warm);
  }

  // 暖色の全体グロー
  if (warm > 0.01) {
    const gg = ctx.createRadialGradient(lt.x, lt.y - M * 0.04, M * 0.01, lt.x, lt.y - M * 0.04, M * 0.85);
    gg.addColorStop(0, `rgba(255,190,110,${0.28 * warm})`);
    gg.addColorStop(0.5, `rgba(255,170,90,${0.11 * warm})`);
    gg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 導入フェードイン（穴からスルッの直後）
  if (IN.intro < 1) {
    ctx.fillStyle = `rgba(8,16,34,${1 - easeOut(IN.intro)})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  // 周辺減光
  const vg = ctx.createRadialGradient(cx, cy, M * 0.3, cx, cy, Math.max(cw, ch) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(6,10,26,${0.5 - 0.2 * warm})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cw, ch);
}

/* スクリーン座標で子どもを描く（内部用） */
function drawKidScreen(x, y, s, pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  drawPerson(KID, pose, G.time, { ph: 0.7, sit: true });
  ctx.restore();
}

/* ---------- LEDランタン（電池式・火なし） ---------- */
function drawLantern(x, y, s, lit, warm) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (lit) {
    const fl = 1 + Math.sin(G.time * 1.1) * 0.015;
    const glow = ctx.createRadialGradient(0, -28, 4, 0, -28, 128 * fl);
    glow.addColorStop(0, 'rgba(255,212,130,0.65)');
    glow.addColorStop(0.4, 'rgba(255,184,94,0.26)');
    glow.addColorStop(1, 'rgba(255,184,94,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -28, 128 * fl, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // 持ち手（金属の光沢）
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6d7488';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, -54, 17, Math.PI * 0.12, Math.PI * 0.88, false); ctx.stroke();
  ctx.strokeStyle = '#aab2c6';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, -54, 17, Math.PI * 0.2, Math.PI * 0.6, false); ctx.stroke();
  // 上ぶた（換気スリット付き）
  const cap = ctx.createLinearGradient(-22, 0, 22, 0);
  cap.addColorStop(0, '#7d8598'); cap.addColorStop(0.4, '#b8c0d2'); cap.addColorStop(1, '#848ca0');
  ctx.fillStyle = cap;
  roundRect(-22, -60, 44, 13, 5); ctx.fill();
  ctx.fillStyle = 'rgba(50,56,72,0.5)';
  for (let i = -2; i <= 2; i++) roundRect(i * 8 - 2, -57, 4, 6, 2), ctx.fill();
  // ガラス部（縦の保護フレーム越しにLED）
  const glass = ctx.createLinearGradient(-18, 0, 18, 0);
  if (lit) {
    glass.addColorStop(0, 'rgba(255,196,110,0.95)');
    glass.addColorStop(0.5, 'rgba(255,236,180,0.98)');
    glass.addColorStop(1, 'rgba(255,188,100,0.95)');
  } else {
    glass.addColorStop(0, 'rgba(188,206,228,0.92)');
    glass.addColorStop(0.5, 'rgba(224,236,248,0.95)');
    glass.addColorStop(1, 'rgba(178,196,220,0.92)');
  }
  ctx.fillStyle = glass;
  roundRect(-18, -48, 36, 36, 7); ctx.fill();
  // LED素子（フィラメントではなく面発光パネル）
  ctx.fillStyle = lit ? '#fff8dc' : '#e8edf5';
  roundRect(-6, -40, 12, 20, 4); ctx.fill();
  if (lit) {
    ctx.strokeStyle = 'rgba(255,248,214,0.9)';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + G.time * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, -30 + Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a) * 21, -30 + Math.sin(a) * 21);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(120,134,158,0.5)';
    ctx.beginPath(); ctx.arc(0, -33, 2, 0, TAU); ctx.fill();
  }
  // ガラスの映り込み
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(-13, -46); ctx.lineTo(-7, -46); ctx.lineTo(-13, -14); ctx.lineTo(-16, -14);
  ctx.closePath(); ctx.fill();
  // 縦フレーム
  ctx.strokeStyle = '#6d7488'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-18, -46); ctx.lineTo(-18, -12); ctx.moveTo(18, -46); ctx.lineTo(18, -12); ctx.stroke();
  // 電池ボックスの台座（火でない安心感：スイッチと電池マーク）
  const base = ctx.createLinearGradient(-22, 0, 22, 0);
  base.addColorStop(0, '#68708a'); base.addColorStop(0.4, '#9aa4bc'); base.addColorStop(1, '#707890');
  ctx.fillStyle = base;
  roundRect(-22, -13, 44, 15, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(-22, -13, 44, 4, 2); ctx.fill();
  ctx.fillStyle = lit ? '#8fe08a' : '#c9d0de';
  ctx.beginPath(); ctx.arc(11, -5.5, 3.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(46,52,68,0.7)'; ctx.lineWidth = 1.4;
  roundRect(-14, -9, 12, 7, 1.5); ctx.stroke();
  ctx.strokeRect(-2, -7.2, 1.8, 3.4);
  ctx.restore();
}

/* ---------- ヒントの手（赤いミトンの小さな手） ---------- */
function drawHand(x, y, press) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  const s = (1 - press * 0.12);
  ctx.scale(s, s);
  // 落ち影
  ctx.fillStyle = 'rgba(30,48,88,0.22)';
  ctx.beginPath(); ctx.ellipse(2, 22, 13, 5, 0, 0, TAU); ctx.fill();
  // 本体（人物のミトンと同じ赤）
  const mg = ctx.createRadialGradient(-4, -6, 2, 0, 0, 18);
  mg.addColorStop(0, 'rgb(226,110,94)');
  mg.addColorStop(1, 'rgb(188,66,60)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(-9, 12);
  ctx.quadraticCurveTo(-13, -2, -8, -9);
  ctx.quadraticCurveTo(0, -15, 8, -9);
  ctx.quadraticCurveTo(13, -2, 9, 12);
  ctx.closePath(); ctx.fill();
  // 親指
  ctx.beginPath();
  ctx.moveTo(-8, 2);
  ctx.quadraticCurveTo(-17, 3, -16, 10);
  ctx.quadraticCurveTo(-14, 15, -8, 12);
  ctx.closePath(); ctx.fill();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath(); ctx.ellipse(-3, -6, 4.5, 3, -0.4, 0, TAU); ctx.fill();
  // 白いニットの手首リブ
  ctx.fillStyle = '#f4f1ea';
  roundRect(-10, 11, 20, 9, 4.5); ctx.fill();
  ctx.strokeStyle = 'rgba(180,172,158,0.7)';
  ctx.lineWidth = 1.2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(i * 2.6, 12); ctx.lineTo(i * 2.6, 19); ctx.stroke();
  }
  ctx.restore();
}

function hintSpec() {
  switch (G.phase) {
    case 'title': {
      const b = titleBtn();
      return { type: 'tap', from: { x: b.x, y: b.y } };
    }
    case 'gather': {
      const side = (G.leftSnow >= G.rightSnow) ? 'L' : 'R';
      const pileX = side === 'L' ? 180 : 820;
      const a = worldToScreen(pileX, MB - 30);
      const b = worldToScreen(MX + (side === 'L' ? -85 : 85), MB - 40);
      return { type: 'drag', from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } };
    }
    case 'pat': {
      const m = moundGeom();
      const p = worldToScreen(MX, MB - m.H * 0.75);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'dig': {
      const p = worldToScreen(MX, MB - 42);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'enter': {
      const p = worldToScreen(MX, MB - 45);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'carve': {
      const IN = G.IN;
      const { cx, cy } = interiorGeom();
      let best = 0, bi = 0;
      for (let i = 0; i < IN.N; i++) {
        if (1 - IN.grow[i] > best) { best = 1 - IN.grow[i]; bi = i; }
      }
      const a0 = bi / IN.N * TAU;
      const r = sectorRadius(bi) * 0.8;
      const p1 = { x: cx + Math.cos(a0 - 0.35) * r, y: cy + Math.sin(a0 - 0.35) * r };
      const p2 = { x: cx + Math.cos(a0 + 0.35) * r, y: cy + Math.sin(a0 + 0.35) * r };
      // 画面内に収める
      p1.x = clamp(p1.x, 20, cw - 20); p1.y = clamp(p1.y, 20, ch - 20);
      p2.x = clamp(p2.x, 20, cw - 20); p2.y = clamp(p2.y, 20, ch - 20);
      return { type: 'drag', from: p1, to: p2 };
    }
    case 'lantern': {
      const IN = G.IN;
      if (IN.lantern.placed) return null;
      const t = lanternTarget();
      return { type: 'drag', from: { x: IN.lantern.x, y: IN.lantern.y }, to: t };
    }
    case 'reveal': {
      const b = replayBtn();
      return { type: 'tap', from: { x: b.x, y: b.y } };
    }
    default: return null;
  }
}

function drawHint() {
  if (G.pointer.down) return;
  if (G.time - G.lastInput < 1.4 && G.phase !== 'title' && G.phase !== 'enter') return;
  const spec = hintSpec();
  if (!spec) return;
  const t = (G.time % 1.6) / 1.6;
  if (spec.type === 'tap') {
    const press = t < 0.5 ? Math.sin(t * Math.PI * 2) : 0;
    drawHand(spec.from.x + 14, spec.from.y + 22 - press * 10, press);
    if (t > 0.1 && t < 0.6) {
      const rr = (t - 0.1) * 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - rr)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(spec.from.x, spec.from.y, 14 + rr * 34, 0, TAU); ctx.stroke();
    }
  } else {
    const k = easeInOut(t);
    const x = lerp(spec.from.x, spec.to.x, k);
    const y = lerp(spec.from.y, spec.to.y, k);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(spec.from.x, spec.from.y);
    ctx.quadraticCurveTo((spec.from.x + spec.to.x) / 2, Math.min(spec.from.y, spec.to.y) - 24, spec.to.x, spec.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawHand(x + 12, y + 20, 0.5);
  }
}

/* ---------- タイトル・リプレイUI ---------- */
function drawTitleUI() {
  const b = titleBtn();
  // タイトルロゴ（装飾）
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.min(cw * 0.09, 52);
  ctx.font = `bold ${fs}px ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDGothic", sans-serif`;
  ctx.lineWidth = fs * 0.28;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineJoin = 'round';
  const ty = ch * 0.16 + Math.sin(G.time * 1.5) * 4;
  ctx.strokeText('かまくら つくろう', cw / 2, ty);
  ctx.fillStyle = '#3d6ea8';
  ctx.fillText('かまくら つくろう', cw / 2, ty);
  // ボタン
  const pulse = 1 + Math.sin(G.time * 3) * 0.05;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(80,120,180,0.5)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff9a56';
  ctx.beginPath();
  ctx.moveTo(b.x - b.r * 0.28, b.y - b.r * 0.42);
  ctx.lineTo(b.x + b.r * 0.5, b.y);
  ctx.lineTo(b.x - b.r * 0.28, b.y + b.r * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawReplayUI() {
  if (G.t < dur(1.6)) return;
  const b = replayBtn();
  const pulse = 1 + Math.sin(G.time * 3) * 0.05;
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(30,40,80,0.5)';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff9a56';
  ctx.lineWidth = b.r * 0.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 0.5, -0.4, Math.PI * 1.4);
  ctx.stroke();
  const aa = -0.4;
  const ax = b.x + Math.cos(aa) * b.r * 0.5, ay = b.y + Math.sin(aa) * b.r * 0.5;
  ctx.fillStyle = '#ff9a56';
  ctx.beginPath();
  ctx.moveTo(ax + b.r * 0.3, ay - b.r * 0.05);
  ctx.lineTo(ax - b.r * 0.16, ay - b.r * 0.3);
  ctx.lineTo(ax - b.r * 0.12, ay + b.r * 0.28);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 「中に入る」ズーム演出 ---------- */
function drawGoInOverlay() {
  const t = G.goinT;
  if (t < 0.35) return;
  // 穴の闇が画面を包む
  const k = easeInOut(clamp((t - 0.35) / 0.65, 0, 1));
  const p = worldToScreen(MX, MB - 45);
  const maxR = Math.hypot(cw, ch);
  const r = lerp(camScale() * holeSize().hh * 0.9, maxR, k);
  ctx.fillStyle = 'rgb(10,20,42)';
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.ellipse(p.x, p.y, r * 0.8, r, 0, 0, TAU, true);
  ctx.fill('evenodd');
  // トンネルのリング（前へ進む感じ）
  if (k > 0.15) {
    for (let i = 0; i < 3; i++) {
      const rk = ((t * 2.2 + i * 0.33) % 1);
      ctx.strokeStyle = `rgba(140,175,220,${(1 - rk) * 0.4 * k})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.8 * rk, r * rk, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

/* ---------- メイン描画 ---------- */
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const phase = G.phase;
  const interior = (phase === 'carve' || phase === 'lantern' || phase === 'glow');

  if (interior) {
    drawInterior();
  } else if (phase === 'toreveal' || phase === 'reveal') {
    drawExterior(G.dusk, true);
    drawSnowfall();
    if (phase === 'reveal') drawReplayUI();
  } else {
    drawExterior(0, false);
    drawSnowfall();
    if (phase === 'title') drawTitleUI();
    if (phase === 'goin') drawGoInOverlay();
  }

  drawSparkles();
  drawHint();

  // フェード遷移オーバーレイ
  if (G.trans) {
    const half = G.trans.dur / 2;
    const a = G.trans.t < half ? G.trans.t / half : 1 - (G.trans.t - half) / half;
    ctx.fillStyle = rgb(G.trans.color, clamp(a, 0, 1));
    ctx.fillRect(0, 0, cw, ch);
  }
}

/* ---------- メインループ ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
bakeTextures();
initSparks();
resetGame(false);
requestAnimationFrame(frame);

/* ---------- E2E用フック ---------- */
window.game = {
  get phase() { return G.phase; },
  get pushes() { return G.pushes; },
  get pats() { return G.pats; },
  get digs() { return G.digs; },
  get carve() { return G.IN ? interiorAvg() : 0; },
  get warm() { return G.IN ? G.IN.warm : 0; },
  get size() { return { w: cw, h: ch, dpr: DPR }; },
  hint: hintSpec,
  version: 1
};
