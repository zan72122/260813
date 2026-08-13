// DOM overlay: one hint at a time, growth beads, and the two screens.

import { STAGE } from './scene.js';

const HINTS = {
  [STAGE.FOG]: { text: 'ゆびで きりを あつめよう', cue: 'drag' },
  [STAGE.ALIGN]: { text: 'よこに うごいて みよう', cue: 'swipe' },
  [STAGE.MIST]: { text: 'ながく おして きりを こく', cue: 'press' },
};

const GROW_WORDS = ['ひかりの わ！', 'いろが ついた！', 'にじの わ！', 'もっと にじ！'];

export function createUI({ onPick, onAgain, onSound }) {
  const el = {
    title: document.getElementById('title'),
    picker: document.getElementById('picker'),
    hint: document.getElementById('hint'),
    hintText: document.getElementById('hintText'),
    hand: document.getElementById('hand'),
    beads: document.getElementById('beads'),
    banner: document.getElementById('banner'),
    finale: document.getElementById('finale'),
    again: document.getElementById('again'),
    sound: document.getElementById('sound'),
    oops: document.getElementById('oops'),
  };
  const beads = [...el.beads.querySelectorAll('.bead')];

  let shownStage = null;
  let shownBeads = -1;
  let bannerTimer = 0;

  el.again.addEventListener('click', () => onAgain());
  el.sound.addEventListener('click', () => {
    const on = onSound();
    el.sound.classList.toggle('off', !on);
  });

  function buildPicker(characters, thumbs) {
    el.picker.innerHTML = '';
    characters.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'pickBtn';
      b.type = 'button';
      b.setAttribute('aria-label', c.name);
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 192;
      const ctx = cv.getContext('2d');
      // Front pose is the left third of the atlas.
      const a = thumbs[i];
      ctx.drawImage(a, 0, 0, a.width / 3, a.height, 0, 0, 128, 192);
      const label = document.createElement('span');
      label.textContent = c.name;
      b.append(cv, label);
      b.addEventListener('click', () => onPick(i));
      el.picker.appendChild(b);
    });
  }

  function showTitle(show) {
    el.title.classList.toggle('hidden', !show);
    if (show) {
      el.hint.classList.add('hidden');
      el.beads.classList.add('hidden');
      el.finale.classList.add('hidden');
      shownStage = null;
      shownBeads = -1;
      beads.forEach((b) => b.classList.remove('on'));
    }
  }

  function banner(text) {
    el.banner.textContent = text;
    el.banner.classList.remove('hidden');
    // restart the CSS animation
    el.banner.style.animation = 'none';
    void el.banner.offsetWidth;
    el.banner.style.animation = '';
    bannerTimer = 2.6;
  }

  function update(s, dt) {
    // hint bubble
    const h = HINTS[s.stage];
    if (s.stage !== shownStage) {
      shownStage = s.stage;
      if (h) {
        el.hintText.textContent = h.text;
        el.hand.className = `hand ${h.cue}`;
        el.hint.classList.remove('hidden');
        el.hint.style.animation = 'none';
        void el.hint.offsetWidth;
        el.hint.style.animation = '';
      } else {
        el.hint.classList.add('hidden');
      }
      el.beads.classList.toggle('hidden', s.stage === STAGE.TITLE || s.stage === STAGE.INTRO);
      el.finale.classList.toggle('hidden', s.stage !== STAGE.FINALE);
    }
    if (s.stage === STAGE.FINALE) el.hint.classList.add('hidden');

    // growth beads
    const lit = Math.min(beads.length, Math.floor(s.ringCount + 0.001));
    if (lit !== shownBeads) {
      beads.forEach((b, i) => b.classList.toggle('on', i < lit));
      if (lit > shownBeads && shownBeads >= 0 && lit > 0 && s.stage !== STAGE.FINALE) {
        banner(GROW_WORDS[Math.min(lit - 1, GROW_WORDS.length - 1)]);
      }
      shownBeads = lit;
    }

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.classList.add('hidden');
    }
  }

  function fail(msg) {
    el.oops.classList.remove('hidden');
    el.title.classList.add('hidden');
    if (msg) el.oops.querySelector('.lead').innerHTML = msg;
  }

  return { buildPicker, showTitle, update, banner, fail, el };
}
