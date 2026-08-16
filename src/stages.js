// ステージ定義: 壁と隙間、登場する物体、フィールドの大きさ。
// パズルは常にひとつの因果 —「厚いと通れない / ぺちゃんこなら通る」— に集中する。

import * as THREE from 'three';

const wallMat = c => new THREE.MeshLambertMaterial({ color: c });

// 壁は画面端よりずっと外まで伸ばす（「横から回れそう」に見えないように）
const EXT = 16;

// 隙間の中の暗がり — 「ここが穴」だと一目で分かるように
function gapShade(width, height, x = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x51415e, side: THREE.DoubleSide })
  );
  m.position.set(x, height / 2, 0);
  return m;
}

export const PLAY = {
  halfW: 5.2,     // x 方向の遊び場の半分
  nearZ: 7.2,     // 手前端
  farZ: -7.2,     // 奥端
  wallZ: 0,
  wallBand: 0.38  // 壁の厚み(半分+余白) — この |z| 帯を横切る時に判定
};

// --- 3種類の壁 ---

// 1: ドア（下に隙間）
function buildDoorWall(gap) {
  const g = new THREE.Group();
  const H = 2.6, T = 0.42;
  const doorW = gap.halfW * 2 + 0.3;
  const sideW = EXT - doorW / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(sideW, H, T), wallMat(0xffb5c9));
  left.position.set(-(doorW / 2 + sideW / 2), H / 2, 0);
  const right = left.clone();
  right.position.x = doorW / 2 + sideW / 2;
  g.add(left, right);
  // ドア枠
  const frameMat = wallMat(0xe56399);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.3, 0.3, T + 0.1), frameMat);
  lintel.position.set(0, H - 0.15, 0);
  g.add(lintel);
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.16, H, T + 0.1), frameMat);
    jamb.position.set(sx * (doorW / 2 + 0.08), H / 2, 0);
    g.add(jamb);
  }
  // ドア板: 下端が gap.h だけ浮いている → ここが「くぐる」場所
  const panelH = H - 0.3 - gap.h;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.06, panelH, 0.14), wallMat(0xfff1e6));
  panel.position.set(0, gap.h + panelH / 2, 0);
  g.add(panel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), wallMat(0xffd60a));
  knob.position.set(doorW / 2 - 0.3, 1.15, 0.12);
  g.add(knob);
  g.add(gapShade(doorW - 0.06, gap.h));
  // 上の飾り窓
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshLambertMaterial({ color: 0xbde0fe, emissive: 0x224466 }));
  win.scale.set(1, 1, 0.3);
  win.position.set(0, 2.0, 0);
  g.add(win);
  return g;
}

// 2: 壁の細いスリット
function buildSlitWall(gap) {
  const g = new THREE.Group();
  const H = 2.3, T = 0.42;
  const gx = gap.x, gw = gap.halfW * 2;
  const leftW = (gx - gw / 2) - (-EXT);
  const rightW = EXT - (gx + gw / 2);
  const c = 0xa8e6cf;
  const left = new THREE.Mesh(new THREE.BoxGeometry(leftW, H, T), wallMat(c));
  left.position.set(-EXT + leftW / 2, H / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(rightW, H, T), wallMat(c));
  right.position.set(EXT - rightW / 2, H / 2, 0);
  // スリットの上（gap.h から上は壁）
  const top = new THREE.Mesh(new THREE.BoxGeometry(gw, H - gap.h, T), wallMat(0x8fd8b8));
  top.position.set(gx, gap.h + (H - gap.h) / 2, 0);
  g.add(left, right, top);
  // スリットの縁を明るく（見つけやすく）
  const lip = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.2, 0.09, T + 0.12), wallMat(0xfff3b0));
  lip.position.set(gx, gap.h + 0.045, 0);
  g.add(lip);
  g.add(gapShade(gw, gap.h, gx));
  // 屋根飾り
  for (let i = 0; i < 6; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), wallMat(i % 2 ? 0xffd166 : 0xff8fab));
    dot.position.set(-4.4 + i * 1.76, H + 0.1, 0);
    g.add(dot);
  }
  return g;
}

