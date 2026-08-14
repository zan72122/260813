// 水のシミュレーション（virtual pipe / shallow water 近似）。
// 目的は物理の正しさではなく、4歳児に見える因果をこわさないこと:
//   高い所から低い所へ / 壁にあたると回りこむ / 穴へ吸いこまれる / 流れが合流する
// DOM を使わない純ロジック。

import { W, H, TT, idx, rebuildHeights } from './city.js';
import { makeRng } from './rng.js';

export const RAIN_SEED = 424242;
export const RUN_TICKS = 1400;

const SUBSTEPS = 2;
const DT = 0.014;
const G = 9.81;
const DAMP = 0.977;
const FLOW = 4.0;          // 流れの速さの調整（模型スケールなので実物より速く）
const MIN_DEPTH = 2e-4;    // これ以下は乾いたことにする
const MAX_V = 7;

const DROP_VOL = 0.038;    // 一滴が足す水の量
const FALL_TICKS = 16;     // 雨つぶが落ちるのにかかる時間
const MAX_DROPS = 260;
const MAX_FLOATERS = 70;

const RIVER_LEVEL = 0.2;

// ---- 雨のスケジュール（tick だけで決まる = 何度でも同じ雨） ----
export function rainRate(t) {
  if (t < 40) return 0;
  if (t < 170) return lerp(0.6, 3.2, (t - 40) / 130);
  if (t < 390) return lerp(3.2, 11, (t - 170) / 220);
  if (t < 830) return 11;
  if (t < 990) return lerp(11, 0, (t - 830) / 160);
  return 0;
}

// 雨雲の先端（北から南へすすむ）
export function rainFront(t) {
  return -18 + (t - 30) * 0.44;
}

function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

export function createSim(city) {
  const n = W * H;
  const sim = {
    city,
    d: new Float32Array(n),
    fx: new Float32Array(n),
    fy: new Float32Array(n),
    k: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    phase: new Float32Array(n),
    maxd: new Float32Array(n),
    prevMaxd: null,
    drops: [],
    floaters: [],
    events: [],
    tick: 0,
    running: false,
    rainRng: makeRng(RAIN_SEED),
    fxRng: makeRng(7777),
    stats: { under: 0, drained: 0, shop: 0, plaza: 0, wet: 0 },
    flags: {},
    drainFlow: 0,
    entranceFlow: 0,
  };
  resetWater(sim);
  return sim;
}

// 街をもういちど「乾いた最初の状態」へ。壁と排水口の状態はそのまま。
export function resetWater(sim) {
  const { city } = sim;
  sim.d.fill(0);
  sim.fx.fill(0);
  sim.fy.fill(0);
  sim.vx.fill(0);
  sim.vy.fill(0);
  sim.phase.fill(0);
  sim.maxd.fill(0);
  sim.drops.length = 0;
  sim.floaters.length = 0;
  sim.events.length = 0;
  sim.tick = 0;
  sim.rainRng = makeRng(RAIN_SEED);
  sim.fxRng = makeRng(7777);
  sim._rainAcc = 0;   // ← これを消し忘れると「まったく同じ雨」でなくなる
  for (const dr of city.drains) dr.flow = 0;
  sim.stats = { under: 0, drained: 0, shop: 0, plaza: 0, wet: 0 };
  sim.flags = {};
  sim.drainFlow = 0;
  sim.entranceFlow = 0;

  // 川には最初から水が流れている
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (city.type[i] === TT.RIVER) {
        sim.d[i] = Math.max(0, city.ground[i] + RIVER_LEVEL - city.ground[i]);
        sim.d[i] = RIVER_LEVEL;
      }
    }
  }
  for (let s = 0; s < 26; s++) spawnFloater(sim, true);
  return sim;
}

function push(sim, ev) { if (sim.events.length < 96) sim.events.push(ev); }

// ---- 1 tick すすめる（描画フレームと 1:1 = フレーム落ちしても結果は同じ） ----
export function stepSim(sim) {
  sim.events.length = 0;
  sim.drainFlow *= 0.6;
  sim.entranceFlow *= 0.6;

  makeRain(sim);
  riverSource(sim);
  for (let s = 0; s < SUBSTEPS; s++) flowStep(sim);
  drainStep(sim);
  velocityStep(sim);
  floaterStep(sim);
  recordStep(sim);

  sim.tick++;
  return sim;
}

