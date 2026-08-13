// 文字にたよらない案内表示（DOM 側）

const CIRC = 2 * Math.PI * 46;

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.hints = {};
    for (const el of this.root.querySelectorAll('.hint')) {
      this.hints[el.dataset.hint] = el;
    }
    this.progress = document.getElementById('progress');
    this.progressFg = this.progress.querySelector('.fg');
    this.again = document.getElementById('again');
    this.boot = document.getElementById('boot');
    this.current = null;
    this._progress = -1;
    this.layout();
    addEventListener('resize', () => this.layout());
  }

  layout() {
    // 画面の短辺に合わせてヒントの大きさを決める
    const m = Math.min(innerWidth, innerHeight);
    const s = Math.max(0.55, Math.min(1.25, m / 460));
    for (const el of Object.values(this.hints)) {
      el.style.width = `${170 * s}px`;
      el.style.transform = 'translate(0,0)';
    }
    this.hints.swipeX.style.width = `${210 * s}px`;
    this.hints.swipeY.style.width = `${110 * s}px`;
    this.hints.circle.style.width = `${230 * s}px`;
  }

  hint(name) {
    if (this.current === name) return;
    this.current = name;
    for (const [k, el] of Object.entries(this.hints)) {
      el.classList.toggle('show', k === name);
    }
  }

  setProgress(v) {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    if (q === this._progress) return;
    this._progress = q;
    this.progressFg.style.strokeDashoffset = String(CIRC * (1 - q));
  }

  showProgress(on) {
    this.progress.classList.toggle('show', !!on);
  }

  showAgain(on) {
    if (on) {
      this.again.hidden = false;
      requestAnimationFrame(() => this.again.classList.add('show'));
    } else {
      this.again.classList.remove('show');
      setTimeout(() => { if (!this.again.classList.contains('show')) this.again.hidden = true; }, 900);
    }
  }

  hideBoot() {
    if (!this.boot) return;
    this.boot.classList.add('gone');
    setTimeout(() => this.boot && this.boot.remove(), 900);
  }

  fatal(msg) {
    if (!this.boot) return;
    this.boot.innerHTML = `<p style="color:#cdd8ee;font:14px/1.7 system-ui;padding:2em;text-align:center;max-width:28em">${msg}</p>`;
    this.boot.classList.remove('gone');
  }
}
