import { Game } from './game.js';

const canvas = document.getElementById('gl');

function fail(msg) {
  const boot = document.getElementById('boot');
  if (boot) {
    boot.innerHTML =
      `<p style="color:#cdd8ee;font:14px/1.8 system-ui;padding:2em;text-align:center;max-width:26em">${msg}</p>`;
  }
}

let game;
try {
  game = new Game(canvas);
} catch (err) {
  console.error(err);
  fail('このブラウザでは表示できませんでした。<br>WebGL2 に対応したブラウザでお試しください。');
  throw err;
}

game.layout();

// テストから決定的に動かすための入口
const params = new URLSearchParams(location.search);
const fixedSeed = params.get('seed');
if (fixedSeed !== null) game.reset((parseInt(fixedSeed, 10) || 0) >>> 0);

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
let manual = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (manual) return;
  step(dt);
}

function step(dt) {
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 6) {
    game.update(STEP);
    acc -= STEP;
  }
  game.render();
  game.adaptQuality(dt);
}

document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
});

requestAnimationFrame(frame);
game.hud.hideBoot();

// E2E 用：論理時間を直接進められるようにしておく
window.__game = {
  get stage() { return game.stage; },
  get align() { return game.align; },
  get charge() { return game.charge; },
  get open() { return game.open; },
  get seed() { return game.def.seed; },
  get camT() { return game.camT; },
  reset: (s) => game.reset(s >>> 0),
  setManual: (v) => { manual = !!v; },
  advance: (seconds) => {
    const n = Math.max(1, Math.round(seconds / STEP));
    for (let i = 0; i < n; i++) game.update(STEP);
    game.render();
  },
  drop: () => { game.dropping = true; },
  charge_: (v) => { game.charge = Math.min(1, v); },
  aim: (offSpin = 0, offTilt = 0) => {
    game.spin = game.best.spin + offSpin;
    game.tilt = game.best.tilt + offTilt;
  },
  jump: (name) => game.setStage(name),
  setMagnet: (v) => { game.noMagnet = !v; },
};
