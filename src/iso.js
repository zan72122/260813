// 斜め上から見たミニチュア（アイソメ投影）。カメラ操作は自由にはさせない。
//
// たて長の画面では、見おろす角度をすこし急にする。
// そうしないと横長のひし形が画面のまん中にぽつんと小さく写ってしまう。

import { W, H } from './city.js';

export const TW = 16;      // セル1つの横はば（zoom=1 のとき）
export const TW2 = TW / 2;
export const HZ = 26;      // 高さ1.0 あたりの画面ピクセル

export let TH = 10;        // セル1つのたてはば（見おろし角）
export let TH2 = TH / 2;

// 模型ぜんたいの大きさ（world 座標）
export const MODEL = { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 };

function updateModel() {
  MODEL.minX = isoX(0, H);
  MODEL.maxX = isoX(W, 0);
  MODEL.minY = isoY(0, 0);
  MODEL.maxY = isoY(W, H);
  MODEL.w = MODEL.maxX - MODEL.minX;
  MODEL.h = MODEL.maxY - MODEL.minY;
  MODEL.cx = (MODEL.minX + MODEL.maxX) / 2;
  MODEL.cy = (MODEL.minY + MODEL.maxY) / 2;
}

// th を変えると見おろし角が変わる。10 ≒ 39°, 13 ≒ 54°
export function setProjection(th) {
  if (th === TH) return false;
  TH = th;
  TH2 = th / 2;
  updateModel();
  return true;
}

export function isoX(gx, gy) { return (gx - gy) * TW2; }
export function isoY(gx, gy, gz = 0) { return (gx + gy) * TH2 - gz * HZ; }

// 画面 → グリッド（高さ 0 の面で交わる点）
export function unproject(wx, wy) {
  const a = wx / TW2, b = wy / TH2;
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

updateModel();
