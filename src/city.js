// ミニチュア都市の地形をつくる。DOM を使わない純ロジック（Node で単体テストできる）。
//
// 高さの単位はだいたい「メートル」。低い所へ水が行くだけの単純な世界。
//   ・道路はまんなかが少し高い（クラウン）→ 両側のみぞに細い流れができる
//   ・交差点はたいらで低い          → 流れが合流する
//   ・ひろばは街でいちばん低い      → 水がたまる
//   ・ひろばのふちは段差            → 入口(スロープ)からしか水が入れない
//   ・地下入口はひろばの中の穴      → ふちを越えると水が落ちていく

import { makeRng, rngRange, rngInt, rngPick } from './rng.js';

export const W = 96;
export const H = 96;

export const TT = {
  RIM: 0,       // 模型のふち（トレイの壁）
  RIVER: 1,     // 小さな川
  BANK: 2,      // 護岸
  PARK: 3,      // 芝生
  ROAD: 4,      // 道路
  CROSS: 5,     // 交差点
  WALK: 6,      // 歩道
  BLOCK: 7,     // 街区
  PLAZA: 8,     // 低いひろば
  CURB: 9,      // ひろばのふち（段差）
  RAMP: 10,     // ひろばの入口（水の入り口）
  ENTRANCE: 11, // 地下入口の穴
  LIP: 12,      // 地下入口のふち（ここを越えると入っちゃう）
  GRATE: 13,    // 排水口
  OUTFALL: 14,  // 地下管から川への出口
};

const VROADS = [[26, 32], [54, 60], [82, 88]];
const HROADS = [[16, 22], [46, 52], [76, 82]];
// 道路にはさまれた街区
const X_BANDS = [[21, 25], [33, 53], [61, 81], [89, 92]];
const Y_BANDS = [[4, 15], [23, 45], [53, 75], [83, 92]];

const RIVER_X = [5, 13];
const BANK_X = [[3, 4], [14, 16]];
const PARK_X = [17, 20];
const CITY_X = [21, 92];
const CITY_Y = [4, 92];

export const PLAZA = { x0: 33, x1: 53, y0: 53, y1: 75 };
export const ENTRANCE = { x0: 45, x1: 50, y0: 65, y1: 70 };
const SHOP = { x0: 34, x1: 39, y0: 58, y1: 63 };

// 谷の底（街でいちばん低い所）。ここへ向かって全体がゆるく傾いている。
const LOW = { x: 38, y: 70 };

// ひろばへの入口は 2 か所だけ。ここからしか水は入れない（壁で止められる）。
const RAMP_N = { x0: 35, x1: 44, y: PLAZA.y0 };
const RAMP_S = { x0: 36, x1: 46, y: PLAZA.y1 };

// ひろばの底の高さと、地下入口のふちの高さ（絶対値）。
// ふちは「水面がここまで上がったら入っちゃう」ラインなので場所によらず一定にする。
const PLAZA_FLOOR = 0.24 - 0.115 - 0.045;
const RAMP_RUN = 5;   // 入口の坂の長さ（セル）
const LIP_H = PLAZA_FLOOR + 0.17;

export const idx = (x, y) => y * W + x;
const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const inBand = (v, b) => v >= b[0] && v <= b[1];

function bandOf(v, bands) {
  for (const b of bands) if (inBand(v, b)) return b;
  return null;
}

// ゆるい谷。LOW から離れるほど高い。
function baseHeight(x, y) {
  const d = Math.hypot(x - LOW.x, y - LOW.y);
  return 0.24 + 0.0100 * Math.min(d, 78);
}

function riverHeight(y) {
  return -0.34 - 0.0032 * y;
}

