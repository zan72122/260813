/**
 * Wordless HUD. Every instruction is a moving finger: a 4 year old who cannot
 * read still knows what to do, in Japanese, English or no language at all.
 */

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function finger(scale = 1) {
  const g = svg('g');
  g.appendChild(svg('circle', { r: 21 * scale, fill: 'rgba(255,255,255,0.45)' }));
  g.appendChild(
    svg('circle', { r: 13 * scale, fill: '#fff', stroke: '#8a5a26', 'stroke-width': 4 * scale }),
  );
  return g;
}

const STROKE = { fill: 'none', stroke: '#fff', 'stroke-width': 9, 'stroke-linecap': 'round' };
const SHADOW = { fill: 'none', stroke: 'rgba(120,72,28,0.35)', 'stroke-width': 15, 'stroke-linecap': 'round' };

export class Hud {
  constructor(root) {
    this.root = root;
    this.t = 0;
    this.kind = null;
    this.anchor = { x: 0, y: 0 };
    this.progress = 0;

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.svg = svg('svg', { viewBox: '-84 -84 168 168' });
    this.hint.appendChild(this.svg);
    root.appendChild(this.hint);

    this.shapes = {
      rotate: this._rotate(),
      drag: this._drag(),
      press: this._press(),
      tap: this._tap(),
      pull: this._pull(),
    };
    for (const k in this.shapes) {
      this.shapes[k].setAttribute('display', 'none');
      this.svg.appendChild(this.shapes[k]);
    }

    // progress ring around the hint
    this.ringBg = svg('circle', {
      r: 66,
      fill: 'none',
      stroke: 'rgba(255,255,255,0.35)',
      'stroke-width': 8,
    });
    this.ring = svg('circle', {
      r: 66,
      fill: 'none',
      stroke: '#ff9425',
      'stroke-width': 8,
      'stroke-linecap': 'round',
      transform: 'rotate(-90)',
    });
    this.ringLen = 2 * Math.PI * 66;
    this.ring.setAttribute('stroke-dasharray', this.ringLen);
    this.ring.setAttribute('stroke-dashoffset', this.ringLen);
    this.svg.appendChild(this.ringBg);
    this.svg.appendChild(this.ring);

    this.pips = document.createElement('div');
    this.pips.id = 'pips';
    for (let i = 0; i < 6; i++) this.pips.appendChild(document.createElement('i'));
    root.appendChild(this.pips);

    this.btnSound = this._button('btn-sound', this._soundIcon());
    this.btnAgain = this._button('btn-again', this._againIcon());
    this.flashEl = document.createElement('div');
    this.flashEl.id = 'flash';
    root.appendChild(this.flashEl);
    this.flashK = 0;
  }

  _button(id, icon) {
    const b = document.createElement('button');
    b.id = id;
    b.className = 'btn';
    b.setAttribute('aria-hidden', 'true');
    b.appendChild(icon);
    this.root.appendChild(b);
    return b;
  }

  _soundIcon() {
    const s = svg('svg', { viewBox: '0 0 48 48' });
    const g = svg('g', { fill: '#8a5a26' });
    g.appendChild(svg('path', { d: 'M8 19h8l10-8v26l-10-8H8z' }));
    this.waves = svg('g', {
      fill: 'none',
      stroke: '#8a5a26',
      'stroke-width': 4,
      'stroke-linecap': 'round',
    });
    this.waves.appendChild(svg('path', { d: 'M32 18a9 9 0 0 1 0 12' }));
    this.waves.appendChild(svg('path', { d: 'M38 13a17 17 0 0 1 0 22' }));
    this.cross = svg('path', {
      d: 'M33 18l12 12M45 18l-12 12',
      stroke: '#c0562a',
      'stroke-width': 5,
      'stroke-linecap': 'round',
      fill: 'none',
      display: 'none',
    });
    s.appendChild(g);
    s.appendChild(this.waves);
    s.appendChild(this.cross);
    return s;
  }

  _againIcon() {
    const s = svg('svg', { viewBox: '0 0 48 48' });
    s.appendChild(
      svg('path', {
        d: 'M38 24a14 14 0 1 1-4.6-10.3',
        fill: 'none',
        stroke: '#ef7d2d',
        'stroke-width': 6,
        'stroke-linecap': 'round',
      }),
    );
    s.appendChild(svg('path', { d: 'M36 4v12H24z', fill: '#ef7d2d' }));
    return s;
  }

  // ---- hint shapes ------------------------------------------------------
  _rotate() {
    const g = svg('g');
    const d = 'M 0 -46 A 46 46 0 1 1 -32.5 -32.5';
    g.appendChild(svg('path', { d, ...SHADOW }));
    g.appendChild(svg('path', { d, ...STROKE, 'stroke-dasharray': '2 18' }));
    const head = svg('path', {
      d: 'M-46 -30 l14 -8 l2 16 z',
      fill: '#fff',
      stroke: 'rgba(120,72,28,0.35)',
      'stroke-width': 5,
      'stroke-linejoin': 'round',
    });
    g.appendChild(head);
    this.rotDot = finger();
    g.appendChild(this.rotDot);
    return g;
  }

  _drag() {
    const g = svg('g');
    const d = 'M -46 0 H 40';
    g.appendChild(svg('path', { d, ...SHADOW }));
    g.appendChild(svg('path', { d, ...STROKE }));
    g.appendChild(
      svg('path', {
        d: 'M38 -16 l22 16 l-22 16 z',
        fill: '#fff',
        stroke: 'rgba(120,72,28,0.35)',
        'stroke-width': 5,
        'stroke-linejoin': 'round',
      }),
    );
    this.dragDot = finger();
    g.appendChild(this.dragDot);
    return g;
  }

