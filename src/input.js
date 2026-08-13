// 一本指だけを扱う入力。2 本目以降の指は無視するので、
// 手のひらが画面に当たっても操作が壊れない。
export class SingleTouch {
  constructor(element) {
    this.el = element;
    this.id = null;
    this.startX = 0;
    this.startY = 0;
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.moved = 0;
    this.down = false;
    this.startTime = 0;
    this.onDown = null;
    this.onMove = null;
    this.onUp = null;

    const opts = { passive: false };
    element.addEventListener('pointerdown', this._down, opts);
    element.addEventListener('pointermove', this._move, opts);
    element.addEventListener('pointerup', this._up, opts);
    element.addEventListener('pointercancel', this._up, opts);
    element.addEventListener('pointerleave', this._up, opts);
    // iOS のダブルタップ拡大とゴムバンドスクロールを止める
    element.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    element.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    element.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    element.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  }

  _ndc(e) {
    const r = this.el.getBoundingClientRect();
    return {
      nx: ((e.clientX - r.left) / r.width) * 2 - 1,
      ny: -((e.clientY - r.top) / r.height) * 2 + 1,
      px: e.clientX - r.left,
      py: e.clientY - r.top,
      w: r.width,
      h: r.height,
    };
  }

  _down = (e) => {
    e.preventDefault();
    if (this.id !== null) return;
    this.id = e.pointerId;
    const p = this._ndc(e);
    this.down = true;
    this.moved = 0;
    this.startX = this.x = this.prevX = p.nx;
    this.startY = this.y = this.prevY = p.ny;
    this.startTime = performance.now();
    if (this.el.setPointerCapture) {
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* 一部ブラウザでは捕捉できないが、動作に影響はない */
      }
    }
    this.onDown && this.onDown(this.state(p));
  };

  _move = (e) => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const p = this._ndc(e);
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = p.nx;
    this.y = p.ny;
    this.moved += Math.hypot(this.x - this.prevX, this.y - this.prevY);
    this.onMove && this.onMove(this.state(p));
  };

  _up = (e) => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const p = this._ndc(e);
    const st = this.state(p);
    st.duration = (performance.now() - this.startTime) / 1000;
    st.isTap = this.moved < 0.09 && st.duration < 0.9;
    this.id = null;
    this.down = false;
    this.onUp && this.onUp(st);
  };

  state(p) {
    return {
      nx: this.x,
      ny: this.y,
      px: p.px,
      py: p.py,
      startX: this.startX,
      startY: this.startY,
      dx: this.x - this.prevX,
      dy: this.y - this.prevY,
      totalX: this.x - this.startX,
      totalY: this.y - this.startY,
      moved: this.moved,
      duration: (performance.now() - this.startTime) / 1000,
      isTap: false,
    };
  }
}
