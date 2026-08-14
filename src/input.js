// One forgiving pointer.
//
// Small children put three fingers down at once and drag with whichever one
// they feel like. We follow the most recently pressed pointer and ignore the
// rest, so the game never stalls waiting for a "correct" finger.

export class Pointer {
  /** @param {HTMLElement} el */
  constructor(el) {
    this.el = el;
    this.down = false;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.dx = 0;
    this.dy = 0;
    this.id = -1;
    this.startX = 0;
    this.startY = 0;
    this.lastActivity = performance.now();
    /** @type {{onDown?:Function,onMove?:Function,onUp?:Function}} */
    this.handlers = {};

    const opts = { passive: false };
    this._onDown = (e) => {
      if (!this._isGameTarget(e)) return;
      e.preventDefault();
      this.id = e.pointerId;
      this.down = true;
      this._set(e);
      this.px = this.x;
      this.py = this.y;
      this.startX = this.x;
      this.startY = this.y;
      this.dx = this.dy = 0;
      this.lastActivity = performance.now();
      el.setPointerCapture?.(e.pointerId);
      this.handlers.onDown?.(this);
    };
    this._onMove = (e) => {
      if (!this.down || e.pointerId !== this.id) return;
      e.preventDefault();
      this.px = this.x;
      this.py = this.y;
      this._set(e);
      this.dx = this.x - this.px;
      this.dy = this.y - this.py;
      this.lastActivity = performance.now();
      this.handlers.onMove?.(this);
    };
    this._onUp = (e) => {
      if (e.pointerId !== this.id) return;
      this.down = false;
      this.id = -1;
      this.dx = this.dy = 0;
      this.lastActivity = performance.now();
      this.handlers.onUp?.(this);
    };

    el.addEventListener('pointerdown', this._onDown, opts);
    window.addEventListener('pointermove', this._onMove, opts);
    window.addEventListener('pointerup', this._onUp, opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    // iOS Safari: stop rubber-band scroll and double-tap zoom over the canvas
    el.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    el.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
  }

  _isGameTarget(e) {
    // HUD buttons live above the canvas and handle their own taps
    return !(e.target instanceof HTMLElement && e.target.closest('[data-ui]'));
  }

  _set(e) {
    const r = this.el.getBoundingClientRect();
    this.x = e.clientX - r.left;
    this.y = e.clientY - r.top;
  }

  /** Straight-line distance travelled since this press began. */
  get travel() {
    return Math.hypot(this.x - this.startX, this.y - this.startY);
  }

  /** Synthetic input, used by the idle-assist and by the E2E harness. */
  inject(type, x, y) {
    if (type === 'down') {
      this.down = true;
      this.x = this.px = this.startX = x;
      this.y = this.py = this.startY = y;
      this.dx = this.dy = 0;
      this.handlers.onDown?.(this);
    } else if (type === 'move') {
      this.px = this.x;
      this.py = this.y;
      this.x = x;
      this.y = y;
      this.dx = x - this.px;
      this.dy = y - this.py;
      this.handlers.onMove?.(this);
    } else {
      this.down = false;
      this.handlers.onUp?.(this);
    }
    this.lastActivity = performance.now();
  }
}
