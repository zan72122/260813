// 画面のどこを触っても操作できる、極めて寛容な入力層。
// 4歳児向け: 位置精度を要求しない / 進捗は減らない / 手ぶれを吸収する。
import { TAU, clamp, angleDelta } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.dx = 0;
    this.dy = 0;
    this.startX = 0;
    this.startY = 0;
    this.downTime = 0;
    this.idle = 0; // 最後に触ってからの秒数
    this.tapped = false; // このフレームで指が離れた（短い接触）
    this.everTouched = false;
    this._pending = { dx: 0, dy: 0 };
    this._id = null;

    const opt = { passive: false };
    canvas.addEventListener('pointerdown', this._down, opt);
    canvas.addEventListener('pointermove', this._move, opt);
    canvas.addEventListener('pointerup', this._up, opt);
    canvas.addEventListener('pointercancel', this._up, opt);
    canvas.addEventListener('pointerleave', this._up, opt);
    // iOS Safari のスクロール/ズームを完全に止める。
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), opt);
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), opt);
    canvas.addEventListener('gesturestart', (e) => e.preventDefault(), opt);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opt);
  }

  _down = (e) => {
    if (this._id !== null) return; // 最初の指だけを見る（手のひらが当たっても壊れない）
    this._id = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const p = this._pos(e);
    this.active = true;
    this.everTouched = true;
    this.x = this.px = this.startX = p.x;
    this.y = this.py = this.startY = p.y;
    this._pending.dx = 0;
    this._pending.dy = 0;
    this.downTime = 0;
    this.idle = 0;
    this.travel = 0;
    e.preventDefault();
  };

  _move = (e) => {
    if (e.pointerId !== this._id) return;
    const p = this._pos(e);
    this._pending.dx += p.x - this.x;
    this._pending.dy += p.y - this.y;
    this.x = p.x;
    this.y = p.y;
    this.idle = 0;
    e.preventDefault();
  };

  _up = (e) => {
    if (e.pointerId !== this._id) return;
    this._id = null;
    this.active = false;
    this.tapped = this.downTime < 0.35;
    e.preventDefault();
  };

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // 毎フレーム先頭で呼ぶ。
  beginFrame(dt) {
    this.dx = this._pending.dx;
    this.dy = this._pending.dy;
    this._pending.dx = 0;
    this._pending.dy = 0;
    this.px = this.x - this.dx;
    this.py = this.y - this.dy;
    if (this.active) {
      this.downTime += dt;
      this.idle = 0;
      this.travel = (this.travel || 0) + Math.hypot(this.dx, this.dy);
    } else {
      this.idle += dt;
    }
  }

  endFrame() {
    this.tapped = false;
  }

  get moveLen() {
    return Math.hypot(this.dx, this.dy);
  }
}

// --- ジェスチャ認識器 ------------------------------------------------------
// いずれも 0..1 の進捗を「増やすだけ」。逆方向の手ぶれで戻ることはない。

// 円運動（混ぜる）。中心からずれていても、ぐるぐるでも往復でも進む。
export class CircleGesture {
  constructor(turns = 2.2) {
    this.need = turns * TAU;
    this.acc = 0;
    this.angle = 0;
    this.has = false;
    this.spin = 0; // 見た目用の回転角
    this.speed = 0;
    this.ex = 0; // 回転中心の推定値（指の移動平均）
    this.ey = 0;
  }
  reset() {
    this.acc = 0;
    this.has = false;
    this.spin = 0;
    this.speed = 0;
  }
  nudge(dt) {
    this.acc += this.need * dt * 0.12;
    this.spin += dt * 2.4;
  }
  // cx, cy は「まだ触っていないとき」の初期中心（ボウルの位置）。
  // 触り始めたら指の移動平均を中心として使うので、画面のどこで回しても成立する。
  update(input, cx, cy, dt) {
    let gain = 0;
    if (input.active) {
      if (!this.has) {
        this.ex = input.x;
        this.ey = input.y;
      } else {
        const l = 1 - Math.exp(-2.6 * dt);
        this.ex += (input.x - this.ex) * l;
        this.ey += (input.y - this.ey) * l;
      }
      const a = Math.atan2(input.y - this.ey, input.x - this.ex);
      const r = Math.hypot(input.y - this.ey, input.x - this.ex);
      if (this.has && r > 10) {
        // 回転成分（半径が小さいと角度が暴れるので上限を掛ける）
        gain += Math.min(Math.abs(angleDelta(a, this.angle)), 0.5);
      }
      this.angle = a;
      this.has = true;
      // 直線的にゴシゴシ動かすだけでも進むよう、移動距離でも加点。
      gain += input.moveLen / 750;
      this.spin += Math.max(gain, input.moveLen / 600) * 2.6;
    } else {
      this.has = false;
    }
    this.speed = this.speed * Math.exp(-6 * dt) + gain * 10;
    this.acc += gain;
    return clamp(this.acc / this.need);
  }
}

// 一方向ドラッグ（注ぐ / 持ち上げる / 蓋を下ろす）。
// axis: 'x' | 'y', sign: +1 | -1。distance は CSS px。
export class DragGesture {
  constructor(axis, sign, distance) {
    this.axis = axis;
    this.sign = sign;
    this.dist = distance;
    this.acc = 0;
    this.rate = 0;
  }
  reset() {
    this.acc = 0;
    this.rate = 0;
  }
  nudge(dt) {
    this.acc += this.dist * dt * 0.12;
  }
  update(input, dt) {
    let d = 0;
    if (input.active) {
      const main = this.axis === 'x' ? input.dx : input.dy;
      const cross = this.axis === 'x' ? input.dy : input.dx;
      // 斜めでも通す。逆方向は無視（減らさない）。
      d = Math.max(0, main * this.sign) + Math.abs(cross) * 0.12;
    }
    this.rate = this.rate * Math.exp(-8 * dt) + (d / Math.max(dt, 1e-3)) * 0.002;
    this.acc += d;
    return clamp(this.acc / this.dist);
  }
}

// 大きな弧のスワイプ（ひっくり返す）。左右どちらでも成立する。
export class ArcGesture {
  constructor(distance) {
    this.dist = distance;
    this.acc = 0;
    this.dir = 0;
    this.rate = 0;
  }
  reset() {
    this.acc = 0;
    this.dir = 0;
    this.rate = 0;
  }
  nudge(dt) {
    this.acc += this.dist * dt * 0.12;
  }
  update(input, dt) {
    let d = 0;
    if (input.active) {
      if (this.dir === 0 && Math.abs(input.dx) > 2) this.dir = Math.sign(input.dx);
      const h = this.dir === 0 ? Math.abs(input.dx) : input.dx * this.dir;
      d = Math.max(0, h) + Math.max(0, -input.dy) * 0.35; // 上向きの弧も加点
    }
    this.rate = this.rate * Math.exp(-8 * dt) + (d / Math.max(dt, 1e-3)) * 0.002;
    this.acc += d;
    return clamp(this.acc / this.dist);
  }
}

// 押さえ続ける / こする（加熱レバー）。触れていれば進む。
export class HoldGesture {
  constructor(duration) {
    this.dur = duration;
    this.acc = 0;
  }
  reset() {
    this.acc = 0;
  }
  nudge(dt) {
    this.acc += this.dur * dt * 0.12;
  }
  update(input, dt) {
    if (input.active) this.acc += dt * (1 + Math.min(input.moveLen, 30) / 60);
    return clamp(this.acc / this.dur);
  }
}
