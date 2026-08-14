// 固定エレベーション（正射影っぽい）カメラ。
// k = sin(仰角): 0 = 真横, 1 = 真上。hf = cos(仰角) = 高さの圧縮率。
import { clamp, damp } from './util.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.portrait = true;
    // カメラは「ワールド上のどの箱を必ず画面に収めるか」で指定する。
    // こうすると iPhone / iPad の縦横どちらでも自動で最適な大きさになる。
    // x,y = 箱の中心 / w,h = 箱の大きさ（ワールド単位） / k = 仰角 / anchor = 箱中心の画面上の縦位置
    this.cam = { x: 0, y: 40, w: 280, h: 140, k: 0.42, anchor: 0.5 };
    this.target = { ...this.cam };
    this.shake = 0;
    this._shx = 0;
    this._shy = 0;
    this.s = 1;
    this.cx = 0;
    this.cy = 0;
  }

  resize(fastMode) {
    const cap = fastMode ? 1 : 2;
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    let dpr = Math.min(window.devicePixelRatio || 1, cap);
    // 大画面（iPad Pro など）で塗り面積が増えすぎないよう上限を掛ける。
    const maxPixels = 2600000;
    if (w * h * dpr * dpr > maxPixels) {
      dpr = Math.max(1, Math.sqrt(maxPixels / (w * h)));
    }
    if (this.w === w && this.h === h && this.dpr === dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.portrait = h >= w;
    return true;
  }

  setTarget(t) {
    Object.assign(this.target, t);
  }

  snapToTarget() {
    Object.assign(this.cam, this.target);
  }

  update(dt) {
    const c = this.cam;
    const t = this.target;
    c.x = damp(c.x, t.x, 3.4, dt);
    c.y = damp(c.y, t.y, 3.4, dt);
    c.w = damp(c.w, t.w, 3.0, dt);
    c.h = damp(c.h, t.h, 3.0, dt);
    c.k = damp(c.k, t.k, 3.2, dt);
    c.anchor = damp(c.anchor, t.anchor, 3.2, dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const a = this.shake * this.shake * 9;
      this._shx = (Math.random() * 2 - 1) * a;
      this._shy = (Math.random() * 2 - 1) * a;
    } else {
      this._shx = this._shy = 0;
    }
    this.recompute();
  }

  recompute() {
    const c = this.cam;
    this.k = clamp(c.k, 0.06, 0.95);
    this.hf = Math.sqrt(Math.max(0.05, 1 - this.k * this.k));
    // 指の置き場所（縦なら下、横なら右）を残して、残りに収める。
    const hb = this.portrait ? 0.94 : 0.8;
    const vb = this.portrait ? 0.64 : 0.74;
    const sw = (this.w * hb) / Math.max(1, c.w);
    const sh = (this.h * vb) / Math.max(1, c.h * this.hf);
    this.s = Math.min(sw, sh);
    this.cx = this.w / 2 + this._shx;
    this.cy = this.h * c.anchor + this._shy;
  }

  // ワールド座標 -> 変換適用後のローカル座標
  X(wx) {
    return wx - this.cam.x;
  }
  Y(wy) {
    return (this.cam.y - wy) * this.hf;
  }
  // ワールド -> 画面(CSS px)
  toScreen(wx, wy) {
    return { x: this.cx + this.X(wx) * this.s, y: this.cy + this.Y(wy) * this.s };
  }
  // 画面(CSS px) -> ワールド
  toWorld(sx, sy) {
    return {
      x: (sx - this.cx) / this.s + this.cam.x,
      y: this.cam.y - (sy - this.cy) / this.s / this.hf,
    };
  }

  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  world() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.s, this.s);
    return ctx;
  }
}
