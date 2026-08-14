// 描画層。Canvas2D のみ（WebGL2 相当の環境がなくても看板演出が成立する）。
// 描画予算は 3 つの Hero Material に集中する:
//   1) 琥珀色で半透明なカラメル
//   2) なめらかな黄色いプリン
//   3) 光沢のある銀色の型
import { TAU, clamp, lerp, mixHex, mixHexA, rgba, smooth } from './util.js';
/* eslint-disable no-unused-vars */

// --- 形状定数（ワールド単位） ---------------------------------------------
export const MOLD = { rb: 40, rt: 54, h: 64, wall: 3.4 };
export const PUD = {
  rb: MOLD.rt - MOLD.wall, // 反転後の下（広い方）
  rt: MOLD.rb - MOLD.wall, // 反転後の上（狭い方）
  h: MOLD.h - 2,
};
export const PLATE = { r: 116, h: 10 };

// --- グラデーション ---------------------------------------------------------
// 座標はカメラ変換後のローカル空間なので毎フレーム作り直す（キャッシュ不可）。
// key 引数は呼び出し側の可読性のためだけに残している。
function lg(ctx, key, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}
function rg(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}
export function clearGradientCache() {
  bgCache.key = '';
}

// --- 基本ヘルパ -------------------------------------------------------------
export function ellipse(ctx, cx, cy, rx, ry, from = 0, to = TAU, ccw = false) {
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), 0, from, to, ccw);
}

export function ground(ctx, v, wx, base, r, alpha = 0.3, tint = '#6b4a2a') {
  const y = v.Y(base);
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, v.X(wx), y, r, r * v.k);
  const g = rg(
    ctx,
    `sh${Math.round(r)}${tint}`,
    v.X(wx),
    y,
    0,
    v.X(wx),
    y,
    r,
    [
      [0, rgba(tint, 0.55)],
      [0.55, rgba(tint, 0.28)],
      [1, rgba(tint, 0)],
    ]
  );
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// 円錐台のシルエットパス（開口部は含めない）。
function frustumPath(ctx, cx, yBot, yTop, rBot, rTop, k) {
  ctx.beginPath();
  ellipse(ctx, cx, yTop, rTop, rTop * k, Math.PI, TAU); // 上面の奥側
  ctx.lineTo(cx + rBot, yBot);
  ellipse(ctx, cx, yBot, rBot, rBot * k, 0, Math.PI); // 底面の手前側
  ctx.closePath();
}

// --- 背景 -------------------------------------------------------------------
// 壁・光・周辺減光は画面サイズと寒色度でしか変わらないので、オフスクリーンに焼いて
// 毎フレームは drawImage 2 回で済ませる（iPad の高解像度でも塗り面積を稼がない）。
const bgCache = { key: '', back: null, front: null };

function bakeBackground(v, tint) {
  const key = `${v.w}x${v.h}@${v.dpr}:${tint.toFixed(2)}`;
  if (bgCache.key === key) return bgCache;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(v.w * v.dpr));
    cv.height = Math.max(1, Math.round(v.h * v.dpr));
    const c2 = cv.getContext('2d');
    c2.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    return { cv, c2 };
  };
  const back = mk();
  const g = back.c2.createLinearGradient(0, 0, 0, v.h);
  g.addColorStop(0, mixHex('#e8c9a6', '#a9c9de', tint));
  g.addColorStop(0.5, mixHex('#d9b189', '#8fb4cd', tint));
  g.addColorStop(1, mixHex('#b98a5f', '#6d93ad', tint));
  back.c2.fillStyle = g;
  back.c2.fillRect(0, 0, v.w, v.h);
  const lx = v.w * 0.32;
  const ly = v.h * 0.18;
  const lr = Math.max(v.w, v.h) * 0.8;
  const gl = back.c2.createRadialGradient(lx, ly, 0, lx, ly, lr);
  gl.addColorStop(0, 'rgba(255,246,222,0.72)');
  gl.addColorStop(0.42, 'rgba(255,238,206,0.20)');
  gl.addColorStop(1, 'rgba(255,232,196,0)');
  back.c2.fillStyle = gl;
  back.c2.fillRect(0, 0, v.w, v.h);

  const front = mk();
  const vg = front.c2.createRadialGradient(
    v.w * 0.5,
    v.h * 0.5,
    Math.min(v.w, v.h) * 0.32,
    v.w * 0.5,
    v.h * 0.5,
    Math.max(v.w, v.h) * 0.78
  );
  vg.addColorStop(0, 'rgba(56,26,4,0)');
  vg.addColorStop(0.55, 'rgba(56,26,4,0.14)');
  vg.addColorStop(1, 'rgba(48,22,3,0.52)');
  front.c2.fillStyle = vg;
  front.c2.fillRect(0, 0, v.w, v.h);

  bgCache.key = key;
  bgCache.back = back.cv;
  bgCache.front = front.cv;
  return bgCache;
}

