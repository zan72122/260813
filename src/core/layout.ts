/**
 * Layout maths for the card stage.
 *
 * The card lives in WebGL while the buttons live in the DOM, so both need to
 * agree on exactly where the card sits. Everything here is pure and measured in
 * CSS pixels with the origin at the top-left of the viewport.
 */

export const CARD_ASPECT = 0.7; // width / height, like a trading card

export interface Rect {
  x: number; // centre x
  y: number; // centre y
  w: number;
  h: number;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/** How much room the UI bands need above/below the card, per orientation. */
export interface Reserve {
  top: number;
  bottom: number;
  side: number;
}

export function reserveFor(vw: number, vh: number, safe: SafeArea = NO_SAFE_AREA): Reserve {
  const portrait = vh >= vw;
  if (portrait) {
    return {
      top: safe.top + Math.max(64, vh * 0.1),
      bottom: safe.bottom + Math.max(118, vh * 0.18),
      side: Math.max(safe.left, safe.right) + Math.max(16, vw * 0.06),
    };
  }
  // Landscape puts the UI in columns beside the card rather than bands above
  // and below it, so almost the whole height is the card's to use.
  return {
    top: safe.top + Math.max(20, vh * 0.05),
    bottom: safe.bottom + Math.max(20, vh * 0.05),
    side: Math.max(safe.left, safe.right) + Math.max(110, vw * 0.22),
  };
}

export function isLandscape(vw: number, vh: number): boolean {
  return vw > vh;
}

/** Per-phase adjustments, e.g. the title screen needs more room above the card. */
export interface RectTweak {
  top?: number;
  bottom?: number;
  scale?: number;
}

/**
 * Largest card of CARD_ASPECT that fits the free area, centred in it.
 * Never returns a zero/negative size, so the renderer can always draw.
 */
export function computeCardRect(
  vw: number,
  vh: number,
  safe: SafeArea = NO_SAFE_AREA,
  tweak: RectTweak = {},
): Rect {
  const base = reserveFor(vw, vh, safe);
  const top = base.top + (tweak.top ?? 0);
  const bottom = base.bottom + (tweak.bottom ?? 0);
  const boxW = Math.max(40, vw - base.side * 2);
  const boxH = Math.max(56, vh - top - bottom);

  let h = boxH;
  let w = h * CARD_ASPECT;
  if (w > boxW) {
    w = boxW;
    h = w / CARD_ASPECT;
  }
  const scale = tweak.scale ?? 1;
  return {
    x: vw / 2,
    y: top + boxH / 2,
    w: w * scale,
    h: h * scale,
  };
}

export function rectTop(rect: Rect): number {
  return rect.y - rect.h / 2;
}

export function rectBottom(rect: Rect): number {
  return rect.y + rect.h / 2;
}

/**
 * Map a viewport point to card-local UV (0..1, origin top-left of the card).
 * Values outside 0..1 mean the touch is off the card.
 */
export function pointToCardUv(px: number, py: number, rect: Rect): { u: number; v: number } {
  return {
    u: (px - (rect.x - rect.w / 2)) / rect.w,
    v: (py - (rect.y - rect.h / 2)) / rect.h,
  };
}

export function isInsideCard(px: number, py: number, rect: Rect, slack = 0): boolean {
  const { u, v } = pointToCardUv(px, py, rect);
  const s = slack;
  return u >= -s && u <= 1 + s && v >= -s && v <= 1 + s;
}
