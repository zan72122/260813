// DOM がわの見た目まわり。もじは最小限。

const el = (id) => document.getElementById(id);

const STORE_KEY = 'niji-bismuth-shelf-v1';
const SHELF_MAX = 12;

export function createUI({ onStart, onAgain, onShelf, onShelfClose, onSound, onPickShelf }) {
  const steps = el('steps');
  const hint = el('hint');
  const word = el('word');
  const titleScreen = el('title');
  const shelfScreen = el('shelf');
  const shelfGrid = el('shelfGrid');
  const againBtn = el('againBtn');
  const shelfBtn = el('shelfBtn');
  const soundBtn = el('soundBtn');

  const TOTAL = 6;
  for (let i = 0; i < TOTAL; i++) steps.appendChild(document.createElement('i'));
  const dots = [...steps.children];

  el('startBtn').addEventListener('click', () => onStart());
  againBtn.addEventListener('click', () => onAgain());
  shelfBtn.addEventListener('click', () => onShelf());
  el('shelfClose').addEventListener('click', () => onShelfClose());
  soundBtn.addEventListener('click', () => onSound());

  let wordTimer = 0;

  const api = {
    /** 何ステップ目かの点（もじの代わり） */
    setStep(i) {
      steps.classList.toggle('on', i >= 0);
      dots.forEach((d, k) => {
        d.classList.toggle('done', k < i);
        d.classList.toggle('now', k === i);
      });
    },

    /**
     * ゆびのヒント。x,y は「丸の左上」の画面ピクセル。
     * 画面の外に出そうなときは、ふちの内がわに寄せる。
     */
    showHint(mode, x, y) {
      hint.className = `hint on ${mode}`;
      api.moveHint(x, y);
    },

    moveHint(x, y) {
      const size = hint.offsetWidth || Math.min(window.innerWidth, window.innerHeight) * 0.24;
      const pad = 8;
      const cx = Math.min(Math.max(x, pad), Math.max(pad, window.innerWidth - size - pad));
      const cy = Math.min(Math.max(y, pad), Math.max(pad, window.innerHeight - size - pad));
      hint.style.transform = `translate(${cx}px, ${cy}px)`;
    },

    hideHint() {
      hint.className = 'hint';
    },

    /** おおきなことばを ぽん と出す */
    word(text) {
      word.textContent = text;
      word.classList.remove('pop');
      // reflow してアニメを最初から
      void word.offsetWidth;
      word.classList.add('pop');
      clearTimeout(wordTimer);
      wordTimer = setTimeout(() => word.classList.remove('pop'), 1600);
    },

    showTitle(on) {
      titleScreen.classList.toggle('hidden', !on);
    },

    showShelfScreen(on) {
      shelfScreen.classList.toggle('hidden', !on);
    },

    isShelfOpen() {
      return !shelfScreen.classList.contains('hidden');
    },

    setTools({ again = false, shelf = true, sound = true } = {}) {
      againBtn.classList.toggle('hidden', !again);
      shelfBtn.classList.toggle('hidden', !shelf);
      soundBtn.classList.toggle('hidden', !sound);
    },

    setMuted(m) {
      document.body.classList.toggle('muted', m);
    },

    renderShelf(items) {
      shelfGrid.innerHTML = '';
      const cells = Math.max(6, Math.ceil((items.length + 1) / 3) * 3);
      for (let i = 0; i < cells; i++) {
        const cell = document.createElement('div');
        cell.className = 'shelf-cell';
        const item = items[i];
        if (item) {
          const img = document.createElement('img');
          img.src = item.thumb;
          img.alt = '';
          img.draggable = false;
          cell.appendChild(img);
          cell.addEventListener('click', () => onPickShelf(item, i));
        } else {
          cell.classList.add('empty');
          cell.innerHTML =
            '<svg class="shelf-empty-ico" viewBox="0 0 64 64">' +
            '<path d="M14 44h36l-8-14H22z" fill="none" stroke="#fff" stroke-width="4" ' +
            'stroke-linejoin="round" opacity="0.7"/></svg>';
        }
        shelfGrid.appendChild(cell);
      }
    },
  };

  return api;
}

/* ---------------- ほぞん（かざりだな） ---------------- */

export function loadShelf() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.slice(0, SHELF_MAX) : [];
  } catch {
    return [];
  }
}

export function saveShelf(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, SHELF_MAX)));
  } catch {
    /* プライベートモードなどでは、ほぞんできなくても遊べる */
  }
}

/**
 * WebGL キャンバスの中央を切りぬいて、たな用の小さな絵をつくる。
 */
export function captureThumb(canvas, size = 168) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const s = Math.min(canvas.width, canvas.height) * 0.78;
    const sx = (canvas.width - s) / 2;
    const sy = (canvas.height - s) / 2 - canvas.height * 0.02;
    g.drawImage(canvas, sx, Math.max(0, sy), s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}