function makeRain(sim) {
  const rate = rainRate(sim.tick);
  const front = rainFront(sim.tick);
  const rng = sim.rainRng;
  sim._rainAcc = (sim._rainAcc || 0) + rate;
  let count = Math.floor(sim._rainAcc);
  sim._rainAcc -= count;
  if (count > 20) count = 20;

  for (let c = 0; c < count; c++) {
    const x = 1 + rng() * (W - 3);
    const y = 1 + rng() * (H - 3);
    const cover = Math.min(1, Math.max(0, (front - y) / 16));
    if (rng() > cover) continue;
    if (sim.drops.length >= MAX_DROPS) continue;
    sim.drops.push({ x, y, t: FALL_TICKS, tt: FALL_TICKS });
  }

  // 落下と着地
  const { city } = sim;
  for (let i = sim.drops.length - 1; i >= 0; i--) {
    const p = sim.drops[i];
    p.t--;
    if (p.t > 0) continue;
    sim.drops.splice(i, 1);
    const gx = Math.round(p.x), gy = Math.round(p.y);
    const target = nearestOpen(city, gx, gy);
    if (target >= 0) {
      sim.d[target] += DROP_VOL;
      push(sim, { t: 'splash', x: p.x, y: p.y, solid: city.solid[idx(gx, gy)] ? 1 : 0 });
    }
  }
}

// 屋根に落ちた雨は、いちばん近い地面へ流れ落ちる。
// 地下入口にはひさしがあるので、雨は直接は入らない（越流でしか入らない）。
function blocked(city, i) {
  const t = city.type[i];
  // ふち(1セル)の上は雨つぶの当たり所が粗すぎるので、雨は落とさず横へ流す
  return city.solid[i] === 1 || t === TT.ENTRANCE || t === TT.LIP || t === TT.CURB;
}

function nearestOpen(city, x, y) {
  if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return -1;
  let i = idx(x, y);
  if (!blocked(city, i)) return i;
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        i = idx(nx, ny);
        if (!blocked(city, i)) return i;
      }
    }
  }
  return -1;
}

function riverSource(sim) {
  const { city } = sim;
  for (let y = 1; y <= 3; y++) {
    for (let x = city.river.x0; x <= city.river.x1; x++) {
      const i = idx(x, y);
      if (sim.d[i] < RIVER_LEVEL) sim.d[i] += 0.02;
    }
  }
}

function flowStep(sim) {
  const { d, fx, fy, k } = sim;
  const { h, solid } = sim.city;

  // 1) 流量を更新（となりとの水面の差で加速、少しずつ減速）
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (x < W - 1) {
        if (solid[i] || solid[i + 1]) fx[i] = 0;
        else {
          const dh = (h[i] + d[i]) - (h[i + 1] + d[i + 1]);
          fx[i] = fx[i] * DAMP + DT * G * FLOW * dh;
        }
      }
      if (y < H - 1) {
        if (solid[i] || solid[i + W]) fy[i] = 0;
        else {
          const dh = (h[i] + d[i]) - (h[i + W] + d[i + W]);
          fy[i] = fy[i] * DAMP + DT * G * FLOW * dh;
        }
      }
    }
  }

  // 2) セルにある水より多くは出せない
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      let out = 0;
      if (x < W - 1 && fx[i] > 0) out += fx[i];
      if (x > 0 && fx[i - 1] < 0) out -= fx[i - 1];
      if (y < H - 1 && fy[i] > 0) out += fy[i];
      if (y > 0 && fy[i - W] < 0) out -= fy[i - W];
      const cap = d[i];
      k[i] = (out * DT > cap && out > 0) ? cap / (out * DT) : 1;
    }
  }

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      if (x < W - 1) fx[i] *= fx[i] > 0 ? k[i] : k[i + 1];
      if (y < H - 1) fy[i] *= fy[i] > 0 ? k[i] : k[i + W];
    }
  }

  // 3) 水深を更新
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      let dv = 0;
      if (x < W - 1) dv -= fx[i];
      if (x > 0) dv += fx[i - 1];
      if (y < H - 1) dv -= fy[i];
      if (y > 0) dv += fy[i - W];
      let nd = d[i] + dv * DT;
      if (nd < MIN_DEPTH) nd = 0;
      d[i] = nd;
    }
  }
}

