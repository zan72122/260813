// シーン管理・入力・レイアウト・画面遷移
import { clamp, easeInOut, TAU, seedRandom } from './util.js';
import { sfx, unlock } from './audio.js';

export class Scene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.idle = 0;
    this.done = false;
  }
  enter() {}
  exit() {}
  update() {}
  draw() {}
  down() {}
  move() {}
  up() {}

  /** 迷っている時間（無操作）に応じて 0→1。次に触る物を揺らすために使う。 */
  get hint() { return clamp((this.idle - 1.8) / 0.7, 0, 1); }
  /** ゆらゆら量 */
  wobble(freq = 5.5, amp = 1) { return Math.sin(this.t * freq) * this.hint * amp; }
  poke() { this.idle = 0; }
  /** 次のシーンへ */
  next(name, delay = 0) {
    if (this.done) return;
    this.done = true;
    this.game.go(name, delay);
  }
}

const STEPS = ['soak', 'steam', 'spray', 'pack', 'ferment', 'finale', 'reveal'];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scenes = new Map();
    this.scene = null;
    this.sceneName = '';
    this.W = 0; this.H = 0; this.S = 0; this.portrait = true;
    this.dpr = 1;
    this.fast = false;
    this.time = 0;
    this.trans = null;          // { to, phase, t, delay }
    this.pointer = { x: 0, y: 0, down: false, id: null, dx: 0, dy: 0, sx: 0, sy: 0, moved: 0 };
    this.ripples = [];
    this.holdRestart = 0;
    this.showChrome = false;    // 進行ドット・リスタートは題名画面では出さない
    this._raf = null;
    this._last = 0;
    this.memory = {};           // シーン間で受け渡す情報
    this.perf = { frames: 0, totalMs: 0, slow: 0 };

    const params = new URLSearchParams(location.search);
    this.fast = params.get('fast') === '1' || params.get('e2e') === '1';
    const seed = params.get('seed');
    seedRandom(seed ? parseInt(seed, 10) : 20260814);
    this.quality = this.fast ? 0.55 : 1;

    this._bindEvents();
    this.resize();
  }

  register(name, factory) { this.scenes.set(name, factory); }

  /* -------------------------- レイアウト -------------------------- */
  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    // 高解像度端末では 2 で頭打ち（モバイルの塗り面積を抑える）
    const dpr = this.fast ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = w; this.H = h;
    this.S = Math.min(w, h);
    this.portrait = h >= w;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.scene && this.scene.layout) this.scene.layout(this.frame());
  }

  frame(dt = 0) {
    return {
      ctx: this.ctx, W: this.W, H: this.H, S: this.S,
      portrait: this.portrait, dt, time: this.time,
      fast: this.fast, quality: this.quality, game: this,
    };
  }

  /* --------------------------- 入力 --------------------------- */
  _bindEvents() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e) => {
      if (this.pointer.down) return;
      e.preventDefault();
      unlock();
      const p = pos(e);
      const pt = this.pointer;
      // 指が画面のふちを越えても離した扱いにしない（びよーんが途切れないように）
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      pt.down = true; pt.id = e.pointerId;
      pt.x = pt.sx = p.x; pt.y = pt.sy = p.y;
      pt.dx = pt.dy = 0; pt.moved = 0;
      this.ripples.push({ x: p.x, y: p.y, t: 0 });
      if (this.trans) return;
      if (this._restartHit(p.x, p.y)) { this.holdRestart = 0.0001; return; }
      this.scene?.poke();
      this.scene?.down(p, this.frame());
    };
    const move = (e) => {
      const pt = this.pointer;
      if (!pt.down || (pt.id !== null && e.pointerId !== pt.id)) return;
      e.preventDefault();
      const p = pos(e);
      pt.dx = p.x - pt.x; pt.dy = p.y - pt.y;
      pt.moved += Math.hypot(pt.dx, pt.dy);
      pt.x = p.x; pt.y = p.y;
      if (this.trans) return;
      if (this.holdRestart > 0) {
        if (Math.hypot(p.x - pt.sx, p.y - pt.sy) > this.S * 0.05) this.holdRestart = 0;
        return;
      }
      this.scene?.poke();
      this.scene?.move({ x: p.x, y: p.y, dx: pt.dx, dy: pt.dy }, this.frame());
    };
    const up = (e) => {
      const pt = this.pointer;
      if (!pt.down) return;
      if (pt.id !== null && e.pointerId !== undefined && e.pointerId !== pt.id) return;
      pt.down = false; pt.id = null;
      this.holdRestart = 0;
      if (this.trans) return;
      this.scene?.up({ x: pt.x, y: pt.y, moved: pt.moved }, this.frame());
    };

    c.addEventListener('pointerdown', down, { passive: false });
    c.addEventListener('pointermove', move, { passive: false });
    c.addEventListener('pointerup', up, { passive: false });
    c.addEventListener('pointercancel', up, { passive: false });
    // iOS のダブルタップズーム・ゴムバンドを抑止
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) sfx.steamOff();
      this._last = performance.now();
    });
  }

  /* ------------------------- シーン遷移 ------------------------- */
  go(name, delay = 0) {
    if (this.trans) return;
    this.trans = { to: name, phase: 'out', t: 0, delay };
  }

  _swap(name) {
    const factory = this.scenes.get(name);
    if (!factory) { console.warn('unknown scene', name); return; }
    if (this.scene) this.scene.exit(this.frame());
    sfx.steamOff();
    this.scene = new factory(this);
    this.sceneName = name;
    this.showChrome = STEPS.includes(name);
    const f = this.frame();
    if (this.scene.layout) this.scene.layout(f);
    this.scene.enter(f);
  }

  start(name) {
    this._swap(name);
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, 1 / 20);   // タブ復帰などの巨大 dt を潰す
      const t0 = performance.now();
      this.step(dt);
      this.render();
      // 描画コストの計測（フレーム間隔ではなく、自分の処理時間）
      this.perf.frames++;
      this.perf.totalMs += performance.now() - t0;
      if (performance.now() - t0 > 16) this.perf.slow++;
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** テストから論理時間だけ進めるためのフック */
  advance(seconds, stepSize = 1 / 60) {
    let left = seconds;
    while (left > 0) {
      const dt = Math.min(stepSize, left);
      this.step(dt);
      left -= dt;
    }
    this.render();
  }

  step(dt) {
    this.time += dt;
    const f = this.frame(dt);

    if (this.pointer.down && this.holdRestart > 0) {
      this.holdRestart += dt;
      if (this.holdRestart > 1.1) {
        this.holdRestart = 0;
        this.pointer.down = false;
        sfx.whoosh();
        this.go('title');
      }
    }

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 0.5) this.ripples.splice(i, 1);
    }

    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      if (tr.phase === 'out') {
        if (tr.t >= 0.3 + tr.delay) {
          this._swap(tr.to);
          tr.phase = 'in'; tr.t = 0;
          sfx.whoosh();
        }
      } else if (tr.t >= 0.34) {
        this.trans = null;
      }
    }

    if (this.scene) {
      this.scene.t += dt;
      this.scene.idle += dt;
      this.scene.update(dt, f);
    }
  }

  render() {
    const ctx = this.ctx;
    const f = this.frame(0);
    ctx.save();
    this.scene?.draw(f);
    ctx.restore();

    // タップの波紋（どこを触ったか常に見える＝幼児の安心感）
    for (const r of this.ripples) {
      const u = r.t / 0.5;
      ctx.globalAlpha = (1 - u) * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = this.S * 0.012 * (1 - u);
      ctx.beginPath();
      ctx.arc(r.x, r.y, this.S * (0.02 + u * 0.07), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (this.showChrome) {
      this._drawSteps(ctx);
      this._drawRestart(ctx);
    }

    if (this.trans) {
      const tr = this.trans;
      let a;
      if (tr.phase === 'out') a = easeInOut(clamp(tr.t / 0.3, 0, 1));
      else a = 1 - easeInOut(clamp(tr.t / 0.34, 0, 1));
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = '#fff3d6';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
  }

  /* 進行ドット：文字なしで「あと何回」を伝える */
  _drawSteps(ctx) {
    const idx = STEPS.indexOf(this.sceneName);
    if (idx < 0) return;
    const S = this.S;
    const r = S * 0.011;
    const gap = r * 3.4;
    const total = STEPS.length;
    const x0 = this.W / 2 - (gap * (total - 1)) / 2;
    const y = Math.max(S * 0.045, 18);
    ctx.save();
    for (let i = 0; i < total; i++) {
      const on = i <= idx;
      const cur = i === idx;
      ctx.globalAlpha = on ? 0.95 : 0.35;
      ctx.fillStyle = on ? (cur ? '#ff8f5e' : '#ffd08a') : '#ffffff';
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y, cur ? r * 1.7 : r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _restartRadius() { return this.S * 0.042; }
  _restartPos() {
    const r = this._restartRadius();
    return { x: this.W - r * 1.7, y: this.H - r * 1.7, r };
  }
  _restartHit(x, y) {
    if (!this.showChrome) return false;
    const p = this._restartPos();
    return Math.hypot(x - p.x, y - p.y) < p.r * 1.35;
  }
  _drawRestart(ctx) {
    const { x, y, r } = this._restartPos();
    const hold = clamp(this.holdRestart / 1.1, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.42 + hold * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // ぐるっと矢印
    ctx.strokeStyle = '#c98a52';
    ctx.lineWidth = r * 0.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, Math.PI * 0.35, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = '#c98a52';
    ctx.beginPath();
    ctx.moveTo(x + r * 0.5, y - r * 0.42);
    ctx.lineTo(x + r * 0.86, y - r * 0.1);
    ctx.lineTo(x + r * 0.2, y - r * 0.02);
    ctx.closePath(); ctx.fill();
    if (hold > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff8f5e';
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.86, -Math.PI / 2, -Math.PI / 2 + TAU * hold);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export { STEPS };
