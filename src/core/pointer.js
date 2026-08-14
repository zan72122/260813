/**
 * One-finger pointer tracking for a 4 year old: first finger wins, everything
 * else is ignored, and every event is delivered on the same frame it arrives so
 * the rollers feel welded to the fingertip.
 */
export class Pointer {
  constructor(el) {
    this.el = el;
    this.id = null;
    this.down = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.dx = 0;
    this.dy = 0;
    this.startX = 0;
    this.startY = 0;
    this.downTime = 0;
    this.moved = 0;
    /** @type {{down?:Function, move?:Function, up?:Function}} */
    this.on = {};

    el.addEventListener('pointerdown', this._down, { passive: false });
    el.addEventListener('pointermove', this._move, { passive: false });
    el.addEventListener('pointerup', this._up, { passive: false });
    el.addEventListener('pointercancel', this._up, { passive: false });
    el.addEventListener('lostpointercapture', this._up, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _pos(e) {
    const r = this.el.getBoundingClientRect();
    this.px = this.x;
    this.py = this.y;
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
    this.w = r.width;
    this.h = r.height;
    this.nx = (this.x / r.width) * 2 - 1;
    this.ny = -(this.y / r.height) * 2 + 1;
  }

  _down = (e) => {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    this._pos(e);
    this.px = this.x;
    this.py = this.y;
    this.dx = 0;
    this.dy = 0;
    this.startX = this.x;
    this.startY = this.y;
    this.moved = 0;
    this.down = true;
    this.downTime = performance.now();
    this.on.down?.(this);
  };

  _move = (e) => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    this._pos(e);
    this.dx = this.x - this.px;
    this.dy = this.y - this.py;
    this.moved += Math.hypot(this.dx, this.dy);
    this.on.move?.(this);
  };

  _up = (e) => {
    if (e.pointerId !== this.id) return;
    e.preventDefault?.();
    this._pos(e);
    this.dx = 0;
    this.dy = 0;
    this.down = false;
    this.id = null;
    this.on.up?.(this);
  };

  /** True for a quick, low-travel touch. */
  get wasTap() {
    return this.moved < 16 && performance.now() - this.downTime < 500;
  }

  /**
   * Signed angle (radians) swept around a screen-space centre by the last move.
   * Falls back to horizontal travel when the finger is right on top of the
   * centre, where the angle would be noise.
   */
  angleAround(cx, cy) {
    const r0 = Math.hypot(this.px - cx, this.py - cy);
    const r1 = Math.hypot(this.x - cx, this.y - cy);
    if (r0 < 26 || r1 < 26) return (this.dx - this.dy) * 0.006;
    const a0 = Math.atan2(this.py - cy, this.px - cx);
    const a1 = Math.atan2(this.y - cy, this.x - cx);
    let d = a1 - a0;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
}
