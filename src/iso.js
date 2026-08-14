// 斜め上から見たミニチュア（アイソメ投影）。カメラ操作は自由にはさせない。

import { W, H } from './city.js';

export const TW = 16;     // セル1つの横はば（zoom=1 のとき）
export const TH = 10;     // セル1つのたてはば → 見おろし角 ≒ 39°
export const TW2 = TW / 2;
export const TH2 = TH / 2;
export const HZ = 26;     // 高さ1.0 あたりの画面ピクセル

export function isoX(gx, gy) { return (gx - gy) * TW2; }
export function isoY(gx, gy, gz = 0) { return (gx + gy) * TH2 - gz * HZ; }

// 模型ぜんたいの大きさ（world 座標）
export const MODEL = {
  minX: isoX(0, H),
  maxX: isoX(W, 0),
  minY: isoY(0, 0),
  maxY: isoY(W, H),
};
MODEL.w = MODEL.maxX - MODEL.minX;
MODEL.h = MODEL.maxY - MODEL.minY;
MODEL.cx = (MODEL.minX + MODEL.maxX) / 2;
MODEL.cy = (MODEL.minY + MODEL.maxY) / 2;

// 画面 → グリッド（高さ 0 の面で交わる点）
export function unproject(wx, wy) {
  const a = wx / TW2, b = wy / TH2;
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

// グリッド空間の画像/図形を world へ乗せるための行列
export function gridMatrix() {
  return [TW2, TH2, -TW2, TH2, 0, 0];
}