  _press() {
    const g = svg('g');
    this.pressRings = [];
    for (let i = 0; i < 2; i++) {
      const c = svg('circle', { r: 30, fill: 'none', stroke: '#fff', 'stroke-width': 7 });
      this.pressRings.push(c);
      g.appendChild(c);
    }
    this.pressDot = finger(1.15);
    g.appendChild(this.pressDot);
    return g;
  }

  _tap() {
    const g = svg('g');
    this.tapRing = svg('circle', { r: 30, fill: 'none', stroke: '#fff', 'stroke-width': 7 });
    g.appendChild(this.tapRing);
    this.tapDot = finger(1.05);
    g.appendChild(this.tapDot);
    return g;
  }

  _pull() {
    const g = svg('g');
    for (const s of [-1, 1]) {
      const d = `M ${s * 14} 0 H ${s * 44}`;
      g.appendChild(svg('path', { d, ...SHADOW }));
      g.appendChild(svg('path', { d, ...STROKE }));
      g.appendChild(
        svg('path', {
          d: `M ${s * 42} -15 l ${s * 22} 15 l ${-s * 22} 15 z`,
          fill: '#fff',
          stroke: 'rgba(120,72,28,0.35)',
          'stroke-width': 5,
          'stroke-linejoin': 'round',
        }),
      );
    }
    this.pullDots = [finger(0.95), finger(0.95)];
    g.appendChild(this.pullDots[0]);
    g.appendChild(this.pullDots[1]);
    return g;
  }

  // ---- api --------------------------------------------------------------
  /** @param {string|null} kind @param {number} angle degrees, to aim drag arrows */
  show(kind, angle = 0) {
    if (this.kind === kind && this.angle === angle) return;
    this.kind = kind;
    this.angle = angle;
    for (const k in this.shapes) this.shapes[k].setAttribute('display', k === kind ? '' : 'none');
    if (kind) this.shapes[kind].setAttribute('transform', `rotate(${angle})`);
    this.hint.classList.toggle('on', !!kind);
    this.t = 0;
  }

  at(x, y) {
    this.anchor.x = x;
    this.anchor.y = y;
  }

  setProgress(p) {
    this.progress = p;
    const on = p > 0.0001 && p < 0.999 && !!this.kind;
    this.ring.setAttribute('display', on ? '' : 'none');
    this.ringBg.setAttribute('display', on ? '' : 'none');
    this.ring.setAttribute('stroke-dashoffset', this.ringLen * (1 - Math.min(1, p)));
  }

  setStep(i) {
    const items = this.pips.children;
    for (let k = 0; k < items.length; k++) {
      items[k].className = k < i ? 'done' : k === i ? 'now' : '';
    }
  }

  showPips(on) {
    this.pips.style.display = on ? 'flex' : 'none';
  }

  showAgain(on) {
    this.btnAgain.classList.toggle('on', on);
  }

  showSound(on) {
    this.btnSound.classList.toggle('on', on);
  }

  setSoundIcon(on) {
    this.waves.setAttribute('display', on ? '' : 'none');
    this.cross.setAttribute('display', on ? 'none' : '');
  }

  flash(k) {
    this.flashK = Math.max(this.flashK, k);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.hint.style.transform = `translate(${this.anchor.x}px, ${this.anchor.y}px)`;

    if (this.kind === 'rotate') {
      const a = (t * 1.5) % (Math.PI * 2);
      this.rotDot.setAttribute(
        'transform',
        `translate(${Math.cos(a - Math.PI / 2) * 46} ${Math.sin(a - Math.PI / 2) * 46})`,
      );
    } else if (this.kind === 'drag') {
      const k = (t * 0.8) % 1;
      this.dragDot.setAttribute('transform', `translate(${-46 + k * 92} 0)`);
      this.dragDot.setAttribute('opacity', String(Math.min(1, Math.sin(k * Math.PI) * 3)));
    } else if (this.kind === 'press') {
      for (let i = 0; i < 2; i++) {
        const k = ((t * 0.9 + i * 0.5) % 1);
        this.pressRings[i].setAttribute('r', String(26 + k * 40));
        this.pressRings[i].setAttribute('opacity', String((1 - k) * 0.9));
      }
      const s = 1 + Math.sin(t * 6) * 0.07;
      this.pressDot.setAttribute('transform', `scale(${s})`);
    } else if (this.kind === 'tap') {
      const k = (t * 1.1) % 1;
      this.tapRing.setAttribute('r', String(24 + k * 40));
      this.tapRing.setAttribute('opacity', String((1 - k) * 0.9));
      const s = k < 0.2 ? 0.86 : 1;
      this.tapDot.setAttribute('transform', `scale(${s})`);
    } else if (this.kind === 'pull') {
      const k = (Math.sin(t * 2.2) * 0.5 + 0.5) * 26;
      this.pullDots[0].setAttribute('transform', `translate(${-14 - k} 0)`);
      this.pullDots[1].setAttribute('transform', `translate(${14 + k} 0)`);
    }

    if (this.flashK > 0.001) {
      this.flashK *= Math.exp(-4.5 * dt);
      this.flashEl.style.opacity = String(this.flashK);
    } else if (this.flashEl.style.opacity !== '0') {
      this.flashEl.style.opacity = '0';
    }
  }
}
