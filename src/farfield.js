// 遠景に広がる塩田群。
// クライマックスで俯瞰に切り替わったとき、画面いっぱいがピンクの幾何学模様になる
// ——この光景を作るための、地平線まで続く池のグリッド。
import * as THREE from 'three';
import { createFarWaterMaterial } from './water.js';
import { FLOOR, TOP, SLOPE } from './world.js';
import { makeRng, clamp } from './util.js';

const FAR_WATER_Y = FLOOR + 0.30;
const BW = 3.0; // 遠景の畦幅

// ピンクが広がる中心。プレイヤーが作った池から外へ波及していく。
const ORIGIN = new THREE.Vector2(0, -6);
const MAX_DIST = 260;

function pushBund(arr, x0, x1, z0, z1) {
  const { pos, uv, idx } = arr;
  const s = Math.min(SLOPE, (x1 - x0) / 2.2, (z1 - z0) / 2.2);
  const o = [
    [x0, FLOOR, z0],
    [x1, FLOOR, z0],
    [x1, FLOOR, z1],
    [x0, FLOOR, z1],
  ];
  const i = [
    [x0 + s, TOP, z0 + s],
    [x1 - s, TOP, z0 + s],
    [x1 - s, TOP, z1 - s],
    [x0 + s, TOP, z1 - s],
  ];
  const push = (v) => {
    pos.push(v[0], v[1], v[2]);
    uv.push(v[0] / 4, v[2] / 4);
    return pos.length / 3 - 1;
  };
  const quad = (a, b, c, d) => {
    const ia = push(a);
    const ib = push(b);
    const ic = push(c);
    const id = push(d);
    idx.push(ia, ib, ic, ia, ic, id);
  };
  quad(o[1], o[0], i[0], i[1]);
  quad(o[2], o[1], i[1], i[2]);
  quad(o[3], o[2], i[2], i[3]);
  quad(o[0], o[3], i[3], i[0]);
  quad(i[0], i[3], i[2], i[1]);
}

function pushWater(arr, x0, x1, z0, z1, rng) {
  const { pos, uv, delay, size, idx } = arr;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const d = Math.hypot(cx - ORIGIN.x, cz - ORIGIN.y);
  // 近い池ほど早くピンクになる。少しゆらぎを混ぜて、機械的な広がりに見えないようにする。
  const del = clamp(Math.pow(d / MAX_DIST, 0.82) * 0.62 + (rng() - 0.5) * 0.07, 0, 0.66);
  // 池ごとに到達する濃度を変える。実際の塩田も工程ごとに色が違う。
  const mx = 0.66 + rng() * 0.34;
  const w = x1 - x0;
  const h = z1 - z0;
  const base = pos.length / 3;
  const corners = [
    [x0, z0, 0, 0],
    [x1, z0, 1, 0],
    [x1, z1, 1, 1],
    [x0, z1, 0, 1],
  ];
  for (const [x, z, u, v] of corners) {
    pos.push(x, FAR_WATER_Y, z);
    uv.push(u, v);
    delay.push(del, mx);
    size.push(w, h);
  }
  idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
}

// 区画を格子に割って、畦と水面を書き出す。
function addBlock(water, bunds, rng, x0, x1, z0, z1, cellW, cellH) {
  const cols = [x0];
  let x = x0;
  while (x1 - x > cellW * 1.4) {
    x += cellW * (0.75 + rng() * 0.5);
    cols.push(x);
  }
  cols.push(x1);

  const rows = [z0];
  let z = z0;
  while (z1 - z > cellH * 1.4) {
    z += cellH * (0.75 + rng() * 0.5);
    rows.push(z);
  }
  rows.push(z1);

  // 畦（縦横のライン）
  for (const cx of cols) pushBund(bunds, cx - BW / 2, cx + BW / 2, z0 - BW / 2, z1 + BW / 2);
  for (const cz of rows) pushBund(bunds, x0 - BW / 2, x1 + BW / 2, cz - BW / 2, cz + BW / 2);

  // 水面
  for (let i = 0; i < cols.length - 1; i++) {
    for (let j = 0; j < rows.length - 1; j++) {
      // 一部は水を抜いて塩を掻き取ったあとの白い池にする（単調さを避ける）
      if (rng() < 0.11) continue;
      pushWater(
        water,
        cols[i] + BW / 2,
        cols[i + 1] - BW / 2,
        rows[j] + BW / 2,
        rows[j + 1] - BW / 2,
        rng
      );
    }
  }
}

export function buildFarField(scene, shared, soilMaterial) {
  const rng = makeRng(20260813);
  const water = { pos: [], uv: [], delay: [], size: [], idx: [] };
  const bunds = { pos: [], uv: [], idx: [] };

  // 取水路の向こう側、地平線まで続く広大な塩田
  addBlock(water, bunds, rng, -250, 250, -262, -37, 30, 24);
  // プレイ区画の左右へ広がる塩田
  addBlock(water, bunds, rng, -250, -22, -19, 150, 28, 22);
  addBlock(water, bunds, rng, 22, 250, -19, 150, 28, 22);
  // 手前側。プレイ中のカメラより後ろから始めるので、操作の視界をふさがない。
  addBlock(water, bunds, rng, -22, 22, 38, 150, 26, 21);

  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(water.pos, 3));
  waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(water.uv, 2));
  waterGeo.setAttribute('aDelay', new THREE.Float32BufferAttribute(water.delay, 2));
  waterGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(water.size, 2));
  waterGeo.setIndex(water.idx);
  waterGeo.computeBoundingSphere();

  const farMat = createFarWaterMaterial(shared);
  const farWater = new THREE.Mesh(waterGeo, farMat);
  farWater.name = 'farWater';
  farWater.renderOrder = 1;
  scene.add(farWater);

  const bundGeo = new THREE.BufferGeometry();
  bundGeo.setAttribute('position', new THREE.Float32BufferAttribute(bunds.pos, 3));
  bundGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bunds.uv, 2));
  bundGeo.setIndex(bunds.idx);
  bundGeo.computeVertexNormals();
  bundGeo.computeBoundingSphere();

  const farBunds = new THREE.Mesh(bundGeo, soilMaterial);
  farBunds.name = 'farBunds';
  scene.add(farBunds);

  return { farWater, farMat, farBunds };
}
