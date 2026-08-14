// 画面の向きごとの「再構図」。単なる回転ではなく、桶・抄き枠・道具の
// ワールド配置そのものを縦横で組み替える。
// シートの状態は正規化グリッド(0..1)で保持しているので、
// ここが変わっても製造中の海苔は壊れない。

const PORTRAIT = {
  mode: 'portrait',
  horizon: -140,
  props: [
    { kind: 'frames', x: -420, s: 0.72 },
    { kind: 'bucket', x: 405, s: 0.60 },
    { kind: 'bucket', x: 545, s: 0.48 },
  ],
  vat: { x: 0, y: -335, rx: 300, ry: 132 },
  frame: { x: 0, y: 175, w: 470, h: 372 },
  ladleHome: { x: -230, y: -110 },
  press: { x: 250, y: 470 },
  lever: { x: 350, y: -170 },
  fan: { x: 372, y: 215 },
  stack: { x: 0, y: -300 },
  cam: {
    title: { x: 0, y: -280, w: 820, h: 1120 },
    mix: { x: 0, y: -320, w: 740, h: 1000 },
    pour: { x: 0, y: -60, w: 900, h: 1270 },
    spread: { x: 0, y: 150, w: 720, h: 980 },
    press: { x: 0, y: 165, w: 600, h: 820 },
    dry: { x: 75, y: 90, w: 900, h: 1215 },
    peel: { x: 0, y: 150, w: 590, h: 800 },
    reveal: { x: 0, y: 165, w: 780, h: 1060 },
  },
};

const LANDSCAPE = {
  mode: 'landscape',
  horizon: -230,
  props: [
    { kind: 'frames', x: -880, s: 0.85 },
    { kind: 'bucket', x: -60, s: 0.55 },
    { kind: 'bucket', x: 770, s: 0.75 },
  ],
  vat: { x: -450, y: -25, rx: 268, ry: 120 },
  frame: { x: 195, y: 15, w: 520, h: 400 },
  ladleHome: { x: -140, y: -150 },
  press: { x: 195, y: 330 },
  lever: { x: 640, y: -30 },
  fan: { x: 620, y: 40 },
  stack: { x: -430, y: -20 },
  cam: {
    title: { x: -140, y: -20, w: 1720, h: 960 },
    mix: { x: -450, y: -25, w: 980, h: 555 },
    pour: { x: -110, y: -10, w: 1500, h: 840 },
    spread: { x: 195, y: 15, w: 1340, h: 625 },
    press: { x: 195, y: 15, w: 1290, h: 600 },
    dry: { x: 380, y: 10, w: 1560, h: 730 },
    peel: { x: 195, y: 5, w: 1290, h: 600 },
    reveal: { x: 60, y: 0, w: 1640, h: 920 },
  },
};

// 最終リビール専用の構図（縦横で並べ方を変える）
const REVEAL_P = {
  hold: { x: 0, y: 150 }, stack: { x: 0, y: -155 },
  onigiri: { x: 0, y: 215 }, onigiriS: 1.35,
  bento: { x: 0, y: 520 }, bentoS: 0.68,
  sheetW: 300, sheetH: 232,
};
const REVEAL_L = {
  hold: { x: 60, y: -20 }, stack: { x: -450, y: 10 },
  onigiri: { x: 100, y: 20 }, onigiriS: 1.05,
  bento: { x: 560, y: 40 }, bentoS: 0.6,
  sheetW: 300, sheetH: 232,
};

export function revealLayout(layout) {
  return layout.mode === 'landscape' ? REVEAL_L : REVEAL_P;
}

export function computeLayout(w, h) {
  const base = w / h >= 1.12 ? LANDSCAPE : PORTRAIT;
  return base;
}

// カメラ矩形 → 表示スケール
export function fitScale(rect, sw, sh) {
  return Math.min(sw / rect.w, sh / rect.h);
}