export function background(ctx, v, tint = 0) {
  const c = v.begin();
  // 寒色度は 0.05 刻みに丸めて、キャッシュが毎フレーム作り直されないようにする。
  const t = Math.round(clamp(tint) * 20) / 20;
  const baked = bakeBackground(v, t);
  c.drawImage(baked.back, 0, 0, v.w, v.h);

  // 作業台（巨大な地面楕円）
  const w = v.world();
  const R = 430;
  const y0 = v.Y(0);
  w.beginPath();
  ellipse(w, v.X(0), y0, R, R * v.k);
  const tg = rg(
    w,
    'table' + tint.toFixed(1),
    v.X(0),
    y0,
    0,
    v.X(0),
    y0,
    R,
    [
      [0, mixHex('#f0d3b2', '#cfe6f6', tint)],
      [0.42, mixHex('#dcb289', '#aecfe6', tint)],
      [0.8, mixHexA('#b8865c', '#7fa5be', tint, 0.92)],
      [1, mixHexA('#a8764c', '#6f96b0', tint, 0)],
    ]
  );
  w.fillStyle = tg;
  w.fill();

  // 画面周辺の減光（視線を中央へ）。必ず画面座標に戻してから描く。
  v.begin();
  c.drawImage(baked.front, 0, 0, v.w, v.h);
}

// --- 銀色の型 ---------------------------------------------------------------
// o: { x, base, open(bool 上が開いている), flipped(bool 広い方が下),
//      caramel(0..1), custard(0..1), set(bool), frost(0..1), alpha }
export function mold(ctx, v, o) {
  const x = v.X(o.x ?? 0);
  const base = o.base ?? 0;
  const h = MOLD.h;
  const flipped = !!o.flipped;
  const rBot = flipped ? MOLD.rt : MOLD.rb;
  const rTop = flipped ? MOLD.rb : MOLD.rt;
  const yBot = v.Y(base);
  const yTop = v.Y(base + h);
  const k = v.k;

  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;

  // 本体
  frustumPath(ctx, x, yBot, yTop, rBot, rTop, k);
  ctx.fillStyle = lg(ctx, 'metal' + Math.round(rTop), x - rTop, 0, x + rTop, 0, [
    [0, '#6c7783'],
    [0.1, '#9aa7b3'],
    [0.24, '#e9f0f6'],
    [0.34, '#ffffff'],
    [0.46, '#c9d4de'],
    [0.62, '#93a0ac'],
    [0.78, '#c6d1db'],
    [0.92, '#7b8794'],
    [1, '#5b6672'],
  ]);
  ctx.fill();

  // 型の横リブ（プリン型らしい段）
  ctx.save();
  frustumPath(ctx, x, yBot, yTop, rBot, rTop, k);
  ctx.clip();
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const yy = lerp(yBot, yTop, t);
    const rr = lerp(rBot, rTop, t);
    ctx.beginPath();
    ellipse(ctx, x, yy, rr, rr * k, 0, Math.PI);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    ctx.beginPath();
    ellipse(ctx, x, yy + 1.6, rr, rr * k, 0, Math.PI);
    ctx.strokeStyle = 'rgba(60,72,86,0.28)';
    ctx.stroke();
  }
  // 霜（冷却後）
  if (o.frost > 0) {
    ctx.globalAlpha = o.frost * 0.75;
    ctx.fillStyle = lg(ctx, 'frost', x, yTop, x, yBot, [
      [0, 'rgba(228,244,255,0.15)'],
      [1, 'rgba(240,250,255,0.9)'],
    ]);
    ctx.fillRect(x - rTop - 4, yTop - 20, rTop * 2 + 8, yBot - yTop + 40);
    ctx.globalAlpha = o.frost * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI + 0.15;
      const t = ((i * 37) % 100) / 100;
      const rr = lerp(rBot, rTop, t) * 0.92;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, lerp(yBot, yTop, t), 1.1 + (i % 3) * 0.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  if (o.open) {
    // 開口部（内側）
    const rin = rTop - MOLD.wall;
    ctx.beginPath();
    ellipse(ctx, x, yTop, rTop, rTop * k);
    ctx.fillStyle = lg(ctx, 'rim', x - rTop, 0, x + rTop, 0, [
      [0, '#8e9aa6'],
      [0.35, '#ffffff'],
      [0.7, '#aab6c2'],
      [1, '#78838f'],
    ]);
    ctx.fill();

    // 内壁
    ctx.save();
    ctx.beginPath();
    ellipse(ctx, x, yTop, rin, rin * k);
    ctx.clip();
    ctx.fillStyle = lg(ctx, 'inwall', x, yTop - rin * k, x, yTop + rin * k, [
      [0, '#3f4854'],
      [0.5, '#5d6875'],
      [1, '#98a4b0'],
    ]);
    ctx.fillRect(x - rin - 2, yTop - rin * k - 2, rin * 2 + 4, rin * k * 2 + 4);

    // 中身
    const cara = clamp(o.caramel ?? 0);
    const cust = clamp(o.custard ?? 0);
    const depth = rin * k * 0.95; // 見かけの深さ（開口の楕円内に収まる範囲）
    if (cara > 0) {
      const yy = yTop + depth * (1 - cara * 0.18);
      const rr = rin * (0.5 + cara * 0.2);
      ctx.beginPath();
      ellipse(ctx, x, yy, rr, rr * k);
      ctx.fillStyle = rg(ctx, 'carapool', x, yy, 0, x, yy, rr, [
        [0, '#e39a3c'],
        [0.6, '#c0761f'],
        [1, '#8a4f12'],
      ]);
      ctx.fill();
      ctx.beginPath();
      ellipse(ctx, x - rr * 0.25, yy - rr * k * 0.3, rr * 0.42, rr * k * 0.34);
      ctx.fillStyle = 'rgba(255,220,150,0.45)';
      ctx.fill();
    }
    if (cust > 0) {
      const yy = yTop + depth * (1 - cust * 0.98);
      const rr = lerp(rin * 0.56, rin * 0.985, cust);
      ctx.beginPath();
      ellipse(ctx, x, yy, rr, rr * k);
      const base1 = o.set ? '#ffd964' : '#ffe28f';
      const base2 = o.set ? '#f0b93f' : '#f8cf6a';
      ctx.fillStyle = rg(ctx, 'custpool' + (o.set ? 1 : 0), x, yy, 0, x, yy, rr, [
        [0, o.set ? '#ffe9a8' : '#fff0c4'],
        [0.55, base1],
        [1, base2],
      ]);
      ctx.fill();
      // カラメルが壁に残す茶色い縁（二層の記憶）
      if (cara > 0 && cust < 0.995) {
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = rgba('#a15c14', 0.5 * (1 - cust * 0.4));
        ctx.stroke();
      }
      // 液面のハイライト
      ctx.beginPath();
      ellipse(ctx, x - rr * 0.28, yy - rr * k * 0.34, rr * 0.4, rr * k * 0.3);
      ctx.fillStyle = o.set ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.5)';
      ctx.fill();
    }
    ctx.restore();

    // 内側リムの光
    ctx.beginPath();
    ellipse(ctx, x, yTop, rin, rin * k);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
  } else {
    // 閉じた面（反転後の型の天面）
    const rr = rTop;
    ctx.beginPath();
    ellipse(ctx, x, yTop, rr, rr * k);
    ctx.fillStyle = rg(ctx, 'moldtop', x - rr * 0.3, yTop - rr * k * 0.4, rr * 0.1, x, yTop, rr, [
      [0, '#ffffff'],
      [0.45, '#d3dce4'],
      [1, '#8d99a5'],
    ]);
    ctx.fill();
    ctx.beginPath();
    ellipse(ctx, x, yTop, rr * 0.55, rr * 0.55 * k);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.stroke();
  }

  // 縁取り
  frustumPath(ctx, x, yBot, yTop, rBot, rTop, k);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(70,82,96,0.45)';
  ctx.stroke();
  ctx.restore();
}

