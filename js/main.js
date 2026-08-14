// Boot, main loop, screen-space UI, and the automated playthrough hook.

import { clamp01, lerp, easeInOut, dist } from './util.js';
import {
  initCanvas, getCtx, beginWorld, beginScreen, end, camera, pointer,
  onPointer, endFrameInput, screenSize, virtualPointer, setRenderScale, getRenderScale,
} from './scene.js';
import { W, updateWorld } from './world.js';
import {
  initStages, updateStages, pointerEvent, restart, goTo, currentStage,
  currentIndex, stageIds, autoPlan,
} from './stages.js';
import { updateFx, drawFx, updateRings, drawRings } from './fx.js';
import { unlock, toggleMute, audio, updateAudio, sfx } from './audio.js';
import { loadTextures, textures, setDisable } from './textures.js';
import { drawBackdrop, invalidateBackdrop, q } from './layer.js';
import * as art from './art.js';

const canvas = document.getElementById('stage');
const ctx = initCanvas(canvas);

W.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ------------------------------------------------------------------ UI

function speakerPos() {
  const r = Math.max(20, Math.min(28, Math.min(screenSize.w, screenSize.h) * 0.045));
  return { x: screenSize.w - r - 16, y: r + 16, r };
}
function replayPos() {
  const r = Math.max(38, Math.min(66, Math.min(screenSize.w, screenSize.h) * 0.11));
  return { x: screenSize.w / 2, y: screenSize.h - r - 26, r };
}

let uiConsumed = false;

onPointer((type) => {
  if (type === 'down') {
    unlock();
    uiConsumed = false;

    const sp = speakerPos();
    if (dist(pointer.sx, pointer.sy, sp.x, sp.y) < sp.r * 1.5) {
      toggleMute();
      if (!audio.muted) sfx.note(4, 0.12);
      uiConsumed = true;
      return;
    }
    if (W.replay > 0.5) {
      const rp = replayPos();
      if (dist(pointer.sx, pointer.sy, rp.x, rp.y) < rp.r * 1.5) {
        sfx.note(7, 0.14);
        restart();
        uiConsumed = true;
        return;
      }
    }
  }
  if (uiConsumed) {
    if (type === 'up') uiConsumed = false;
    return;
  }
  pointerEvent(type);
});

// ------------------------------------------------------------- autoplay
// Drives the real input path with a virtual finger. Used by the smoke test
// and handy for watching the whole loop without touching the screen.

const auto = { on: false, g: null, t: 0, wait: 0 };

function updateAuto(dt) {
  if (!auto.on) return;
  if (auto.wait > 0) { auto.wait -= dt; return; }

  if (!auto.g) {
    const plan = autoPlan();
    if (!plan) { auto.wait = 0.12; return; }
    auto.g = plan;
    auto.t = 0;
    const s = camera.toScreen(plan.type === 'tap' ? plan.x : plan.x0, plan.type === 'tap' ? plan.y : plan.y0);
    virtualPointer.down(s.x, s.y);
    return;
  }

  const g = auto.g;
  auto.t += dt;
  if (g.type === 'tap') {
    if (auto.t > 0.1) { virtualPointer.up(); auto.g = null; auto.wait = 0.14; }
    return;
  }
  const k = clamp01(auto.t / (g.dur || 0.5));
  const e = easeInOut(k);
  const s = camera.toScreen(lerp(g.x0, g.x1, e), lerp(g.y0, g.y1, e));
  virtualPointer.move(s.x, s.y);
  if (k >= 1) { virtualPointer.up(); auto.g = null; auto.wait = 0.2; }
}

// ---------------------------------------------------------------- render

/** Everything the cached backdrop's appearance depends on, besides the camera. */
function backdropKey() {
  return [
    W.mood.from, W.mood.to, q(W.mood.t, 0.06),
    q(W.shopAlpha, 0.1), q(W.floorAlpha, 0.1), q(W.floorY, 16),
    q(W.bowlA, 0.1), q(W.dryness, 0.12),
    q(W.boardAlpha, 0.1), q(W.cutBoardAlpha, 0.1), q(W.ball.x, 20), q(W.grain, 0.1),
  ].join(',');
}

