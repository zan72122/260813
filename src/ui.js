// DOM がわの見た目まわり。もじは最小限。

import { codexCells, cellIcon, cellLabel } from './codex.js';

const el = (id) => document.getElementById(id);

export function createUI({ onStart, onAgain, onCodex, onCodexClose, onSound, onPickCell }) {
  const steps = el('steps');
  const hint = el('hint');
  const word = el('word');
  const starsBox = el('stars');
  const countBox = el('count');
  const titleScreen = el('title');
  const codexScreen = el('codex');
  const codexGrid = el('codexGrid');
  const codexMeter = el('codexMeter');
  const againBtn = el('againBtn');
  const codexBtn = el('codexBtn');
  const soundBtn = el('soundBtn');

  const TOTAL_STEPS = 7;
  for (let i = 0; i < TOTAL_STEPS; i++) steps.appendChild(document.createElement('i'));
  const dots = [...steps.children];

  el('startBtn').addEventListener('click', () => onStart());
  againBtn.addEventListener('click', () => onAgain());
  codexBtn.addEventListener('click', () => onCodex());
  el('codexClose').addEventListener('click', () => onCodexClose());
  soundBtn.addEventListener('click', () => onSound());

  let wordTimer = 0;
  let starTimer = 0;

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
     * いくつ入れたか の点。n < 0 で消える。
     * かけらの数・たねの数を、もじなしで見せるため。
     */
    setCount(n, total) {
      if (n < 0) {
        countBox.className = 'count';
        return;
      }
      if (countBox.children.length !== total) {
        countBox.innerHTML = '';
        for (let i = 0; i < total; i++) countBox.appendChild(document.createElement('i'));
      }
      [...countBox.children].forEach((c, i) => c.classList.toggle('on', i < n));
      countBox.className = 'count on';
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
      void word.offsetWidth; // reflow してアニメを最初から
      word.classList.add('pop');
      clearTimeout(wordTimer);
      wordTimer = setTimeout(() => word.classList.remove('pop'), 1600);
    },

    /** できばえの星（1〜3）。もじなしの「すごさ」表示。 */
    stars(n) {
      starsBox.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.style.animationDelay = `${i * 0.14}s`;
        s.innerHTML =
          '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6' +
          ' 1.4-6.8L2.2 9.1l6.9-.8z"/></svg>';
        starsBox.appendChild(s);
      }
      starsBox.className = 'stars on';
      clearTimeout(starTimer);
      starTimer = setTimeout(() => (starsBox.className = 'stars'), 2600);
    },

    showTitle(on) {
      titleScreen.classList.toggle('hidden', !on);
    },

    showCodexScreen(on) {
      codexScreen.classList.toggle('hidden', !on);
    },

    isCodexOpen() {
      return !codexScreen.classList.contains('hidden');
    },

    setTools({ again = false, codex = true, sound = true } = {}) {
      againBtn.classList.toggle('hidden', !again);
      codexBtn.classList.toggle('hidden', !codex);
      soundBtn.classList.toggle('hidden', !sound);
    },

    setMuted(m) {
      document.body.classList.toggle('muted', m);
    },

    /** ずかんボタンの横に「あと何マス」を点で出す */
    setCodexCount(n, total) {
      codexBtn.dataset.count = `${n}`;
      codexBtn.style.setProperty('--fill', `${(n / total) * 100}%`);
    },

    pulseCodexButton() {
      codexBtn.classList.remove('pulse');
      void codexBtn.offsetWidth;
      codexBtn.classList.add('pulse');
    },

    renderCodex(codex) {
      const cells = codexCells();
      codexGrid.innerHTML = '';
      let got = 0;
      for (const cell of cells) {
        const entry = codex.cells[cell.key];
        const box = document.createElement('button');
        box.type = 'button';
        box.className = `codex-cell${entry ? ' got' : ''}${cell.rare ? ' rare' : ''}`;
        box.setAttribute('aria-label', cellLabel(cell));
        if (entry) {
          got++;
          const img = document.createElement('img');
          img.src = entry.thumb;
          img.alt = '';
          img.draggable = false;
          box.appendChild(img);
          if (entry.count > 1) {
            const b = document.createElement('b');
            b.textContent = `${Math.min(entry.count, 99)}`;
            box.appendChild(b);
          }
          box.addEventListener('click', () => onPickCell(cell, entry));
        } else {
          box.innerHTML = `<span class="sil c-${cell.color || 'rare'}">${cellIcon(cell)}</span>`;
        }
        codexGrid.appendChild(box);
      }
      // 進みぐあいのバー（もじなし）
      codexMeter.style.setProperty('--p', `${(got / cells.length) * 100}%`);
    },
  };

  return api;
}

/**
 * WebGL キャンバスの中央を切りぬいて、ずかん用の小さな絵をつくる。
 */
export function captureThumb(canvas, size = 168) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const s = Math.min(canvas.width, canvas.height) * 0.8;
    const sx = (canvas.width - s) / 2;
    const sy = (canvas.height - s) / 2 - canvas.height * 0.02;
    g.drawImage(canvas, sx, Math.max(0, sy), s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}
