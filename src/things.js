// 物体（潰せるもの）の定義とビルダー、そして「ぺちゃんこ」変形システム。
//
// 変形は本格 soft-body ではなく、パーツ単位の非一様スケールで偽装する:
//  - 高さはイージングでゆっくり縮む
//  - 横は少し広がる（床に近いパーツほど大きく広がり、角が押し出される感じを出す）
//  - 完了時・復元時にバネでプルンと揺れる
// これで色・輪郭・模様が保たれ、「さっきの椅子だ」と分かるまま平たくなる。

import * as THREE from 'three';
import { makeBlobShadow } from './fx.js';

const MAT_CACHE = new Map();
function mat(color) {
  if (!MAT_CACHE.has(color)) {
    MAT_CACHE.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return MAT_CACHE.get(color);
}

function geom(type, size) {
  switch (type) {
    case 'box': return new THREE.BoxGeometry(size[0], size[1], size[2]);
    case 'sphere': return new THREE.SphereGeometry(size[0], 20, 14);
    case 'cyl': return new THREE.CylinderGeometry(size[0], size[1] ?? size[0], size[2], 16);
    case 'torus': return new THREE.TorusGeometry(size[0], size[1], 10, 24);
    case 'cone': return new THREE.ConeGeometry(size[0], size[1], 16);
    default: throw new Error('unknown geom ' + type);
  }
}

// --- 物体カタログ（データ駆動: 全部同じ squash 方式を使い回す） ---
// part: [type, size, pos, color, rot?, scale?]
export const CATALOG = {
  cushion: {
    label: 'クッション', height: 0.55, radius: 0.62,
    parts: [
      ['sphere', [0.6], [0, 0.28, 0], 0xff8fab, null, [1, 0.48, 1]],
      ['sphere', [0.09], [0, 0.55, 0], 0xffc2d1],
      ['sphere', [0.13], [0.42, 0.24, 0.42], 0xffc2d1],
      ['sphere', [0.13], [-0.42, 0.24, 0.42], 0xffc2d1],
      ['sphere', [0.13], [0.42, 0.24, -0.42], 0xffc2d1],
      ['sphere', [0.13], [-0.42, 0.24, -0.42], 0xffc2d1]
    ]
  },
  giftbox: {
    label: 'はこ', height: 0.78, radius: 0.55,
    parts: [
      ['box', [0.78, 0.56, 0.78], [0, 0.28, 0], 0x8ecae6],
      ['box', [0.86, 0.16, 0.86], [0, 0.62, 0], 0x5fa8d3],
      ['box', [0.14, 0.6, 0.8], [0, 0.3, 0], 0xffe066],
      ['box', [0.8, 0.6, 0.14], [0, 0.3, 0], 0xffe066],
      ['sphere', [0.12], [0, 0.74, 0], 0xffd60a],
      ['sphere', [0.09], [0.12, 0.72, 0], 0xffd60a],
      ['sphere', [0.09], [-0.12, 0.72, 0], 0xffd60a]
    ]
  },
  ball: {
    label: 'ボール', height: 0.6, radius: 0.32,
    parts: [
      ['sphere', [0.3], [0, 0.3, 0], 0xf94144],
      ['torus', [0.3, 0.045], [0, 0.3, 0], 0xffffff, [Math.PI / 2, 0, 0]],
      ['sphere', [0.075], [0, 0.6, 0], 0xffffff]
    ]
  },
  chair: {
    label: 'いす', height: 1.5, radius: 0.68,
    parts: [
      ['cyl', [0.055, 0.055, 0.66], [0.3, 0.33, 0.3], 0xd4a373],
      ['cyl', [0.055, 0.055, 0.66], [-0.3, 0.33, 0.3], 0xd4a373],
      ['cyl', [0.055, 0.055, 0.66], [0.3, 0.33, -0.3], 0xd4a373],
      ['cyl', [0.055, 0.055, 0.66], [-0.3, 0.33, -0.3], 0xd4a373],
      ['box', [0.78, 0.12, 0.78], [0, 0.7, 0], 0xe9c46a],
      ['box', [0.7, 0.1, 0.7], [0, 0.79, 0], 0xf4a261],
      ['box', [0.78, 0.72, 0.11], [0, 1.14, -0.34], 0xe9c46a],
      ['sphere', [0.07], [0.28, 1.5, -0.34], 0xf4a261],
      ['sphere', [0.07], [-0.28, 1.5, -0.34], 0xf4a261]
    ]
  },
  teddy: {
    label: 'くまさん', height: 1.34, radius: 0.62,
    parts: [
      ['sphere', [0.42], [0, 0.44, 0], 0xb5838d, null, [1, 1.05, 0.9]],
      ['sphere', [0.26], [0, 0.5, 0.3], 0xffcdb2, null, [1, 1.1, 0.55]],
      ['sphere', [0.3], [0, 1.02, 0], 0xb5838d],
      ['sphere', [0.12], [0.24, 1.26, 0], 0xb5838d],
      ['sphere', [0.12], [-0.24, 1.26, 0], 0xb5838d],
      ['sphere', [0.065], [0.24, 1.26, 0.06], 0xffcdb2],
      ['sphere', [-0.065 + 0.13], [-0.24, 1.26, 0.06], 0xffcdb2],
      ['sphere', [0.13], [0, 0.96, 0.26], 0xffcdb2, null, [1, 0.8, 0.7]],
      ['sphere', [0.05], [0, 1.02, 0.36], 0x3d2b24],
      ['sphere', [0.045], [0.11, 1.1, 0.27], 0x3d2b24],
      ['sphere', [0.045], [-0.11, 1.1, 0.27], 0x3d2b24],
      ['sphere', [0.14], [0.4, 0.62, 0.1], 0xb5838d, null, [1, 1.5, 1]],
      ['sphere', [0.14], [-0.4, 0.62, 0.1], 0xb5838d, null, [1, 1.5, 1]],
      ['sphere', [0.17], [0.22, 0.14, 0.16], 0xb5838d, null, [1.2, 0.8, 1.4]],
      ['sphere', [0.17], [-0.22, 0.14, 0.16], 0xb5838d, null, [1.2, 0.8, 1.4]]
    ]
  },
  bicycle: {
    label: 'じてんしゃ', height: 1.72, radius: 1.15,
    parts: [
      ['torus', [0.52, 0.1], [0.78, 0.52, 0], 0x577590, [0, Math.PI / 2, 0]],
      ['torus', [0.52, 0.1], [-0.78, 0.52, 0], 0x577590, [0, Math.PI / 2, 0]],
      ['sphere', [0.13], [0.78, 0.52, 0], 0xf9c74f],
      ['sphere', [0.13], [-0.78, 0.52, 0], 0xf9c74f],
      ['cyl', [0.07, 0.07, 1.28], [0, 0.62, 0], 0xf3722c, [0, 0, Math.PI / 2 - 0.18]],
      ['cyl', [0.07, 0.07, 0.9], [0.62, 1.0, 0], 0xf3722c, [0, 0, 0.28]],
      ['cyl', [0.07, 0.07, 0.85], [-0.55, 0.95, 0], 0xf3722c, [0, 0, -0.25]],
      ['cyl', [0.055, 0.055, 0.62], [0.78, 1.36, 0], 0xf8961e, [Math.PI / 2, 0, 0]],
      ['sphere', [0.09], [0.78, 1.36, 0.31], 0xf94144],
      ['sphere', [0.09], [0.78, 1.36, -0.31], 0xf94144],
      ['box', [0.4, 0.12, 0.24], [-0.62, 1.42, 0], 0x90323d],
      ['sphere', [0.16], [0.15, 0.52, 0], 0xf9c74f],
      ['box', [0.26, 0.05, 0.1], [0.15, 0.52, 0.22], 0xf8961e],
      ['box', [0.26, 0.05, 0.1], [0.15, 0.52, -0.22], 0xf8961e],
      ['sphere', [0.14], [0.78, 1.62, 0], 0xf94144],
      ['cone', [0.1, 0.18], [0.78, 1.5, 0], 0xf94144]
    ]
  },
  elephant: {
    label: 'ぞうさん', height: 2.05, radius: 1.2,
    parts: [
      ['sphere', [0.85], [0, 1.0, -0.1], 0x98b8d9, null, [1.15, 1, 1.3]],
      ['sphere', [0.55], [0, 1.5, 0.85], 0x98b8d9],
      ['sphere', [0.4], [0.62, 1.62, 0.72], 0xbcd4ea, null, [0.35, 1, 1]],
      ['sphere', [0.4], [-0.62, 1.62, 0.72], 0xbcd4ea, null, [0.35, 1, 1]],
      ['cyl', [0.16, 0.2, 0.6], [0, 1.15, 1.28], 0x98b8d9, [0.7, 0, 0]],
      ['cyl', [0.12, 0.16, 0.5], [0, 0.78, 1.45], 0x98b8d9, [0.25, 0, 0]],
      ['sphere', [0.14], [0, 0.55, 1.5], 0xbcd4ea],
      ['cyl', [0.2, 0.23, 0.7], [0.5, 0.35, 0.45], 0x98b8d9],
      ['cyl', [0.2, 0.23, 0.7], [-0.5, 0.35, 0.45], 0x98b8d9],
      ['cyl', [0.2, 0.23, 0.7], [0.55, 0.35, -0.65], 0x98b8d9],
      ['cyl', [0.2, 0.23, 0.7], [-0.55, 0.35, -0.65], 0x98b8d9],
      ['sphere', [0.07], [0.24, 1.68, 1.3], 0x2b2d42],
      ['sphere', [0.07], [-0.24, 1.68, 1.3], 0x2b2d42],
      ['sphere', [0.1], [0, 0.9, -1.2], 0xbcd4ea]
    ]
  },
  // 飾り（ターゲットではないが潰すと楽しい）
  tree: {
    label: 'き', height: 1.9, radius: 0.75,
    parts: [
      ['cyl', [0.14, 0.18, 0.7], [0, 0.35, 0], 0xa5673f],
      ['sphere', [0.6], [0, 1.1, 0], 0x74c69d],
      ['sphere', [0.42], [0.35, 1.5, 0.1], 0x95d5b2],
      ['sphere', [0.4], [-0.35, 1.45, -0.05], 0x74c69d],
      ['sphere', [0.09], [0.3, 1.0, 0.5], 0xff6b6b],
      ['sphere', [0.09], [-0.25, 1.35, 0.45], 0xffd166]
    ]
  },
  flower: {
    label: 'おはな', height: 0.95, radius: 0.4,
    parts: [
      ['cyl', [0.04, 0.05, 0.6], [0, 0.3, 0], 0x74c69d],
      ['sphere', [0.13], [0, 0.72, 0], 0xffd166],
      ['sphere', [0.12], [0.2, 0.72, 0], 0xff8fab],
      ['sphere', [0.12], [-0.2, 0.72, 0], 0xff8fab],
      ['sphere', [0.12], [0, 0.72, 0.2], 0xff8fab],
      ['sphere', [0.12], [0, 0.72, -0.2], 0xff8fab],
      ['sphere', [0.12], [0, 0.9, 0], 0xff8fab]
    ]
  }
};

let nextId = 1;

// 物体を作る。squash 用にパーツごとの基準値を保存しておく。
export function buildThing(kind, opts = {}) {
  const def = CATALOG[kind];
  const group = new THREE.Group();
  const parts = [];
  for (const [type, size, pos, color, rot, scl] of def.parts) {
    const m = new THREE.Mesh(geom(type, size.map(v => Math.abs(v))), mat(color));
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    group.add(m);
    parts.push({
      mesh: m,
      basePos: m.position.clone(),
      baseScale: m.scale.clone()
    });
  }
  const shadow = makeBlobShadow(def.radius);
  const scale = opts.scale ?? 1;
  group.scale.setScalar(scale);

  const thing = {
    id: nextId++,
    kind,
    def,
    group,
    shadow,
    parts,
    height: def.height * scale,
    radius: def.radius * scale,
    flatHeight: Math.min(Math.max(def.height * scale * 0.055, 0.07), 0.13),
    isTarget: opts.isTarget ?? false,
    // 状態
    squash: 0,          // 0=立体 1=ぺちゃんこ
    displaySquash: 0,   // バネで追従する表示用
    squashVel: 0,
    wobble: 0,          // プルン揺れの残りエネルギー
    wobblePhase: 0,
    captured: false,
    delivered: false,
    restoring: false,
    hopT: -1,           // お届け後のよろこびホップ
    lastStep: 0,        // squish 効果音の段階
    home: new THREE.Vector3()
  };
  group.userData.thing = thing;
  return thing;
}

const easeSquash = t => t * t * (3 - 2 * t); // smoothstep — ギューッと粘る感じ

// 毎フレーム: squash 値からパーツの見た目を更新する。
export function applySquash(thing, dt) {
  // 表示値はバネで追従（復元時にオーバーシュートして「ポン」の弾みが出る）
  const stiff = thing.restoring ? 90 : 40;
  const damp = thing.restoring ? 7.5 : 11;
  const acc = (thing.squash - thing.displaySquash) * stiff - thing.squashVel * damp;
  thing.squashVel += acc * dt;
  thing.displaySquash += thing.squashVel * dt;
  if (thing.restoring && Math.abs(thing.displaySquash) < 0.02 && Math.abs(thing.squashVel) < 0.05) {
    thing.displaySquash = 0;
    thing.squashVel = 0;
    thing.restoring = false;
  }

  const s = easeSquash(Math.min(Math.max(thing.displaySquash, -0.25), 1.08) * 0.5 + 0.5) * 2 - 1;
  // ↑ displaySquash はオーバーシュートで負にもなる（縦に伸びる）

  const H = thing.def.height;
  const flatRatio = thing.flatHeight / thing.height;
  const h = 1 + (flatRatio - 1) * Math.max(s, 0) - Math.min(s, 0) * 0.35; // s<0 なら縦伸び

  // プルン揺れ
  thing.wobblePhase += dt * 26;
  const wob = thing.wobble * Math.sin(thing.wobblePhase) * 0.06;
  thing.wobble = Math.max(0, thing.wobble - dt * 2.2);

  const sq = Math.max(s, 0);
  for (const p of thing.parts) {
    const yRatio = Math.min(Math.max(p.basePos.y / H, 0), 1);
    // 下のパーツほど広がる → 角が押し広げられて丸まって見える
    // s<0（復元オーバーシュートで縦伸び）のときは横が少し細くなる = squash & stretch
    const spread = (1 + 0.34 * sq + 0.22 * sq * (1 - yRatio) + Math.min(s, 0) * 0.18) * (1 - wob * 0.5);
    const hh = h * (1 + wob);
    p.mesh.scale.set(
      p.baseScale.x * spread,
      p.baseScale.y * hh,
      p.baseScale.z * spread
    );
    p.mesh.position.set(p.basePos.x * spread, p.basePos.y * hh, p.basePos.z * spread);
  }

  // 影: ぺちゃんこになるほど本体に密着してくっきり・広く
  const spreadNow = 1 + 0.4 * sq;
  thing.shadow.scale.setScalar(thing.radius * 2.4 * spreadNow);
  thing.shadow.material.opacity = 0.55 + sq * 0.35;
  thing.shadow.position.x = thing.group.position.x;
  thing.shadow.position.z = thing.group.position.z;
}

// いま実際に占めている高さ（当たり判定用）
export function currentHeight(thing) {
  const flatRatio = thing.flatHeight / thing.height;
  const s = Math.max(Math.min(thing.displaySquash, 1), 0);
  return thing.height * (1 + (flatRatio - 1) * easeSquash(s));
}

// いま実際に占めている足元半径
export function currentRadius(thing) {
  const s = Math.max(Math.min(thing.displaySquash, 1), 0);
  return thing.radius * (1 + 0.34 * easeSquash(s));
}
