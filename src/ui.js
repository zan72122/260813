// DOM overlay. Deliberately tiny: a four-year-old reads pictures, not text,
// so the HUD is one short hiragana line, a fat progress bar, the colour
// chips, and an animated finger that shows the gesture.

const el = (tag, cls, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
};

export class UI {
  /**
   * @param {HTMLElement} root
   * @param {{onColor?:(id:string)=>void, onSound?:(on:boolean)=>void}} cb
   */
  constructor(root, cb = {}) {
    this.root = root;
    this.cb = cb;

    this.title = el('div', 'title', root);
    const h = el('h1', null, this.title);
    h.textContent = 'しろい こな';
    const tap = el('div', 'tap', this.title);
    tap.textContent = 'さわって はじめる';

    this.prompt = el('div', 'prompt', root);
    this.prompt.setAttribute('aria-live', 'polite');

    this.meter = el('div', 'meter', root);
    this.meterFill = el('i', null, this.meter);

    this.chips = el('div', 'chips', root);
    this.chips.setAttribute('data-ui', '');
    /** @type {Map<string, HTMLElement>} */
    this.chipEls = new Map();

    this.hint = el('div', 'hint', root);
    this.hintRing = el('div', 'ring', this.hint);
    this.hintArrow = el('div', 'arrow', this.hint);

    const corner = el('div', 'corner', root);
    corner.setAttribute('data-ui', '');
    this.soundOn = true;
    this.soundBtn = el('button', 'icon-btn', corner);
    this.soundBtn.setAttribute('data-ui', '');
    this.soundBtn.textContent = '🔊';
    this.soundBtn.setAttribute('aria-label', 'おと');
    this.soundBtn.addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.soundBtn.textContent = this.soundOn ? '🔊' : '🔇';
      this.cb.onSound?.(this.soundOn);
    });

    // NOTE: no data-ui on the panel itself - it covers the whole screen, and
    // its clickability is controlled by the .show class alone (see style.css).
    this.panel = el('div', 'panel', root);
    this.panelCard = el('div', 'card', this.panel);
    this.panelCard.setAttribute('data-ui', '');
    this.panelTitle = el('h1', null, this.panelCard);
    this.panelBody = el('p', null, this.panelCard);
    this.panelBtns = el('div', null, this.panelCard);

    this._hintPos = { x: 0, y: 0 };
  }

  hideTitle() {
    this.title.classList.add('gone');
  }

  setAccent(hex) {
    this.root.style.setProperty('--accent', hex);
  }

  /** @param {string} text */
  say(text, tiny = false) {
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.classList.toggle('tiny', tiny);
    this.prompt.classList.add('show');
  }

  hidePrompt() {
    this.prompt.classList.remove('show');
  }

  /** @param {{id:string,hex:string,name:string}[]} colors */
  showChips(colors, activeId) {
    if (this.chipEls.size !== colors.length) {
      this.chips.textContent = '';
      this.chipEls.clear();
      for (const c of colors) {
        const b = el('button', 'chip', this.chips);
        b.setAttribute('data-ui', '');
        b.dataset.color = c.id;
        b.style.background = c.hex;
        b.setAttribute('aria-label', c.name);
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.cb.onColor?.(c.id);
        });
        this.chipEls.set(c.id, b);
      }
    }
    for (const [id, node] of this.chipEls) node.classList.toggle('on', id === activeId);
    this.chips.classList.add('show');
    this.chips.style.pointerEvents = 'auto';
  }

  setActiveChip(id) {
    for (const [cid, node] of this.chipEls) node.classList.toggle('on', cid === id);
  }

  hideChips() {
    this.chips.classList.remove('show');
    this.chips.style.pointerEvents = 'none';
  }

  showMeter(v) {
    this.meter.classList.add('show');
    this.meterFill.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  }

  hideMeter() {
    this.meter.classList.remove('show');
  }

  /** @param {number} x @param {number} y @param {string} glyph */
  showHint(x, y, glyph = '👆') {
    this._hintPos.x = x;
    this._hintPos.y = y;
    this.hint.style.transform = `translate(${x}px, ${y}px)`;
    if (this.hintArrow.textContent !== glyph) this.hintArrow.textContent = glyph;
    this.hint.classList.add('show');
  }

  moveHint(x, y) {
    this.hint.style.transform = `translate(${x}px, ${y}px)`;
  }

  hideHint() {
    this.hint.classList.remove('show');
  }

  /**
   * @param {{title:string, body?:string,
   *   buttons:{label:string,kind?:'ghost',onClick:()=>void}[]}} o
   */
  showPanel(o) {
    this.panelTitle.textContent = o.title;
    this.panelBody.textContent = o.body ?? '';
    this.panelBtns.textContent = '';
    for (const b of o.buttons) {
      const node = el('button', `big-btn${b.kind === 'ghost' ? ' ghost' : ''}`, this.panelBtns);
      node.setAttribute('data-ui', '');
      node.textContent = b.label;
      node.addEventListener('click', b.onClick);
    }
    this.panel.classList.add('show');
  }

  hidePanel() {
    this.panel.classList.remove('show');
  }
}
