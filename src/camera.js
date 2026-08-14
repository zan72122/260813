// カメラは演出（ディレクター）が動かす。プレイヤーは動かさない。
// 水がこまった所へ近づいたら寄る / 排水口をさわるときは接写 / 終わったら引き。

import { isoX, isoY, MODEL } from './iso.js';

export function createCamera() {
  return {
    x: 0, y: 0, zoom: 1,
    tx: 0, ty: 0, tzoom: 1,
    fit: 1,
    vw: 1, vh: 1,
    hold: 0,
    priority: 0,
    biasY: 0,
  };
}

export function fitCamera(cam, vw, vh) {
  cam.vw = vw; cam.vh = vh;
  const pad = 1.04;
  // 模型はひし形なので、上下のとがった所（板だけ）は少しはみ出してよい
  const fw = vw / (MODEL.w * pad);
  const fh = vh / ((MODEL.h * 0.82 + 60) * pad);
  cam.fit = Math.min(fw, fh);
  // 下のボタンに街がかくれないよう、すこし上に寄せる
  cam.biasY = -vh * 0.055;
  return cam.fit;
}

// z: 1 = ぜんたい, 1.9 = ふつう, 3.4 = 接写
export function look(cam, gx, gy, z, priority = 0, hold = 0) {
  if (priority < cam.priority && cam.hold > 0) return false;
  cam.tx = isoX(gx, gy);
  cam.ty = isoY(gx, gy) - 24;
  cam.tzoom = cam.fit * z;
  cam.priority = priority;
  cam.hold = hold;
  return true;
}

export function lookWide(cam, priority = 0, hold = 0) {
  if (priority < cam.priority && cam.hold > 0) return false;
  cam.tx = MODEL.cx;
  cam.ty = MODEL.cy - 20;
  cam.tzoom = cam.fit * 1.02;
  cam.priority = priority;
  cam.hold = hold;
  return true;
}

export function updateCamera(cam, dt = 1) {
  if (cam.hold > 0) { cam.hold -= dt; if (cam.hold <= 0) cam.priority = 0; }
  const s = 0.055;
  cam.x += (cam.tx - cam.x) * s;
  cam.y += (cam.ty - cam.y) * s;
  cam.zoom += (cam.tzoom - cam.zoom) * s * 0.9;
  return cam;
}

export function snapCamera(cam) {
  cam.x = cam.tx; cam.y = cam.ty; cam.zoom = cam.tzoom;
}

// world → 画面（CSS px）
export function worldToScreen(cam, wx, wy) {
  return {
    x: (wx - cam.x) * cam.zoom + cam.vw / 2,
    y: (wy - cam.y) * cam.zoom + cam.vh / 2 + cam.biasY,
  };
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: (sx - cam.vw / 2) / cam.zoom + cam.x,
    y: (sy - cam.vh / 2 - cam.biasY) / cam.zoom + cam.y,
  };
}