function drainStep(sim) {
  const { city, d } = sim;

  // 排水口が水を飲む
  for (const dr of city.drains) {
    if (dr.state !== 'open') { dr.flow = (dr.flow || 0) * 0.7; continue; }
    let took = 0;
    for (const i of dr.cells) {
      const dep = d[i];
      if (dep <= 0) continue;
      // 水が深いほど勢いよく吸いこむ（√h の関係）
      const rate = dr.power * (0.012 + 0.34 * Math.sqrt(dep));
      const take = Math.min(dep, rate);
      d[i] -= take;
      took += take;
    }
    dr.flow = (dr.flow || 0) * 0.55 + took * 0.45;
    sim.drainFlow += took;
    sim.stats.drained += took;
    if (took > 0.02 && !sim.flags['suck_' + dr.id]) {
      sim.flags['suck_' + dr.id] = sim.tick;
      push(sim, { t: 'suckStart', id: dr.id, x: dr.x, y: dr.y });
    }
  }

  // 地下入口と川の出口が水を飲む
  const ab = city.absorb;
  for (let i = 0; i < ab.length; i++) {
    const a = ab[i];
    if (a === 0 || d[i] <= 0) continue;
    const take = Math.min(d[i], d[i] * a + 0.004);
    d[i] -= take;
    if (city.type[i] === TT.ENTRANCE) {
      sim.stats.under += take;
      sim.entranceFlow += take;
      // ぱらぱら落ちた雨つぶではなく「越流」だけを数える
      if (sim.entranceFlow > 0.03 && !sim.flags.overflow) {
        sim.flags.overflow = sim.tick;
        push(sim, { t: 'overflow', x: (city.entrance.x0 + city.entrance.x1) / 2, y: (city.entrance.y0 + city.entrance.y1) / 2 });
      }
    }
  }
}

function velocityStep(sim) {
  const { d, fx, fy, vx, vy, phase } = sim;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const dep = d[i];
      if (dep <= 0) { vx[i] = 0; vy[i] = 0; continue; }
      const inv = 1 / Math.max(dep, 0.015);
      let ux = ((x > 0 ? fx[i - 1] : 0) + (x < W - 1 ? fx[i] : 0)) * 0.5 * inv;
      let uy = ((y > 0 ? fy[i - W] : 0) + (y < H - 1 ? fy[i] : 0)) * 0.5 * inv;
      if (ux > MAX_V) ux = MAX_V; else if (ux < -MAX_V) ux = -MAX_V;
      if (uy > MAX_V) uy = MAX_V; else if (uy < -MAX_V) uy = -MAX_V;
      vx[i] = ux; vy[i] = uy;
      phase[i] += Math.hypot(ux, uy) * 0.05 + 0.006;
      if (phase[i] > 1e4) phase[i] -= 1e4;
    }
  }
}

// ---- 浮いているもの（葉・花びら・ボール）＝ 流れの向きを見せる ----
function spawnFloater(sim, riverOnly = false) {
  const { city, d } = sim;
  const rng = sim.fxRng;
  if (sim.floaters.length >= MAX_FLOATERS) return;
  for (let tries = 0; tries < 24; tries++) {
    const x = 1 + rng() * (W - 2);
    const y = 1 + rng() * (H - 2);
    const i = idx(Math.round(x), Math.round(y));
    if (riverOnly && city.type[i] !== TT.RIVER) continue;
    if (d[i] < (riverOnly ? 0.05 : 0.02)) continue;
    const kind = rng();
    sim.floaters.push({
      x, y,
      kind: kind < 0.5 ? 'leaf' : kind < 0.78 ? 'petal' : 'ball',
      rot: rng() * 6.28,
      spin: (rng() - 0.5) * 0.1,
      size: 0.8 + rng() * 0.7,
      tone: rng(),
      dead: 0,
      swirl: 0,
    });
    return;
  }
}

function sample(arr, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return 0;
  const tx = x - x0, ty = y - y0;
  const i = idx(x0, y0);
  return arr[i] * (1 - tx) * (1 - ty) + arr[i + 1] * tx * (1 - ty)
       + arr[i + W] * (1 - tx) * ty + arr[i + W + 1] * tx * ty;
}
export { sample };

