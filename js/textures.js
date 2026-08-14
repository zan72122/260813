// Baked material tiles.
//
// Each tile already has its lighting solved in (see tools/bake-textures.mjs),
// so painting with one is exactly as expensive as painting with a flat colour
// — a single fill, no extra layers. That is the whole reason this game can
// look like real wood and cloth on a 2018 iPad.
//
// Patterns are locked to WORLD space: they are built with a transform that
// maps the tile onto a fixed number of world units, and filled while the
// camera transform is active. Textures therefore sit on the objects and do
// not swim when the camera moves.

const FILES = ['wood', 'floor', 'bamboo', 'cloth', 'dough', 'flour', 'ice', 'grain'];

const imgs = Object.create(null);
const patterns = new Map();
let loaded = 0;

export const textures = {
  get ready() { return loaded === FILES.length; },
  get progress() { return loaded / FILES.length; },
  has(name) { return !!imgs[name]; },
};

export function loadTextures(onDone) {
  for (const name of FILES) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgs[name] = img;
      if (++loaded === FILES.length && onDone) onDone();
    };
    img.onerror = () => {
      // A missing tile is not fatal: every call site has a flat fallback.
      if (++loaded === FILES.length && onDone) onDone();
    };
    img.src = `assets/baked/${name}.webp`;
  }
}

/**
 * A repeating pattern scaled so one tile covers `span` world units across.
 * Cached per (name, span) — building one is cheap but not free.
 */
export let DISABLE = false;
export function setDisable(v) { DISABLE = v; patterns.clear(); }

export function pattern(ctx, name, span) {
  if (DISABLE) return null;
  const img = imgs[name];
  if (!img) return null;
  const key = name + '|' + span;
  let p = patterns.get(key);
  if (p !== undefined) return p;

  p = ctx.createPattern(img, 'repeat');
  if (p && p.setTransform) {
    const k = span / img.naturalWidth;
    try {
      p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    } catch (e) {
      // Very old Safari: fall back to an untransformed tile rather than none.
    }
  }
  patterns.set(key, p);
  return p;
}

/** Fill the current path with a material, or a flat colour if it is missing. */
export function texStyle(ctx, name, span, fallback) {
  return pattern(ctx, name, span) || fallback;
}

/**
 * Paint a material over the current path, then modulate it with a colour so
 * one tile can serve several objects at different tints and brightnesses.
 * `tint` is applied with 'multiply', which keeps the relief and grain.
 */
export function paintMaterial(ctx, name, span, fallback, tint, tintAlpha = 0) {
  ctx.fillStyle = texStyle(ctx, name, span, fallback);
  ctx.fill();
  if (tint && tintAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.restore();
  }
}

export function image(name) { return imgs[name] || null; }

/** Drop cached patterns — call if the drawing context is ever replaced. */
export function resetPatterns() { patterns.clear(); }
