// Bootstrap: build the procedural art, wire input and UI, run the loop.

import * as G from './gl.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  CHARACTERS, makeCharacterAtlas, makeSilhouette, makePuff, makeNoise,
  makeSparkle, makeTerrace,
} from './textures.js';
import {
  createScene, createCamera, update as updateScene, updateCamera, setStage, STAGE,
} from './scene.js';
import { clamp } from './math.js';

const canvas = document.getElementById('stage');
const gl = G.createContext(canvas);

const audio = createAudio();
const ui = createUI({
  onPick: (i) => pick(i),
  onAgain: () => restart(),
  onSound: () => audio.toggle(),
});

if (!gl) {
  ui.fail('この ブラウザでは あそべません<br>(WebGL2 が ひつよう です)');
  throw new Error('WebGL2 unavailable');
}

document.getElementById('others').addEventListener('click', () => {
  scene = createScene(0);
  setStage(scene, STAGE.TITLE);
  ui.showTitle(true);
});

/* --------------------------------------------------------------- assets --- */

const atlases = CHARACTERS.map(makeCharacterAtlas);
const assets = {
  noise: makeNoise(),
  puff: makePuff(7),
  sparkle: makeSparkle(),
  terrace: makeTerrace(),
  atlas: atlases[0],
  silhouette: makeSilhouette(CHARACTERS[0]),
};

let renderer;
try {
  renderer = createRenderer(gl, assets);
} catch (err) {
  console.error(err);
  ui.fail('えを つくれませんでした<br>ページを よみこみなおしてね');
  throw err;
}

ui.buildPicker(CHARACTERS, atlases);

/* ---------------------------------------------------------------- state --- */

let scene = createScene(0);
let cam = createCamera();
let charIndex = 0;
let lastMilestone = 0;
let lastStage = scene.stage;

const input = createInput(canvas, () => scene, {
  onFirstTouch: () => audio.start(),
  onTap: (s) => { if (s.stage === STAGE.INTRO && s.stageT > 1.0) setStage(s, STAGE.FOG); },
});

function pick(i) {
  charIndex = i;
  renderer.setCharacter(atlases[i], makeSilhouette(CHARACTERS[i]));
  audio.start();
  scene = createScene(0);
  scene.introDur = 5.4;
  setStage(scene, STAGE.INTRO);
  lastMilestone = 0;
  ui.showTitle(false);
  ui.update(scene, 0);
}

function restart() {
  scene = createScene(0);
  scene.introDur = 2.8;         // repeat runs get a shorter fly-around
  setStage(scene, STAGE.INTRO);
  lastMilestone = 0;
  input.reset();
  ui.showTitle(false);
  ui.update(scene, 0);
  audio.whoosh(0.7);
  void charIndex;
}

/* --------------------------------------------------------------- resize --- */

let renderScale = 1;

function resize() {
  const cw = Math.max(1, canvas.clientWidth || window.innerWidth);
  const ch = Math.max(1, canvas.clientHeight || window.innerHeight);
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  let w = Math.round(cw * dpr * renderScale);
  let h = Math.round(ch * dpr * renderScale);

  // Keep the fill rate sane on phones.
  const budget = 2.0e6;
  if (w * h > budget) {
    const k = Math.sqrt(budget / (w * h));
    w = Math.round(w * k); h = Math.round(h * k);
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    renderer.resize(w, h);
  }
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

/* ----------------------------------------------------------------- loop --- */

let last = performance.now();
let slowFrames = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;          // tab switches must not fast-forward the game
  if (dt <= 0) dt = 1 / 60;

  resize();
  input.update(scene, dt);
  updateScene(scene, dt);
  updateCamera(cam, scene, dt);
  ui.update(scene, dt);

  // Sound follows the picture.
  if (scene.milestone > lastMilestone) {
    audio.chime(scene.milestone + 1, 0.6);
    lastMilestone = scene.milestone;
  }
  if (scene.stage !== lastStage) {
    if (scene.stage === STAGE.FINALE) audio.fanfare();
    else audio.whoosh(0.8);
    lastStage = scene.stage;
  }

  const fade = scene.stage === STAGE.TITLE ? 1 : Math.min(1, 0.25 + scene.stageT * 3);
  renderer.render(scene, cam, { fade: scene.stage === STAGE.INTRO ? fade : 1 });

  // Drop resolution if the device is struggling; never raise it back mid-run.
  if (dt > 0.028) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90 && renderScale > 0.62) {
    renderScale = Math.max(0.62, renderScale - 0.18);
    slowFrames = 0;
    resize();
  }

  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { last = performance.now(); });
requestAnimationFrame(frame);

// Handy for screenshots and manual testing.
window.__game = {
  get scene() { return scene; },
  get cam() { return cam; },
  setStage: (st) => setStage(scene, st),
  pick,
  restart,
};
