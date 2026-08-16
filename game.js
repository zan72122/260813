/* じょせつしゃ ゴー！ — ロータリ除雪車の一本指ゲーム (4歳向け)
 * 依存なし / Canvas 2D / iPhone・iPad 縦横対応
 * URL params:
 *   ?fast=1   … DPR1・粒子減・固定シード (E2E用)
 *   ?demo=1   … 自動プレイ入力
 *   ?t=SEC    … 起動時に決定論的にSEC秒ぶん先へ進めてから描画
 *   ?seed=N   … 乱数シード
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- params
  var Q = {};
  try {
    location.search.replace(/[?&]([^=&]+)=?([^&]*)/g, function (_, k, v) {
      Q[k] = decodeURIComponent(v || '1');
      return '';
    });
  } catch (e) {}
  var FAST = !!Q.fast;
  var DEMO = !!Q.demo;
  var PRESTEP = parseFloat(Q.t || '0') || 0;

  // ---------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var SEED = Q.seed ? (parseInt(Q.seed, 10) || 42) : (FAST ? 42 : ((Math.random() * 1e9) | 0));
  var rng = mulberry32(SEED);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // ---------------------------------------------------------------- canvas
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = FAST ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- world consts
  var ROAD_Y = 600;          // 路面帯の上端
  var ROAD_H = 96;           // 路面帯の厚み
  var BASE_Y = ROAD_Y + 66;  // 車両の接地ライン
  var HORIZON = 470;
  var COL_W = 8;

  var WALL_START = 560;
  var GOAL_X = 3960;         // ここまで除雪したらゴール
  var WORLD_END = 4700;
  var PLAZA_X = GOAL_X + 40; // 広場(最初から除雪済み)

  var NCOL = Math.ceil(WORLD_END / COL_W);

  var G = 1500;              // 投雪の重力
  var TRUCK_CAP = 380;       // ダンプ満杯
  var AIM_MIN = -340, AIM_MAX = 250;

  // ---------------------------------------------------------------- world state
  var snowH = new Float32Array(NCOL);   // 雪壁ハイトフィールド
  var snowH0 = new Float32Array(NCOL);  // 初期値(演出用)
  var pileH = null;                     // 落とし損ね雪の山 (20px cell)
  var PILE_W = 20;
  var NPILE = Math.ceil(WORLD_END / PILE_W);

  var houses = [], polesBack = [], powerPoles = [], mountainsFar = [], mountainsMid = [];
  var bankBackPhase = [], bankFrontPhase = [];

  function genScenery() {
    houses.length = 0; powerPoles.length = 0; polesBack.length = 0;
    mountainsFar.length = 0; mountainsMid.length = 0;
    var r = mulberry32(SEED ^ 0x5EED);
    var hueSets = [
      ['#8d9db6', '#6b7a94'], // 青灰
      ['#b98d74', '#96705a'], // 煉瓦
      ['#d9c9a3', '#b3a380'], // クリーム
      ['#88a08c', '#6c8370'], // 深緑
      ['#a58bab', '#83698a']  // 藤
    ];
    var x = -700;
    while (x < WORLD_END + 900) {
      var w = 170 + r() * 110;
      var hh = 110 + r() * 70;
      var hs = hueSets[(r() * hueSets.length) | 0];
      houses.push({
        x: x, w: w, h: hh,
        body: hs[0], dark: hs[1],
        roofH: 55 + r() * 30,
        win: 1 + ((r() * 2) | 0),
        chimney: r() < 0.55,
        smokeSeed: r() * 100,
        tree: r() < 0.5
      });
      x += w + 130 + r() * 220;
    }
    for (x = -400; x < WORLD_END + 600; x += 560 + r() * 120) {
      powerPoles.push({ x: x, h: 210 + r() * 30 });
    }
    for (x = -300; x < WORLD_END + 400; x += 420 + r() * 240) {
      polesBack.push({ x: x, h: 165 + r() * 25 });
    }
    for (var i = 0; i < 9; i++) {
      mountainsFar.push({ x: -900 + i * 780 + r() * 300, w: 900 + r() * 500, h: 260 + r() * 140 });
      mountainsMid.push({ x: -700 + i * 700 + r() * 300, w: 620 + r() * 380, h: 170 + r() * 100 });
    }
    bankBackPhase = [r() * 7, r() * 7, r() * 7];
    bankFrontPhase = [r() * 7, r() * 7, r() * 7];
  }

  function genSnow() {
    var r = mulberry32(SEED ^ 0xACE);
    var p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
    // 大きな吹き溜まり
    var drifts = [];
    for (var d = 0; d < 6; d++) drifts.push({ x: WALL_START + 300 + r() * (GOAL_X - WALL_START - 500), a: 55 + r() * 65, w: 160 + r() * 160 });
    for (var i = 0; i < NCOL; i++) {
      var x = i * COL_W;
      var h = 0;
      if (x > WALL_START && x < PLAZA_X) {
        h = 205 + 40 * Math.sin(x * 0.0042 + p1) + 26 * Math.sin(x * 0.0113 + p2) + 13 * Math.sin(x * 0.027 + p3) + r() * 7;
        for (var dd = 0; dd < drifts.length; dd++) {
          var dr = drifts[dd];
          var q = (x - dr.x) / dr.w;
          h += dr.a * Math.exp(-q * q * 3);
        }
        // 入口はなだらかに
        if (x < WALL_START + 220) h *= (x - WALL_START) / 220;
        // ゴール手前で断ち切り
        if (x > PLAZA_X - 340) h *= (PLAZA_X - x) / 340;
        h = Math.max(0, h);
      }
      snowH[i] = h;
      snowH0[i] = h;
    }
    pileH = new Float32Array(NPILE);
  }

  // ---------------------------------------------------------------- entities
  var S; // ゲーム全体の状態

  function newTruck(x) {
    return {
      x: x, load: 0, state: 'follow', // follow | leave | gone
      vx: 0, bounce: 0, flip: 1, honkT: 0
    };
  }

  function resetGame(toTitle) {
    S = {
      mode: toTitle ? 'title' : 'play',
      t: 0,
      plow: {
        x: 260, speed: 0, augerRot: 0, chuteA: -0.6, beacon: 0,
        eatRate: 0, eatSm: 0, trackPhase: 0
      },
      truck: newTruck(30),
      truckCount: 0,
      nextTruckT: 0,
      aimOff: -285,
      touching: false,
      pointerX: 0, pointerY: 0,
      idleT: 0,
      flowAcc: 0, mistAcc: 0,
      flowTotal: 0,
      closeupDone: false,
      camMode: toTitle ? 'title' : 'follow',
      camT: 0,
      closeupTimer: 0,
      closeupTruck: false,
      finishT: 0,
      frontierI: 0,
      shake: 0,
      sparkT: 0
    };
    genSnow();
    flows.length = 0; chunks.length = 0; poofs.length = 0; sparkles.length = 0;
    cam.cx = 1500; cam.cy = 300; cam.zoom = 0.28;
    if (!toTitle) { cam.cx = S.plow.x; cam.cy = 420; }
    updateFrontier();
  }

  function updateFrontier() {
    var i = S.frontierI;
    while (i < NCOL && snowH[i] <= 4) i++;
    S.frontierI = i;
  }
  function frontierX() { return S.frontierI * COL_W; }

  // particles
  var flows = [];    // シュートから飛ぶ雪 {x,y,vx,vy,r,count,life}
  var chunks = [];   // オーガに吸い込まれる塊
  var poofs = [];    // 着地のふわっ
  var sparkles = []; // ゴール演出
  var flakesFar = [], flakesNear = [];
  (function initFlakes() {
    var r = mulberry32(SEED ^ 0xF1A4E);
    var nf = FAST ? 26 : 64, nn = FAST ? 8 : 18;
    for (var i = 0; i < nf; i++) flakesFar.push({ x: r(), y: r(), s: 0.7 + r() * 1.1, ph: r() * 7 });
    for (i = 0; i < nn; i++) flakesNear.push({ x: r(), y: r(), s: 2.2 + r() * 2.6, ph: r() * 7 });
  })();

  // ---------------------------------------------------------------- camera
  var cam = { cx: 1500, cy: 300, zoom: 0.28, sx: 0, sy: 0 };

  function camBoxFor(mode) {
    var p = S.plow;
    if (mode === 'title') {
      return { x: 950 + Math.sin(S.t * 0.07) * 110, roadFrac: 0.72, bw: 1300, bh: 900, rate: 1.2 };
    }
    if (mode === 'closeup') {
      if (S.closeupTruck && S.truck.state !== 'gone') {
        return { x: S.truck.x + 30, roadFrac: 0.82, bw: 700, bh: 520, rate: 2.6 };
      }
      // シュート先端とダンプ荷台の中間 = 投雪アーチが真ん中に来る
      var mid = p.x - 130;
      return { x: mid, roadFrac: 0.86, bw: 680, bh: 560, rate: 2.2 };
    }
    if (mode === 'finish') {
      return { x: (WALL_START + PLAZA_X) / 2 + 320, roadFrac: 0.78, bw: 3400, bh: 1050, rate: 0.9 };
    }
    // follow: 低い視点 (路面が画面の下寄り・車両大きめ)
    return { x: p.x - 40, roadFrac: 0.74, bw: 860, bh: 600, rate: 2.4 };
  }

  function updateCamera(dt) {
    var box = camBoxFor(S.camMode);
    var zoom = Math.min(W / box.bw, H / box.bh);
    zoom = clamp(zoom, 0.16, 1.7);
    var visH = H / zoom;
    var cy = ROAD_Y + 30 - (box.roadFrac - 0.5) * visH;
    var k = 1 - Math.exp(-dt * box.rate);
    cam.zoom = lerp(cam.zoom, zoom, k);
    cam.cx = lerp(cam.cx, box.x, k);
    cam.cy = lerp(cam.cy, cy, k);
    // 食い込みの微振動
    var sh = S.shake / cam.zoom;
    cam.sx = (rng() - 0.5) * sh;
    cam.sy = (rng() - 0.5) * sh * 0.7;
    S.shake = Math.max(0, S.shake - dt * 14);
  }

  // world→screen (視差付き)
  function W2SX(x, p) {
    if (p === undefined) p = 1;
    // レイヤー空間: 水平は cx*p、垂直は HORIZON を支点に縮める
    return (x - cam.cx * p) * cam.zoom + W / 2 + cam.sx * cam.zoom;
  }
  function W2SY(y, p) {
    if (p === undefined) p = 1;
    var py = 0.55 + 0.45 * p;
    var cyEff = HORIZON + (cam.cy - HORIZON) * 1;
    var yEff = HORIZON + (y - HORIZON) * py + (1 - py) * 0;
    return (yEff - cyEff) * cam.zoom + H / 2 + cam.sy * cam.zoom;
  }
  function viewL(p) { return cam.cx * (p === undefined ? 1 : p) - W / 2 / cam.zoom - 60; }
  function viewR(p) { return cam.cx * (p === undefined ? 1 : p) + W / 2 / cam.zoom + 60; }

  // ---------------------------------------------------------------- audio
  var sfx = {
    ctx: null, master: null, engineGain: null, augerGain: null, chuteGain: null,
    engineOsc: null, ok: false,
    init: function () {
      if (this.ctx || FAST) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var c = this.ctx = new AC();
        var m = this.master = c.createGain();
        m.gain.value = 0.22; m.connect(c.destination);

        // エンジン
        var o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 52;
        var o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 104.5;
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
        var eg = this.engineGain = c.createGain(); eg.gain.value = 0;
        o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(m);
        o1.start(); o2.start();
        this.engineOsc = o1;

        // ノイズバッファ
        var len = c.sampleRate * 1.2;
        var buf = c.createBuffer(1, len, c.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        // オーガのゴリゴリ
        var n1 = c.createBufferSource(); n1.buffer = buf; n1.loop = true;
        var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.8;
        var ag = this.augerGain = c.createGain(); ag.gain.value = 0;
        n1.connect(bp); bp.connect(ag); ag.connect(m); n1.start();

        // 投雪のシャーッ
        var n2 = c.createBufferSource(); n2.buffer = buf; n2.loop = true; n2.playbackRate.value = 1.4;
        var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
        var cg = this.chuteGain = c.createGain(); cg.gain.value = 0;
        n2.connect(hp); hp.connect(cg); cg.connect(m); n2.start();

        this.ok = true;
      } catch (e) { this.ctx = null; }
    },
    resume: function () {
      try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) {}
    },
    set: function (speed, eat, flow) {
      if (!this.ok) return;
      try {
        var t = this.ctx.currentTime;
        this.engineGain.gain.setTargetAtTime(0.10 + speed * 0.0016, t, 0.1);
        this.engineOsc.frequency.setTargetAtTime(50 + speed * 0.35, t, 0.15);
        this.augerGain.gain.setTargetAtTime(Math.min(0.4, eat * 0.00005), t, 0.08);
        this.chuteGain.gain.setTargetAtTime(Math.min(0.22, flow * 0.00003), t, 0.1);
      } catch (e) {}
    },
    tone: function (freq, dur, delay, type, vol) {
      if (!this.ok) return;
      try {
        var c = this.ctx, t = c.currentTime + (delay || 0);
        var o = c.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) {}
    },
    horn: function () { this.tone(620, 0.16, 0, 'square', 0.14); this.tone(495, 0.24, 0.18, 'square', 0.14); },
    chime: function () {
      var ns = [523, 659, 784, 1047];
      for (var i = 0; i < ns.length; i++) this.tone(ns[i], 0.34, i * 0.16, 'sine', 0.18);
    }
  };

  // ---------------------------------------------------------------- input
  var activePointer = null;

  function pointerToAim(px) {
    var plowSX = W2SX(S.plow.x, 1);
    var off = (px - plowSX) / cam.zoom;
    return clamp(off, AIM_MIN, AIM_MAX);
  }

  function onDown(px, py) {
    sfx.init(); sfx.resume();
    S.pointerX = px; S.pointerY = py;
    if (S.mode === 'title') {
      S.mode = 'play';
      S.camMode = 'follow';
      S.touching = true;
      return;
    }
    if (S.mode === 'finish') {
      // リプレイボタン (画面下中央の円)
      var bx = W / 2, by = H - Math.min(H * 0.16, 130), r = 62;
      if (S.finishT > 1 && (px - bx) * (px - bx) + (py - by) * (py - by) < r * r * 2.2) {
        resetGame(false);
        return;
      }
      return;
    }
    S.touching = true;
    S.idleT = 0;
    S.aimOff = lerp(S.aimOff, pointerToAim(px), 0.5);
  }
  function onMove(px, py) {
    S.pointerX = px; S.pointerY = py;
    if (S.touching && S.mode === 'play') {
      S.aimOff = pointerToAim(px);
      S.idleT = 0;
    }
  }
  function onUp() {
    S.touching = false;
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (activePointer === null) {
      activePointer = e.pointerId;
      onDown(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId === activePointer) { e.preventDefault(); onMove(e.clientX, e.clientY); }
  });
  function endPointer(e) {
    if (e.pointerId === activePointer) { activePointer = null; onUp(); }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // ---------------------------------------------------------------- update
  function chuteBase() {
    return { x: S.plow.x - 84, y: BASE_Y - 136 };
  }
  function chuteTip() {
    var b = chuteBase();
    var a = S.plow.chuteA;
    return { x: b.x + Math.sin(a) * 88, y: b.y - 10 - Math.cos(a) * 88, a: a };
  }
  function bedInfo() {
    var t = S.truck;
    return { cx: t.x - 46 * t.flip, halfW: 70, topY: BASE_Y - 120 };
  }

  function spawnFlow(counting) {
    var tip = chuteTip();
    var bed = bedInfo();
    var aimX = S.plow.x + S.aimOff;
    // やさしい吸着: ダンプ近くを狙っていたら荷台へ寄せる
    var landY = BASE_Y - 12;
    if (S.truck.state === 'follow' && Math.abs(aimX - bed.cx) < 135) {
      aimX = lerp(aimX, bed.cx, 0.8);
      landY = bed.topY;
    }
    var dx = aimX - tip.x;
    var T = clamp(0.75 + Math.abs(dx) / 620, 0.75, 1.3);
    var dy = landY - tip.y;
    var vx = dx / T;
    var vy = (dy - 0.5 * G * T * T) / T;
    var jx = (rng() - 0.5) * 60, jy = (rng() - 0.5) * 70;
    flows.push({
      x: tip.x + (rng() - 0.5) * 8, y: tip.y + (rng() - 0.5) * 8,
      vx: vx + jx, vy: vy + jy,
      r: counting ? 5 + rng() * 6 : 2.5 + rng() * 3.5,
      count: counting, life: 2.2
    });
  }

  function landFlow(p) {
    var bed = bedInfo();
    var t = S.truck;
    if (t.state === 'follow' && p.y > bed.topY - 6 && Math.abs(p.x - bed.cx) < bed.halfW) {
      if (p.count) {
        t.load = Math.min(TRUCK_CAP, t.load + 1);
        t.bounce = 1;
        if (t.load >= TRUCK_CAP) truckFull();
      }
      poofs.push({ x: p.x, y: bed.topY - 10 - (t.load / TRUCK_CAP) * 44, r: 4 + rng() * 5, life: 0.35, t: 0 });
      return;
    }
    // 地面 or 雪壁の上
    var ci = clamp((p.x / COL_W) | 0, 0, NCOL - 1);
    if (snowH[ci] > 6) {
      poofs.push({ x: p.x, y: ROAD_Y + 40 - snowH[ci], r: 4 + rng() * 4, life: 0.3, t: 0 });
      return;
    }
    if (p.count) {
      var pi = clamp((p.x / PILE_W) | 0, 0, NPILE - 1);
      pileH[pi] = Math.min(64, pileH[pi] + 3.2);
    }
    poofs.push({ x: p.x, y: BASE_Y - 6, r: 5 + rng() * 5, life: 0.35, t: 0 });
  }

  function truckFull() {
    var t = S.truck;
    t.state = 'leave';
    t.honkT = 0.01;
    S.truckCount++;
    S.nextTruckT = 2.2;
    sfx.horn();
    // ちょい寄りカメラ
    if (S.camMode === 'follow') {
      S.camMode = 'closeup'; S.closeupTruck = true; S.closeupTimer = 1.6;
    }
  }

  function update(dt) {
    S.t += dt;
    var p = S.plow;

    // デモ入力
    if (DEMO) {
      if (S.mode === 'title' && S.t > 0.4) { S.mode = 'play'; S.camMode = 'follow'; S.touching = true; }
      if (S.mode === 'play') {
        S.touching = true;
        S.aimOff = Q.aim !== undefined ? parseFloat(Q.aim) : (-285 + Math.sin(S.t * 0.45) * 70);
      }
    }

    // ---- カメラモード遷移
    if (S.closeupTimer > 0) {
      S.closeupTimer -= dt;
      if (S.closeupTimer <= 0 && S.camMode === 'closeup') {
        S.camMode = S.mode === 'finish' ? 'finish' : 'follow';
        S.closeupTruck = false;
      }
    }

    if (S.mode === 'play') {
      if (!S.touching) S.idleT += dt; else S.idleT = 0;

      // ---- 前進と食い込み
      var faceX = p.x + 4;
      var fi = clamp((faceX / COL_W) | 0, 0, NCOL - 1);
      var hFace = Math.max(snowH[fi], snowH[Math.min(fi + 1, NCOL - 1)], snowH[Math.min(fi + 2, NCOL - 1)]);
      var targetSpeed = 0;
      if (S.touching) targetSpeed = clamp(118 - hFace * 0.34, 48, 100);
      p.speed = lerp(p.speed, targetSpeed, 1 - Math.exp(-dt * 4));
      p.x += p.speed * dt;
      p.trackPhase += p.speed * dt * 0.06;

      // 食べる
      var eaten = 0;
      if (S.touching) {
        var weights = [1, 0.95, 0.7, 0.4, 0.15];
        for (var k = 0; k < weights.length; k++) {
          var ci = fi + k;
          if (ci >= NCOL) break;
          if (snowH[ci] > 0) {
            var bite = Math.min(snowH[ci], dt * 1200 * weights[k]);
            snowH[ci] -= bite;
            eaten += bite * COL_W;
          }
        }
      }
      p.eatRate = eaten / Math.max(dt, 1e-4);
      p.eatSm = lerp(p.eatSm, p.eatRate, 1 - Math.exp(-dt * 5));
      updateFrontier();

      if (p.eatRate > 2000) {
        S.shake = Math.min(2.6, S.shake + dt * 24);
        // 吸い込まれる塊
        var nCh = FAST ? 1 : 3;
        for (var c = 0; c < nCh; c++) {
          if (rng() < dt * 60) {
            var hh = snowH[fi] + 10 + rng() * 60;
            chunks.push({
              x: faceX + 8 + rng() * 26,
              y: ROAD_Y + 40 - Math.min(hh, hFace),
              t: 0, life: 0.4 + rng() * 0.2,
              seed: rng() * 7
            });
          }
        }
      }

      // オーガ回転
      p.augerRot += dt * (2.2 + (S.touching ? 9 : 0) + p.eatSm * 0.0004);
      p.beacon += dt * 4.5;

      // シュート角
      var targetA = clamp(S.aimOff * 0.0042, -0.95, 0.75);
      p.chuteA = lerp(p.chuteA, targetA, 1 - Math.exp(-dt * 6));

      // ---- 投雪 (食べた量が0.35秒ほど遅れて吹き出す)
      var flow = p.eatSm;
      S.flowAcc += dt * flow / 260;
      S.mistAcc += dt * flow / 200;
      var maxCount = FAST ? 90 : 220;
      var maxMist = FAST ? 60 : 150;
      var nCount = 0, nMist = 0;
      for (var fj = 0; fj < flows.length; fj++) { if (flows[fj].count) nCount++; else nMist++; }
      while (S.flowAcc >= 1) {
        S.flowAcc -= 1;
        if (nCount < maxCount) { spawnFlow(true); S.flowTotal++; nCount++; }
      }
      while (S.mistAcc >= 1) {
        S.mistAcc -= 1;
        if (nMist < maxMist) { spawnFlow(false); nMist++; }
      }

      // 初回の投雪接写
      if (!S.closeupDone && S.flowTotal > 45) {
        S.closeupDone = true;
        S.camMode = 'closeup'; S.closeupTruck = false; S.closeupTimer = 3.4;
      }

      // ---- ダンプ
      var t = S.truck;
      if (t.state === 'follow') {
        var tx = p.x - 315;
        t.x += (tx - t.x) * Math.min(1, dt * 2.0);
        t.flip = 1;
      } else if (t.state === 'leave') {
        t.honkT += dt;
        if (t.honkT > 0.7) {
          t.flip = -1;
          t.vx = Math.min(0, t.vx) - dt * 260;
          t.x += t.vx * dt;
        } else {
          t.bounce = 1;
        }
        if (t.x < viewL(1) - 400) t.state = 'gone';
      }
      if (t.state === 'gone' || (t.state === 'leave' && t.honkT > 1.2)) {
        if (S.nextTruckT > 0) {
          S.nextTruckT -= dt;
          if (S.nextTruckT <= 0) {
            S.truck = newTruck(Math.max(viewL(1) - 320, p.x - 900));
          }
        }
      }
      t.bounce = Math.max(0, t.bounce - dt * 3);

      // ---- ゴール
      if (frontierX() >= GOAL_X - 20) {
        S.mode = 'finish';
        S.camMode = 'finish';
        S.finishT = 0;
        S.touching = false;
        sfx.chime();
      }
    } else if (S.mode === 'finish') {
      S.finishT += dt;
      // 惰性でちょっと進んで停止
      p.speed = lerp(p.speed, 0, 1 - Math.exp(-dt * 1.6));
      if (p.x < PLAZA_X + 120) p.x += Math.max(p.speed, 24) * dt * Math.max(0, 1 - S.finishT * 0.45);
      p.augerRot += dt * Math.max(0.4, 6 - S.finishT * 2);
      p.beacon += dt * 4.5;
      p.eatSm = lerp(p.eatSm, 0, dt * 3);
      // きらきら
      S.sparkT -= dt;
      if (S.sparkT <= 0 && sparkles.length < (FAST ? 20 : 80)) {
        S.sparkT = 0.05;
        sparkles.push({
          x: cam.cx + (rng() - 0.5) * W / cam.zoom * 0.9,
          y: HORIZON - 150 + rng() * 260,
          vy: 30 + rng() * 40, t: 0, life: 2.5 + rng() * 1.5, ph: rng() * 7
        });
      }
    } else if (S.mode === 'title') {
      p.augerRot += dt * 1.2;
      p.beacon += dt * 4.5;
    }

    // ---- パーティクル更新
    for (var i = flows.length - 1; i >= 0; i--) {
      var f = flows[i];
      f.vy += G * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      var landLimit = BASE_Y - 6;
      if ((f.vy > 0 && f.y >= landLimit - 90 && hitSomething(f)) || f.life <= 0) {
        flows.splice(i, 1);
      }
    }
    for (i = chunks.length - 1; i >= 0; i--) {
      var ch = chunks[i];
      ch.t += dt;
      if (ch.t > ch.life) chunks.splice(i, 1);
    }
    for (i = poofs.length - 1; i >= 0; i--) {
      poofs[i].t += dt;
      if (poofs[i].t > poofs[i].life) poofs.splice(i, 1);
    }
    for (i = sparkles.length - 1; i >= 0; i--) {
      var sp = sparkles[i];
      sp.t += dt; sp.y += sp.vy * dt;
      if (sp.t > sp.life) sparkles.splice(i, 1);
    }
    // 落ちた雪の山はゆっくり落ち着く
    if ((S.t * 60 | 0) % 3 === 0) {
      for (i = 0; i < NPILE; i++) if (pileH[i] > 0) pileH[i] *= 0.9993;
    }

    updateCamera(dt);
    sfx.set(S.plow.speed, S.plow.eatSm ? S.plow.eatRate : 0, S.plow.eatSm);
    if (Q.dbg) {
      document.title = S.mode + ' cam=' + S.camMode + ' fr=' + (frontierX() | 0) +
        ' trucks=' + S.truckCount + ' load=' + S.truck.load + ' flow=' + S.flowTotal + ' eatSm=' + (S.plow.eatSm | 0) + ' nfl=' + flows.length + ' aim=' + (S.aimOff | 0) + ' spd=' + (S.plow.speed | 0);
    }
  }

  function hitSomething(f) {
    var bed = bedInfo();
    var t = S.truck;
    if (t.state === 'follow' && f.vy > 0 &&
        f.y > bed.topY - 8 && f.y < bed.topY + 40 &&
        Math.abs(f.x - bed.cx) < bed.halfW) {
      landFlow(f); return true;
    }
    var ci = clamp((f.x / COL_W) | 0, 0, NCOL - 1);
    var groundY = snowH[ci] > 6 ? (ROAD_Y + 40 - snowH[ci]) : (BASE_Y - 8);
    if (f.y >= groundY) { landFlow(f); return true; }
    return false;
  }

  // ---------------------------------------------------------------- draw helpers
  function rr(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hash1(n) {
    var s = Math.sin(n * 127.1 + SEED * 0.001) * 43758.545;
    return s - Math.floor(s);
  }

  // ---------------------------------------------------------------- draw layers
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3d5683');
    g.addColorStop(0.45, '#7d97bd');
    g.addColorStop(0.72, '#c9d4e6');
    g.addColorStop(0.85, '#f0dcc8');
    g.addColorStop(1, '#e8dcd2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 淡い夕日のグロー
    var gx = W * 0.68, gy = H * 0.42;
    var rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, H * 0.5);
    rg.addColorStop(0, 'rgba(255,225,190,0.5)');
    rg.addColorStop(1, 'rgba(255,225,190,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFlakes(list, speed, size, alpha) {
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var yy = (f.y + S.t * speed * f.s * 0.05) % 1;
      var xx = (f.x + Math.sin(S.t * 0.6 + f.ph) * 0.012 - S.t * 0.004 * f.s) % 1;
      if (xx < 0) xx += 1;
      ctx.beginPath();
      ctx.arc(xx * W, yy * H, size * f.s, 0, 6.284);
      ctx.fill();
    }
  }

  function drawMountains() {
    var lists = [
      { arr: mountainsFar, p: 0.12, c: '#aebdd9', snow: '#dbe4f2' },
      { arr: mountainsMid, p: 0.22, c: '#9aabc9', snow: '#d2ddef' }
    ];
    for (var li = 0; li < lists.length; li++) {
      var L = lists[li];
      var baseY = W2SY(HORIZON + 10, L.p);
      for (var i = 0; i < L.arr.length; i++) {
        var m = L.arr[i];
        var x0 = W2SX(m.x, L.p), x1 = W2SX(m.x + m.w, L.p);
        if (x1 < -50 || x0 > W + 50) continue;
        var peakX = (x0 + x1) / 2;
        var peakY = baseY - m.h * cam.zoom * (0.55 + 0.45 * L.p);
        ctx.fillStyle = L.c;
        ctx.beginPath();
        ctx.moveTo(x0, baseY);
        ctx.quadraticCurveTo(peakX, peakY, x1, baseY);
        ctx.fill();
        // 冠雪
        ctx.fillStyle = L.snow;
        ctx.beginPath();
        var st = 0.28;
        var ax = lerp(x0, peakX, 1 - st), bx = lerp(x1, peakX, 1 - st);
        var ay = quadY(x0, baseY, peakX, peakY, x1, 1 - st * 0.9);
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(peakX, peakY, bx, ay);
        ctx.quadraticCurveTo(peakX, ay + 6, ax, ay);
        ctx.fill();
      }
    }
    // うっすら空気感 (1回だけ)
    var hazeY = W2SY(HORIZON + 10, 0.22);
    ctx.fillStyle = 'rgba(190,205,228,0.28)';
    ctx.fillRect(0, hazeY - 1, W, H - hazeY + 1);
  }
  function quadY(x0, y0, cx, cy, x1, t) {
    var a = lerp(y0, cy, t), b = lerp(cy, y0, t);
    return lerp(a, b, t);
  }

  function drawHouses() {
    var P = 0.5;
    var l = viewL(P), r = viewR(P);
    var baseY = W2SY(ROAD_Y - 4, P);
    for (var i = 0; i < houses.length; i++) {
      var hse = houses[i];
      if (hse.x + hse.w < l || hse.x > r) continue;
      var x = W2SX(hse.x, P);
      var z = cam.zoom * (0.55 + 0.45 * P);
      var w = hse.w * z, hh = hse.h * z, roofH = hse.roofH * z;
      var y = baseY - hh;

      // 本体
      ctx.fillStyle = hse.body;
      ctx.fillRect(x, y, w, hh);
      ctx.fillStyle = hse.dark;
      ctx.fillRect(x, y, w, hh * 0.12);

      // 窓 (あったかい灯り)
      var winN = hse.win;
      for (var wi = 0; wi < winN; wi++) {
        var wxp = x + w * (0.22 + wi * 0.4);
        var wyp = y + hh * 0.34;
        var ws = Math.max(6, w * 0.2);
        var glow = ctx.createRadialGradient(wxp + ws / 2, wyp + ws / 2, 1, wxp + ws / 2, wyp + ws / 2, ws * 1.7);
        glow.addColorStop(0, 'rgba(255,190,90,0.55)');
        glow.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(wxp - ws, wyp - ws, ws * 3, ws * 3);
        ctx.fillStyle = '#ffcf7d';
        rr(wxp, wyp, ws, ws * 1.05, 2 * z); ctx.fill();
        ctx.strokeStyle = 'rgba(90,60,30,0.55)';
        ctx.lineWidth = Math.max(1, 1.4 * z);
        ctx.beginPath();
        ctx.moveTo(wxp + ws / 2, wyp); ctx.lineTo(wxp + ws / 2, wyp + ws * 1.05);
        ctx.stroke();
      }
      // ドア
      ctx.fillStyle = hse.dark;
      rr(x + w * 0.68, baseY - hh * 0.42, w * 0.16, hh * 0.42, 3 * z); ctx.fill();

      // 屋根 + 分厚い屋根雪
      var rx0 = x - w * 0.09, rx1 = x + w * 1.09, rpx = x + w / 2;
      var rpy = y - roofH;
      ctx.fillStyle = '#5d6675';
      ctx.beginPath();
      ctx.moveTo(rx0, y + 2); ctx.lineTo(rpx, rpy); ctx.lineTo(rx1, y + 2);
      ctx.closePath(); ctx.fill();
      // 屋根雪 (もこもこ・軒からはみ出す)
      var sn = 10 * z + hh * 0.10;
      ctx.fillStyle = '#f7faff';
      ctx.beginPath();
      ctx.moveTo(rx0 - 4 * z, y + 3);
      ctx.quadraticCurveTo(rx0 - 8 * z, y - sn * 0.8, rx0 + w * 0.16, lerp(y, rpy, 0.32) - sn * 0.5);
      ctx.quadraticCurveTo(rpx - w * 0.18, lerp(y, rpy, 0.8) - sn * 0.4, rpx, rpy - sn);
      ctx.quadraticCurveTo(rpx + w * 0.18, lerp(y, rpy, 0.8) - sn * 0.4, rx1 - w * 0.16, lerp(y, rpy, 0.32) - sn * 0.5);
      ctx.quadraticCurveTo(rx1 + 8 * z, y - sn * 0.8, rx1 + 4 * z, y + 3);
      ctx.quadraticCurveTo(rx1 - w * 0.2, y - sn * 0.28, rpx, y - roofH * 0.5 - sn * 0.2);
      ctx.quadraticCurveTo(rx0 + w * 0.2, y - sn * 0.28, rx0 - 4 * z, y + 3);
      ctx.fill();
      // 屋根雪の青い影
      ctx.fillStyle = 'rgba(160,185,225,0.35)';
      ctx.beginPath();
      ctx.moveTo(rx0 - 2 * z, y + 2);
      ctx.quadraticCurveTo(rpx, y - roofH * 0.4, rx1 + 2 * z, y + 2);
      ctx.quadraticCurveTo(rpx, y - roofH * 0.18, rx0 - 2 * z, y + 2);
      ctx.fill();
      // つらら
      ctx.fillStyle = 'rgba(220,235,255,0.85)';
      for (var ic = 0; ic < 4; ic++) {
        var ix = lerp(rx0, rx1, 0.15 + ic * 0.23) + hash1(i * 10 + ic) * 6 * z;
        var il = (5 + hash1(i * 31 + ic) * 10) * z;
        ctx.beginPath();
        ctx.moveTo(ix - 2 * z, y + 2);
        ctx.lineTo(ix + 2 * z, y + 2);
        ctx.lineTo(ix, y + 2 + il);
        ctx.closePath(); ctx.fill();
      }
      // 煙突とけむり
      if (hse.chimney) {
        var chx = x + w * 0.72, chw = w * 0.1;
        ctx.fillStyle = '#7a6a5f';
        ctx.fillRect(chx, rpy + roofH * 0.25 - 14 * z, chw, 20 * z);
        ctx.fillStyle = '#fff';
        ctx.fillRect(chx - 1.5 * z, rpy + roofH * 0.25 - 17 * z, chw + 3 * z, 5 * z);
        ctx.fillStyle = 'rgba(240,240,245,0.5)';
        for (var sm = 0; sm < 3; sm++) {
          var st2 = (S.t * 0.35 + hse.smokeSeed + sm * 0.33) % 1;
          var smx = chx + chw / 2 + Math.sin((st2 * 4 + sm) * 2) * 8 * z;
          var smy = rpy + roofH * 0.25 - 18 * z - st2 * 46 * z;
          ctx.globalAlpha = (1 - st2) * 0.45;
          ctx.beginPath();
          ctx.arc(smx, smy, (4 + st2 * 9) * z, 0, 6.284);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // 木
      if (hse.tree) {
        var tx = x + w + 40 * z;
        drawSnowTree(tx, baseY, 46 * z);
      }
    }
  }

  function drawSnowTree(x, baseY, s) {
    ctx.fillStyle = '#6b5744';
    ctx.fillRect(x - s * 0.06, baseY - s * 0.3, s * 0.12, s * 0.3);
    for (var t = 0; t < 3; t++) {
      var ty = baseY - s * 0.25 - t * s * 0.32;
      var tw = s * (0.55 - t * 0.13);
      ctx.fillStyle = '#4c6b57';
      ctx.beginPath();
      ctx.moveTo(x - tw, ty); ctx.lineTo(x + tw, ty); ctx.lineTo(x, ty - s * 0.42);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4f8ff';
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.8, ty - s * 0.1);
      ctx.quadraticCurveTo(x, ty - s * 0.34, x + tw * 0.8, ty - s * 0.1);
      ctx.quadraticCurveTo(x, ty - s * 0.02, x - tw * 0.8, ty - s * 0.1);
      ctx.fill();
    }
  }

  function drawPowerPoles() {
    var P = 0.62;
    var l = viewL(P), r = viewR(P);
    var baseY = W2SY(ROAD_Y - 2, P);
    ctx.lineCap = 'round';
    var prev = null;
    for (var i = 0; i < powerPoles.length; i++) {
      var pp = powerPoles[i];
      if (pp.x < l - 700 || pp.x > r + 700) { prev = null; continue; }
      var x = W2SX(pp.x, P);
      var z = cam.zoom * (0.55 + 0.45 * P);
      var topY = baseY - pp.h * z;
      ctx.strokeStyle = '#4a4440';
      ctx.lineWidth = Math.max(1.5, 4 * z);
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, topY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 16 * z, topY + 10 * z); ctx.lineTo(x + 16 * z, topY + 10 * z); ctx.stroke();
      // 雪の帽子
      ctx.strokeStyle = '#f4f8ff';
      ctx.lineWidth = Math.max(1.2, 3.4 * z);
      ctx.beginPath(); ctx.moveTo(x - 16 * z, topY + 8 * z); ctx.lineTo(x + 16 * z, topY + 8 * z); ctx.stroke();
      // 電線 (たわみ + 上に雪)
      if (prev) {
        var px = W2SX(prev.x, P), ptY = baseY - prev.h * z;
        var mx = (px + x) / 2, my = Math.max(ptY, topY) + 26 * z;
        ctx.strokeStyle = 'rgba(60,55,52,0.75)';
        ctx.lineWidth = Math.max(1, 1.6 * z);
        ctx.beginPath(); ctx.moveTo(px, ptY + 10 * z);
        ctx.quadraticCurveTo(mx, my, x, topY + 10 * z); ctx.stroke();
        ctx.strokeStyle = 'rgba(250,252,255,0.8)';
        ctx.beginPath(); ctx.moveTo(px, ptY + 8.6 * z);
        ctx.quadraticCurveTo(mx, my - 1.4 * z, x, topY + 8.6 * z); ctx.stroke();
      }
      prev = pp;
    }
  }

  function bankTop(x, phases, base, amp) {
    return base -
      amp * (0.6 + 0.4 * Math.sin(x * 0.006 + phases[0])) -
      amp * 0.35 * Math.sin(x * 0.017 + phases[1]) -
      amp * 0.18 * Math.sin(x * 0.043 + phases[2]);
  }

  function drawBackBank() {
    var P = 0.88;
    var l = viewL(P), r = viewR(P);
    var z = cam.zoom * (0.55 + 0.45 * P);

    // 埋もれたガードレール (先に描いて上から雪を被せる)
    ctx.strokeStyle = '#c8cdd6';
    ctx.lineWidth = Math.max(2, 7 * z);
    ctx.lineCap = 'round';
    var gy = W2SY(ROAD_Y - 46, P);
    ctx.beginPath();
    ctx.moveTo(W2SX(l, P), gy);
    ctx.lineTo(W2SX(r, P), gy);
    ctx.stroke();
    ctx.fillStyle = '#9aa1ad';
    for (var gx = Math.floor(l / 90) * 90; gx < r; gx += 90) {
      var gsx = W2SX(gx, P);
      ctx.fillRect(gsx - 2.4 * z, gy, 4.8 * z, 44 * z);
    }

    // 雪の土手
    ctx.fillStyle = '#eef3fb';
    ctx.beginPath();
    var y0 = W2SY(ROAD_Y + 8, P);
    ctx.moveTo(W2SX(l, P), y0);
    for (var x = l; x <= r; x += 26) {
      var ty = bankTop(x, bankBackPhase, ROAD_Y - 30, 58);
      ctx.lineTo(W2SX(x, P), W2SY(ty, P));
    }
    ctx.lineTo(W2SX(r, P), y0);
    ctx.closePath();
    ctx.fill();
    // 土手の青い影
    var shg = ctx.createLinearGradient(0, W2SY(ROAD_Y - 90, P), 0, y0);
    shg.addColorStop(0, 'rgba(255,255,255,0)');
    shg.addColorStop(1, 'rgba(150,175,215,0.45)');
    ctx.fillStyle = shg;
    ctx.beginPath();
    ctx.moveTo(W2SX(l, P), y0);
    for (x = l; x <= r; x += 26) {
      ctx.lineTo(W2SX(x, P), W2SY(bankTop(x, bankBackPhase, ROAD_Y - 30, 58) + 8, P));
    }
    ctx.lineTo(W2SX(r, P), y0);
    ctx.closePath();
    ctx.fill();

    // スノーポール (赤白)
    for (var i = 0; i < polesBack.length; i++) {
      var sp = polesBack[i];
      if (sp.x < l || sp.x > r) continue;
      var sx2 = W2SX(sp.x, P);
      var byTop = W2SY(bankTop(sp.x, bankBackPhase, ROAD_Y - 30, 58), P);
      var ph = sp.h * z;
      var pw = Math.max(2.4, 5 * z);
      var bands = 6;
      for (var b = 0; b < bands; b++) {
        ctx.fillStyle = (b % 2 === 0) ? '#e8443a' : '#ffffff';
        ctx.fillRect(sx2 - pw / 2, byTop - ph + (b * ph / bands), pw, ph / bands + 0.5);
      }
      // 先端の反射材と雪
      ctx.fillStyle = '#ffb13d';
      ctx.beginPath(); ctx.arc(sx2, byTop - ph, pw * 0.9, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx2 - pw * 0.2, byTop - ph - pw * 0.7, pw * 0.7, 0, 6.284); ctx.fill();
    }
  }

  function drawRoad() {
    var l = Math.max(viewL(1), -100);
    var fr = frontierX();
    var revealR = Math.min(viewR(1), WORLD_END);
    var topY = W2SY(ROAD_Y, 1), botY = W2SY(ROAD_Y + ROAD_H, 1);
    var x0 = W2SX(l, 1);
    var x1 = W2SX(revealR, 1);

    // 濡れたアスファルト
    var g = ctx.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, '#333a45');
    g.addColorStop(0.35, '#272d37');
    g.addColorStop(0.75, '#3d4653');
    g.addColorStop(1, '#4a5361');
    ctx.fillStyle = g;
    ctx.fillRect(x0, topY, x1 - x0, botY - topY);

    // 空の映り込み (濡れ感)
    ctx.globalAlpha = 0.16;
    var sheen = ctx.createLinearGradient(0, topY, 0, botY);
    sheen.addColorStop(0, '#f0dcc8');
    sheen.addColorStop(0.5, '#8fa8c8');
    sheen.addColorStop(1, '#c9d4e6');
    ctx.fillStyle = sheen;
    for (var wx3 = Math.floor(l / 140) * 140; wx3 < revealR; wx3 += 140) {
      var ww = 60 + hash1(wx3) * 70;
      ctx.fillRect(W2SX(wx3 + hash1(wx3 * 3) * 60, 1), topY + 4 * cam.zoom, ww * cam.zoom, (ROAD_H - 10) * cam.zoom);
    }
    ctx.globalAlpha = 1;

    // フロンティア付近は濡れて真っ黒 (削りたて)
    var wetW = 260;
    var wg = ctx.createLinearGradient(W2SX(fr - wetW, 1), 0, W2SX(fr + 10, 1), 0);
    wg.addColorStop(0, 'rgba(12,16,22,0)');
    wg.addColorStop(1, 'rgba(12,16,22,0.5)');
    ctx.fillStyle = wg;
    ctx.fillRect(W2SX(fr - wetW, 1), topY, wetW * cam.zoom + 10, botY - topY);

    // センターライン (除雪済み区間と広場)
    ctx.fillStyle = 'rgba(235,200,90,0.85)';
    var cy2 = W2SY(ROAD_Y + 48, 1);
    var dashW = 46, gap = 44;
    for (var dx2 = Math.floor(l / (dashW + gap)) * (dashW + gap); dx2 < revealR; dx2 += dashW + gap) {
      if (dx2 > fr - 30 && dx2 < PLAZA_X - 40) continue;
      ctx.fillRect(W2SX(dx2, 1), cy2 - 2.4 * cam.zoom, dashW * cam.zoom, 4.8 * cam.zoom);
    }
    // 端の白線
    ctx.fillStyle = 'rgba(230,235,242,0.5)';
    var eyT = W2SY(ROAD_Y + 8, 1);
    ctx.fillRect(x0, eyT, Math.min(W2SX(fr - 14, 1), x1) - x0, 3 * cam.zoom);

    // 轍 (クローラ跡と車輪跡)
    drawTracks(l, Math.min(fr - 8, revealR));

    // 広場のうっすら雪 (轍で磨かれた感じ)
    ctx.fillStyle = 'rgba(238,243,251,0.5)';
    for (var pz = Math.max(Math.floor(l / 80) * 80, PLAZA_X - 30); pz < revealR; pz += 80) {
      ctx.beginPath();
      ctx.ellipse(W2SX(pz + hash1(pz) * 50, 1), W2SY(ROAD_Y + 24 + hash1(pz * 3) * 56, 1),
        (34 + hash1(pz * 7) * 30) * cam.zoom, (7 + hash1(pz * 11) * 6) * cam.zoom, 0, 0, 6.284);
      ctx.fill();
    }

    // 路肩の削り残し雪すじ
    ctx.fillStyle = 'rgba(244,248,255,0.85)';
    for (var ex = Math.floor(l / 60) * 60; ex < Math.min(fr - 20, revealR); ex += 60) {
      var eh = 3 + hash1(ex * 7) * 5;
      ctx.beginPath();
      ctx.ellipse(W2SX(ex + hash1(ex) * 30, 1), W2SY(ROAD_Y + 5, 1), (26 + hash1(ex * 3) * 20) * cam.zoom, eh * cam.zoom, 0, 0, 6.284);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(W2SX(ex + hash1(ex * 5) * 30, 1), W2SY(ROAD_Y + ROAD_H - 4, 1), (30 + hash1(ex * 9) * 24) * cam.zoom, (eh + 2) * cam.zoom, 0, 0, 6.284);
      ctx.fill();
    }
  }

  function drawTracks(l, r) {
    if (r <= l) return;
    var z = cam.zoom;
    // クローラ跡 2本
    var offs = [26, 62];
    for (var oi = 0; oi < offs.length; oi++) {
      var ty = W2SY(ROAD_Y + offs[oi], 1);
      ctx.fillStyle = oi === 0 ? 'rgba(15,18,24,0.5)' : 'rgba(15,18,24,0.32)';
      ctx.fillRect(W2SX(l, 1), ty - 5 * z, (r - l) * z, 10 * z);
      // トレッドの刻み
      if (z > 0.45 && oi === 0) {
        ctx.fillStyle = 'rgba(200,210,225,0.10)';
        for (var tx2 = Math.floor(l / 22) * 22; tx2 < r; tx2 += 22) {
          ctx.fillRect(W2SX(tx2, 1), ty - 5 * z, 3 * z, 10 * z);
        }
      }
    }
  }

  function drawPiles() {
    var l = viewL(1), r = viewR(1);
    var i0 = clamp((l / PILE_W) | 0, 0, NPILE - 1);
    var i1 = clamp((r / PILE_W) | 0 + 1, 0, NPILE - 1);
    // なめらかなシルエットで描く (隣接セルを平均)
    var by = W2SY(BASE_Y + 6, 1);
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    var drawing = false;
    for (var i = i0; i <= i1 + 1; i++) {
      var hL = i > 0 ? pileH[i - 1] : 0;
      var hC = i <= i1 ? pileH[i] : 0;
      var hgt = (hL + hC) * 0.5 * 1.7;
      var x = W2SX(i * PILE_W, 1);
      var y = by - hgt * cam.zoom;
      if (hgt > 1.5) {
        if (!drawing) { ctx.moveTo(x - PILE_W * cam.zoom, by); drawing = true; }
        ctx.quadraticCurveTo(x - PILE_W * 0.5 * cam.zoom, y, x, y);
      } else if (drawing) {
        ctx.lineTo(x, by);
        drawing = false;
      }
    }
    if (drawing) ctx.lineTo(W2SX((i1 + 2) * PILE_W, 1), by);
    ctx.fill();
  }

  function drawWall() {
    var l = Math.max(viewL(1), 0);
    var r = Math.min(viewR(1), WORLD_END);
    var i0 = clamp((l / COL_W) | 0, 0, NCOL - 1);
    var i1 = clamp(Math.ceil(r / COL_W), 0, NCOL - 1);
    // 可視範囲に雪が無ければスキップ
    var any = false;
    for (var i = i0; i <= i1; i++) if (snowH[i] > 1) { any = true; break; }
    if (!any) return;

    var baseY = ROAD_Y + 42;              // 壁頂の基準
    var floorY = ROAD_Y + ROAD_H + 10;    // 道路帯の底まで完全に覆う

    // 本体 (雪がある連続区間ごとに、道路を埋めて描く)
    var topSY = W2SY(ROAD_Y - 300, 1), botSY = W2SY(floorY, 1);
    var g = ctx.createLinearGradient(0, topSY, 0, botSY);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#eaf1fb');
    g.addColorStop(1, '#c2d2ec');
    ctx.fillStyle = g;
    var runStart = -1;
    for (i = i0; i <= i1 + 1; i++) {
      var hasSnow = i <= i1 && snowH[i] > 1;
      if (hasSnow && runStart < 0) runStart = i;
      if (!hasSnow && runStart >= 0) {
        ctx.beginPath();
        ctx.moveTo(W2SX(runStart * COL_W - 2, 1), W2SY(floorY, 1));
        for (var ri = runStart; ri < i; ri++) {
          ctx.lineTo(W2SX(ri * COL_W, 1), W2SY(baseY - snowH[ri], 1));
        }
        ctx.lineTo(W2SX((i - 1) * COL_W + COL_W, 1), W2SY(baseY - snowH[i - 1], 1));
        ctx.lineTo(W2SX((i - 1) * COL_W + COL_W + 2, 1), W2SY(floorY, 1));
        ctx.closePath();
        ctx.fill();
        runStart = -1;
      }
    }

    // 上端のハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, 3 * cam.zoom);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var started = false;
    for (i = i0; i <= i1; i++) {
      if (snowH[i] > 3) {
        var px2 = W2SX(i * COL_W, 1), py2 = W2SY(baseY - snowH[i], 1);
        if (!started) { ctx.moveTo(px2, py2); started = true; }
        else ctx.lineTo(px2, py2);
      } else started = false;
    }
    ctx.stroke();

    // 切削面 (フロンティアの断面) — オーガが噛んだ凹み
    var fi = S.frontierI;
    if (fi > i0 - 2 && fi < i1 + 2 && snowH[Math.min(fi, NCOL - 1)] > 4) {
      var fx = fi * COL_W;
      var fh = snowH[Math.min(fi, NCOL - 1)];
      var cxs = W2SX(fx, 1);
      var cyTop = W2SY(baseY - fh, 1);
      var cyBot = W2SY(baseY + 20, 1);
      var grad = ctx.createLinearGradient(cxs, 0, cxs + 26 * cam.zoom, 0);
      grad.addColorStop(0, 'rgba(140,168,210,0.55)');
      grad.addColorStop(1, 'rgba(140,168,210,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cxs, cyTop);
      ctx.quadraticCurveTo(cxs + 34 * cam.zoom, (cyTop + cyBot) / 2, cxs, cyBot);
      ctx.lineTo(cxs + 30 * cam.zoom, cyBot);
      ctx.lineTo(cxs + 30 * cam.zoom, cyTop);
      ctx.closePath();
      ctx.fill();
      // 噛み跡のギザギザ
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, 2 * cam.zoom);
      ctx.beginPath();
      var teeth = 6;
      for (var tt = 0; tt <= teeth; tt++) {
        var ty2 = lerp(cyTop, cyBot, tt / teeth);
        var txo = (tt % 2 === 0 ? 0 : 7 * cam.zoom) + Math.sin(S.t * 22 + tt) * (S.plow.eatRate > 2000 ? 2.4 * cam.zoom : 0);
        if (tt === 0) ctx.moveTo(cxs + txo, ty2); else ctx.lineTo(cxs + txo, ty2);
      }
      ctx.stroke();
    }

    // きらきら
    if (cam.zoom > 0.35) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (i = i0; i <= i1; i += 3) {
        if (snowH[i] < 12) continue;
        var hsh = hash1(i * 13);
        var tw = Math.sin(S.t * 2.4 + hsh * 40);
        if (tw < 0.55) continue;
        var sxp = W2SX(i * COL_W + hsh * 8, 1);
        var syp = W2SY(baseY - snowH[i] * (0.25 + hsh * 0.7), 1);
        ctx.globalAlpha = (tw - 0.55) * 1.6;
        ctx.fillRect(sxp, syp, 2.4 * cam.zoom, 2.4 * cam.zoom);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPlaza() {
    // ゴール広場: 最初から見えている (雪壁の切れ目の先)
    var P = 1;
    if (PLAZA_X > viewR(P) + 200) return;
    var z = cam.zoom;

    // まちかどの街灯と旗
    var lampX = W2SX(PLAZA_X + 260, P);
    var lampBase = W2SY(ROAD_Y - 2, P);
    ctx.strokeStyle = '#3c4450';
    ctx.lineWidth = Math.max(2, 5 * z);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lampX, lampBase); ctx.lineTo(lampX, lampBase - 150 * z); ctx.stroke();
    var lg = ctx.createRadialGradient(lampX, lampBase - 156 * z, 2, lampX, lampBase - 156 * z, 46 * z);
    lg.addColorStop(0, 'rgba(255,214,140,0.95)');
    lg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lampX, lampBase - 156 * z, 46 * z, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#ffe9bb';
    ctx.beginPath(); ctx.arc(lampX, lampBase - 156 * z, 9 * z, 0, 6.284); ctx.fill();

    // ゆきだるま
    var smX = W2SX(PLAZA_X + 150, P), smB = W2SY(ROAD_Y - 4, P);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(smX, smB - 22 * z, 26 * z, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(smX, smB - 58 * z, 18 * z, 0, 6.284); ctx.fill();
    ctx.fillStyle = 'rgba(150,175,215,0.4)';
    ctx.beginPath(); ctx.arc(smX + 8 * z, smB - 16 * z, 18 * z, 0.4, 2.4); ctx.fill();
    // バケツ帽・顔
    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.moveTo(smX - 14 * z, smB - 70 * z); ctx.lineTo(smX + 14 * z, smB - 70 * z);
    ctx.lineTo(smX + 10 * z, smB - 86 * z); ctx.lineTo(smX - 10 * z, smB - 86 * z);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(smX - 6 * z, smB - 60 * z, 2.2 * z, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(smX + 6 * z, smB - 60 * z, 2.2 * z, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#f28c28';
    ctx.beginPath();
    ctx.moveTo(smX, smB - 56 * z); ctx.lineTo(smX + 12 * z, smB - 53 * z); ctx.lineTo(smX, smB - 51 * z);
    ctx.closePath(); ctx.fill();

    // 子どもたち (2人・手を振る)
    drawKid(W2SX(PLAZA_X + 90, P), W2SY(ROAD_Y - 2, P), z, '#e8443a', '#ffd23d', 0);
    drawKid(W2SX(PLAZA_X + 210, P), W2SY(ROAD_Y - 2, P), z, '#3a7de8', '#7ce085', 2.1);
  }

  function drawKid(x, baseY, z, coat, hat, phase) {
    var waveSpeed = S.mode === 'finish' ? 9 : 3.5;
    var arm = Math.sin(S.t * waveSpeed + phase) * 0.5 - 0.6;
    var s = z;
    // 体
    ctx.fillStyle = coat;
    rr(x - 11 * s, baseY - 40 * s, 22 * s, 32 * s, 8 * s); ctx.fill();
    // 足
    ctx.fillStyle = '#3c4450';
    ctx.fillRect(x - 8 * s, baseY - 10 * s, 6 * s, 10 * s);
    ctx.fillRect(x + 2 * s, baseY - 10 * s, 6 * s, 10 * s);
    // 頭
    ctx.fillStyle = '#ffe0c2';
    ctx.beginPath(); ctx.arc(x, baseY - 50 * s, 11 * s, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x - 4 * s, baseY - 51 * s, 1.6 * s, 0, 6.284); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4 * s, baseY - 51 * s, 1.6 * s, 0, 6.284); ctx.fill();
    ctx.strokeStyle = '#a5502c';
    ctx.lineWidth = Math.max(1, 1.6 * s);
    ctx.beginPath(); ctx.arc(x, baseY - 48 * s, 4.5 * s, 0.3, 2.84); ctx.stroke();
    // 帽子 + ぽんぽん
    ctx.fillStyle = hat;
    ctx.beginPath(); ctx.arc(x, baseY - 55 * s, 10.5 * s, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(x, baseY - 66 * s, 4 * s, 0, 6.284); ctx.fill();
    // 振る腕
    ctx.strokeStyle = coat;
    ctx.lineWidth = 6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 9 * s, baseY - 34 * s);
    ctx.lineTo(x + 9 * s + Math.cos(arm) * 17 * s, baseY - 34 * s + Math.sin(arm) * 17 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, baseY - 34 * s);
    ctx.lineTo(x - 15 * s, baseY - 24 * s);
    ctx.stroke();
  }

  function drawTruck() {
    var t = S.truck;
    if (t.state === 'gone') return;
    var z = cam.zoom;
    var x = W2SX(t.x, 1);
    if (x < -400 || x > W + 400) return;
    var baseY = W2SY(BASE_Y, 1) - t.bounce * 5 * z;
    var flip = t.flip;

    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(flip * z * 1.22, z * 1.22);

    // 荷台
    ctx.fillStyle = '#5f8f6e';
    rr(-102, -100, 128, 62, 6); ctx.fill();
    ctx.fillStyle = '#4a7357';
    ctx.fillRect(-102, -100, 128, 10);
    ctx.strokeStyle = '#3d5f48';
    ctx.lineWidth = 3;
    ctx.strokeRect(-96, -92, 116, 48);
    // 積もった雪
    if (t.load > 0) {
      var mh = 10 + (t.load / TRUCK_CAP) * 58;
      ctx.fillStyle = '#f7faff';
      ctx.beginPath();
      ctx.moveTo(-100, -98);
      ctx.quadraticCurveTo(-70, -98 - mh, -38, -100 - mh * 0.9);
      ctx.quadraticCurveTo(-6, -98 - mh * 0.8, 24, -98);
      ctx.closePath();
      ctx.fill();
    }
    // シャーシ
    ctx.fillStyle = '#39404c';
    ctx.fillRect(-104, -40, 178, 14);
    // キャブ
    ctx.fillStyle = '#4a90d9';
    rr(30, -86, 62, 60, 9); ctx.fill();
    ctx.fillStyle = '#bfe3ff';
    rr(44, -80, 40, 26, 5); ctx.fill();
    // 運転手さん
    ctx.fillStyle = '#ffe0c2';
    ctx.beginPath(); ctx.arc(58, -64, 8, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#e8443a';
    ctx.beginPath(); ctx.arc(58, -71, 7, Math.PI, 0); ctx.fill();
    // バンパー・ライト
    ctx.fillStyle = '#d5dae2';
    ctx.fillRect(84, -38, 12, 12);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(92, -46, 5, 0, 6.284); ctx.fill();
    // 満杯で去るときのハザード
    if (t.state === 'leave' && Math.sin(S.t * 14) > 0) {
      ctx.fillStyle = '#ffb13d';
      ctx.beginPath(); ctx.arc(-100, -46, 6, 0, 6.284); ctx.fill();
    }
    // タイヤ
    var wheels = [-80, -34, 58];
    for (var wi = 0; wi < wheels.length; wi++) {
      ctx.fillStyle = '#22262d';
      ctx.beginPath(); ctx.arc(wheels[wi], -14, 17, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#8b93a0';
      ctx.beginPath(); ctx.arc(wheels[wi], -14, 8, 0, 6.284); ctx.fill();
    }
    // 泥よけ
    ctx.fillStyle = '#2c313a';
    ctx.fillRect(-96, -34, 30, 6);
    ctx.restore();
  }

  function drawPlow() {
    var p = S.plow;
    var z = cam.zoom;
    var x = W2SX(p.x, 1);
    var baseY = W2SY(BASE_Y, 1);
    var bob = Math.sin(S.t * 9) * (p.speed > 5 ? 1.4 : 0.4) * z;

    ctx.save();
    ctx.translate(x, baseY + bob);
    ctx.scale(z, z);

    // ---------- クローラ
    ctx.fillStyle = '#2c313a';
    rr(-188, -34, 158, 36, 17); ctx.fill();
    ctx.fillStyle = '#454c58';
    for (var wi = 0; wi < 4; wi++) {
      ctx.beginPath(); ctx.arc(-166 + wi * 38, -16, 11, 0, 6.284); ctx.fill();
    }
    // トレッド模様 (回る)
    ctx.strokeStyle = '#565e6c';
    ctx.lineWidth = 3;
    var tp = (p.trackPhase % 1) * 18;
    for (var tk = -186 + tp; tk < -34; tk += 18) {
      ctx.beginPath(); ctx.moveTo(tk, -33); ctx.lineTo(tk + 4, -1); ctx.stroke();
    }

    // ---------- 車体
    ctx.fillStyle = '#f27b21';
    rr(-196, -108, 150, 78, 10); ctx.fill();
    ctx.fillStyle = '#d96a15';
    ctx.fillRect(-196, -52, 150, 12);
    // ルーバー
    ctx.strokeStyle = '#c25c10';
    ctx.lineWidth = 3;
    for (var lv = 0; lv < 3; lv++) {
      ctx.beginPath(); ctx.moveTo(-120 + lv * 16, -96); ctx.lineTo(-120 + lv * 16, -66); ctx.stroke();
    }

    // ---------- キャブ
    ctx.fillStyle = '#f28c28';
    rr(-186, -176, 92, 76, 9); ctx.fill();
    ctx.fillStyle = '#274156';
    rr(-178, -168, 76, 40, 6); ctx.fill();
    var wg2 = ctx.createLinearGradient(-178, -168, -102, -128);
    wg2.addColorStop(0, 'rgba(200,235,255,0.75)');
    wg2.addColorStop(0.55, 'rgba(140,190,230,0.4)');
    wg2.addColorStop(1, 'rgba(200,235,255,0.15)');
    ctx.fillStyle = wg2;
    rr(-178, -168, 76, 40, 6); ctx.fill();
    // 運転手さん (まるいシルエット + 手)
    ctx.fillStyle = '#35526b';
    ctx.beginPath(); ctx.arc(-128, -142, 12, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath(); ctx.arc(-128, -150, 11, Math.PI, 0); ctx.fill();

    // 屋根の雪
    ctx.fillStyle = '#f7faff';
    ctx.beginPath();
    ctx.moveTo(-188, -176);
    ctx.quadraticCurveTo(-140, -188, -92, -176);
    ctx.quadraticCurveTo(-140, -180, -188, -176);
    ctx.fill();

    // 回転灯
    var beaconOn = Math.sin(p.beacon) > 0;
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(-146, -186, 12, 8);
    ctx.fillStyle = beaconOn ? '#ffc93d' : '#c78e1e';
    rr(-149, -198, 18, 13, 5); ctx.fill();
    if (beaconOn) {
      var bg = ctx.createRadialGradient(-140, -192, 2, -140, -192, 42);
      bg.addColorStop(0, 'rgba(255,205,80,0.55)');
      bg.addColorStop(1, 'rgba(255,205,80,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(-140, -192, 42, 0, 6.284); ctx.fill();
    }

    // 排気筒
    ctx.fillStyle = '#3c4450';
    ctx.fillRect(-76, -140, 10, 34);
    ctx.fillStyle = 'rgba(200,205,215,0.35)';
    for (var ex2 = 0; ex2 < 3; ex2++) {
      var et = (S.t * 0.9 + ex2 * 0.33) % 1;
      ctx.globalAlpha = (1 - et) * 0.4 * Math.min(1, p.speed / 30 + 0.3);
      ctx.beginPath();
      ctx.arc(-71 + Math.sin(et * 9) * 4, -146 - et * 34, 4 + et * 8, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---------- オーガハウジング (フード)
    // 側面バレル
    var hg = ctx.createLinearGradient(0, -128, 0, 0);
    hg.addColorStop(0, '#f28c28');
    hg.addColorStop(1, '#d96a15');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(-52, -122);
    ctx.lineTo(-10, -122);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-52, -4);
    ctx.closePath();
    ctx.fill();

    // ---------- オーガ本体 (正面をこちらへ少し向けたチート表現)
    var acx = 0, acy = -62, arx = 34, ary = 58;
    // ドラム暗部
    ctx.fillStyle = '#3f2c14';
    ctx.beginPath(); ctx.ellipse(acx, acy, arx, ary, 0, 0, 6.284); ctx.fill();
    // スパイラル羽根 (2条)
    ctx.save();
    ctx.beginPath(); ctx.ellipse(acx, acy, arx - 3, ary - 3, 0, 0, 6.284); ctx.clip();
    for (var blade = 0; blade < 2; blade++) {
      ctx.strokeStyle = blade === 0 ? '#e8ebf2' : '#c3cbd8';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      var turns = 1.55;
      var steps = 26;
      for (var st3 = 0; st3 <= steps; st3++) {
        var q = st3 / steps;
        var ang = p.augerRot * (blade === 0 ? 1 : 1) + blade * Math.PI + q * turns * Math.PI * 2;
        var rad = q * 0.92;
        var px3 = acx + Math.cos(ang) * arx * rad;
        var py3 = acy + Math.sin(ang) * ary * rad;
        if (st3 === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
      }
      ctx.stroke();
    }
    // 回転の残像
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 5;
    for (var arc2 = 0; arc2 < 3; arc2++) {
      ctx.beginPath();
      ctx.ellipse(acx, acy, arx * (0.4 + arc2 * 0.24), ary * (0.4 + arc2 * 0.24), 0, p.augerRot * 1.4 + arc2, p.augerRot * 1.4 + arc2 + 1.9);
      ctx.stroke();
    }
    ctx.restore();
    // 中心コーン
    ctx.fillStyle = '#8b93a0';
    ctx.beginPath(); ctx.ellipse(acx, acy, 8, 11, 0, 0, 6.284); ctx.fill();
    // ハウジングリング
    ctx.strokeStyle = '#b9520c';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.ellipse(acx, acy, arx, ary, 0, 0, 6.284); ctx.stroke();
    ctx.strokeStyle = '#f5a04d';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(acx, acy, arx + 4, ary + 4, 0, 0, 6.284); ctx.stroke();

    // ヘッドライト
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(-56, -96, 7, 0, 6.284); ctx.fill();
    var hlg = ctx.createRadialGradient(-56, -96, 2, -56, -96, 30);
    hlg.addColorStop(0, 'rgba(255,230,150,0.4)');
    hlg.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = hlg;
    ctx.beginPath(); ctx.arc(-50, -96, 30, 0, 6.284); ctx.fill();

    // ---------- シュート (指で左右に動く)
    var a = p.chuteA;
    ctx.save();
    ctx.translate(-84, -136);
    // 基部 (回転台)
    ctx.fillStyle = '#c25c10';
    ctx.beginPath(); ctx.arc(0, 2, 17, 0, 6.284); ctx.fill();
    ctx.fillStyle = '#d96a15';
    rr(-15, -6, 30, 20, 6); ctx.fill();
    // 首
    ctx.rotate(a);
    var chuteGrad = ctx.createLinearGradient(-14, -84, 16, 0);
    chuteGrad.addColorStop(0, '#f7ab5c');
    chuteGrad.addColorStop(1, '#d96a15');
    ctx.fillStyle = chuteGrad;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.quadraticCurveTo(-17, -44, -11, -82);
    ctx.lineTo(14, -82);
    ctx.quadraticCurveTo(17, -40, 13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a34a08';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 縦のリブ
    ctx.strokeStyle = 'rgba(180,90,20,0.6)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -78); ctx.stroke();
    // デフレクタ (先端の曲がり) — 投げる向きへ倒す
    ctx.save();
    if (a < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#c25c10';
    ctx.beginPath();
    ctx.moveTo(-11, -82);
    ctx.quadraticCurveTo(4, -104, 27, -88);
    ctx.lineTo(20, -72);
    ctx.quadraticCurveTo(7, -84, 14, -82);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.restore();
  }

  function drawChunks() {
    // オーガへ吸い込まれる雪塊
    var p = S.plow;
    var z = cam.zoom;
    var acX = W2SX(p.x - 18, 1); // オーガ中心
    var acY = W2SY(BASE_Y - 62, 1);
    for (var i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var q = c.t / c.life;
      var ease = q * q;
      var cx3 = lerp(W2SX(c.x, 1), acX, ease);
      var cy3 = lerp(W2SY(c.y, 1), acY, ease);
      // 渦を巻きながら
      var ang = p.augerRot * 2 + c.seed;
      cx3 += Math.cos(ang) * 14 * (1 - q) * z;
      cy3 += Math.sin(ang) * 18 * (1 - q) * z;
      ctx.globalAlpha = 1 - ease * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx3, cy3, (4 + c.seed) * (1 - q * 0.5) * z, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 接触点の白い飛沫
    if (p.eatRate > 2000) {
      var fx = W2SX(p.x + 10, 1);
      var fi = clamp(((p.x + 6) / COL_W) | 0, 0, NCOL - 1);
      var fy = W2SY(ROAD_Y + 40 - snowH[fi] * 0.5, 1);
      var sg = ctx.createRadialGradient(fx, fy, 2, fx, fy, 46 * z);
      sg.addColorStop(0, 'rgba(255,255,255,0.85)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(fx, fy, 46 * z, 0, 6.284); ctx.fill();
    }
  }

  function drawFlow() {
    var p = S.plow;
    var z = cam.zoom;

    // 太い噴流バンド (ドバーッの主役)
    var flow = p.eatSm;
    if (flow > 900 && S.mode !== 'title') {
      var tip = chuteTip();
      var bed = bedInfo();
      var aimX = S.plow.x + S.aimOff;
      var landY = BASE_Y - 12;
      if (S.truck.state === 'follow' && Math.abs(aimX - bed.cx) < 135) {
        aimX = lerp(aimX, bed.cx, 0.8);
        landY = bed.topY;
      }
      var dx = aimX - tip.x;
      var T = clamp(0.75 + Math.abs(dx) / 620, 0.75, 1.3);
      var dy = landY - tip.y;
      var vx0 = dx / T;
      var vy0 = (dy - 0.5 * G * T * T) / T;
      var alpha = Math.min(0.55, (flow - 900) / 9000);
      var widthMax = Math.min(30, 8 + flow / 700);
      var N = 16;
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(235,244,255,' + alpha + ')' : 'rgba(255,255,255,' + (alpha * 0.9) + ')';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (var i = 0; i <= N; i++) {
          var tq = (i / N) * T;
          var wx4 = tip.x + vx0 * tq + Math.sin(S.t * 20 + i * 1.7) * (pass === 0 ? 6 : 2) * (i / N);
          var wy4 = tip.y + vy0 * tq + 0.5 * G * tq * tq;
          var sxq = W2SX(wx4, 1), syq = W2SY(wy4, 1);
          if (i === 0) ctx.moveTo(sxq, syq); else ctx.lineTo(sxq, syq);
        }
        ctx.lineWidth = (pass === 0 ? widthMax : widthMax * 0.45) * z;
        ctx.stroke();
      }
    }

    // 粒
    for (var j = 0; j < flows.length; j++) {
      var f = flows[j];
      var fsx = W2SX(f.x, 1), fsy = W2SY(f.y, 1);
      if (fsx < -60 || fsx > W + 60) continue;
      ctx.globalAlpha = f.count ? 0.95 : 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fsx, fsy, f.r * z, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 着地ふわっ
    for (j = 0; j < poofs.length; j++) {
      var po = poofs[j];
      var q = po.t / po.life;
      ctx.globalAlpha = (1 - q) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(W2SX(po.x, 1), W2SY(po.y, 1), (po.r + q * 14) * z, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFrontBank() {
    var P = 1.14;
    var l = viewL(P), r = viewR(P);
    var topBase = ROAD_Y + ROAD_H + 4;
    ctx.fillStyle = '#e7eefb';
    ctx.beginPath();
    ctx.moveTo(-20, H + 20);
    for (var x = l; x <= r; x += 30) {
      var ty = bankTop(x, bankFrontPhase, topBase, 26);
      ctx.lineTo(W2SX(x, P), W2SY(ty, P));
    }
    ctx.lineTo(W + 20, H + 20);
    ctx.closePath();
    ctx.fill();
    // 影
    var sg = ctx.createLinearGradient(0, W2SY(topBase, P), 0, H);
    sg.addColorStop(0, 'rgba(255,255,255,0.9)');
    sg.addColorStop(0.4, 'rgba(205,219,242,0.5)');
    sg.addColorStop(1, 'rgba(178,195,226,0.5)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-20, H + 20);
    for (x = l; x <= r; x += 30) {
      ctx.lineTo(W2SX(x, P), W2SY(bankTop(x, bankFrontPhase, topBase, 26) + 6, P));
    }
    ctx.lineTo(W + 20, H + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawSparkles() {
    for (var i = 0; i < sparkles.length; i++) {
      var sp = sparkles[i];
      var q = sp.t / sp.life;
      var tw = 0.5 + 0.5 * Math.sin(S.t * 8 + sp.ph);
      ctx.globalAlpha = (1 - q) * tw;
      ctx.fillStyle = i % 3 === 0 ? '#ffd76e' : '#ffffff';
      var x = W2SX(sp.x, 1), y = W2SY(sp.y, 1);
      var s = (2 + tw * 3) * Math.max(cam.zoom, 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s * 0.6, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(20,30,55,0)');
    g.addColorStop(1, 'rgba(20,30,55,0.17)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- UI (文字最小限)
  function drawUI() {
    var mins = Math.min(W, H);
    if (S.mode === 'title') {
      // ロゴ
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var fs = Math.min(W * 0.082, H * 0.12, 64);
      ctx.font = '800 ' + fs + 'px "Hiragino Maru Gothic ProN", "BIZ UDGothic", "Yu Gothic", sans-serif';
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = 'rgba(40,60,100,0.85)';
      ctx.lineJoin = 'round';
      var ty = H * 0.2;
      ctx.strokeText('じょせつしゃ ゴー！', W / 2, ty);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('じょせつしゃ ゴー！', W / 2, ty);
      ctx.fillStyle = '#ffd23d';
      ctx.font = '700 ' + fs * 0.38 + 'px "Hiragino Maru Gothic ProN", sans-serif';
      ctx.fillText('❄ ゆきを たべて みちを つくろう ❄', W / 2, ty + fs * 0.95);

      // タップ促し (脈打つ丸 + ▶)
      var pl = 1 + Math.sin(S.t * 3.2) * 0.08;
      var bx = W / 2, by = H * 0.62, br = mins * 0.085 * pl;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.284); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(bx, by, br * 1.35 + Math.sin(S.t * 3.2) * 6, 0, 6.284); ctx.stroke();
      ctx.fillStyle = '#f27b21';
      ctx.beginPath();
      ctx.moveTo(bx - br * 0.28, by - br * 0.42);
      ctx.lineTo(bx + br * 0.5, by);
      ctx.lineTo(bx - br * 0.28, by + br * 0.42);
      ctx.closePath(); ctx.fill();
    }

    if (S.mode === 'play' && S.idleT > 2.6) {
      // 指を動かすヒント: 白い丸が左右へ
      var hx = W / 2 + Math.sin(S.t * 2.2) * mins * 0.16;
      var hy = H * 0.82;
      ctx.globalAlpha = Math.min(1, (S.idleT - 2.6) * 2) * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(hx, hy, mins * 0.035, 0, 6.284); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = mins * 0.014;
      ctx.lineCap = 'round';
      // ← → シェブロン
      var chs = mins * 0.05;
      ctx.beginPath();
      ctx.moveTo(W / 2 - mins * 0.24 + chs, hy - chs * 0.7);
      ctx.lineTo(W / 2 - mins * 0.24, hy);
      ctx.lineTo(W / 2 - mins * 0.24 + chs, hy + chs * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2 + mins * 0.24 - chs, hy - chs * 0.7);
      ctx.lineTo(W / 2 + mins * 0.24, hy);
      ctx.lineTo(W / 2 + mins * 0.24 - chs, hy + chs * 0.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (S.mode === 'finish' && S.finishT > 1) {
      // リプレイ (円弧矢印)
      var pl2 = 1 + Math.sin(S.t * 3) * 0.06;
      var bx2 = W / 2, by2 = H - Math.min(H * 0.16, 130), br2 = 56 * pl2 * Math.min(1, mins / 500);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath(); ctx.arc(bx2, by2, br2, 0, 6.284); ctx.fill();
      ctx.strokeStyle = '#f27b21';
      ctx.lineWidth = br2 * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(bx2, by2, br2 * 0.52, -0.4, 4.2);
      ctx.stroke();
      // 矢じり
      var aa = -0.4;
      var ax2 = bx2 + Math.cos(aa) * br2 * 0.52, ay2 = by2 + Math.sin(aa) * br2 * 0.52;
      ctx.fillStyle = '#f27b21';
      ctx.beginPath();
      ctx.moveTo(ax2 + br2 * 0.3, ay2 - br2 * 0.12);
      ctx.lineTo(ax2 - br2 * 0.06, ay2 - br2 * 0.34);
      ctx.lineTo(ax2 - br2 * 0.02, ay2 + br2 * 0.16);
      ctx.closePath(); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky();
    drawFlakes(flakesFar, 26, 1.6, 0.5);
    drawMountains();
    drawHouses();
    drawPowerPoles();
    drawBackBank();
    drawRoad();
    drawPiles();
    drawPlaza();
    drawWall();
    drawTruck();
    drawChunks();
    drawPlow();
    drawFlow();
    drawSparkles();
    drawFrontBank();
    drawFlakes(flakesNear, 60, 2.6, 0.75);
    drawVignette();
    drawUI();
  }

  // ---------------------------------------------------------------- loop
  var lastT = 0;
  function frame(ts) {
    // 回転やUIバー変化でresizeイベントが落ちても追従する
    if (W !== window.innerWidth || H !== window.innerHeight) resize();
    var dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
    lastT = ts;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  genScenery();
  resetGame(!DEMO && PRESTEP === 0);

  if (PRESTEP > 0) {
    var steps = Math.round(PRESTEP * 120);
    for (var i = 0; i < steps; i++) update(1 / 120);
    render();
  }

  // テスト用フック (決定論的状態を公開)
  window.__game = {
    seed: SEED,
    get mode() { return S.mode; },
    get plowX() { return S.plow.x; },
    get frontier() { return frontierX(); },
    get cleared() { return clamp((frontierX() - WALL_START) / (GOAL_X - WALL_START), 0, 1); },
    get trucksFilled() { return S.truckCount; },
    get truckLoad() { return S.truck.load; },
    get flowTotal() { return S.flowTotal; },
    get camMode() { return S.camMode; },
    step: function (sec) {
      var n = Math.round(sec * 120);
      for (var i = 0; i < n; i++) update(1 / 120);
      render();
    },
    setTouch: function (on, screenX) {
      S.touching = !!on;
      if (S.mode === 'title' && on) { S.mode = 'play'; S.camMode = 'follow'; }
      if (screenX !== undefined) S.aimOff = pointerToAim(screenX);
    },
    setAim: function (off) { S.aimOff = clamp(off, AIM_MIN, AIM_MAX); }
  };

  requestAnimationFrame(frame);
})();
