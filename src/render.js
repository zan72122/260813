// えがく係。すべて Canvas 2D（iPhone/iPad で確実に動く）。
// 水がヒーロー: 青〜水色ではっきり輪郭が見えること、流れの向きが見えることを優先する。

import { W, H, TT, idx, wallCells } from './city.js';
import { TW2, TH2, isoX, isoY } from './iso.js';

const S = 3; // 水ビットマップの解像度倍率

// 水面のゆらぎ用。1 フレームに何万回も呼ぶので表引きにする。
const SIN_N = 1024;
const SIN_TABLE = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN_TABLE[i] = Math.sin((i / SIN_N) * Math.PI * 2);
const fastSin = (x) => SIN_TABLE[((x * (SIN_N / (Math.PI * 2))) | 0) & (SIN_N - 1)];

const C = {
  tableTop: '#7b5836',
  tableBot: '#2f2018',
  boardSide: '#c9ae82',
  boardSide2: '#a98d63',
  rim: '#f0e6cc',
  park: '#a3d183',
  parkDark: '#87bd6a',
  riverBed: '#5d87a3',
  bank: '#dccfab',
  yard: '#cfe0ae',
  walk: '#f2ead7',
  road: '#a69f94',
  roadDark: '#98917f',
  gutter: '#8f887d',
  cross: '#9d968b',
  plaza: '#dccfb0',
  plazaLine: '#cbbc99',
  curb: '#f4ecd7',
  ramp: '#c8bb9a',
  hole: '#2a2f36',
  metal: '#b9bcc0',
  metalDark: '#7d8288',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const wcan = document.createElement('canvas');
  wcan.width = W * S; wcan.height = H * S;
  const wctx = wcan.getContext('2d');
  const wimg = wctx.createImageData(W * S, H * S);

  const r = {
    canvas, ctx, wcan, wctx, wimg,
    dpr: 1, vw: 1, vh: 1,
    fx: [],
    time: 0,
    quality: 1,
    prof: null,
  };

  r.bg = document.createElement('canvas');
  r.vg = document.createElement('canvas');

  r.resize = (vw, vh, dpr) => {
    r.vw = vw; r.vh = vh; r.dpr = dpr;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    // 机と周辺減光は動かないので 1 枚に焼いておく
    for (const [c, fn] of [[r.bg, drawTable], [r.vg, drawVignette]]) {
      c.width = canvas.width; c.height = canvas.height;
      const cc = c.getContext('2d');
      cc.setTransform(dpr, 0, 0, dpr, 0, 0);
      cc.clearRect(0, 0, vw, vh);
      fn(cc, vw, vh);
    }
  };

  r.addFx = (type, x, y, opt = {}) => {
    if (r.fx.length > 180) r.fx.shift();
    r.fx.push({ type, x, y, age: 0, life: opt.life || 24, ...opt });
  };

  r.draw = (sim, cam, ui) => draw(r, sim, cam, ui);
  return r;
}

// ---------- 便利関数 ----------
function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// グリッドの長方形（連続座標）→ 画面の平行四辺形
function quadPts(x0, y0, x1, y1, z = 0) {
  return [
    [isoX(x0, y0), isoY(x0, y0, z)],
    [isoX(x1, y0), isoY(x1, y0, z)],
    [isoX(x1, y1), isoY(x1, y1, z)],
    [isoX(x0, y1), isoY(x0, y1, z)],
  ];
}