// 3: 格子（バーの下をくぐる）
function buildFenceWall(gap) {
  const g = new THREE.Group();
  const H = 2.1, T = 0.3;
  const c = 0xcdb4db;
  const gx = gap.x, gw = gap.halfW * 2;
  // 両サイドは生垣
  const leftW = (gx - gw / 2) - (-EXT);
  const rightW = EXT - (gx + gw / 2);
  const hedgeMat = wallMat(0x87c38f);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(leftW, 1.7, 0.7), hedgeMat);
  hl.position.set(-EXT + leftW / 2, 0.85, 0);
  const hr = new THREE.Mesh(new THREE.BoxGeometry(rightW, 1.7, 0.7), hedgeMat);
  hr.position.set(EXT - rightW / 2, 0.85, 0);
  g.add(hl, hr);
  // 上のレール
  const rail = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.4, 0.16, T), wallMat(0xb392c8));
  rail.position.set(gx, H, 0);
  const rail2 = rail.clone();
  rail2.position.y = H - 0.6;
  g.add(rail, rail2);
  // 縦バー: 下端は gap.h で止まっている → その下をくぐる
  const barH = H - gap.h;
  const nBars = Math.floor(gw / 0.42);
  for (let i = 0; i <= nBars; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, barH, 10), wallMat(c));
    bar.position.set(gx - gw / 2 + (gw / nBars) * i, gap.h + barH / 2, 0);
    g.add(bar);
  }
  // バーの先端を丸く
  for (let i = 0; i <= nBars; i++) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), wallMat(0xffd166));
    tip.position.set(gx - gw / 2 + (gw / nBars) * i, H + 0.14, 0);
    g.add(tip);
  }
  return g;
}

const BUILDERS = { door: buildDoorWall, slit: buildSlitWall, fence: buildFenceWall };

// --- ステージデータ ---
// gap.h = 隙間の高さ（これより薄ければ通れる）
// フィールド半径は「その物体を覆える大きさ」に合わせて成長する
export const STAGES = [
  {
    name: 'おへや',
    wall: 'door',
    gap: { x: 0, halfW: 1.25, h: 0.42 },
    fieldRadius: 1.35,
    things: [
      { kind: 'cushion', pos: [-1.7, 3.2] },
      { kind: 'giftbox', pos: [1.9, 4.0] },
      { kind: 'ball', pos: [0.3, 5.1] }
    ],
    decor: [
      { kind: 'flower', pos: [-4.2, 5.8] },
      { kind: 'flower', pos: [4.3, 2.2] }
    ]
  },
  {
    name: 'おにわ',
    wall: 'slit',
    gap: { x: 1.1, halfW: 1.5, h: 0.3 },
    fieldRadius: 2.0,
    things: [
      { kind: 'chair', pos: [-2.0, 3.6] },
      { kind: 'teddy', pos: [1.6, 4.8] }
    ],
    decor: [
      { kind: 'tree', pos: [-4.3, 5.5] },
      { kind: 'flower', pos: [4.4, 4.9] }
    ]
  },
  {
    name: 'こうえん',
    wall: 'fence',
    gap: { x: -0.6, halfW: 2.1, h: 0.24 },
    fieldRadius: 3.0,
    things: [
      { kind: 'bicycle', pos: [-1.6, 3.8] },
      { kind: 'elephant', pos: [2.3, 5.0] }
    ],
    decor: [
      { kind: 'tree', pos: [4.4, 5.9] },
      { kind: 'tree', pos: [-4.5, 2.0] }
    ]
  }
];

export function buildWall(stageDef) {
  const wall = BUILDERS[stageDef.wall](stageDef.gap);
  wall.position.z = PLAY.wallZ;
  return wall;
}

// 移動判定: 物体(中心 pos, 足元半径 r, 現在高さ h)が壁帯を通れるか
export function canCrossWall(stageDef, x, h, r) {
  const gap = stageDef.gap;
  const inGapX = Math.abs(x - gap.x) < gap.halfW - Math.min(r * 0.25, 0.3);
  return inGapX && h <= gap.h;
}
