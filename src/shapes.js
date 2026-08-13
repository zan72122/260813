// 形状定義 — サインプレーン上の2Dパスを等弧長でサンプルして返す。
// 実寸: サイン全体は幅 0.6〜0.7m 程度（実際の小型ネオンサイン相当）。
import * as THREE from 'three';

export const SAMPLES = 256; // 等弧長サンプル数

function resampleUniform(dense, n) {
  // dense: THREE.Vector2[] → 等弧長 n 点にリサンプル
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
  }
  const L = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * L;
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1e-9;
    const f = (s - cum[j]) / seg;
    out.push(new THREE.Vector2().lerpVectors(dense[j], dense[j + 1], f));
  }
  return { points: out, length: L };
}

// 角丸ポリライン(星用): 各角を半径rの円弧で丸める
function roundedPolygon(corners, r, closed = true) {
  const dense = [];
  const n = corners.length;
  const per = 26;
  for (let i = 0; i < n; i++) {
    const p = corners[i];
    const prev = corners[(i - 1 + n) % n];
    const next = corners[(i + 1) % n];
    const din = p.clone().sub(prev).normalize();
    const dout = next.clone().sub(p).normalize();
    const a = p.clone().sub(din.clone().multiplyScalar(r));
    const b = p.clone().add(dout.clone().multiplyScalar(r));
    if (dense.length === 0) dense.push(a.clone());
    // ベジェで角を丸める
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const q1 = new THREE.Vector2().lerpVectors(a, p, t);
      const q2 = new THREE.Vector2().lerpVectors(p, b, t);
      dense.push(new THREE.Vector2().lerpVectors(q1, q2, t));
    }
    // 次の角の手前まで直線
    const nc = corners[(i + 1) % n];
    const bEnd = nc.clone().sub(dout.clone().multiplyScalar(r));
    for (let k = 1; k <= per; k++) {
      dense.push(new THREE.Vector2().lerpVectors(b, bEnd, k / per));
    }
    if (!closed && i === n - 2) break;
  }
  return dense;
}

function starDense() {
  const R = 0.335, r = 0.143;
  const corners = [];
  for (let i = 0; i < 10; i++) {
    const ang = Math.PI / 2 + (i * Math.PI) / 5; // 上向きスタート
    const rad = i % 2 === 0 ? R : r;
    corners.push(new THREE.Vector2(Math.cos(ang) * rad, Math.sin(ang) * rad));
  }
  // 開始点を左下の谷にして書き順を自然に
  const start = 7;
  const rot = corners.slice(start).concat(corners.slice(0, start));
  rot.push(rot[0].clone());
  return roundedPolygon(rot.slice(0, 10), 0.02, true).concat();
}

function heartDense() {
  const pts = [];
  const N = 720;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector2(x * 0.0195, y * 0.0195 + 0.02));
  }
  return pts;
}

function flowerDense() {
  const pts = [];
  const N = 900;
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + (i / N) * Math.PI * 4; // 2周で5枚花弁(r=sin 2.5θ)
    const rad = 0.055 + 0.30 * Math.pow(Math.abs(Math.sin(1.25 * th)), 0.85);
    pts.push(new THREE.Vector2(Math.cos(th) * rad, Math.sin(th) * rad + 0.01));
  }
  return pts;
}

function rainbowDense() {
  const pts = [];
  const N = 400;
  const R = 0.35;
  const a0 = Math.PI + 0.10, a1 = -0.10; // ほぼ半円のアーチ
  for (let i = 0; i <= N; i++) {
    const a = a0 + (i / N) * (a1 - a0);
    pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R - 0.13));
  }
  return pts;
}

const GRADS = {
  star: [
    [0.0, 0xffd94f], [0.5, 0xffab26], [1.0, 0xffe98a],
  ],
  heart: [
    [0.0, 0xff7bb1], [0.45, 0xff2e63], [1.0, 0xff9ec9],
  ],
  flower: [
    [0.0, 0xff5fd6], [0.35, 0xc46bff], [0.68, 0x8f8bff], [1.0, 0xff5fd6],
  ],
  rainbow: [
    [0.0, 0xff4444], [0.22, 0xffa02e], [0.42, 0xffe93e],
    [0.62, 0x3fe86f], [0.82, 0x3fb4ff], [1.0, 0xb45cff],
  ],
};

const DENSE = { star: starDense, heart: heartDense, flower: flowerDense, rainbow: rainbowDense };

export function buildShape(name) {
  const dense = DENSE[name]();
  const { points, length } = resampleUniform(dense, SAMPLES);
  const grad = GRADS[name].map(([s, hex]) => ({ stop: s, color: new THREE.Color(hex) }));
  // 平均色（照明・床反射用）
  const avg = new THREE.Color(0, 0, 0);
  grad.forEach((g) => avg.add(g.color));
  avg.multiplyScalar(1 / grad.length);
  return { name, points, length, grad, avg };
}

export function gradColorAt(shape, s) {
  const g = shape.grad;
  if (s <= g[0].stop) return g[0].color.clone();
  for (let i = 1; i < g.length; i++) {
    if (s <= g[i].stop) {
      const f = (s - g[i - 1].stop) / (g[i].stop - g[i - 1].stop || 1e-9);
      return g[i - 1].color.clone().lerp(g[i].color, f);
    }
  }
  return g[g.length - 1].color.clone();
}
