/**
 * 画面レイアウト。たて（ポートレート）よこ（ランドスケープ）両対応。
 * canvas と DOM の UI が同じ場所を使うように、ここで一元管理して CSS 変数にも書き出す。
 */

export interface Layout {
  /** CSS ピクセルでの画面サイズ */
  w: number;
  h: number;
  dpr: number;
  portrait: boolean;
  safe: { top: number; right: number; bottom: number; left: number };
  /** 上の情報バーの高さ */
  topBar: number;
  /** 操作パネルの帯の太さ（たて=下、よこ=右） */
  panel: number;
  /** 視野（まるい窓）の中心と半径 */
  fieldCx: number;
  fieldCy: number;
  fieldR: number;
  /** UI をのぞいた、絵を描いてよい範囲 */
  availW: number;
  availH: number;
}

function readSafeAreaInsets(): Layout['safe'] {
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : 0;
  };
  return {
    top: num('--sa-top'),
    right: num('--sa-right'),
    bottom: num('--sa-bottom'),
    left: num('--sa-left'),
  };
}

/**
 * canvas は CSS で画面いっぱいに広げてある。その実寸をそのまま採寸するので、
 * iOS の URL バーの出入りなどでサイズがずれても、すきまが出ない。
 */
export function computeLayout(maxDpr = 2, box?: { width: number; height: number }): Layout {
  const vv = window.visualViewport;
  const w = Math.round(box?.width || vv?.width || window.innerWidth);
  const h = Math.round(box?.height || vv?.height || window.innerHeight);
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const portrait = h >= w;
  const safe = readSafeAreaInsets();

  const topBar = (portrait ? 84 : 68) + safe.top;
  const panel = portrait ? 146 + safe.bottom : 176 + safe.right;

  const availLeft = safe.left;
  const availTop = topBar;
  const availW = w - safe.left - (portrait ? safe.right : panel);
  const availH = h - topBar - (portrait ? panel : safe.bottom);

  const fieldCx = availLeft + availW / 2;
  const fieldCy = availTop + availH / 2;
  const fieldR = Math.max(70, Math.min(availW / 2 - 10, availH / 2 - 10));

  return {
    w,
    h,
    dpr,
    portrait,
    safe,
    topBar,
    panel,
    fieldCx,
    fieldCy,
    fieldR,
    availW,
    availH,
  };
}

export function applyLayoutVars(l: Layout): void {
  const s = document.documentElement.style;
  s.setProperty('--top-bar', `${l.topBar}px`);
  s.setProperty('--panel', `${l.panel}px`);
  s.setProperty('--field-cx', `${l.fieldCx}px`);
  s.setProperty('--field-cy', `${l.fieldCy}px`);
  s.setProperty('--field-r', `${l.fieldR}px`);
}
