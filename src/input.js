// 指ひとつだけを見る。長押し＝噴霧、ドラッグ＝向き、短いタップ＝少しだけ霧。
export class Input {
  constructor(el) {
    this.el = el;
    this.x = 0; this.y = 0;         // CSS px
    this.vx = 0; this.vy = 0;
    this.down = false;
    this.held = 0;                  // 押している時間（秒）
    this.sinceUp = 999;
    this.pointerId = null;
    this.everTouched = false;
    this.tapBurst = 0;              // 短いタップで出す“ぽふっ”の量
    this.idle = 0;
    this._lastX = 0; this._lastY = 0;
    this._downX = 0; this._downY = 0;
    this._moved = 0;

    const opts = { passive: false };
    el.addEventListener('pointerdown', this._onDown, opts);
    el.addEventListener('pointermove', this._onMove, opts);
    window.addEventListener('pointerup', this._onUp, opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    el.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.down = false; this.pointerId = null; });
  }

  _onDown = (e) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.down = true;
    this.held = 0;
    this.sinceUp = 0;
    this.idle = 0;
    this.everTouched = true;
    this._moved = 0;
    const r = this.el.getBoundingClientRect();
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
    this._lastX = this.x; this._lastY = this.y;
    this._downX = this.x; this._downY = this.y;
    this.vx = 0; this.vy = 0;
    if (this.el.setPointerCapture) {
      try { this.el.setPointerCapture(e.pointerId); } catch { /* 対応していない端末では無視 */ }
    }
    e.preventDefault();
    if (this.onFirstTouch) { this.onFirstTouch(); }
  };

  _onMove = (e) => {
    if (e.pointerId !== this.pointerId) return;
    const r = this.el.getBoundingClientRect();
    const nx = e.clientX - r.left;
    const ny = e.clientY - r.top;
    this._moved += Math.hypot(nx - this.x, ny - this.y);
    this.x = nx; this.y = ny;
    this.idle = 0;
    e.preventDefault();
  };

  _onUp = (e) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    // 短くちょんと触れただけなら、少量の霧を出す
    if (this.held < 0.22 && this._moved < 22) this.tapBurst = 1;
    this.down = false;
    this.sinceUp = 0;
  };

  update(dt) {
    if (this.down) {
      this.held += dt;
      this.idle += dt;
    } else {
      this.sinceUp += dt;
      this.idle += dt;
    }
    const k = 1 - Math.exp(-dt / 0.06);
    this.vx += ((this.x - this._lastX) / Math.max(dt, 0.001) - this.vx) * k;
    this.vy += ((this.y - this._lastY) / Math.max(dt, 0.001) - this.vy) * k;
    this._lastX = this.x;
    this._lastY = this.y;
  }

  consumeTap() {
    const t = this.tapBurst;
    this.tapBurst = 0;
    return t;
  }
}
