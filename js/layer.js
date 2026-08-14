// Backdrop cache.
//
// Painting a repeating material costs several times what a flat colour costs,
// because every pixel is resampled from the tile. For the big surfaces — the
// wall, the floor, the table under the finished bowl — that is a full screen
// of resampling on every frame, which is exactly the budget an old iPad does
// not have.
//
// But those surfaces only change when the camera does. So we render them once
// into an offscreen canvas and blit it 1:1 while the camera holds still, which
// most of the time it does: the camera is game-driven and settles after every
// stage change. Motion re-renders, stillness is free.

import { screenSize, camera } from './scene.js';

let canvas = null;
let ctx = null;
let key = '';
let valid = false;

/** Content changed for reasons other than the camera (a fade, a mood swap). */
export function invalidateBackdrop() { valid = false; }

// The backdrop is scenery, never the subject, so it is baked at reduced
// resolution: the re-render that happens when the camera settles costs half
// as much, and the slight softness reads as depth rather than as blur.
const BAKE = 0.72;

function ensure() {
  const w = Math.max(1, Math.round(screenSize.w * screenSize.dpr * BAKE));
  const h = Math.max(1, Math.round(screenSize.h * screenSize.dpr * BAKE));
  if (!canvas) {
    canvas = document.createElement('canvas');
    // Opaque: the layer covers the whole screen, so the blit is a plain copy.
    ctx = canvas.getContext('2d', { alpha: false });
  }
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    valid = false;
  }
  return ctx;
}

/**
 * Draw the backdrop, reusing the cached bitmap when nothing that affects it
 * has moved. `stateKey` must fold in every animated value the draw reads.
 */
export function drawBackdrop(destCtx, stateKey, paintScreen, paint) {
  // Quantise the camera so a pixel of drift does not throw the cache away.
  const k = `${stateKey}|${Math.round(camera.x * 2)}|${Math.round(camera.y * 2)}|${Math.round(camera.scale * 700)}`;

  // While the key is still changing — a fade in progress, the camera easing —
  // caching would cost a render *and* a blit every frame. So churn draws
  // straight to the screen, exactly as it did before there was a cache, and
  // only a settled scene pays for the bitmap.
  if (k !== key) {
    key = k;
    valid = false;
    destCtx.save();
    destCtx.setTransform(screenSize.dpr, 0, 0, screenSize.dpr, 0, 0);
    paintScreen(destCtx);
    destCtx.translate(screenSize.w / 2 + camera.shakeX, screenSize.h / 2 + camera.shakeY);
    destCtx.scale(camera.scale, camera.scale);
    destCtx.translate(-camera.x, -camera.y);
    paint(destCtx);
    destCtx.restore();
    return;
  }

  const lctx = ensure();
  if (!valid) {
    valid = true;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.save();
    lctx.setTransform(screenSize.dpr * BAKE, 0, 0, screenSize.dpr * BAKE, 0, 0);
    // The sky gradient goes in the layer too, so the blit replaces both the
    // background fill and the backdrop instead of stacking on top of it.
    paintScreen(lctx);
    lctx.translate(screenSize.w / 2, screenSize.h / 2);
    lctx.scale(camera.scale, camera.scale);
    lctx.translate(-camera.x, -camera.y);
    paint(lctx);
    lctx.restore();
  }
  destCtx.save();
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  // Camera shake is applied at blit time, so a kick never invalidates the
  // cache — it just slides the finished bitmap.
  destCtx.drawImage(canvas,
    camera.shakeX * screenSize.dpr, camera.shakeY * screenSize.dpr,
    canvas.width / BAKE, canvas.height / BAKE);
  destCtx.restore();
}

/** Rounded to a step, for use in cache keys. */
export const q = (v, step = 0.02) => Math.round(v / step);