export function createCity(seed = 20260814) {
  const rng = makeRng(seed);
  const type = new Uint8Array(W * H);
  const ground = new Float32Array(W * H);
  const solid = new Uint8Array(W * H);
  const absorb = new Float32Array(W * H);

  // ---- 1. 地面の種類 ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      let t;
      if (inBand(x, RIVER_X)) {
        t = TT.RIVER;
      } else if (BANK_X.some((b) => inBand(x, b))) {
        t = TT.BANK;
      } else if (inBand(x, PARK_X)) {
        t = y < 2 || y > 93 ? TT.RIM : TT.PARK;
      } else if (x < CITY_X[0] || x > CITY_X[1] || y < CITY_Y[0] || y > CITY_Y[1]) {
        t = TT.RIM;
      } else if (inRect(x, y, PLAZA)) {
        t = TT.PLAZA;
      } else {
        const vb = bandOf(x, VROADS);
        const hb = bandOf(y, HROADS);
        if (vb && hb) t = TT.CROSS;
        else if (vb || hb) t = TT.ROAD;
        else t = TT.BLOCK;
      }
      type[i] = t;
    }
  }

  // ひろばのふち / 入口スロープ
  for (let y = PLAZA.y0; y <= PLAZA.y1; y++) {
    for (let x = PLAZA.x0; x <= PLAZA.x1; x++) {
      const edge = x === PLAZA.x0 || x === PLAZA.x1 || y === PLAZA.y0 || y === PLAZA.y1;
      if (!edge) continue;
      const onRampN = y === RAMP_N.y && x >= RAMP_N.x0 && x <= RAMP_N.x1;
      const onRampS = y === RAMP_S.y && x >= RAMP_S.x0 && x <= RAMP_S.x1;
      type[idx(x, y)] = (onRampN || onRampS) ? TT.RAMP : TT.CURB;
    }
  }

  // 地下入口（穴 + ふち）
  for (let y = ENTRANCE.y0 - 1; y <= ENTRANCE.y1 + 1; y++) {
    for (let x = ENTRANCE.x0 - 1; x <= ENTRANCE.x1 + 1; x++) {
      type[idx(x, y)] = inRect(x, y, ENTRANCE) ? TT.ENTRANCE : TT.LIP;
    }
  }

  // 歩道（街区のうち道路/ひろばに近い所）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (type[i] !== TT.BLOCK) continue;
      let near = false;
      for (let dy = -3; dy <= 3 && !near; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const t = type[idx(nx, ny)];
          if (t === TT.ROAD || t === TT.CROSS || t === TT.CURB || t === TT.RAMP) { near = true; break; }
        }
      }
      if (near) type[i] = TT.WALK;
    }
  }

  // ---- 2. 高さ ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const b = baseHeight(x, y);
      let h;
      switch (type[i]) {
        case TT.RIM: h = b + 1.7; break;
        case TT.RIVER: h = riverHeight(y); break;
        case TT.BANK: h = b + 0.42; break;
        case TT.PARK: h = b + 0.17; break;
        case TT.WALK: h = b + 0.145; break;
        case TT.BLOCK: h = b + 0.175; break;
        case TT.CROSS: h = b; break;
        case TT.ROAD: {
          // 道路はかまぼこ型。まんなかが少し高く、両はしがみぞになる。
          const vb = bandOf(x, VROADS), hb = bandOf(y, HROADS);
          const bd = vb || hb;
          const c = (bd[0] + bd[1]) / 2;
          const half = (bd[1] - bd[0]) / 2 + 0.5;
          const off = Math.abs((vb ? x : y) - c);
          h = b + 0.065 * Math.max(0, 1 - off / half);
          break;
        }
        case TT.PLAZA: {
          // ひろばは「まわりの傾きと関係のない、ひとつのおわん」。
          // こうしておくと「水面がふちの高さに届いたら入る」がいつも同じになる。
          const dd = Math.hypot(x - LOW.x, y - LOW.y);
          h = PLAZA_FLOOR + 0.055 * Math.min(1, dd / 20);
          // 入口はゆるい坂にする。段差だと水が飛びはねて、へんな所へ入ってしまう。
          const slope = (r, dist) => {
            if (x < r.x0 || x > r.x1 || dist < 0 || dist > RAMP_RUN) return h;
            const t = dist / RAMP_RUN;
            const top = baseHeight(x, r.y) - 0.02;
            return Math.max(h, top + (h - top) * t);
          };
          h = slope(RAMP_N, y - RAMP_N.y);
          h = slope(RAMP_S, RAMP_S.y - y);
          break;
        }
        case TT.CURB: h = b + 0.15; break;
        case TT.RAMP: h = b - 0.02; break;
        case TT.LIP: h = LIP_H; break;
        case TT.ENTRANCE: h = LIP_H - 1.0; break;
        default: h = b;
      }
      ground[i] = h;
    }
  }

  // 川の出口（南端）と地下入口は水を飲み込む
  for (let x = RIVER_X[0]; x <= RIVER_X[1]; x++) {
    for (let y = 92; y < H; y++) absorb[idx(x, y)] = 0.35;
  }
  for (let y = ENTRANCE.y0; y <= ENTRANCE.y1; y++) {
    for (let x = ENTRANCE.x0; x <= ENTRANCE.x1; x++) absorb[idx(x, y)] = 0.55;
  }

  // ---- 3. 排水口 ----
  const drains = [
    // ひろばの詰まった排水口。葉っぱを取ると渦を巻いて吸い込む（いちばんの見せ場）
    { id: 'plaza', x: 38, y: 70, r: 2.6, state: 'clogged', power: 0.28, leaves: 9 },
    // 大きな排水口。ふたを開けると、ひろばへ行く前の水を横取りする
    { id: 'big', x: 57, y: 49, r: 3.2, state: 'closed', power: 0.9, leaves: 0 },
    // はじめから働いている小さな排水口（見本）
    { id: 'north', x: 29, y: 19, r: 1.7, state: 'open', power: 0.06, leaves: 0 },
  ];
  for (const d of drains) {
    d.cells = [];
    const r = Math.ceil(d.r);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > d.r) continue;
        const x = d.x + dx, y = d.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = idx(x, y);
        d.cells.push(i);
        type[i] = TT.GRATE;
        ground[i] -= 0.03; // 少しくぼませて水を集める
      }
    }
  }

  // 地下管の出口（川へ）
  const outfall = { x: 15, y: 78 };
  for (let dy = -1; dy <= 1; dy++) type[idx(outfall.x, outfall.y + dy)] = TT.OUTFALL;

  // ---- 4. 建物・木 ----
  const { buildings, trees } = placeProps(rng, type, ground);

  // ひろばの中の小さなお店。水はここで左右に分かれ、入口は水につかりやすい。
  buildings.push({
    x0: SHOP.x0, y0: SHOP.y0, x1: SHOP.x1, y1: SHOP.y1,
    height: 1.05, wall: '#ffd9a8', side: '#e8b877', roof: '#e0685c',
    gable: false, shop: true, seed: 4242,
  });

  const city = {
    W, H, type, ground, solid, absorb, drains, buildings, trees,
    outfall,
    layout: {
      vroads: VROADS, hroads: HROADS,
      xBands: X_BANDS, yBands: Y_BANDS,
      riverX: RIVER_X, bankX: BANK_X, parkX: PARK_X,
      cityX: CITY_X, cityY: CITY_Y,
    },
    plaza: PLAZA, entrance: ENTRANCE, shop: SHOP, low: LOW,
    ramps: { north: RAMP_N, south: RAMP_S },
    river: { x0: RIVER_X[0], x1: RIVER_X[1] },
    walls: [],
    h: new Float32Array(W * H),
    watch: [
      // 4歳児に見せる 3 つのゲージ（少ないほどよい）
      { id: 'under', x: 47, y: 68, cells: rectCells(ENTRANCE), kind: 'volume', scale: 120 },
      { id: 'shop', x: 37, y: 65, cells: rectCells({ x0: SHOP.x0 - 1, x1: SHOP.x1 + 1, y0: SHOP.y1 + 1, y1: SHOP.y1 + 3 }), kind: 'depth', scale: 0.24 },
      { id: 'plaza', x: LOW.x, y: LOW.y, cells: discCells(LOW.x, LOW.y - 4, 5), kind: 'depth', scale: 0.28 },
    ],
  };

  rebuildHeights(city);
  return city;
}