function render() {
  // The sky, wall, floor and table are expensive to paint (repeating
  // materials are resampled per pixel) but only change when the camera does
  // — so they are cached together and blitted while the camera holds still.
  // Folding the background gradient into the same layer means one opaque
  // copy replaces what used to be two full-screen passes.
  beginScreen();
  drawBackdrop(ctx, backdropKey(), (g) => art.drawBackground(g), (g) => {
    art.drawSky(g);
    art.drawShop(g, W.shopAlpha);
    art.drawFloor(g, W.floorY, W.floorAlpha);
    art.drawBoard(g, W.ball.x * 0.6, 105, 340, W.boardAlpha);
    art.drawCuttingBoard(g, W.cutBoardAlpha);
    if (W.bowlA > 0.01) art.drawRevealTable(g, W.bowlA);
  }, (g) => art.drawGrain(g, W.grain));
  end();

  beginWorld();
  art.drawSkyLive(ctx);
  art.drawBackRacks(ctx);
  art.drawRack(ctx);
  art.drawGuides(ctx);
  art.drawBundleGlow(ctx, W.glow);

  ctx.save();
  if (W.layout.to === 'bundle' && Math.abs(W.bundle.rot) > 0.001) ctx.rotate(W.bundle.rot);
  art.drawStrands(ctx);
  if (W.band.on) art.drawBand(ctx);
  ctx.restore();
  if (!W.band.on) art.drawBand(ctx);

  art.drawOffcuts(ctx);
  art.drawBottomRod(ctx);
  art.drawComb(ctx, W.combAlpha);
  art.drawRope(ctx);
  art.drawBall(ctx);
  art.drawBlobs(ctx);

  if (W.potA > 0.01) {
    art.drawPot(ctx, W.potA);
    art.drawBoilingNoodles(ctx, W.boilA);
  }
  if (W.bowlA > 0.01) art.drawBowlScene(ctx, W.bowlA);

  drawFx(ctx);
  drawRings(ctx);
  art.drawHint(ctx);
  end();

  beginScreen();
  if (W.steamA > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${clamp01(W.steamA) * 0.94})`;
    ctx.fillRect(0, 0, screenSize.w, screenSize.h);
  }
  art.drawSunbeams(ctx, W.beams);
  art.drawVignette(ctx);
  const sp = speakerPos();
  art.drawSpeaker(ctx, sp.x, sp.y, sp.r, audio.muted);
  if (W.replay > 0.02) {
    ctx.save();
    ctx.globalAlpha = W.replay;
    const rp = replayPos();
    art.drawReplay(ctx, rp.x, rp.y, rp.r, W.time);
    ctx.restore();
  }
  end();
}

// ------------------------------------------------------------------ loop

let last = performance.now();
let timeScale = 1;
let running = true;

// Adaptive resolution. Older iPads are fill-rate bound long before they are
// CPU bound, so when frames run long we render fewer pixels rather than let
// the animation stutter. Hysteresis + a cooldown keep it from oscillating.
const perf = { samples: [], cooldown: 3 };

function adapt(dtMs) {
  perf.cooldown -= dtMs / 1000;
  perf.samples.push(dtMs);
  if (perf.samples.length < 60) return;
  const sorted = perf.samples.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  perf.samples.length = 0;
  if (perf.cooldown > 0) return;
  const s = getRenderScale();
  if (median > 26 && s > 0.56) {
    setRenderScale(s - 0.15);
    perf.cooldown = 2.5;
  } else if (median < 13 && s < 1) {
    setRenderScale(s + 0.1);
    perf.cooldown = 4;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawMs = now - last;
  let dt = rawMs / 1000;
  last = now;
  if (!running) return;
  // A backgrounded tab can hand us a huge dt; clamp so nothing teleports.
  if (rawMs < 500) adapt(rawMs);
  dt = Math.min(dt, 1 / 20) * timeScale;

  step(dt);
  render();
}

function step(dt) {
  updateAuto(dt);
  updateStages(dt);
  updateWorld(dt);
  camera.update(dt);
  updateFx(dt);
  updateRings(dt);
  updateAudio(dt);
  endFrameInput(dt);
}

document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  last = performance.now();
});

// Materials stream in behind the game: every draw call has a flat-colour
// fallback, so the first frame paints immediately and simply gets richer.
// The cached backdrop must be told, or it keeps serving the bitmap it baked
// from those fallbacks for the rest of the session.
loadTextures(() => invalidateBackdrop());

initStages();
requestAnimationFrame(frame);

// --------------------------------------------------------- test handles

window.__somenToScreen = (wx, wy) => camera.toScreen(wx, wy);
window.__somenPointerId = () => pointer.id;

window.__somen = {
  ready: true,
  get stage() { return currentStage(); },
  get index() { return currentIndex(); },
  get stages() { return stageIds(); },
  get world() { return W; },
  get done() { return W.done; },
  get texturesReady() { return textures.ready; },
  auto(on = true) { auto.on = on; },
  speed(x) { timeScale = x; },
  get renderScale() { return getRenderScale(); },
  setRenderScale(k) { setRenderScale(k); },
  noTextures(v) { setDisable(v); },
  jump(i) { goTo(i); },
  restart() { restart(); },
};
