// 海苔シートのモデルと描画。
// 状態は正規化グリッド(0..1 x 0..1)で持つので、画面の向きが変わっても壊れない。
//
// 描画パイプライン:
//  1. 低解像度テクスチャ(56x42)に「量」と「濡れ」を書き込む
//  2. 拡大スムージングで、どろっとした輪郭に変える
//  3. 繊維テクスチャと艶を source-atop で内側にだけ乗せる
//  4. 横ストリップに切って台形/曲面へワープ転送する（平面 / 剥がし）
import { clamp, lerp, inv, smooth, makeNoise, rng, TAU } from './util.js';

export const COLS = 56;
export const ROWS = 42;
const SW = 448;   // スクラッチ解像度
const SH = 336;

const WET_RGB = [32, 50, 33];   // 濡れた海藻ペースト（黒緑）
const DRY_RGB = [11, 21, 15];   // 乾いた海苔（ほぼ黒）

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 繊維テクスチャ（初回一度だけ生成）
function makeFiber() {
  const c = mkCanvas(SW, SH);
  const x = c.getContext('2d');
  const r = rng(1234);
  for (let i = 0; i < 2600; i++) {
    const px = r() * SW, py = r() * SH;
    const len = 6 + r() * 26;
    const a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI * 0.5);
    const light = r() < 0.42;
    x.strokeStyle = light
      ? `rgba(126,158,120,${0.05 + r() * 0.13})`
      : `rgba(0,10,4,${0.05 + r() * 0.16})`;
    x.lineWidth = 0.6 + r() * 1.5;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(
      px + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6,
      py + Math.sin(a) * len * 0.5 + (r() - 0.5) * 6,
      px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
  return c;
}

export class Sheet {
  constructor() {
    this.fill = new Float32Array(COLS * ROWS);
    this.wet = new Float32Array(COLS * ROWS);
    this.press = new Float32Array(COLS * ROWS);
    this.mottle = new Float32Array(COLS * ROWS);
    this.dry = 0;
    this.shrink = 0;

    this.mottle2 = new Float32Array(COLS * ROWS);
    const n = makeNoise(99);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        this.mottle[y * COLS + x] = n.fbm(x * 0.14, y * 0.16, 3);
        this.mottle2[y * COLS + x] = n.fbm(x * 0.62 + 40, y * 0.66 + 17, 2);
      }
    }

    this.tex = mkCanvas(COLS, ROWS);
    this.texCtx = this.tex.getContext('2d');
    this.texData = this.texCtx.createImageData(COLS, ROWS);
    this.gloss = mkCanvas(COLS, ROWS);
    this.glossCtx = this.gloss.getContext('2d');
    this.glossData = this.glossCtx.createImageData(COLS, ROWS);

    this.sc = mkCanvas(SW, SH);
    this.scx = this.sc.getContext('2d');
    this.fiber = makeFiber();
    this.reset();
  }

  reset() {
    this.dirty = true;
    this.fill.fill(0);
    this.wet.fill(1);
    this.press.fill(0);
    this.dry = 0;
    this.shrink = 0;
  }

  idx(cx, cy) { return cy * COLS + cx; }

  // --- 操作 -------------------------------------------------------------
  // 流し込み: (u,v)中心のガウス状に量を足す
  pour(u, v, dt, rate = 2.6, rad = 0.16) {
    this.dirty = true;
    const cx = u * COLS, cy = v * ROWS;
    const R = rad * COLS;
    let added = 0;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(COLS - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R * ROWS / COLS)), y1 = Math.min(ROWS - 1, Math.ceil(cy + R * ROWS / COLS));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / (R * ROWS / COLS);
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const w = (1 - d2) * (1 - d2);
        const i = this.idx(x, y);
        const before = this.fill[i];
        this.fill[i] = Math.min(1.45, before + rate * dt * w);
        added += this.fill[i] - before;
      }
    }
    return added;
  }

  // 均し: 指の軌跡まわりを平らにしつつ、四角の縁まで満たす
  spread(u, v, dirx, diry, amount) {
    this.dirty = true;
    const cx = u * COLS, cy = v * ROWS;
    const R = 0.28 * COLS;
    const RY = R * ROWS / COLS;
    const k = clamp(amount, 0, 1);
    const src = this.fill;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(COLS - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - RY)), y1 = Math.min(ROWS - 1, Math.ceil(cy + RY));
    // 近傍平均（ならす）
    let sum = 0, cnt = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { sum += src[this.idx(x, y)]; cnt++; }
    const avg = cnt ? sum / cnt : 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / RY;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const w = smooth(1 - d2);
        const i = this.idx(x, y);
        // ならす + 四角を満たす（幼児向け: 必ず良くなる方向にしか動かない）
        const toAvg = lerp(src[i], Math.max(avg, 0.35), 0.55 * w * k);
        this.fill[i] = clamp(lerp(toAvg, 1.0, 0.5 * w * k), 0, 1.45);
        this.wet[i] = Math.max(0.55, this.wet[i] - 0.10 * w * k);
      }
    }
  }

  // 圧搾: 水を抜く。押した所だけ締まって艶が変わる
  pressAt(u, v, amount, rad = 0.3) {
    this.dirty = true;
    const cx = u * COLS, cy = v * ROWS;
    const R = rad * COLS, RY = R * ROWS / COLS;
    let squeezed = 0;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(COLS - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - RY)), y1 = Math.min(ROWS - 1, Math.ceil(cy + RY));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / R, dy = (y - cy) / RY;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const w = smooth(1 - d2);
        const i = this.idx(x, y);
        const b = this.wet[i];
        this.wet[i] = Math.max(0, b - amount * w);
        squeezed += b - this.wet[i];
        this.press[i] = Math.min(1, this.press[i] + amount * w * 1.6);
        if (this.fill[i] > 0.2) this.fill[i] = lerp(this.fill[i], 1.0, 0.25 * w * amount);
      }
    }
    return squeezed;
  }

  // ゆるい拡散。流し込んだ液が自分でじわっと広がる（液体らしさ + 詰み防止）
  relax(dt, k = 1) {
    this.dirty = true;
    const a = this.fill;
    if (!this._tmp) this._tmp = new Float32Array(a.length);
    const t = this._tmp;
    const m = clamp(k * dt, 0, 0.24);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        const l = a[i - (x > 0 ? 1 : 0)];
        const r = a[i + (x < COLS - 1 ? 1 : 0)];
        const u = a[i - (y > 0 ? COLS : 0)];
        const d = a[i + (y < ROWS - 1 ? COLS : 0)];
        t[i] = a[i] + m * ((l + r + u + d) * 0.25 - a[i]);
      }
    }
    a.set(t);
  }

  dryStep(amount) {
    this.dirty = true;
    this.dry = clamp(this.dry + amount, 0, 1);
    this.shrink = this.dry * 0.035;
    if (amount > 0) {
      for (let i = 0; i < this.wet.length; i++) this.wet[i] = Math.max(0, this.wet[i] - amount * 1.4);
    }
  }

  // --- 指標 -------------------------------------------------------------
  coverage() {
    let s = 0;
    for (let i = 0; i < this.fill.length; i++) s += clamp(this.fill[i], 0, 1);
    return s / this.fill.length;
  }

  evenness() {
    let good = 0;
    for (let i = 0; i < this.fill.length; i++) if (this.fill[i] > 0.72) good++;
    return good / this.fill.length;
  }

  avgWet() {
    let s = 0;
    for (let i = 0; i < this.wet.length; i++) s += this.wet[i];
    return s / this.wet.length;
  }

  // 一気に理想状態へ寄せる（工程クリア時の仕上げ）
  settle(t) {
    this.dirty = true;
    for (let i = 0; i < this.fill.length; i++) this.fill[i] = lerp(this.fill[i], 1, t);
  }

  // --- テクスチャ生成 ---------------------------------------------------
  buildTexture(force = false) {
    if (!this.dirty && !force) return;   // 変化がなければ作り直さない
    this.dirty = false;
    const d = this.texData.data;
    const gd = this.glossData.data;
    const dry = this.dry;
    for (let i = 0; i < COLS * ROWS; i++) {
      const f = this.fill[i];
      const m = this.mottle[i];
      const m2 = this.mottle2[i];
      const w = this.wet[i] * (1 - dry);
      // 縁を粒立たせる（どろっとした塊感）
      const a = smooth(inv(0.16, 0.40, f * (0.84 + m2 * 0.34)));
      const t = clamp(dry * 0.85 + (1 - this.wet[i]) * 0.35, 0, 1);
      const shade = 0.62 + m * 0.48 + (m2 - 0.5) * 0.18 - clamp(f - 1, 0, 0.45) * 0.28;
      const o = i * 4;
      d[o] = clamp(lerp(WET_RGB[0], DRY_RGB[0], t) * shade, 0, 255);
      d[o + 1] = clamp(lerp(WET_RGB[1], DRY_RGB[1], t) * shade, 0, 255);
      d[o + 2] = clamp(lerp(WET_RGB[2], DRY_RGB[2], t) * shade, 0, 255);
      d[o + 3] = a * 255;
      // 艶: 面全体を白くしない。狭いハイライト帯と、濡れた粒のきらめきだけ。
      const u = (i % COLS) / COLS, v = ((i / COLS) | 0) / ROWS;
      const band = Math.exp(-Math.pow((u * 0.72 + v * 0.62 - 0.44) / 0.28, 2));
      const spec = m2 > 0.72 ? (m2 - 0.72) * 1.6 : 0;
      const g = clamp(w * (0.03 + 0.23 * band * band * band + spec * 0.35) * (1 - this.press[i] * 0.6), 0, 1) * a;
      gd[o] = 158; gd[o + 1] = 196; gd[o + 2] = 166; gd[o + 3] = g * 255;
    }
    this.texCtx.putImageData(this.texData, 0, 0);
    this.glossCtx.putImageData(this.glossData, 0, 0);

    const x = this.scx;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, SW, SH);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(this.tex, 0, 0, SW, SH);
    // 繊維（乾くほどはっきり）
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = 0.48 + 0.45 * this.dry;
    x.drawImage(this.fiber, 0, 0);
    x.globalAlpha = 1;
    // 艶
    x.drawImage(this.gloss, 0, 0, SW, SH);
    x.globalCompositeOperation = 'source-over';
  }

  // --- 描画 -------------------------------------------------------------
  // q(u,v) -> {x,y} : 枠内の正規化座標をワールド座標へ
  // vTo: 0..1 この値までを平面として描く（剥がし中は剥離線まで）
  drawFlat(ctx, q, vFrom = 0, vTo = 1) {
    if (vTo <= vFrom) return;
    const N = 34;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < N; i++) {
      const v0 = lerp(vFrom, vTo, i / N);
      const v1 = lerp(vFrom, vTo, (i + 1) / N);
      const a = q(0, v0), b = q(1, v0), c = q(0, v1);
      const sy = v0 * SH, sh = Math.max(0.6, (v1 - v0) * SH);
      const dx = a.x, dw = b.x - a.x, dy = a.y, dh = c.y - a.y + 0.8;
      ctx.drawImage(this.sc, 0, sy, SW, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // 剥がし中のめくれた部分。
  // シートの「行」は枠のふちと平行なまま。曲げは行の縦方向の詰まりで表す。
  // （行を曲線に垂直に回すと、幅の広いリボンでは扇状に割れてしまう）
  drawRibbon(ctx, vFrom, vTo, curve, shadow = false) {
    const N = 30;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < N; i++) {
      const s0 = i / N, s1 = (i + 1) / N;
      const p0 = curve(s0), p1 = curve(s1);
      const seg = Math.abs(p1.y - p0.y) + 2.4;
      const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
      const ang = (p0.ang + p1.ang) * 0.5;
      const w = (p0.w + p1.w) / 2;
      const v0 = lerp(vFrom, vTo, s0), v1 = lerp(vFrom, vTo, s1);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      if (shadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(-w / 2, -seg / 2, w, seg);
      } else {
        const sy = v0 * SH, sh = Math.max(0.6, (v1 - v0) * SH);
        ctx.drawImage(this.sc, 0, sy, SW, sh, -w / 2, -seg / 2, w, seg);
        // 面の向きによる陰影（裏面はマットで少し明るい）
        const back = p0.face < 0;
        const lightK = clamp(0.5 - p0.face * 0.5, 0, 1);
        if (back) {
          ctx.fillStyle = `rgba(74,92,68,${0.34 + 0.2 * lightK})`;
          ctx.fillRect(-w / 2, -seg / 2, w, seg);
        } else {
          ctx.fillStyle = `rgba(0,0,0,${0.3 * lightK})`;
          ctx.fillRect(-w / 2, -seg / 2, w, seg);
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