function fillQuad(ctx, x0, y0, x1, y1, color, z = 0) {
  poly(ctx, quadPts(x0, y0, x1, y1, z));
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeQuad(ctx, x0, y0, x1, y1, color, wdt, z = 0) {
  poly(ctx, quadPts(x0, y0, x1, y1, z));
  ctx.strokeStyle = color;
  ctx.lineWidth = wdt;
  ctx.stroke();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// グリッド空間の円を描くための変換（アイソメの楕円になる）
function pushGrid(ctx, gx, gy, gz = 0) {
  ctx.save();
  ctx.translate(isoX(gx, gy), isoY(gx, gy, gz));
  ctx.transform(TW2, TH2, -TW2, TH2, 0, 0);
}

// ---------- メイン ----------
function draw(r, sim, cam, ui) {
  const { ctx, dpr, vw, vh } = r;
  r.time += 1;
  const city = sim.city;
  const z = cam.zoom;
  const detail = z / cam.fit;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  let tt = r.prof ? performance.now() : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(r.bg, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (r.prof) { r.prof.table = (r.prof.table || 0) + (performance.now() - tt); }

  ctx.save();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 + (cam.biasY || 0) - cam.y * z));

  const P = r.prof;
  const mark = P ? (k, t0) => { P[k] = (P[k] || 0) + (performance.now() - t0); } : null;
  let t0 = P ? performance.now() : 0;

  drawBoard(ctx);
  drawGround(ctx, city, detail);
  if (P) { mark('ground', t0); t0 = performance.now(); }
  drawCloudShadow(ctx, sim);
  paintWater(r, sim);
  if (P) { mark('paintWater', t0); t0 = performance.now(); }
  drawWater(ctx, r);
  if (P) { mark('drawWater', t0); t0 = performance.now(); }
  drawEntranceFall(ctx, sim, r.time);
  drawFloaters(ctx, sim);
  drawDrains(ctx, sim, r.time, ui);
  if (P) { mark('floatersDrains', t0); t0 = performance.now(); }
  drawProps(ctx, city, detail);
  if (P) { mark('props', t0); t0 = performance.now(); }
  drawFx(ctx, r);
  drawRain(ctx, sim);
  drawCloud(ctx, sim);
  if (P) { mark('fxRainCloud', t0); t0 = performance.now(); }
  if (ui && ui.wallGhost) drawWallGhost(ctx, city, ui.wallGhost);

  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tt = r.prof ? performance.now() : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(r.vg, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (ui && ui.crossFade > 0.01) drawCrossSection(ctx, vw, vh, ui.crossFade, r.time);
  if (r.prof) { r.prof.vignette = (r.prof.vignette || 0) + (performance.now() - tt); }
}

// ---------- 机 ----------
function drawTable(ctx, vw, vh) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, C.tableTop);
  g.addColorStop(1, C.tableBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  // 木目
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#e0c49a';
  ctx.lineWidth = Math.max(1, vh / 260);
  for (let i = 0; i < 7; i++) {
    const y = vh * (i / 7) + (i % 2 ? 12 : -6);
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(vw * 0.3, y + 14, vw * 0.7, y - 14, vw + 20, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(ctx, vw, vh) {
  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
}

// ---------- 模型の台 ----------
function drawBoard(ctx) {
  const TH_B = 22;
  const p = quadPts(0, 0, W, H);
  // 影（机に置いてある感じ）
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#1a1008';
  poly(ctx, quadPts(0, 0, W, H).map((q) => [q[0] + 14, q[1] + TH_B + 12]));
  ctx.fill();
  ctx.restore();

  // 側面 2 枚
  poly(ctx, [p[1], p[2], [p[2][0], p[2][1] + TH_B], [p[1][0], p[1][1] + TH_B]]);
  ctx.fillStyle = C.boardSide2; ctx.fill();
  poly(ctx, [p[2], p[3], [p[3][0], p[3][1] + TH_B], [p[2][0], p[2][1] + TH_B]]);
  ctx.fillStyle = C.boardSide; ctx.fill();

  // 天面
  poly(ctx, p);
  ctx.fillStyle = C.rim; ctx.fill();
}

// ---------- 地面 ----------
function drawGround(ctx, city, detail) {
  const L = city.layout;

  // 芝生
  fillQuad(ctx, L.parkX[0], 2, L.parkX[1] + 1, H - 2, C.park);

  // 川と護岸
  for (const b of L.bankX) fillQuad(ctx, b[0], 0, b[1] + 1, H, C.bank);
  fillQuad(ctx, L.riverX[0], 0, L.riverX[1] + 1, H, C.riverBed);
  ctx.save();
  ctx.globalAlpha = 0.5;
  strokeQuad(ctx, L.riverX[0], 0, L.riverX[1] + 1, H, shade(C.riverBed, 0.8), 1.4);
  ctx.restore();

  // 街区（歩道 → 内側の庭）
  for (const bx of L.xBands) {
    for (const by of L.yBands) {
      if (bx[0] === city.plaza.x0 && by[0] === city.plaza.y0) continue;
      fillQuad(ctx, bx[0], by[0], bx[1] + 1, by[1] + 1, C.walk);
      if (bx[1] - bx[0] > 7 && by[1] - by[0] > 7) {
        fillQuad(ctx, bx[0] + 3, by[0] + 3, bx[1] - 2, by[1] - 2, C.yard);
      }
      if (detail > 1.15) {
        ctx.globalAlpha = 0.5;
        strokeQuad(ctx, bx[0], by[0], bx[1] + 1, by[1] + 1, '#d6c9ab', 0.9);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 道路
  const cx0 = L.cityX[0], cx1 = L.cityX[1] + 1, cy0 = L.cityY[0], cy1 = L.cityY[1] + 1;
  for (const v of L.vroads) fillQuad(ctx, v[0], cy0, v[1] + 1, cy1, C.road);
  for (const h of L.hroads) fillQuad(ctx, cx0, h[0], cx1, h[1] + 1, C.road);
  for (const v of L.vroads) for (const h of L.hroads) fillQuad(ctx, v[0], h[0], v[1] + 1, h[1] + 1, C.cross);

  // みぞ（水が細く流れる所）を先に見せておく
  ctx.globalAlpha = 0.55;
  for (const v of L.vroads) {
    fillQuad(ctx, v[0], cy0, v[0] + 0.9, cy1, C.gutter);
    fillQuad(ctx, v[1] + 0.1, cy0, v[1] + 1, cy1, C.gutter);
  }
  for (const h of L.hroads) {
    fillQuad(ctx, cx0, h[0], cx1, h[0] + 0.9, C.gutter);
    fillQuad(ctx, cx0, h[1] + 0.1, cx1, h[1] + 1, C.gutter);
  }
  ctx.globalAlpha = 1;

  // センターライン
  if (detail > 1.0) {
    ctx.globalAlpha = 0.7;
    for (const v of L.vroads) {
      const cx = (v[0] + v[1] + 1) / 2;
      for (let y = cy0 + 1; y < cy1 - 2; y += 5) fillQuad(ctx, cx - 0.22, y, cx + 0.22, y + 2.6, '#f6f1e4');
    }
    for (const h of L.hroads) {
      const cy = (h[0] + h[1] + 1) / 2;
      for (let x = cx0 + 1; x < cx1 - 2; x += 5) fillQuad(ctx, x, cy - 0.22, x + 2.6, cy + 0.22, '#f6f1e4');
    }
    ctx.globalAlpha = 1;
  }

  drawPlaza(ctx, city, detail);
  drawOutfall(ctx, city);
}

function drawPlaza(ctx, city, detail) {
  const p = city.plaza;
  const x0 = p.x0, y0 = p.y0, x1 = p.x1 + 1, y1 = p.y1 + 1;

  // まわりのふち（せき）
  fillQuad(ctx, x0 - 0.6, y0 - 0.6, x1 + 0.6, y1 + 0.6, C.curb);
  // 底
  fillQuad(ctx, x0 + 1, y0 + 1, x1 - 1, y1 - 1, C.plaza);

  // 北と西の内かべ = 影。ここが「低い」の手がかりになる。
  ctx.save();
  for (let k = 0; k < 5; k++) {
    ctx.globalAlpha = 0.16 * (1 - k / 5);
    ctx.fillStyle = '#4a3a1e';
    poly(ctx, quadPts(x0 + 1, y0 + 1 + k * 0.8, x1 - 1, y0 + 1.8 + k * 0.8));
    ctx.fill();
    poly(ctx, quadPts(x0 + 1 + k * 0.8, y0 + 1, x0 + 1.8 + k * 0.8, y1 - 1));
    ctx.fill();
  }
  ctx.restore();

  // 南と東は明るいふち
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#fffaea';
  poly(ctx, quadPts(x0 + 1, y1 - 1.7, x1 - 1, y1 - 1)); ctx.fill();
  poly(ctx, quadPts(x1 - 1.7, y0 + 1, x1 - 1, y1 - 1)); ctx.fill();
  ctx.restore();

  // タイル
  if (detail > 1.05) {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = C.plazaLine;
    ctx.lineWidth = 0.7;
    for (let x = x0 + 5; x < x1 - 1; x += 4) {
      ctx.beginPath();
      ctx.moveTo(isoX(x, y0 + 1), isoY(x, y0 + 1));
      ctx.lineTo(isoX(x, y1 - 1), isoY(x, y1 - 1));
      ctx.stroke();
    }
    for (let y = y0 + 5; y < y1 - 1; y += 4) {
      ctx.beginPath();
      ctx.moveTo(isoX(x0 + 1, y), isoY(x0 + 1, y));
      ctx.lineTo(isoX(x1 - 1, y), isoY(x1 - 1, y));
      ctx.stroke();
    }
    ctx.restore();
  }

  // 水の入口（ふちが切れている 2 か所）
  const rn = city.ramps.north, rs = city.ramps.south;
  fillQuad(ctx, rn.x0, rn.y - 1.2, rn.x1 + 1, rn.y + 5, C.ramp);
  fillQuad(ctx, rs.x0, rs.y - 4, rs.x1 + 1, rs.y + 1.6, C.ramp);
  if (detail > 1.05) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#a89673';
    ctx.lineWidth = 0.55;
    for (let k = 0; k < 4; k++) {
      const yy = rn.y + 0.6 + k * 1.1;
      ctx.beginPath();
      ctx.moveTo(isoX(rn.x0 + 0.5, yy), isoY(rn.x0 + 0.5, yy));
      ctx.lineTo(isoX(rn.x1 + 0.5, yy), isoY(rn.x1 + 0.5, yy));
      ctx.stroke();
      const ys = rs.y + 0.4 - k * 1.1;
      ctx.beginPath();
      ctx.moveTo(isoX(rs.x0 + 0.5, ys), isoY(rs.x0 + 0.5, ys));
      ctx.lineTo(isoX(rs.x1 + 0.5, ys), isoY(rs.x1 + 0.5, ys));
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEntrance(ctx, city);
}

function drawEntrance(ctx, city) {
  const e = city.entrance;
  const x0 = e.x0, y0 = e.y0, x1 = e.x1 + 1, y1 = e.y1 + 1;

  // ふち（ここを水がこえると入っちゃう）
  fillQuad(ctx, x0 - 1, y0 - 1, x1 + 1, y1 + 1, '#f3e9cd');
  ctx.save();
  ctx.globalAlpha = 0.45;
  strokeQuad(ctx, x0 - 1, y0 - 1, x1 + 1, y1 + 1, '#bda87e', 0.9);
  ctx.restore();

  // 穴
  poly(ctx, quadPts(x0, y0, x1, y1));
  ctx.fillStyle = '#20262d';
  ctx.fill();

  // かいだん（北から南へ、だんだん暗く）
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const a = y0 + (y1 - y0) * (k / steps);
    const b = y0 + (y1 - y0) * ((k + 0.62) / steps);
    const g = 1 - k / steps;
    fillQuad(ctx, x0, a, x1, b, `rgb(${(58 + 96 * g) | 0},${(64 + 100 * g) | 0},${(72 + 104 * g) | 0})`);
  }

  // てすり
  ctx.strokeStyle = '#e8eef2';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  for (let k = 0; k <= 4; k++) {
    const yy = y0 + (y1 - y0) * (k / 4);
    ctx.moveTo(isoX(x0, yy), isoY(x0, yy));
    ctx.lineTo(isoX(x0, yy), isoY(x0, yy) - 9);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(isoX(x0, y0), isoY(x0, y0) - 9);
  ctx.lineTo(isoX(x0, y1), isoY(x0, y1) - 9);
  ctx.stroke();
}

function drawOutfall(ctx, city) {
  const o = city.outfall;
  fillQuad(ctx, o.x - 0.5, o.y - 1.5, o.x + 1.5, o.y + 1.5, '#8f8577');
  ctx.save();
  ctx.globalAlpha = 0.8;
  fillQuad(ctx, o.x - 0.2, o.y - 1, o.x + 1, o.y + 1, '#3d4650');
  ctx.restore();
}

// ---------- 水 ----------
function paintWater(r, sim) {
  const { d, vx, vy, phase } = sim;
  const solid = sim.city.solid;
  const data = r.wimg.data;
  const WS = W * S, HS = H * S;

  for (let py = 0; py < HS; py++) {
    const gy = py / S;
    const y0 = Math.max(1, Math.min(H - 2, gy | 0));
    const ty = gy - y0;
    const rowo = py * WS * 4;
    for (let px = 0; px < WS; px++) {
      const gx = px / S;
      const x0 = Math.max(1, Math.min(W - 2, gx | 0));
      const tx = gx - x0;
      const i = y0 * W + x0;
      const dep = d[i] * (1 - tx) * (1 - ty) + d[i + 1] * tx * (1 - ty)
                + d[i + W] * (1 - tx) * ty + d[i + W + 1] * tx * ty;
      const o = rowo + px * 4;
      if (dep < 0.0016) { data[o + 3] = 0; continue; }

      const t = Math.min(1, dep / 0.10);
      const deep = t * t * (3 - 2 * t);
      let cr = 86 - 68 * deep;
      let cg = 190 - 100 * deep;
      let cb = 236 - 48 * deep;

      const sp = Math.abs(vx[i]) + Math.abs(vy[i]);
      const sh = fastSin(phase[i] * 5.5 + (gx + gy) * 0.85 + 12.566);
      const add = sh * (5 + 13 * Math.min(1, sp * 0.4));
      cr += add; cg += add; cb += add * 0.4;

      // あわは「水の先っぽ（となりが乾いている）」と「速い所」だけ。
      // 全部の浅い水を白くすると、水ではなく霧に見えてしまう。
      const dry = 0.0016;
      const front = (d[i - 1] < dry || d[i + 1] < dry || d[i - W] < dry || d[i + W] < dry) ? 1 : 0;
      // あわは「進んでいく水の先っぽ」のもの。深くたまった水のふちは白く光らせない。
      let f = Math.min(0.4, front * 0.12 * (1 - deep) + Math.min(0.28, sp * 0.065));
      // 壁ぎわは白くあわ立たせる（水が当たって左右へ分かれるのを見せる）
      if (solid[i - 1] === 2 || solid[i + 1] === 2 || solid[i - W] === 2 || solid[i + W] === 2) {
        f = Math.min(0.72, f + 0.3);
      }
      cr += (255 - cr) * f;
      cg += (255 - cg) * f;
      cb += (255 - cb) * f;

      // うすい流れでも「青い水」とわかること。深いほど濃くなる。
      const at = Math.min(1, Math.max(0, (dep - 0.0016) / 0.0042));
      const a = at * at * (3 - 2 * at) * (0.52 + 0.44 * deep);
      data[o] = cr < 0 ? 0 : cr > 255 ? 255 : cr;
      data[o + 1] = cg < 0 ? 0 : cg > 255 ? 255 : cg;
      data[o + 2] = cb < 0 ? 0 : cb > 255 ? 255 : cb;
      data[o + 3] = (a * 255) | 0;
    }
  }
  r.wctx.putImageData(r.wimg, 0, 0);
}

function drawWater(ctx, r) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  // グリッド → アイソメ
  ctx.transform(TW2 / S, TH2 / S, -TW2 / S, TH2 / S, 0, 0);
  ctx.drawImage(r.wcan, 0, 0);
  ctx.restore();
}

// 地下入口へ落ちていく水（「ここから入っちゃった」の瞬間）
function drawEntranceFall(ctx, sim, time) {
  const flow = sim.entranceFlow;
  if (flow < 0.0012) return;
  const e = sim.city.entrance;
  const x0 = e.x0, y0 = e.y0, x1 = e.x1 + 1, y1 = e.y1 + 1;
  const a = Math.min(1, flow * 26);

  ctx.save();

  // ふちを越えるところ: 白いすじ
  ctx.globalAlpha = a * 0.85;
  ctx.fillStyle = 'rgba(238,252,255,0.95)';
  poly(ctx, quadPts(x0 - 1, y0 - 1, x1 + 1, y0));
  ctx.fill();
  poly(ctx, quadPts(x0 - 1, y0, x0, y1 + 1));
  ctx.fill();

  // 穴の中を落ちる水
  ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(
    isoX(x0, y0), isoY(x0, y0), isoX(x1, y1), isoY(x1, y1));
  g.addColorStop(0, 'rgba(214,246,255,0.95)');
  g.addColorStop(0.45, 'rgba(96,180,232,0.8)');
  g.addColorStop(1, 'rgba(28,86,146,0.5)');
  poly(ctx, quadPts(x0, y0, x1, y1));
  ctx.fillStyle = g;
  ctx.fill();

  // 落ちていくすじとしぶき
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 0.5;
  for (let k = 0; k < 7; k++) {
    const px = x0 + 0.5 + ((k * 1.7) % (x1 - x0 - 1));
    const ph = ((time * 0.055 + k * 0.31) % 1);
    const ya = y0 + ph * (y1 - y0);
    const yb = Math.min(y1, ya + 1.6);
    ctx.globalAlpha = a * (1 - ph) * 0.9;
    ctx.beginPath();
    ctx.moveTo(isoX(px, ya), isoY(px, ya));
    ctx.lineTo(isoX(px, yb), isoY(px, yb));
    ctx.stroke();
  }
  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 8; k++) {
    const ph = (time * 0.07 + k * 0.41) % 1;
    const px = x0 + 0.6 + ((k * 2.3) % (x1 - x0 - 1.2));
    const py = y0 + ph * (y1 - y0);
    ctx.beginPath();
    ctx.ellipse(isoX(px, py), isoY(px, py), 1.3 * (1 - ph) + 0.4, 0.7, 0, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- 浮いているもの ----------
const LEAF_COLORS = ['#6cbf5a', '#4ea64a', '#93cf63'];
const PETAL_COLORS = ['#ffb7d0', '#ffd0e0', '#ff9ec0'];
const BALL_COLORS = ['#ff7a5c', '#ffd23f', '#5cc9ff'];

function drawFloaters(ctx, sim) {
  for (const f of sim.floaters) {
    const x = isoX(f.x, f.y), y = isoY(f.x, f.y);
    const s = f.size * (f.dead > 0 ? f.dead / 8 : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, TH2 / TW2 * 1.6);
    ctx.rotate(f.rot);
    if (f.kind === 'leaf') {
      ctx.fillStyle = LEAF_COLORS[(f.tone * 3) | 0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4 * s, 1.9 * s, 0, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,90,40,.55)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-3.2 * s, 0); ctx.lineTo(3.2 * s, 0); ctx.stroke();
    } else if (f.kind === 'petal') {
      ctx.fillStyle = PETAL_COLORS[(f.tone * 3) | 0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6 * s, 1.5 * s, 0, 0, 6.2832);
      ctx.fill();
    } else {
      const col = BALL_COLORS[(f.tone * 3) | 0];
      ctx.beginPath();
      ctx.arc(0, 0, 2.6 * s, 0, 6.2832);
      ctx.fillStyle = col; ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.8 * s, -0.8 * s, 0.9 * s, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- 排水口 ----------
function drawDrains(ctx, sim, time, ui) {
  const city = sim.city;
  for (const d of city.drains) {
    const rr = d.r + 0.6;

    // くぼみ
    pushGrid(ctx, d.x + 0.5, d.y + 0.5);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832);
    ctx.fillStyle = '#8d8578'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.82, 0, 6.2832);
    ctx.fillStyle = d.state === 'closed' ? C.metal : '#333a41'; ctx.fill();
    ctx.restore();

    if (d.state === 'closed') {
      // ふた
      pushGrid(ctx, d.x + 0.5, d.y + 0.5);
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.66, 0, 6.2832);
      ctx.strokeStyle = C.metalDark; ctx.lineWidth = 0.22; ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * 6.2832;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr * 0.28, Math.sin(a) * rr * 0.28);
        ctx.lineTo(Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // 格子
      pushGrid(ctx, d.x + 0.5, d.y + 0.5);
      ctx.strokeStyle = '#9aa1a8'; ctx.lineWidth = 0.3;
      for (let k = -3; k <= 3; k++) {
        const off = k * (rr * 0.22);
        const half = Math.sqrt(Math.max(0, (rr * 0.78) ** 2 - off ** 2));
        ctx.beginPath();
        ctx.moveTo(off, -half); ctx.lineTo(off, half);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 詰まっている葉っぱ
    if (d.state === 'clogged') {
      for (let k = 0; k < d.leaves; k++) {
        const a = (k / d.leaves) * 6.2832 + 0.4;
        const rad = (0.35 + ((k * 37) % 10) / 16) * rr;
        const lx = d.x + 0.5 + Math.cos(a) * rad;
        const ly = d.y + 0.5 + Math.sin(a) * rad;
        ctx.save();
        ctx.translate(isoX(lx, ly), isoY(lx, ly));
        ctx.scale(1, TH2 / TW2 * 1.6);
        ctx.rotate(a * 1.7);
        ctx.fillStyle = LEAF_COLORS[k % 3];
        ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 2.4, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(40,80,35,.5)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
        ctx.restore();
      }
    }

    // 渦（いちばんの見せ場）
    const flow = d.flow || 0;
    if (d.state === 'open' && flow > 0.004) {
      drawVortex(ctx, d, flow, time);
    }

    // さわってほしい所を光らせる
    if (ui && ui.hintDrain === d.id) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.09);
      pushGrid(ctx, d.x + 0.5, d.y + 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, rr * (1.25 + pulse * 0.35), 0, 6.2832);
      ctx.strokeStyle = `rgba(255,238,120,${0.35 + pulse * 0.5})`;
      ctx.lineWidth = 0.45;
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawVortex(ctx, d, flow, time) {
  const rr = (d.r + 0.6) * Math.min(1.75, 1.05 + flow * 6);
  const a = Math.min(0.95, flow * 22);
  pushGrid(ctx, d.x + 0.5, d.y + 0.5);
  ctx.globalAlpha = a;

  // へこみ
  const g = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
  g.addColorStop(0, 'rgba(12,52,96,0.95)');
  g.addColorStop(0.45, 'rgba(40,120,190,0.5)');
  g.addColorStop(1, 'rgba(120,215,240,0)');
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832);
  ctx.fillStyle = g; ctx.fill();

  // うずの腕
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    const base = time * 0.13 + (arm / 3) * 6.2832;
    for (let s = 0; s <= 22; s++) {
      const tt = s / 22;
      const ang = base + tt * 4.4;
      const rad = rr * (0.16 + tt * 0.86);
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 0.34;
    ctx.globalAlpha = a * 0.75;
    ctx.stroke();
  }

  // あわのつぶ
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 9; k++) {
    const ang = time * 0.17 + k * 0.7;
    const rad = rr * (0.25 + ((k * 13) % 7) / 11);
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.16, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- 建物・木・壁 ----------
function drawProps(ctx, city, detail) {
  const items = [];
  for (const b of city.buildings) {
    if (b.z0 === undefined) b.z0 = groundOf(city, b.x0, b.y0);
    items.push({ k: 'b', d: b.x0 + b.y0, o: b });
  }
  for (const t of city.trees) items.push({ k: 't', d: t.x + t.y, o: t });
  for (const w of city.walls) items.push({ k: 'w', d: w.x + w.y, o: w });
  items.push({ k: 'e', d: city.entrance.x0 + city.entrance.y0 - 2, o: city.entrance });
  items.sort((a, b) => a.d - b.d);

  for (const it of items) {
    if (it.k === 'b') drawBuilding(ctx, it.o, detail);
    else if (it.k === 't') drawTree(ctx, it.o, city);
    else if (it.k === 'w') drawWall(ctx, it.o, city, 1);
    else drawCanopy(ctx, city);
  }
}

function groundOf(city, x, y) {
  return city.ground[idx(Math.max(0, Math.min(W - 1, x | 0)), Math.max(0, Math.min(H - 1, y | 0)))];
}

function drawBuilding(ctx, b, detail) {
  const z0 = b.z0;
  const z1 = z0 + b.height;
  const x0 = b.x0, y0 = b.y0, x1 = b.x1 + 1, y1 = b.y1 + 1;

  // 影
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#3a3020';
  poly(ctx, [
    [isoX(x0, y0), isoY(x0, y0, z0)],
    [isoX(x1 + 1.2, y0), isoY(x1 + 1.2, y0, z0)],
    [isoX(x1 + 1.2, y1 + 1.2), isoY(x1 + 1.2, y1 + 1.2, z0)],
    [isoX(x0, y1 + 1.2), isoY(x0, y1 + 1.2, z0)],
  ]);
  ctx.fill();
  ctx.restore();

  // 東の面
  poly(ctx, [
    [isoX(x1, y0), isoY(x1, y0, z0)], [isoX(x1, y1), isoY(x1, y1, z0)],
    [isoX(x1, y1), isoY(x1, y1, z1)], [isoX(x1, y0), isoY(x1, y0, z1)],
  ]);
  ctx.fillStyle = shade(b.side, 0.92); ctx.fill();

  // 南の面
  poly(ctx, [
    [isoX(x0, y1), isoY(x0, y1, z0)], [isoX(x1, y1), isoY(x1, y1, z0)],
    [isoX(x1, y1), isoY(x1, y1, z1)], [isoX(x0, y1), isoY(x0, y1, z1)],
  ]);
  ctx.fillStyle = b.wall; ctx.fill();

  // まど
  if (detail > 1.25) drawWindows(ctx, b, z0, z1);

  // 屋根
  if (b.gable) {
    const ym = (y0 + y1) / 2;
    const zr = z1 + Math.min(0.75, b.height * 0.42);
    // 南のななめ屋根
    poly(ctx, [
      [isoX(x0, y1), isoY(x0, y1, z1)], [isoX(x1, y1), isoY(x1, y1, z1)],
      [isoX(x1, ym), isoY(x1, ym, zr)], [isoX(x0, ym), isoY(x0, ym, zr)],
    ]);
    ctx.fillStyle = b.roof; ctx.fill();
    // 東の三角
    poly(ctx, [
      [isoX(x1, y0), isoY(x1, y0, z1)], [isoX(x1, y1), isoY(x1, y1, z1)],
      [isoX(x1, ym), isoY(x1, ym, zr)],
    ]);
    ctx.fillStyle = shade(b.roof, 0.82); ctx.fill();
    // 北のななめ屋根
    poly(ctx, [
      [isoX(x0, y0), isoY(x0, y0, z1)], [isoX(x1, y0), isoY(x1, y0, z1)],
      [isoX(x1, ym), isoY(x1, ym, zr)], [isoX(x0, ym), isoY(x0, ym, zr)],
    ]);
    ctx.fillStyle = shade(b.roof, 1.12); ctx.fill();
  } else {
    poly(ctx, quadPts(x0, y0, x1, y1, z1));
    ctx.fillStyle = shade(b.roof, 1.05); ctx.fill();
    if (b.shop) {
      // お店のひさし（しましま）
      const az = z0 + b.height * 0.66;
      for (let k = 0; k < 6; k++) {
        fillQuad(ctx, x0 + (x1 - x0) * (k / 6), y1, x0 + (x1 - x0) * ((k + 1) / 6), y1 + 1.3,
          k % 2 ? '#ffffff' : '#e8695c', az);
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    strokeQuad(ctx, x0, y0, x1, y1, shade(b.roof, 0.7), 0.9, z1);
    ctx.restore();
    // 屋上の小屋
    const mx = (x0 + x1) / 2;
    fillQuad(ctx, mx - 1, y0 + 1, mx + 1, y0 + 3, shade(b.roof, 0.9), z1 + 0.25);
  }
}

function drawWindows(ctx, b, z0, z1) {
  const wcol = 'rgba(255,255,255,0.82)';
  const rows = Math.max(1, Math.floor((z1 - z0) / 0.75));
  const cols = Math.max(1, Math.floor((b.x1 - b.x0) / 3));
  ctx.fillStyle = wcol;
  for (let rr = 0; rr < rows; rr++) {
    const wz = z0 + 0.35 + rr * 0.75;
    if (wz + 0.4 > z1) continue;
    for (let cc = 0; cc < cols; cc++) {
      const wx = b.x0 + 1 + cc * 3;
      if (wx + 1.2 > b.x1 + 1) continue;
      const y = b.y1 + 1;
      poly(ctx, [
        [isoX(wx, y), isoY(wx, y, wz)], [isoX(wx + 1.2, y), isoY(wx + 1.2, y, wz)],
        [isoX(wx + 1.2, y), isoY(wx + 1.2, y, wz + 0.42)], [isoX(wx, y), isoY(wx, y, wz + 0.42)],
      ]);
      ctx.fill();
    }
  }
  // ドア
  const dx = b.x0 + (b.x1 - b.x0) / 2 - 0.7;
  const y = b.y1 + 1;
  poly(ctx, [
    [isoX(dx, y), isoY(dx, y, z0)], [isoX(dx + 1.4, y), isoY(dx + 1.4, y, z0)],
    [isoX(dx + 1.4, y), isoY(dx + 1.4, y, z0 + 0.62)], [isoX(dx, y), isoY(dx, y, z0 + 0.62)],
  ]);
  ctx.fillStyle = 'rgba(90,60,40,0.8)';
  ctx.fill();
}

function drawTree(ctx, t, city) {
  const z = groundOf(city, t.x, t.y);
  const x = isoX(t.x, t.y), y = isoY(t.x, t.y, z);
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#3a4a20';
  ctx.beginPath(); ctx.ellipse(x + 3, y + 2, t.r * 5, t.r * 2.6, 0, 0, 6.2832); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#8a6a45';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - t.r * 8); ctx.stroke();
  const g1 = t.tone > 0.5 ? '#63b45a' : '#7cc264';
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.arc(x, y - t.r * 10, t.r * 4.2, 0, 6.2832); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(x - t.r * 1.4, y - t.r * 11.4, t.r * 2.1, 0, 6.2832); ctx.fill();
}

function drawWall(ctx, wl, city, alpha) {
  const cells = wallCells(wl);
  if (!cells.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of cells) {
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + 1); y1 = Math.max(y1, c.y + 1);
  }
  const z0 = groundOf(city, (x0 + x1) / 2, (y0 + y1) / 2);
  const z1 = z0 + 0.34;
  ctx.save();
  ctx.globalAlpha = alpha;
  // 東・南の面
  poly(ctx, [
    [isoX(x1, y0), isoY(x1, y0, z0)], [isoX(x1, y1), isoY(x1, y1, z0)],
    [isoX(x1, y1), isoY(x1, y1, z1)], [isoX(x1, y0), isoY(x1, y0, z1)],
  ]);
  ctx.fillStyle = '#d98f6e'; ctx.fill();
  poly(ctx, [
    [isoX(x0, y1), isoY(x0, y1, z0)], [isoX(x1, y1), isoY(x1, y1, z0)],
    [isoX(x1, y1), isoY(x1, y1, z1)], [isoX(x0, y1), isoY(x0, y1, z1)],
  ]);
  ctx.fillStyle = '#eda882'; ctx.fill();
  poly(ctx, quadPts(x0, y0, x1, y1, z1));
  ctx.fillStyle = '#ffd9bd'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.7; ctx.stroke();
  // しましま（おもちゃっぽく、目につくように）
  ctx.save();
  poly(ctx, quadPts(x0, y0, x1, y1, z1));
  ctx.clip();
  ctx.fillStyle = 'rgba(230,110,80,.85)';
  const long = (x1 - x0) > (y1 - y0);
  for (let k = 0; k < 12; k++) {
    if (long) fillQuad(ctx, x0 + k * 1.8, y0, x0 + 0.9 + k * 1.8, y1, 'rgba(230,110,80,.85)', z1);
    else fillQuad(ctx, x0, y0 + k * 1.8, x1, y0 + 0.9 + k * 1.8, 'rgba(230,110,80,.85)', z1);
  }
  ctx.restore();
  ctx.restore();
}

function drawWallGhost(ctx, city, ghost) {
  ctx.save();
  ctx.globalAlpha = ghost.ok ? 0.72 : 0.32;
  drawWall(ctx, ghost, city, 1);
  if (!ghost.ok) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff4d4d';
    for (const c of wallCells(ghost)) fillQuad(ctx, c.x, c.y, c.x + 1, c.y + 1, 'rgba(255,80,80,.45)');
  }
  ctx.restore();
}

// 地下入口のひさし
function drawCanopy(ctx, city) {
  const e = city.entrance;
  const z = groundOf(city, e.x0, e.y0) + 1.0;
  const x0 = e.x0 - 1.2, x1 = e.x1 + 2.2, y0 = e.y0 - 1.2, y1 = e.y0 + 0.6;
  // 柱
  ctx.strokeStyle = '#9aa3ab';
  ctx.lineWidth = 1.4;
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    ctx.beginPath();
    ctx.moveTo(isoX(cx, cy), isoY(cx, cy, z - 1.0));
    ctx.lineTo(isoX(cx, cy), isoY(cx, cy, z));
    ctx.stroke();
  }
  // 屋根
  poly(ctx, quadPts(x0, y0, x1, y1, z));
  ctx.fillStyle = '#5fa6d6'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
}

// ---------- 雨・雲 ----------
function drawRain(ctx, sim) {
  const drops = sim.drops;
  if (!drops.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(200,238,255,0.85)';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const p of drops) {
    const prog = 1 - p.t / p.tt;
    const z = 5.2 * (1 - prog * prog);
    const x = isoX(p.x, p.y), y = isoY(p.x, p.y, z);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 1);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCloudShadow(ctx, sim) {
  const front = frontOf(sim);
  if (front < -20 || front > H + 40) return;
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#1a2a3a';
  const y0 = Math.max(0, front - 60), y1 = Math.min(H, front);
  if (y1 > y0) { poly(ctx, quadPts(0, y0, W, y1)); ctx.fill(); }
  ctx.restore();
}

function frontOf(sim) {
  return -18 + (sim.tick - 30) * 0.44;
}

function drawCloud(ctx, sim) {
  const front = frontOf(sim);
  if (front < -30 || sim.tick > 1040) return;
  const alpha = Math.min(0.55, Math.max(0, (sim.tick - 20) / 60)) * (sim.tick > 950 ? Math.max(0, (1040 - sim.tick) / 90) : 1);
  if (alpha <= 0.01) return;
  ctx.save();
  // 雲は模型の上だけ。机の上にしみのように散らばらせない。
  const CZ = 8.2;
  poly(ctx, quadPts(-2, -2, W + 2, H + 2, CZ));
  ctx.clip();
  ctx.globalAlpha = alpha;
  const cy = Math.min(front - 10, H + 6);
  for (let k = 0; k < 22; k++) {
    const gx = ((k * 11.7) % (W + 30)) - 15;
    const gy = cy - 34 + ((k * 23) % 52);
    const x = isoX(gx, gy), y = isoY(gx, gy, CZ);
    const rr = 40 + ((k * 31) % 30);
    const g = ctx.createRadialGradient(x, y - rr * 0.1, rr * 0.1, x, y, rr);
    g.addColorStop(0, 'rgba(252,253,255,0.92)');
    g.addColorStop(0.5, 'rgba(226,235,245,0.55)');
    g.addColorStop(1, 'rgba(206,220,236,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.42, 0, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- エフェクト ----------
function drawFx(ctx, r) {
  for (let i = r.fx.length - 1; i >= 0; i--) {
    const f = r.fx[i];
    f.age++;
    const t = f.age / f.life;
    if (t >= 1) { r.fx.splice(i, 1); continue; }
    if (f.type === 'splash') {
      const rr = 0.25 + t * 1.0;
      pushGrid(ctx, f.x, f.y);
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = f.solid ? 'rgba(255,255,255,.9)' : 'rgba(220,245,255,.95)';
      ctx.lineWidth = 0.14;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.stroke();
      ctx.restore();
    } else if (f.type === 'suck') {
      pushGrid(ctx, f.x, f.y);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 0.28;
      ctx.beginPath(); ctx.arc(0, 0, 0.4 + t * 1.4, 0, 6.2832); ctx.stroke();
      ctx.restore();
    } else if (f.type === 'leaf') {
      // 葉っぱが飛んでいく
      const x = f.x + (f.vx || 0) * f.age * 0.14;
      const y = f.y + (f.vy || 0) * f.age * 0.14;
      const z = Math.sin(t * 3.14) * 2.2;
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.translate(isoX(x, y), isoY(x, y, z));
      ctx.scale(1, 0.62);
      ctx.rotate(f.age * 0.22);
      ctx.fillStyle = LEAF_COLORS[(f.tone || 0) % 3];
      ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 2.5, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else if (f.type === 'ring') {
      pushGrid(ctx, f.x, f.y);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = f.color || 'rgba(255,240,150,.9)';
      ctx.lineWidth = 0.4 * (1 - t) + 0.1;
      ctx.beginPath(); ctx.arc(0, 0, 1 + t * (f.max || 8), 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- 地下の断面 ----------
function drawCrossSection(ctx, vw, vh, fade, time) {
  const w = Math.min(vw * 0.40, 300);
  const h = w * 0.5;
  const x = vw * 0.035;
  const y = vh * 0.05;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);

  // カード
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.fillStyle = '#f6efdd'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 3; ctx.stroke();

  ctx.save();
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.clip();

  // 空と地面
  ctx.fillStyle = '#cfe6f5'; ctx.fillRect(0, 0, w, h * 0.3);
  ctx.fillStyle = '#b9a17c'; ctx.fillRect(0, h * 0.3, w, h);
  ctx.fillStyle = '#8f7a5c'; ctx.fillRect(0, h * 0.3, w, 5);

  // 排水口
  const gx = w * 0.2;
  ctx.fillStyle = '#5a5f66';
  ctx.fillRect(gx - 26, h * 0.3 - 6, 52, 8);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = '#e8eef2';
    ctx.fillRect(gx - 22 + i * 10, h * 0.3 - 5, 3, 6);
  }

  // 地面の上の水
  ctx.fillStyle = 'rgba(70,160,220,.85)';
  ctx.fillRect(0, h * 0.3 - 12, gx - 20, 12);

  // たて穴と横管
  ctx.fillStyle = '#3b424a';
  ctx.fillRect(gx - 16, h * 0.3, 32, h * 0.34);
  ctx.fillRect(gx - 16, h * 0.62, w * 0.72, 30);
  ctx.fillStyle = '#2a3037';
  ctx.fillRect(gx - 16, h * 0.3, 32, 4);

  // 管の中を流れる水
  ctx.fillStyle = 'rgba(90,190,240,.95)';
  ctx.fillRect(gx - 12, h * 0.3, 24, h * 0.32);
  ctx.fillRect(gx - 12, h * 0.66, w * 0.66, 20);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let k = 0; k < 6; k++) {
    const p = ((time * 0.02 + k / 6) % 1);
    const px = gx + p * w * 0.64;
    ctx.beginPath();
    ctx.arc(px, h * 0.72 + Math.sin(p * 9 + k) * 4, 3.2, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx + Math.sin(p * 8) * 4, h * 0.32 + p * h * 0.3, 2.6, 0, 6.2832);
    ctx.fill();
  }

  // 川へ出る
  const rx = w * 0.86;
  ctx.fillStyle = '#4a8fb8';
  ctx.fillRect(rx, h * 0.55, w - rx, h);
  ctx.fillStyle = 'rgba(150,220,245,.95)';
  ctx.beginPath();
  ctx.moveTo(gx + w * 0.66 - 16, h * 0.66);
  ctx.quadraticCurveTo(rx - 6, h * 0.68, rx + 4, h * 0.56);
  ctx.lineTo(rx + 4, h * 0.7);
  ctx.quadraticCurveTo(rx - 10, h * 0.8, gx + w * 0.66 - 16, h * 0.86);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 結果くらべ用のミニマップ ----------
export function drawMinimap(canvas, city, maxd, under = 0) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const sc = size / W;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#efe7d6';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const t = city.type[i];
    let r = 235, g = 228, b = 206;
    if (t === TT.ROAD || t === TT.CROSS) { r = 176; g = 170; b = 160; }
    else if (t === TT.PLAZA || t === TT.CURB || t === TT.RAMP) { r = 214; g = 202; b = 176; }
    else if (t === TT.PARK) { r = 168; g = 208; b = 140; }
    else if (t === TT.RIVER) { r = 110; g = 150; b = 180; }
    else if (t === TT.ENTRANCE) { r = 60; g = 66; b = 74; }
    if (city.solid[i] === 1 && t !== TT.RIM) { r = 205; g = 195; b = 180; }

    const d = maxd ? maxd[i] : 0;
    if (d > 0.018 && t !== TT.RIVER) {
      // 深い所ほど濃い青。1回目と2回目のちがいが色で分かるように。
      // うすい水は水色、ふかく沈んだ所はこい紺色。
      // 「1回目はここが真っ青だったのに、2回目はうすい」が色でわかるようにする。
      const k = Math.min(1, (d - 0.018) / 0.26);
      const e = Math.pow(k, 0.8);
      const wr = 165 - 155 * e, wg = 220 - 150 * e, wb = 248 - 92 * e;
      const mix = 0.55 + 0.45 * e;
      r = r * (1 - mix) + wr * mix;
      g = g * (1 - mix) + wg * mix;
      b = b * (1 - mix) + wb * mix;
    }
    const o = i * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }

  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, size, size);

  // 地下入口。入った水の量ぶんだけ丸が青くうまる。
  const e = city.entrance;
  const cx = ((e.x0 + e.x1) / 2 + 0.5) * sc, cy = ((e.y0 + e.y1) / 2 + 0.5) * sc;
  const rad = size * 0.055;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, 6.2832);
  ctx.fillStyle = '#fffdf6';
  ctx.fill();
  const lv = Math.min(1, under / 110);
  if (lv > 0.02) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#1a5fb4';
    ctx.fillRect(cx - rad, cy + rad - 2 * rad * lv, rad * 2, 2 * rad * lv);
    ctx.restore();
  }
  ctx.strokeStyle = '#e0534d';
  ctx.lineWidth = Math.max(2, size * 0.016);
  ctx.stroke();
  ctx.restore();
}