// 型の中の「いま液面がある点」（カメラ変換後のローカル座標）。注ぐ流れの着地点に使う。
export function moldPoolPoint(v, x, base, cara, cust) {
  const yTop = v.Y(base + MOLD.h);
  const rin = MOLD.rt - MOLD.wall;
  const depth = rin * v.k * 0.95;
  const c = clamp(cust ?? 0);
  const a = clamp(cara ?? 0);
  const y = c > 0.001 ? yTop + depth * (1 - c * 0.98) : yTop + depth * (1 - a * 0.18);
  return { x: v.X(x), y };
}

// --- 白い皿 -----------------------------------------------------------------
export function plate(ctx, v, o) {
  const x = v.X(o.x ?? 0);
  const base = o.base ?? 0;
  const R = PLATE.r;
  const H = PLATE.h;
  const yBot = v.Y(base);
  const yTop = v.Y(base + H);
  const k = v.k;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  // 側面
  frustumPath(ctx, x, yBot, yTop, R * 0.72, R, k);
  ctx.fillStyle = lg(ctx, 'plateside', x - R, 0, x + R, 0, [
    [0, '#cdd3dd'],
    [0.3, '#ffffff'],
    [0.6, '#eef1f6'],
    [1, '#c3cad4'],
  ]);
  ctx.fill();
  // 上面
  ctx.beginPath();
  ellipse(ctx, x, yTop, R, R * k);
  ctx.fillStyle = rg(ctx, 'platetop', x - R * 0.3, yTop - R * k * 0.4, R * 0.05, x, yTop, R, [
    [0, '#ffffff'],
    [0.62, '#f6f8fb'],
    [1, '#dde3ea'],
  ]);
  ctx.fill();
  // 見込みの段
  ctx.beginPath();
  ellipse(ctx, x, yTop, R * 0.74, R * 0.74 * k);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(190,200,214,0.75)';
  ctx.stroke();
  ctx.beginPath();
  ellipse(ctx, x, yTop - 1.4, R * 0.74, R * 0.74 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.restore();
}

// --- 鍋（カラメル用） -------------------------------------------------------
// o: { x, base, tilt(rad), liquid(0..1), color, bubbles(0..1), rot }
export function pot(ctx, v, o) {
  const k = v.k;
  const R = 62;
  const rb = 52;
  const H = 40;
  ctx.save();
  const p = { x: v.X(o.x), y: v.Y(o.base) };
  ctx.translate(p.x, p.y);
  ctx.rotate(o.tilt || 0);
  const yBot = 0;
  const yTop = -H * v.hf;

  // 取っ手
  ctx.beginPath();
  ctx.moveTo(-R * 0.95, yTop + 8);
  ctx.lineTo(-R - 78, yTop + 2);
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a5560';
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();

  // 本体
  frustumPath(ctx, 0, yBot, yTop, rb, R, k);
  ctx.fillStyle = lg(ctx, 'potbody', -R, 0, R, 0, [
    [0, '#6c7783'],
    [0.14, '#aab6c2'],
    [0.3, '#f2f7fb'],
    [0.42, '#ffffff'],
    [0.55, '#c2cdd8'],
    [0.75, '#8b97a3'],
    [1, '#5c6773'],
  ]);
  ctx.fill();

  // 開口
  ctx.beginPath();
  ellipse(ctx, 0, yTop, R, R * k);
  ctx.fillStyle = lg(ctx, 'potrim', -R, 0, R, 0, [
    [0, '#8e9aa6'],
    [0.4, '#ffffff'],
    [1, '#77828e'],
  ]);
  ctx.fill();
  const rin = R - 4;
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, 0, yTop, rin, rin * k);
  ctx.clip();
  ctx.fillStyle = lg(ctx, 'potin', 0, yTop - rin * k, 0, yTop + rin * k, [
    [0, '#3d4653'],
    [1, '#8a96a2'],
  ]);
  ctx.fillRect(-rin - 2, yTop - rin * k - 2, rin * 2 + 4, rin * k * 2 + 4);

  // 液面
  const L = clamp(o.liquid ?? 0);
  if (L > 0) {
    const yy = yTop + rin * k * (1 - L) * 0.8;
    const rr = rin * (0.7 + 0.3 * L);
    // 容器を傾けても液面は水平を保つ（回転を打ち消す）
    ctx.translate(0, yTop);
    ctx.rotate(-(o.tilt || 0));
    ctx.translate(0, -yTop);
    ctx.beginPath();
    ellipse(ctx, 0, yy, rr, rr * k);
    ctx.fillStyle = o.color || '#f4f2ea';
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.globalAlpha = 1;
    // ハイライト
    ctx.beginPath();
    ellipse(ctx, -rr * 0.3, yy - rr * k * 0.35, rr * 0.34, rr * k * 0.26);
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.fill();
    // ふつふつ
    if (o.bubbles > 0) {
      ctx.globalAlpha = clamp(o.bubbles) * 0.85;
      for (let i = 0; i < 12; i++) {
        const t = (o.time * (0.5 + (i % 5) * 0.13) + i * 0.37) % 1;
        const a = i * 2.4;
        const bx = Math.cos(a) * rr * 0.62 * (0.4 + t * 0.6);
        const by = yy + Math.sin(a) * rr * k * 0.6 * (0.4 + t * 0.6);
        const rad = 1.6 + t * 3.4;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, TAU);
        ctx.fillStyle = 'rgba(255,245,225,' + (0.7 - t * 0.6) + ')';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  ctx.beginPath();
  ellipse(ctx, 0, yTop, rin, rin * k);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();
  ctx.restore();
}

// --- ボウル（プリン液用） ---------------------------------------------------
export function bowl(ctx, v, o) {
  const k = v.k;
  const R = 74;
  const H = 46;
  ctx.save();
  ctx.translate(v.X(o.x), v.Y(o.base));
  ctx.rotate(o.tilt || 0);
  const yBot = 0;
  const yTop = -H * v.hf;

  // 丸い胴（下が丸いボウル）
  ctx.beginPath();
  ctx.moveTo(-R, yTop);
  ctx.quadraticCurveTo(-R * 0.98, yBot + 8, 0, yBot + 4);
  ctx.quadraticCurveTo(R * 0.98, yBot + 8, R, yTop);
  ellipse(ctx, 0, yTop, R, R * k, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = lg(ctx, 'bowlbody', -R, 0, R, 0, [
    [0, '#dfe6ee'],
    [0.22, '#ffffff'],
    [0.42, '#f4f7fb'],
    [0.68, '#dbe2ea'],
    [1, '#b9c3cf'],
  ]);
  ctx.fill();

  ctx.beginPath();
  ellipse(ctx, 0, yTop, R, R * k);
  ctx.fillStyle = '#f3f6fa';
  ctx.fill();
  const rin = R - 4;
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, 0, yTop, rin, rin * k);
  ctx.clip();
  ctx.fillStyle = lg(ctx, 'bowlin', 0, yTop - rin * k, 0, yTop + rin * k, [
    [0, '#c9d2dc'],
    [1, '#eef2f7'],
  ]);
  ctx.fillRect(-rin - 2, yTop - rin * k - 2, rin * 2 + 4, rin * k * 2 + 4);

  const L = clamp(o.liquid ?? 0);
  if (L > 0) {
    const yy = yTop + rin * k * (1 - L) * 0.55;
    const rr = rin * (0.78 + 0.22 * L);
    ctx.translate(0, yTop);
    ctx.rotate(-(o.tilt || 0));
    ctx.translate(0, -yTop);
    ctx.beginPath();
    ellipse(ctx, 0, yy, rr, rr * k);
    ctx.fillStyle = rg(ctx, 'custliq', 0, yy, 0, 0, yy, rr, [
      [0, '#fff0bd'],
      [0.6, '#ffe08a'],
      [1, '#f4c85c'],
    ]);
    ctx.fill();
    // 混ざり具合: 白い筋が消えていく
    const un = clamp(1 - (o.mixed ?? 0));
    if (un > 0.01) {
      ctx.save();
      ctx.beginPath();
      ellipse(ctx, 0, yy, rr, rr * k);
      ctx.clip();
      ctx.globalAlpha = un * 0.85;
      for (let i = 0; i < 5; i++) {
        const a = (o.swirl || 0) + (i / 5) * TAU;
        ctx.beginPath();
        for (let j = 0; j <= 22; j++) {
          const u = j / 22;
          const ang = a + u * 2.6;
          const rad = rr * (0.15 + u * 0.78);
          const px = Math.cos(ang) * rad;
          const py = yy + Math.sin(ang) * rad * k;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineWidth = 6 - i * 0.6;
        ctx.lineCap = 'round';
        ctx.strokeStyle = i % 2 ? 'rgba(255,252,240,0.9)' : 'rgba(255,214,110,0.85)';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // 混ぜている間の波紋
    const rip = clamp(o.ripple ?? 0);
    if (rip > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, rip * 0.5);
      for (let i = 0; i < 3; i++) {
        const ph = (((o.time ?? 0) * 1.1 + i / 3) % 1);
        const rad = rr * (0.24 + ph * 0.74);
        ctx.beginPath();
        ellipse(ctx, 0, yy, rad, rad * k);
        ctx.lineWidth = 3 * (1 - ph);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
      }
      ctx.restore();
    }
    // 表面の光
    ctx.beginPath();
    ellipse(ctx, -rr * 0.3, yy - rr * k * 0.35, rr * 0.34, rr * k * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ellipse(ctx, 0, yTop, rin, rin * k);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
  ctx.restore();
}

// 泡立て器
export function whisk(ctx, v, o) {
  const cx = v.X(o.x);
  const cy = v.Y(o.base);
  const rot = o.rot || 0;
  const orbit = o.orbit ?? 30;
  const px = cx + Math.cos(rot) * orbit;
  const py = cy + Math.sin(rot) * orbit * v.k;
  ctx.save();
  ctx.translate(px, py);
  const hTop = -104 * v.hf;
  // ワイヤ（かご）
  for (let i = 0; i < 6; i++) {
    const sp = (i / 5 - 0.5) * 2;
    ctx.beginPath();
    ctx.moveTo(0, hTop + 34);
    ctx.quadraticCurveTo(sp * 26, hTop + 62, 0, 6);
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = '#9aa6b2';
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  }
  // 柄
  ctx.beginPath();
  ctx.moveTo(0, hTop + 38);
  ctx.lineTo(0, hTop - 12);
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7f8b98';
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.restore();
}

// 傾いた容器の「注ぎ口」の位置（カメラ変換後のローカル座標）
export function vesselSpout(v, x, base, tilt, R, H) {
  const s = Math.sin(tilt);
  const c = Math.cos(tilt);
  const hy = -H * v.hf;
  return { x: v.X(x) + R * c - hy * s, y: v.Y(base) + R * s + hy * c };
}

// --- 注ぐ流れ（リボン） -----------------------------------------------------
// 座標はすべてカメラ変換後のローカル座標（v.X / v.Y / vesselSpout の出力）。
export function stream(ctx, v, o) {
  const x0 = o.x0;
  const y0 = o.y0;
  const x1 = o.x1;
  const y1 = o.y1;
  const w0 = o.width ?? 9;
  const t = o.time || 0;
  const seg = 16;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const wob = Math.sin(t * 7 + u * 5.5) * 2.4 * (1 - u * 0.4) * (o.wobble ?? 1);
    // 落下は下ほど速い → 上をゆるく、下を直線に
    const ux = lerp(x0, x1, u * u * 0.35 + u * 0.65);
    const uy = lerp(y0, y1, u);
    pts.push([ux + wob, uy, lerp(w0, w0 * 0.62, u)]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0] - pts[0][2] / 2, pts[0][1]);
  for (let i = 1; i <= seg; i++) ctx.lineTo(pts[i][0] - pts[i][2] / 2, pts[i][1]);
  for (let i = seg; i >= 0; i--) ctx.lineTo(pts[i][0] + pts[i][2] / 2, pts[i][1]);
  ctx.closePath();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = lg(
    ctx,
    'stream' + (o.c1 || '') + (o.c2 || '') + Math.round(x0) + '_' + Math.round(x1),
    x0 - w0,
    0,
    x0 + w0,
    0,
    [
      [0, o.c2 || '#b5651d'],
      [0.35, o.c1 || '#e5a13f'],
      [0.55, o.hi || '#ffd9a0'],
      [0.8, o.c1 || '#e5a13f'],
      [1, o.c2 || '#b5651d'],
    ]
  );
  ctx.fill();
  ctx.restore();
}

export function splash(ctx, v, o) {
  const x = o.lx != null ? o.lx : v.X(o.x);
  const y = o.ly != null ? o.ly : v.Y(o.y);
  const r = o.r ?? 14;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 0.9;
  ctx.beginPath();
  ellipse(ctx, x, y, r, r * v.k * 0.9);
  ctx.fillStyle = o.color || 'rgba(240,180,90,0.55)';
  ctx.fill();
  ctx.restore();
}

// --- 湯気 -------------------------------------------------------------------
export function steamPuffs(ctx, v, list, color = 'rgba(255,255,255,') {
  ctx.save();
  for (const p of list) {
    const x = v.X(p.x);
    const y = v.Y(p.y);
    const a = p.life * (1 - p.life) * 4;
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, TAU);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, p.r));
    g.addColorStop(0, color + 0.42 * a + ')');
    g.addColorStop(0.5, color + 0.20 * a + ')');
    g.addColorStop(1, color + '0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

// --- Hero: プリン -----------------------------------------------------------
// 本物の soft-body は使わない。頂点オフセット（進行波）＋バネによる squash で偽装。
// o: { x, base, wobble(振幅), phase, squash(>0 で潰れる), reveal(0..1 下から見える割合),
//      caramelFlow(0..1), alpha, glow }
export function pudding(ctx, v, o) {
  const cx = v.X(o.x ?? 0);
  const base = o.base ?? 0;
  const k = v.k;
  const A = o.wobble || 0;
  const ph = o.phase || 0;
  const sq = o.squash || 0;
  const hEff = PUD.h * (1 - sq * 0.55);
  const N = 16;

  const rAt = (t) =>
    lerp(PUD.rb, PUD.rt, t) *
    (1 + sq * 0.34 * (1 - t * 0.45)) *
    (1 + A * 0.0016 * Math.cos(ph * 1.1 - t * 2.4));
  const dxAt = (t) => A * Math.sin(ph - t * 2.05) * Math.pow(t, 1.45);
  const yAt = (t) => v.Y(base + hEff * t);

  const L = [];
  const R = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = rAt(t);
    const d = dxAt(t);
    const y = yAt(t);
    L.push([cx + d - r, y]);
    R.push([cx + d + r, y]);
  }
  const rTopE = rAt(1);
  const dTop = dxAt(1);
  const yTopE = yAt(1);
  const rBotE = rAt(0);
  const yBotE = yAt(0);

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(R[0][0], R[0][1]);
    ellipse(ctx, cx + dxAt(0), yBotE, rBotE, rBotE * k, 0, Math.PI); // 手前の底
    for (let i = 1; i <= N; i++) ctx.lineTo(L[i][0], L[i][1]);
    ellipse(ctx, cx + dTop, yTopE, rTopE, rTopE * k, Math.PI, TAU); // 奥の上
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
  };

  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;

  // 型に隠れている部分を切る（型を引き上げる途中の露出制御）
  if (o.reveal != null && o.reveal < 1) {
    const cut = v.Y(base + hEff * clamp(o.reveal) + 0.5);
    ctx.beginPath();
    ctx.rect(cx - 260, cut, 520, 640);
    ctx.clip();
  }

  // 接地影
  ground(ctx, v, (o.x ?? 0) + dTop * 0.1, base + 0.4, rBotE * 1.16, 0.5, '#8a5a24');

  // 皿にゆっくり広がるカラメル（本体より先に描く。手前のふちだけが見える）
  const flow = clamp(o.caramelFlow ?? 0);
  const pool = clamp((flow - 0.55) / 0.45);
  if (pool > 0) {
    const pr = rBotE * (1.0 + pool * 0.22);
    ctx.beginPath();
    ellipse(ctx, cx, yAt(0) + 1.5, pr, pr * k);
    ctx.fillStyle = rg(ctx, 'pool', cx, yAt(0), rBotE * 0.75, cx, yAt(0), pr, [
      [0, 'rgba(178,104,26,0.85)'],
      [0.75, 'rgba(170,98,24,0.6)'],
      [1, 'rgba(158,88,20,0)'],
    ]);
    ctx.fill();
  }

  // 本体
  ctx.save();
  bodyPath();
  ctx.clip();
  const x0 = cx - PUD.rb * 1.3;
  const x1 = cx + PUD.rb * 1.3;
  ctx.fillStyle = lg(ctx, 'pudside', x0, 0, x1, 0, [
    [0, '#e0a02c'],
    [0.1, '#f3c14a'],
    [0.24, '#ffe488'],
    [0.34, '#fff3bd'],
    [0.5, '#ffd964'],
    [0.72, '#f0b83e'],
    [0.88, '#d9962a'],
    [1, '#c07f22'],
  ]);
  ctx.fillRect(x0, yTopE - 40, x1 - x0, yBotE - yTopE + 80);
  // 下方の陰影
  ctx.fillStyle = lg(ctx, 'pudshade', 0, yTopE, 0, yBotE + 6, [
    [0, 'rgba(120,60,10,0)'],
    [0.55, 'rgba(120,60,10,0.05)'],
    [1, 'rgba(110,55,8,0.3)'],
  ]);
  ctx.fillRect(x0, yTopE - 40, x1 - x0, yBotE - yTopE + 80);
  // 半透明の「抜け」（プリンらしい透け感）— 主張しすぎない程度に
  ctx.globalCompositeOperation = 'lighter';
  const gy = lerp(yTopE, yBotE, 0.62);
  ctx.fillStyle = rg(ctx, 'pudsss', cx + rBotE * 0.5, gy, 2, cx + rBotE * 0.5, gy, rBotE * 0.95, [
    [0, 'rgba(255,205,110,0.22)'],
    [1, 'rgba(255,190,70,0)'],
  ]);
  ctx.fillRect(x0, yTopE - 40, x1 - x0, yBotE - yTopE + 80);
  ctx.globalCompositeOperation = 'source-over';
  // 主ハイライト（左上から差す光の縦帯）
  const hx = cx + dxAt(0.5) - rBotE * 0.44;
  const hy = lerp(yTopE, yBotE, 0.46);
  ctx.beginPath();
  ellipse(ctx, hx, hy, rBotE * 0.24, (yBotE - yTopE) * 0.34);
  ctx.fillStyle = rg(ctx, 'pudhi', hx, hy, 0, hx, hy, rBotE * 0.34, [
    [0, 'rgba(255,255,255,0.6)'],
    [0.55, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fill();
  // リムライト（右）
  ctx.beginPath();
  ctx.moveTo(R[0][0], R[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(R[i][0], R[i][1]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,248,210,0.55)';
  ctx.stroke();
  ctx.restore();

  // 上面（カラメルの層）— 薄く艶やかに。黄色を殺さない。
  const rTopC = rTopE * 0.995;
  ctx.beginPath();
  ellipse(ctx, cx + dTop, yTopE, rTopC, rTopC * k);
  ctx.fillStyle = lg(
    ctx,
    'pudtop',
    cx + dTop - rTopC,
    yTopE - rTopC * k,
    cx + dTop + rTopC,
    yTopE + rTopC * k,
    [
      [0, '#e6ab53'],
      [0.34, '#cf8a2c'],
      [0.68, '#b06618'],
      [1, '#8f4e0e'],
    ]
  );
  ctx.fill();
  // 上面のつや
  ctx.save();
  ctx.beginPath();
  ellipse(ctx, cx + dTop, yTopE, rTopC, rTopC * k);
  ctx.clip();
  const sx = cx + dTop - rTopC * 0.3;
  const sy = yTopE - rTopC * k * 0.34;
  ctx.beginPath();
  ellipse(ctx, sx, sy, rTopC * 0.5, rTopC * k * 0.46);
  ctx.fillStyle = rg(ctx, 'topgloss', sx, sy, 0, sx, sy, rTopC * 0.5, [
    [0, 'rgba(255,236,192,0.6)'],
    [0.6, 'rgba(255,224,168,0.22)'],
    [1, 'rgba(255,220,160,0)'],
  ]);
  ctx.fill();
  ctx.beginPath();
  ellipse(ctx, cx + dTop + rTopC * 0.34, yTopE + rTopC * k * 0.3, rTopC * 0.28, rTopC * k * 0.22);
  ctx.fillStyle = 'rgba(255,214,150,0.24)';
  ctx.fill();
  ctx.restore();
  // 上面の縁（ふちで一段明るく光る）
  ctx.beginPath();
  ellipse(ctx, cx + dTop, yTopE, rTopC, rTopC * k);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(255,226,168,0.6)';
  ctx.stroke();

  // カラメルが頂上から側面へゆっくり流れる（細い筋。黄色い側面を覆いつくさない）
  if (flow > 0) {
    // [横位置 -1..1, 遅れ, 到達する高さの割合, 太さ]
    const drips = [
      [-0.74, 0.0, 0.5, 8.0],
      [0.5, 0.06, 0.56, 9.0],
      [-0.22, 0.16, 0.36, 7.0],
      [0.84, 0.24, 0.26, 5.6],
      [0.2, 0.34, 0.3, 6.4],
      [-0.95, 0.44, 0.2, 5.0],
    ];
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (const [a, delay, len, w] of drips) {
      const gp = clamp((flow - delay) / (1 - delay));
      if (gp <= 0) continue;
      const reach = smooth(gp) * len;
      const tEnd = clamp(1 - reach);
      const steps = 10;
      const lp = [];
      const rp = [];
      const mid = [];
      const front = Math.sqrt(Math.max(0, 1 - a * a)); // 方位角 φ の sin。手前ほど 1。
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const t = lerp(1, tEnd, u);
        const r = rAt(t);
        const wander = Math.sin(a * 9.1 + u * 2.4) * 1.1 * u;
        const px = cx + dxAt(t) + r * a + wander;
        // 円錐の「手前側の面」を伝って落ちるので、常に楕円分だけ下へずらす
        const py = yAt(t) + r * k * front;
        // 上は細く、先端に向かってふくらむ（とろみのある垂れ方）
        const ww = (w * (0.5 + 0.6 * u * u)) / 2;
        lp.push([px - ww, py]);
        rp.push([px + ww, py]);
        mid.push([px, py]);
      }
      ctx.beginPath();
      ctx.moveTo(lp[0][0], lp[0][1]);
      for (let i = 1; i < lp.length; i++) ctx.lineTo(lp[i][0], lp[i][1]);
      for (let i = rp.length - 1; i >= 0; i--) ctx.lineTo(rp[i][0], rp[i][1]);
      ctx.closePath();
      const gx = cx + dxAt(tEnd) + rAt(tEnd) * a;
      ctx.fillStyle = lg(ctx, 'dripg', gx - w, 0, gx + w, 0, [
        [0, '#94520f'],
        [0.3, '#c07822'],
        [0.52, '#e5a854'],
        [0.78, '#b56a18'],
        [1, '#7f440c'],
      ]);
      ctx.fill();
      // 先端のしずく
      const ex = mid[mid.length - 1][0];
      const ey = mid[mid.length - 1][1];
      ctx.beginPath();
      ctx.arc(ex, ey, w * 0.56, 0, TAU);
      ctx.fillStyle = '#b06617';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - w * 0.18, ey - w * 0.2, w * 0.2, 0, TAU);
      ctx.fillStyle = 'rgba(255,226,176,0.55)';
      ctx.fill();
      // 艶の筋
      ctx.beginPath();
      ctx.moveTo(mid[0][0] - w * 0.14, mid[0][1]);
      for (let i = 1; i < mid.length; i++) ctx.lineTo(mid[i][0] - w * 0.16, mid[i][1]);
      ctx.lineWidth = Math.max(0.8, w * 0.16);
      ctx.strokeStyle = 'rgba(255,222,164,0.5)';
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

// --- UI（文字なし） ---------------------------------------------------------
// 指のアイコン。画面座標で描く。
export function handIcon(ctx, x, y, scale = 1, rot = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(90,50,15,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  // 手のひら
  ctx.moveTo(-13, 6);
  ctx.quadraticCurveTo(-17, 24, -6, 30);
  ctx.quadraticCurveTo(6, 35, 14, 26);
  ctx.quadraticCurveTo(20, 18, 19, 4);
  ctx.lineTo(19, -4);
  ctx.quadraticCurveTo(19, -10, 13, -10);
  ctx.quadraticCurveTo(9, -10, 9, -5);
  ctx.lineTo(9, -8);
  ctx.quadraticCurveTo(9, -14, 3, -14);
  ctx.quadraticCurveTo(-1, -14, -1, -8);
  ctx.lineTo(-1, -12);
  ctx.quadraticCurveTo(-1, -18, -7, -18);
  ctx.quadraticCurveTo(-11, -18, -11, -12);
  ctx.lineTo(-11, -26);
  ctx.quadraticCurveTo(-11, -33, -17, -33);
  ctx.quadraticCurveTo(-23, -33, -23, -26);
  ctx.lineTo(-23, 2);
  ctx.quadraticCurveTo(-23, 4, -13, 6);
  ctx.closePath();
  ctx.fillStyle = '#fff7ec';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7b5230';
  ctx.stroke();
  ctx.restore();
}

// 破線の誘導パス（円 / 直線 / 弧）
export function guideArrow(ctx, pts, phase, alpha = 1, color = 'rgba(255,255,255,0.95)') {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([16, 14]);
  ctx.lineDashOffset = -phase;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = 13;
  ctx.strokeStyle = 'rgba(120,72,30,0.28)';
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  // 矢じり
  const n = pts.length - 1;
  const [ax, ay] = pts[n];
  const [bx, by] = pts[Math.max(0, n - 1)];
  const ang = Math.atan2(ay - by, ax - bx);
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(-16, -13);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-16, 13);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

export function sparkles(ctx, list) {
  ctx.save();
  for (const p of list) {
    const a = clamp(p.life) * (1 - p.life * 0.2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = a;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      const nx = Math.cos(ang) * p.r;
      const ny = Math.sin(ang) * p.r;
      const mx = Math.cos(ang + Math.PI / 4) * p.r * 0.22;
      const my = Math.sin(ang + Math.PI / 4) * p.r * 0.22;
      if (i === 0) ctx.moveTo(nx, ny);
      else ctx.lineTo(nx, ny);
      ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.fillStyle = p.color || 'rgba(255,246,200,0.95)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