function rectCells(r) {
  const out = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(idx(x, y));
  return out;
}

function discCells(cx, cy, rad) {
  const out = [];
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (Math.hypot(x - cx, y - cy) <= rad && x >= 0 && y >= 0 && x < W && y < H) out.push(idx(x, y));
    }
  }
  return out;
}

// 建物は街区の内側にだけ置く（歩道と道路は空けておく → 水の道が見える）
function placeProps(rng, type, ground) {
  const buildings = [];
  const trees = [];
  const palette = [
    ['#ffb3a7', '#e2705f'], ['#ffe08a', '#e3ac3a'], ['#a8e6c9', '#4fb890'],
    ['#bcd8ff', '#6fa3e0'], ['#e2c7ff', '#a681d8'], ['#ffd3b6', '#e09a63'],
    ['#fff1d6', '#d9bd8b'], ['#c9ecff', '#7fc4e8'],
  ];
  const roofs = ['#c05a5a', '#5b7fa8', '#5f9c6d', '#b98a4a', '#8a6ea8'];

  const free = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        if (type[idx(x, y)] !== TT.BLOCK) return false;
      }
    }
    return true;
  };

  for (const bx of X_BANDS) {
    for (const by of Y_BANDS) {
      // 歩道(3セル)＋すきま(1セル)の内がわだけに建てる → 道と歩道はいつも見える
      const ix0 = bx[0] + 3, ix1 = bx[1] - 3, iy0 = by[0] + 3, iy1 = by[1] - 3;
      if (ix1 - ix0 < 3 || iy1 - iy0 < 3) continue;
      const tall = (bx[1] - bx[0]) > 12 && (by[1] - by[0]) > 12;
      for (let y = iy0; y + 3 <= iy1; ) {
        const rowH = Math.min(rngInt(rng, 4, 8), iy1 - y + 1);
        for (let x = ix0; x + 3 <= ix1; ) {
          const colW = Math.min(rngInt(rng, 4, 8), ix1 - x + 1);
          const x1 = x + colW - 1, y1 = y + rowH - 1;
          if (colW >= 4 && rowH >= 4 && free(x, y, x1, y1)) {
            const pal = rngPick(rng, palette);
            buildings.push({
              x0: x, y0: y, x1, y1,
              height: rngRange(rng, 1.0, tall ? 2.3 : 1.5),
              wall: pal[0], side: pal[1],
              roof: rngPick(rng, roofs),
              gable: rng() < 0.55,
              seed: Math.floor(rng() * 1e6),
            });
          }
          x += colW + 1;
        }
        y += rowH + 1;
      }
    }
  }

  // 建物のあたりを立体化（水が入らない壁）
  for (const b of buildings) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) type[idx(x, y)] = TT.BLOCK;
    }
  }

  // 木：川ぞいの芝生・街区のすきま・ひろばのすみ
  const occupied = (x, y, pad = 1) => buildings.some(
    (b) => x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad);
  const farFromTrees = (x, y, r) => !trees.some((o) => Math.hypot(o.x - x, o.y - y) < r);

  for (let n = 0; n < 420 && trees.length < 74; n++) {
    const x = rngInt(rng, 1, W - 2), y = rngInt(rng, 1, H - 2);
    const t = type[idx(x, y)];
    const inPark = t === TT.PARK;
    const inYard = (t === TT.BLOCK || t === TT.WALK) && !occupied(x, y, 1);
    const onPlazaEdge = t === TT.PLAZA
      && (x < PLAZA.x0 + 3 || x > PLAZA.x1 - 3 || y < PLAZA.y0 + 3 || y > PLAZA.y1 - 3)
      && !occupied(x, y, 2);
    if (!inPark && !inYard && !onPlazaEdge) continue;
    if (!farFromTrees(x, y, inPark ? 4 : 5)) continue;
    trees.push({ x, y, r: rngRange(rng, 1.4, 2.4), tone: rng(), seed: Math.floor(rng() * 1e6) });
  }

  return { buildings, trees, ground };
}

