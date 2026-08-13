// One gesture at a time, chosen by the stage the game is in.

import { STAGE, applyDragFog, applySwipe, applyHold } from './scene.js';

export function createInput(canvas, getState, hooks = {}) {
  let id = null;
  let lx = 0, ly = 0;
  let down = false;
  let moved = 0;
  let downTime = 0;

  const size = () => ({ w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 });

  function onDown(e) {
    if (id !== null) return;
    id = e.pointerId;
    down = true;
    moved = 0;
    downTime = performance.now();
    lx = e.clientX; ly = e.clientY;
    canvas.setPointerCapture?.(id);
    hooks.onFirstTouch?.();
    const s = getState();
    if (s) s.idle = 0;
    e.preventDefault();
  }

  function onMove(e) {
    if (!down || e.pointerId !== id) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    moved += Math.hypot(dx, dy);
    const s = getState();
    if (!s) return;
    const { w, h } = size();

    // Stage 3 is a press, not a drag: a wobbling finger must not move the child.
    if (s.stage === STAGE.FOG) applyDragFog(s, dx, dy, w, h);
    else if (s.stage === STAGE.ALIGN || s.stage === STAGE.FINALE) applySwipe(s, dx, w);
    e.preventDefault();
  }

  function onUp(e) {
    if (e.pointerId !== id) return;
    const s = getState();
    if (s && moved < 12 && performance.now() - downTime < 400) hooks.onTap?.(s);
    down = false;
    id = null;
    e.preventDefault();
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp, { passive: false });
  canvas.addEventListener('pointercancel', onUp, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // Holding is a per-frame effect, so it lives in the update loop.
    update(s, dt) {
      if (!s) return;
      if (down && s.stage === STAGE.MIST) applyHold(s, dt);
      if (down) s.idle = 0;
    },
    get isDown() { return down; },
    reset() { down = false; id = null; moved = 0; },
  };
}