function floaterStep(sim) {
  const { city, d, vx, vy } = sim;
  if (sim.tick % 5 === 0) spawnFloater(sim);

  for (let i = sim.floaters.length - 1; i >= 0; i--) {
    const f = sim.floaters[i];
    const dep = sample(d, f.x, f.y);
    if (f.dead > 0) {
      f.dead -= 1;
      f.size *= 0.9;
      if (f.dead <= 0) sim.floaters.splice(i, 1);
      continue;
    }

    // 開いている排水口へ吸いよせられて、くるくる回りながら消える
    let sucked = false;
    for (const dr of city.drains) {
      if (dr.state !== 'open') continue;
      const dx = dr.x - f.x, dy = dr.y - f.y;
      const dist = Math.hypot(dx, dy);
      if (dist > dr.r + 5) continue;
      const pull = Math.min(1.6, 2.4 / Math.max(0.6, dist));
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      f.x += nx * pull * 0.16;
      f.y += ny * pull * 0.16;
      // 接線方向 = 渦
      f.x += -ny * pull * 0.24;
      f.y += nx * pull * 0.24;
      f.spin = 0.34;
      f.swirl = Math.min(1, f.swirl + 0.15);
      if (dist < 1.0) {
        f.dead = 8;
        push(sim, { t: 'suck', x: f.x, y: f.y, id: dr.id });
      }
      sucked = true;
    }

    if (!sucked) {
      if (dep < 0.006) { f.rot += f.spin * 0.1; f.spin *= 0.9; continue; } // 浅い所で座礁
      const ux = sample(vx, f.x, f.y);
      const uy = sample(vy, f.x, f.y);
      f.x += ux * 0.055;
      f.y += uy * 0.055;
      f.rot += f.spin + (ux - uy) * 0.01;
      f.spin *= 0.96;
      f.swirl *= 0.9;
    }

    if (f.x < 1 || f.y < 1 || f.x > W - 2 || f.y > H - 2) { sim.floaters.splice(i, 1); continue; }
    const ii = idx(Math.round(f.x), Math.round(f.y));
    if (city.solid[ii]) { // 壁にぶつかったら押しもどす
      f.x -= sample(vx, f.x, f.y) * 0.06;
      f.y -= sample(vy, f.x, f.y) * 0.06;
    }
    if (city.type[ii] === TT.ENTRANCE) { f.dead = 8; }
  }
}

function recordStep(sim) {
  const { d, maxd, city } = sim;
  let wet = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] > maxd[i]) maxd[i] = d[i];
    if (d[i] > 0.012 && city.type[i] !== TT.RIVER) wet++;
  }
  sim.stats.wet = wet;

  for (const w of city.watch) {
    if (w.kind !== 'depth') continue;
    let m = 0;
    for (const i of w.cells) if (d[i] > m) m = d[i];
    if (w.id === 'shop') sim.stats.shop = Math.max(sim.stats.shop, m);
    if (w.id === 'plaza') sim.stats.plaza = Math.max(sim.stats.plaza, m);
  }

  // 見どころのタイミングを教える（カメラ用）
  if (!sim.flags.firstStream && sim.tick > 60) {
    let c = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > 0.01 && city.type[i] === TT.ROAD) { c++; if (c > 40) break; }
    if (c > 40) { sim.flags.firstStream = sim.tick; push(sim, { t: 'firstStream' }); }
  }
  if (!sim.flags.rampIn) {
    const r = city.ramps.north;
    let m = 0;
    for (let x = r.x0; x <= r.x1; x++) m = Math.max(m, d[idx(x, r.y)]);
    if (m > 0.02) { sim.flags.rampIn = sim.tick; push(sim, { t: 'rampIn', x: (r.x0 + r.x1) / 2, y: r.y }); }
  }
  if (!sim.flags.plazaPool && sim.stats.plaza > 0.05) {
    sim.flags.plazaPool = sim.tick;
    push(sim, { t: 'plazaPool', x: city.low.x, y: city.low.y });
  }
}

// ---- プレイヤーの介入 ----
export function openDrain(sim, id) {
  const dr = sim.city.drains.find((x) => x.id === id);
  if (!dr || dr.state === 'open') return null;
  const was = dr.state;
  dr.state = 'open';
  dr.openedAt = sim.tick;
  return was;
}

export function setWall(sim, wall) {
  sim.city.walls = wall ? [wall] : [];
  rebuildHeights(sim.city);
  // 壁の下にあった水は横へ逃がす
  if (wall) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (sim.city.solid[i] === 2 && sim.d[i] > 0) sim.d[i] = 0;
      }
    }
  }
}
