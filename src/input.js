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
    /** milliseconds held that no frame has consumed yet */
    this._heldMs = 0;
    this._heldFrom = 0;
    /** @type {{onDown?:Function,onMove?:Function,onUp?:Function,onHover?:Function}} */
    this.handlers = {};

    const opts = { passive: false };
    this._onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // ignore right/middle
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
      this._heldFrom = this.lastActivity;
      el.setPointerCapture?.(e.pointerId);
      this.handlers.onDown?.(this);
    };
    this._onMove = (e) => {
      // A mouse hovers; a finger does not. Following the cursor while no
      // button is held is what makes the tool feel alive on a laptop.
      if (!this.down && e.pointerType !== 'touch') {
        if (!this._isGameTarget(e)) return;
        this._set(e);
        this.lastActivity = performance.now();
        this.handlers.onHover?.(this);
        return;
      }
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
      this._heldMs += Math.max(0, this.lastActivity - this._heldFrom);
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

  /**
   * Seconds the pointer has been held since the last call.
   *
   * Sampling `down` once per frame loses any press that starts and ends inside
   * a single frame gap - which is exactly what happens to a quick tap when the
   * renderer is having a slow moment. Accumulating the time instead means a
   * short press still pours some juice.
   */
  consumeHeld(minWhileDown = 0) {
    const now = performance.now();
    let ms = this._heldMs;
    this._heldMs = 0;
    if (this.down) {
      ms += Math.max(0, now - this._heldFrom);
      this._heldFrom = now;
    }
    return Math.max(ms / 1000, this.down ? minWhileDown : 0);
  }

  /** Throw away unconsumed press time (on entering a stage that uses it). */
  clearHeld() {
    this._heldMs = 0;
    this._heldFrom = performance.now();
  }

  /** Synthetic input, used by the idle-assist and by the E2E harness. */
  inject(type, x, y) {
    if (type === 'down') {
      this.down = true;
      this._heldFrom = performance.now();
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