// 建物・防水壁を足した「水がぶつかる高さ」を作りなおす
export function rebuildHeights(city) {
  const { h, ground, solid, buildings, walls } = city;
  h.set(ground);
  solid.fill(0);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (city.type[i] === TT.RIM) { solid[i] = 1; }
    }
  }

  for (const b of buildings) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = idx(x, y);
        h[i] = ground[i] + 2.2;
        solid[i] = 1;
      }
    }
  }

  for (const wl of walls) {
    for (const c of wallCells(wl)) {
      const i = idx(c.x, c.y);
      if (city.solid[i]) continue;
      h[i] = ground[i] + 0.34;
      solid[i] = 2; // 2 = プレイヤーの壁
    }
  }
  return city;
}

export function wallCells(wl) {
  const out = [];
  const len = wl.len ?? 9, thick = 2;
  for (let a = -Math.floor(len / 2); a <= Math.floor(len / 2); a++) {
    for (let b = 0; b < thick; b++) {
      const x = wl.horizontal ? wl.x + a : wl.x + b;
      const y = wl.horizontal ? wl.y + b : wl.y + a;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      out.push({ x, y });
    }
  }
  return out;
}

export function canPlaceWall(city, wl) {
  const cells = wallCells(wl);
  if (!cells.length) return false;
  let ok = 0;
  for (const c of cells) {
    const i = idx(c.x, c.y);
    const t = city.type[i];
    if (city.solid[i] === 1) return false;
    if (t === TT.ENTRANCE || t === TT.RIVER || t === TT.RIM || t === TT.GRATE) return false;
    if (t === TT.ROAD || t === TT.CROSS || t === TT.PLAZA || t === TT.RAMP || t === TT.WALK || t === TT.CURB || t === TT.LIP) ok++;
  }
  return ok >= cells.length * 0.7;
}
