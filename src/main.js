// 床ジッパー — 4歳向けモバイルWebゲーム
// 「チャックをあけて、ものを下に落とす」
// 文字・数値UIなし / 一本指操作 / 縦横対応

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// パラメータ
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const E2E = params.has('e2e');

const ZIP = {
  zStart: 7.2,          // ジッパー始端（手前・アンカー）
  zEndFull: -10.2,      // トラック終端
  toothSpacing: 0.36,
  gapePerLen: 0.27,     // 開口長→最大開口半幅
  gapeMax: 2.95,
  influence: 4.8,       // 布が押しのけられる影響半径
  lensPow: 0.85,
};

const ROOM = {
  xHalf: 8.6,
  zNear: 9.7,
  zFar: -12.1,
  depth: 7.6,           // 床下空間の深さ
};

const CUSHION_TOP = -6.0;
const GRAVITY = 16;

// ステージごとの最大開口長
const STAGE_MAX_OPEN = [6.5, 11.5, 17.4];

// ---------------------------------------------------------------------------
// 乱数（E2E時はシード固定）
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = E2E ? mulberry32(12345) : Math.random;
const rr = (a, b) => a + (b - a) * rng();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------
// サウンド（全て合成・iOSは初回タッチで解禁）
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  master: null,
  noiseBuf: null,
  lastTick: 0,
  lastCreak: 0,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { /* no audio */ }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  _noise(dur, freq, q, gain, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  _tone(type, f0, f1, dur, gain, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },

  // ジジジ…（開閉のラチェット1コマ）
  zipTick(closing, speed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick < 0.024) return;
    this.lastTick = now;
    const f = closing ? 1500 : 2300;
    this._noise(0.035, f + Math.random() * 500, 2.5, clamp(0.10 + speed * 0.012, 0.1, 0.3));
    this._tone('square', closing ? 320 : 420, closing ? 260 : 330, 0.02, 0.03);
  },

  creak(strength) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCreak < 0.24) return;
    this.lastCreak = now;
    this._tone('sawtooth', 110 + Math.random() * 50, 70, 0.16, 0.05 * strength);
    this._noise(0.1, 500, 6, 0.03 * strength);
  },

  wedge() { // 引っ掛かり「むぎゅ」
    this._tone('sine', 300, 170, 0.14, 0.07);
  },

  boing() { // 復帰・登場
    this._tone('sine', 420, 200, 0.18, 0.09);
    this._tone('sine', 630, 300, 0.18, 0.04);
  },

  whoosh() {
    this._noise(0.35, 700, 0.8, 0.10);
  },

  thump(big) { // ガタン→ポフッ
    this._tone('sine', big ? 85 : 120, 40, 0.28, big ? 0.32 : 0.22);
    this._noise(0.16, 240, 1.2, big ? 0.20 : 0.13);
  },

  pof() {
    this._noise(0.22, 320, 0.9, 0.15);
  },

  squeak() {
    this._tone('sine', 620, 900, 0.05, 0.06);
    this._tone('sine', 900, 620, 0.06, 0.05, 0.05);
  },

  chime() {
    const notes = [523, 659, 784, 880, 1046];
    notes.forEach((f, i) => this._tone('triangle', f, f, 0.5, 0.10, i * 0.11));
  },

  ding() {
    this._tone('triangle', 880, 880, 0.35, 0.06);
  },

  pop() {
    this._tone('sine', 500, 900, 0.07, 0.08);
  },
};

// ---------------------------------------------------------------------------
// レンダラ・シーン・カメラ
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: !E2E, powerPreference: 'high-performance' });
renderer.setPixelRatio(E2E ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
if (!E2E) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// やわらかい背景グラデーション
{
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffe9c9');
  grad.addColorStop(0.5, '#fbdcc0');
  grad.addColorStop(1, '#f2c7ae');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
const camBase = { pos: new THREE.Vector3(0, 15.5, 13.8), target: new THREE.Vector3(0, -1.2, -1.6), fov: 52 };
const camPeek = { active: false, t: 0, dur: 0, z: 0 };
let lastPeekAt = -99;

function layoutCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  camera.aspect = aspect;
  // 縦画面(≈0.46)〜横画面(≈2.1)で連続補間
  // 取っ手（z≈8.9）が画面下端に必ず入るよう俯角を調整してある
  const t = clamp((aspect - 0.45) / (1.9 - 0.45), 0, 1);
  camBase.fov = lerp(58, 47, t);
  camBase.pos.set(0, lerp(11.8, 10.8, t), lerp(12.8, 11.8, t));
  camBase.target.set(0, lerp(-0.6, -1.2, t), lerp(0.5, 3.2, t));
  camera.fov = camBase.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', layoutCamera);
if (window.visualViewport) window.visualViewport.addEventListener('resize', layoutCamera);
layoutCamera();

// ライト
scene.add(new THREE.HemisphereLight(0xfff4e0, 0xcf9e7e, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(7, 14, 8);
if (!E2E) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -14;
  sc.near = 2; sc.far = 40;
  sun.shadow.bias = -0.0004;
}
scene.add(sun);
// 床下のあかり（こわくない空間に）
const cellarLight = new THREE.PointLight(0xffd9a8, 40, 20, 1.6);
cellarLight.position.set(0, -3.4, -1);
scene.add(cellarLight);

// ---------------------------------------------------------------------------
// テクスチャ（Canvas生成）
// ---------------------------------------------------------------------------

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// キルト床＋ジッパーテープ帯（mirror=trueで左パネル用）
function makeFloorTexture() {
  const t = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#f6e3c8';
    g.fillRect(0, 0, w, h);
    // キルトのステッチ格子
    g.strokeStyle = 'rgba(197,160,120,0.4)';
    g.lineWidth = 2;
    g.setLineDash([9, 7]);
    const step = 60;
    for (let x = -h; x < w + h; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke();
      g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke();
    }
    g.setLineDash([]);
    // ぽつぽつ模様
    g.fillStyle = 'rgba(233,169,140,0.45)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % w, y = (i * 89.3) % h;
      g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
    }
    // ジッパーテープ帯（縫い付け感・seam側 = u0）
    const tapeW = 36;
    g.fillStyle = '#e2899d';
    g.fillRect(0, 0, tapeW, h);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, 6, h);
    // テープのステッチ2本
    g.strokeStyle = '#fff3ea';
    g.lineWidth = 3;
    g.setLineDash([11, 8]);
    for (const sx of [tapeW - 8, 10]) {
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, h); g.stroke();
    }
    g.setLineDash([]);
  });
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3); // z方向にのみ繰り返し（テープは seam 側に固定）
  return t;
}

const cushionTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#bfe8cf';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      g.beginPath();
      g.arc(x * 64 + (y % 2 ? 32 : 0) + 16, y * 64 + 16, 9, 0, Math.PI * 2);
      g.fill();
    }
});
cushionTex.wrapS = cushionTex.wrapT = THREE.RepeatWrapping;
cushionTex.repeat.set(3, 8);

function makeSoftCircleTexture(color) {
  return makeCanvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}
const puffTex = makeSoftCircleTexture('rgba(255,250,240,0.95)');
const sparkTex = makeSoftCircleTexture('rgba(255,236,150,1)');
const hintTex = makeSoftCircleTexture('rgba(255,255,255,0.95)');

// ---------------------------------------------------------------------------
// 床（変形パネル×2）
// ---------------------------------------------------------------------------

const FLOOR_W = 10.6;                   // 各パネル幅（画面端まで床が届くよう広め）
const FLOOR_L = ROOM.zNear - ROOM.zFar; // 21.8
const SEG_X = 14, SEG_Z = 120;

function buildFloorPanel(side) { // side: +1 右, -1 左
  const geo = new THREE.PlaneGeometry(FLOOR_W, FLOOR_L, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  // 中心を seam に：x∈[0, FLOOR_W]（距離d）、z∈[zFar, zNear]
  geo.translate(FLOOR_W / 2, 0, (ROOM.zNear + ROOM.zFar) / 2);
  if (side < 0) {
    // 左パネルは毎フレーム x を符号反転して書き込む（＝鏡映になる）ので、
    // 面の巻き順もあらかじめ反転して表面が上を向くようにしておく
    const idx = geo.getIndex().array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t;
    }
  }
  const pos = geo.attributes.position;
  const base = new Float32Array(pos.array); // d, y, z
  const mat = new THREE.MeshStandardMaterial({
    map: makeFloorTexture(),
    roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);
  return { mesh, geo, pos, base, side };
}
const floorPanels = [buildFloorPanel(1), buildFloorPanel(-1)];

// 現在の開口
const zipper = {
  sliderZ: ZIP.zStart,   // スライダー位置（開くほど小さく）
  maxOpen: STAGE_MAX_OPEN[0],
  wasOpen: true,         // 初回に必ず全頂点を書き込む
  activity: 0,           // 動かしている勢い（波打ち用）
};

function openLen() { return ZIP.zStart - zipper.sliderZ; }

function holeHalfAt(z, sliderZ = zipper.sliderZ) {
  const len = ZIP.zStart - sliderZ;
  if (len <= 0.02) return 0;
  if (z <= sliderZ || z >= ZIP.zStart) return 0;
  const u = (ZIP.zStart - z) / len;
  const gape = Math.min(ZIP.gapeMax, len * ZIP.gapePerLen);
  return gape * Math.pow(Math.sin(Math.PI * u), ZIP.lensPow);
}

let simTime = 0;

function deformFloor() {
  const opened = openLen() > 0.02;
  if (!opened && !zipper.wasOpen) return;
  const R = ZIP.influence;
  for (const p of floorPanels) {
    const arr = p.pos.array, base = p.base, side = p.side;
    const cols = SEG_X + 1, rows = SEG_Z + 1;
    for (let r = 0; r < rows; r++) {
      const i0 = r * cols * 3;
      const z = base[i0 + 2];
      const h = holeHalfAt(z);
      if (h <= 0.0001) {
        // 閉状態へ戻す
        for (let c = 0; c < cols; c++) {
          const i = i0 + c * 3;
          arr[i] = side * base[i];
          arr[i + 1] = base[i + 1];
          arr[i + 2] = base[i + 2];
        }
        continue;
      }
      const wave = Math.sin(z * 2.6 + simTime * 9) * 0.03 * zipper.activity;
      for (let c = 0; c < cols; c++) {
        const i = i0 + c * 3;
        const d = base[i]; // 0..FLOOR_W（seamからの距離）
        const t = clamp(d / R, 0, 1);
        const fall = 1 - t * t * (3 - 2 * t);
        const s = h * fall;
        const bulge = 0.42 * s * (1 - s / h);
        const roll = 0.2 * Math.min(1, h * 1.6) * Math.exp(-(d * d) / 0.5);
        arr[i] = side * (d + s);
        arr[i + 1] = bulge - roll + (d < R ? wave * fall : 0);
        arr[i + 2] = z;
      }
    }
    p.pos.needsUpdate = true;
    p.geo.computeVertexNormals();
  }
  zipper.wasOpen = opened;
}

// ---------------------------------------------------------------------------
// 床下空間（こわくない秘密の地下）
// ---------------------------------------------------------------------------

const cellarStars = [];
{
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 1 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd9a276, roughness: 1 });
  const mk = (w, h, px, py, pz, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(px, py, pz); m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  const D = ROOM.depth;
  const yMid = -D / 2;
  mk(ROOM.xHalf * 2 + 1, D, 0, yMid, ROOM.zFar, 0);                 // 奥
  mk(FLOOR_L + 1, D, -ROOM.xHalf, yMid, (ROOM.zNear + ROOM.zFar) / 2, Math.PI / 2);  // 左
  mk(FLOOR_L + 1, D, ROOM.xHalf, yMid, (ROOM.zNear + ROOM.zFar) / 2, -Math.PI / 2);  // 右
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.xHalf * 2 + 1, FLOOR_L + 1), floorMat);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(0, -D, (ROOM.zNear + ROOM.zFar) / 2);
  scene.add(fl);

  // 奥の壁（床の切れ目を隠し、部屋らしさを出す）
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 10),
    new THREE.MeshStandardMaterial({ color: 0xf6cfa9, roughness: 1 })
  );
  backWall.position.set(0, 5, ROOM.zFar - 0.05);
  scene.add(backWall);

  // ふかふかクッション（着地点）
  const cush = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 1.6, FLOOR_L - 1.2),
    new THREE.MeshStandardMaterial({ map: cushionTex, roughness: 1 })
  );
  cush.position.set(0, CUSHION_TOP - 0.8, (ROOM.zNear + ROOM.zFar) / 2);
  scene.add(cush);
  // クッションのふち（パイピング）
  const pipe = new THREE.Mesh(
    new THREE.BoxGeometry(8.0, 0.35, FLOOR_L - 1.0),
    new THREE.MeshStandardMaterial({ color: 0x8fd8b2, roughness: 1 })
  );
  pipe.position.set(0, CUSHION_TOP - 0.05, (ROOM.zNear + ROOM.zFar) / 2);
  scene.add(pipe);

  // ただよう星（あたたかい空間の演出）
  const starMat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(starMat);
    s.position.set(rr(-5, 5), rr(-5.4, -1.4), rr(-9, 7));
    s.scale.setScalar(rr(0.25, 0.5));
    s.userData.bob = rr(0, Math.PI * 2);
    s.userData.baseY = s.position.y;
    scene.add(s);
    cellarStars.push(s);
  }
}

// ---------------------------------------------------------------------------
// ジッパーの歯・スライダー・ストッパー
// ---------------------------------------------------------------------------

const TEETH_PER_SIDE = Math.floor((ZIP.zStart - ZIP.zEndFull) / ZIP.toothSpacing);
const toothGeo = new THREE.BoxGeometry(0.34, 0.17, 0.24);
const toothMat = new THREE.MeshStandardMaterial({ color: 0xe3b23e, metalness: 0.5, roughness: 0.4 });
const teethMesh = new THREE.InstancedMesh(toothGeo, toothMat, TEETH_PER_SIDE * 2);
teethMesh.castShadow = !E2E;
scene.add(teethMesh);
const toothDummy = new THREE.Object3D();

function updateTeeth() {
  let idx = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < TEETH_PER_SIDE; i++) {
      const z = ZIP.zStart - (i + (side > 0 ? 0.25 : 0.75)) * ZIP.toothSpacing;
      const h = holeHalfAt(z);
      const nearSlider = Math.abs(z - zipper.sliderZ) < 0.75;
      toothDummy.position.set(
        side * (h > 0.001 ? h + 0.08 : 0.115),
        (h > 0.001 ? -0.14 * Math.min(1, h * 1.6) : 0) + 0.10,
        z
      );
      toothDummy.rotation.set(0, 0, h > 0.001 ? -side * Math.min(1.0, 0.35 + h * 0.35) : 0);
      const s = nearSlider ? 0.001 : 1; // スライダー胴体の下は隠す
      toothDummy.scale.setScalar(s);
      toothDummy.updateMatrix();
      teethMesh.setMatrixAt(idx++, toothDummy.matrix);
    }
  }
  teethMesh.instanceMatrix.needsUpdate = true;
}

// スライダー（大きな取っ手つき）
const slider = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0xc3d0e0, metalness: 0.3, roughness: 0.45 });
  const metal2 = new THREE.MeshStandardMaterial({ color: 0x93a7be, metalness: 0.3, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), metal);
  body.position.y = 0.32;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.44, 0.7), metal2);
  nose.position.set(0, 0.32, -1.15);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), metal2);
  post.position.set(0, 0.7, 0.4);
  // リング取っ手（子どもがつかむところ・床に寝かせて対象を隠さない）
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.2, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0xf25c6e, metalness: 0.35, roughness: 0.45 })
  );
  ring.rotation.x = -Math.PI / 2.1;
  ring.position.set(0, 0.3, 1.4);
  const link = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.8), metal2);
  link.position.set(0, 0.45, 0.75);
  slider.add(body, nose, post, ring, link);
  slider.traverse((o) => { if (o.isMesh) o.castShadow = !E2E; });
  slider.userData.ring = ring;
  scene.add(slider);
}

// 取っ手ハイライト（何を触ればよいかのヒント）
const hintRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.1, 0.08, 8, 40),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
);
hintRing.rotation.x = -Math.PI / 2;
scene.add(hintRing);

// 進行方向を示す光の粒（線に沿って流れる）
const hintDots = [];
{
  const m = new THREE.SpriteMaterial({ map: hintTex, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(m.clone());
    s.scale.setScalar(0.5);
    scene.add(s);
    hintDots.push(s);
  }
}

// ストッパー（ここまで開けられる、の赤いボタン）
const stopper = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8493f, roughness: 0.5 });
  // seam をまたぐ赤いアーチ（デフォルトの XY 平面の上半分をそのまま使う）
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.28, 12, 20, Math.PI), mat);
  arch.position.y = 0.1;
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), mat);
  footL.position.set(-0.72, 0.15, 0);
  const footR = footL.clone();
  footR.position.x = 0.72;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.5 }));
  knob.position.y = 1.05;
  stopper.add(arch, footL, footR, knob);
  stopper.traverse((o) => { if (o.isMesh) o.castShadow = !E2E; });
  scene.add(stopper);
}
const stopperAnim = { t: 1, fromZ: 0, toZ: 0 };

function stopperTargetZ() { return ZIP.zStart - zipper.maxOpen - 0.75; }
stopper.position.set(0, 0, stopperTargetZ());
stopperAnim.fromZ = stopperAnim.toZ = stopperTargetZ();

// ---------------------------------------------------------------------------
// パーティクル（ポフッ・キラキラ）
// ---------------------------------------------------------------------------

const particles = [];

function spawnPuff(x, y, z, n = 8, scale = 1) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.85, depthWrite: false }));
    s.position.set(x + rr(-0.7, 0.7) * scale, y + rr(0, 0.4), z + rr(-0.7, 0.7) * scale);
    s.scale.setScalar(rr(0.5, 0.9) * scale);
    s.userData = {
      vel: new THREE.Vector3(rr(-1, 1), rr(0.6, 1.6), rr(-1, 1)),
      life: 0, maxLife: rr(0.4, 0.7), grow: rr(1.8, 2.8) * scale, puff: true,
    };
    scene.add(s);
    particles.push(s);
  }
}

function spawnSparkles(x, y, z, n = 14, spread = 1.6) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 1, depthWrite: false }));
    s.position.set(x + rr(-spread, spread), y + rr(0, 0.5), z + rr(-spread, spread));
    s.scale.setScalar(rr(0.2, 0.45));
    s.userData = {
      vel: new THREE.Vector3(rr(-1.6, 1.6), rr(1.5, 4), rr(-1.6, 1.6)),
      life: 0, maxLife: rr(0.5, 0.9), grow: 0, puff: false,
    };
    scene.add(s);
    particles.push(s);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const s = particles[i];
    const u = s.userData;
    u.life += dt;
    if (u.life >= u.maxLife) {
      scene.remove(s);
      s.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    const k = u.life / u.maxLife;
    s.position.addScaledVector(u.vel, dt);
    if (!u.puff) u.vel.y -= 6 * dt;
    if (u.grow) s.scale.setScalar(s.scale.x + u.grow * dt);
    s.material.opacity = (u.puff ? 0.85 : 1) * (1 - k);
  }
}

// ---------------------------------------------------------------------------
// 落とすもの（小物→中物→大物）
// ---------------------------------------------------------------------------

const propMats = {
  red: new THREE.MeshStandardMaterial({ color: 0xef6a5a, roughness: 0.85 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x5aa9e6, roughness: 0.85 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.85 }),
  green: new THREE.MeshStandardMaterial({ color: 0x7ec87e, roughness: 0.85 }),
  purple: new THREE.MeshStandardMaterial({ color: 0xb48ce0, roughness: 0.85 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xc99560, roughness: 0.9 }),
  wood2: new THREE.MeshStandardMaterial({ color: 0xa87748, roughness: 0.9 }),
  terra: new THREE.MeshStandardMaterial({ color: 0xd47f52, roughness: 0.9 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x5fae5f, roughness: 0.9 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xfff1dc, roughness: 0.9 }),
};
const colorPool = ['red', 'blue', 'yellow', 'green', 'purple'];
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// 各ビルダーは { g, footL(z方向), footW(x方向), height } を返す
const PROP_BUILDERS = {
  ball() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), propMats[pick(colorPool)]);
    m.position.y = 0.46;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 8, 24), propMats.cream);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.46;
    g.add(m, band);
    return { g, footL: 0.92, footW: 0.92, height: 0.92 };
  },
  block() {
    const g = new THREE.Group();
    const c = pick(colorPool);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), propMats[c]);
    m.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 12), propMats.cream);
    top.position.y = 1.05;
    g.add(m, top);
    return { g, footL: 1.0, footW: 1.0, height: 1.1 };
  },
  pot() {
    const g = new THREE.Group();
    const potm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.62, 14), propMats.terra);
    potm.position.y = 0.31;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.58, 0.14, 14), propMats.terra);
    rim.position.y = 0.62;
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), propMats.leaf);
    b1.position.set(0, 1.0, 0);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), propMats.leaf);
    b2.position.set(0.24, 1.22, 0.1);
    const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), propMats.leaf);
    b3.position.set(-0.22, 1.18, -0.08);
    g.add(potm, rim, b1, b2, b3);
    return { g, footL: 1.2, footW: 1.2, height: 1.45 };
  },
  stool() {
    const g = new THREE.Group();
    const c = pick(colorPool);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.2, 16), propMats[c]);
    seat.position.y = 0.95;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.95, 8), propMats.wood);
      leg.position.set(Math.cos(a) * 0.5, 0.47, Math.sin(a) * 0.5);
      leg.rotation.z = -Math.cos(a) * 0.14;
      leg.rotation.x = Math.sin(a) * 0.14;
      g.add(leg);
    }
    g.add(seat);
    return { g, footL: 1.5, footW: 1.5, height: 1.1 };
  },
  chair() {
    const g = new THREE.Group();
    const c = pick(colorPool);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.16, 1.2), propMats[c]);
    seat.position.y = 0.85;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.05, 0.14), propMats[c]);
    back.position.set(0, 1.45, -0.55);
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8), propMats.wood);
      leg.position.set(sx, 0.42, sz);
      g.add(leg);
    }
    g.add(seat, back);
    return { g, footL: 1.45, footW: 1.4, height: 2.0 };
  },
  table() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 2.5), propMats.wood);
    top.position.y = 1.28;
    for (const sx of [-0.85, 0.85]) for (const sz of [-1.05, 1.05]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.25, 8), propMats.wood2);
      leg.position.set(sx, 0.62, sz);
      g.add(leg);
    }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.24, 10), propMats[pick(colorPool)]);
    cup.position.set(0.4, 1.5, 0.3);
    g.add(top, cup);
    return { g, footL: 2.6, footW: 2.15, height: 1.6 };
  },
  slide() {
    const g = new THREE.Group();
    const c1 = pick(colorPool), c2 = pick(colorPool);
    // はしご側
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.18), propMats[c1]);
    ladder.position.set(0, 0.85, 1.3);
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.3), propMats.cream);
      step.position.set(0, 0.4 + i * 0.5, 1.42);
      g.add(step);
    }
    // てっぺん
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.8), propMats[c2]);
    deck.position.set(0, 1.75, 0.75);
    // すべり面
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 2.6), propMats[c2]);
    ramp.position.set(0, 0.95, -0.55);
    ramp.rotation.x = 0.6;
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 2.6), propMats[c1]);
    rimL.position.set(-0.5, 1.06, -0.55);
    rimL.rotation.x = 0.6;
    const rimR = rimL.clone();
    rimR.position.x = 0.5;
    // 支柱
    for (const sz of [0.4, 1.15]) for (const sx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8), propMats.cream);
      leg.position.set(sx, 0.85, sz);
      g.add(leg);
    }
    g.add(ladder, deck, ramp, rimL, rimR);
    return { g, footL: 3.3, footW: 1.55, height: 2.1 };
  },
  house() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.5, 3.6), propMats.cream);
    body.position.y = 1.25;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.7, 4), propMats.red);
    roof.position.y = 3.3;
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.12), propMats.blue);
    door.position.set(0, 0.75, 1.82);
    const win1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), propMats.yellow);
    win1.position.set(-1.2, 1.5, 1.82);
    const win2 = win1.clone();
    win2.position.x = 1.2;
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), propMats.terra);
    chim.position.set(1.1, 3.4, -0.9);
    g.add(body, roof, door, win1, win2, chim);
    return { g, footL: 4.4, footW: 4.0, height: 4.2 };
  },
};

// グラグラ→ガタン のチューニング
const FALL_FRAC = 0.8;      // 全長のこの割合が飲み込まれたら落下へ
const WOBBLE_MIN_TIME = 0.45; // すぐには落ちない（踏ん張り最短時間）
const CRIT_HOLD = 0.5;      // 限界でこらえる時間
const CRIT_LURCH = 0.14;    // 落ちる直前の「ため」

const props = [];

class Prop {
  constructor(type, zc) {
    const built = PROP_BUILDERS[type]();
    this.type = type;
    this.root = new THREE.Group();       // 位置
    this.tiltNode = new THREE.Group();   // 傾き（footprint端を軸に）
    this.body = built.g;                 // 形
    this.tiltNode.add(this.body);
    this.root.add(this.tiltNode);
    this.root.position.set(rr(-0.12, 0.12), 0, zc);
    scene.add(this.root);
    this.footL = built.footL;
    this.footW = built.footW;
    this.height = built.height;
    this.zc = zc;
    this.state = 'rest'; // rest wobble critical fall landed gone
    this.hopVy = 0;      // スライダー接近時のぴょん
    this.hopY = 0;
    this.hopCool = 0;
    this.tilt = 0; this.tiltVel = 0;
    this.dir = 1;
    this.wobbleTime = 0;
    this.critTime = 0;
    this.vy = 0;
    this.spin = 0;
    this.sink = 0;
    this.landBounces = 0;
    this.wedgeCue = 0;
    this.spawning = false;
    this.spawnT = 0;
    this.settleT = 0;
    this.squashT = 0;
    this.jiggleT = 0;
    this.body.traverse((o) => { if (o.isMesh) { o.castShadow = !E2E; } });
  }

  // 開口をサンプリングして支持状態を調べる
  sampleHole() {
    const N = 15;
    const zLo = this.zc - this.footL / 2, zHi = this.zc + this.footL / 2;
    const needFull = this.footW * 0.92;
    const needHalf = needFull * 0.5;
    let bestFull = 0, bestHalf = 0, curFull = 0, curHalf = 0;
    let fullAtLo = false, fullAtHi = false;
    let maxW = 0;
    for (let i = 0; i < N; i++) {
      const z = zLo + ((zHi - zLo) * i) / (N - 1);
      const w = 2 * holeHalfAt(z);
      maxW = Math.max(maxW, w);
      if (w >= needFull) { curFull++; if (i === 0) fullAtLo = true; if (i === N - 1) fullAtHi = true; }
      else curFull = 0;
      if (w >= needHalf) curHalf++; else curHalf = 0;
      bestFull = Math.max(bestFull, curFull);
      bestHalf = Math.max(bestHalf, curHalf);
    }
    return {
      fullFrac: bestFull / N,
      halfFrac: bestHalf / N,
      fullAtLo, fullAtHi,
      maxW,
      widthOK: maxW >= needFull,
    };
  }

  update(dt) {
    if (this.spawning) { this.updateSpawn(dt); return; }
    switch (this.state) {
      case 'rest': case 'wobble': case 'critical': this.updateStanding(dt); break;
      case 'fall': this.updateFall(dt); break;
      case 'landed': this.updateLanded(dt); break;
    }
    // タップでぷるん
    if (this.jiggleT > 0) {
      this.jiggleT -= dt;
      const k = Math.max(0, this.jiggleT) / 0.35;
      const s = 1 + Math.sin(k * Math.PI * 3) * 0.06 * k;
      this.body.scale.set(1 / s, s, 1 / s);
      if (this.jiggleT <= 0) this.body.scale.set(1, 1, 1);
    }
  }

  updateStanding(dt) {
    // スライダーが下を通るときは、ぴょんと跳ねてよける
    this.hopCool -= dt;
    const overlap =
      Math.abs(zipper.sliderZ - this.zc) < this.footL / 2 + 1.5 &&
      Math.abs(this.root.position.x) < 1.6;
    if (overlap && this.hopY <= 0 && this.hopCool <= 0 && zipper.activity > 0.05) {
      this.hopVy = 5.5;
      this.hopCool = 0.55;
      this.sink = 0;
      Sound.pop();
    }
    if (this.hopY > 0 || this.hopVy > 0) {
      this.hopVy -= GRAVITY * 1.4 * dt;
      this.hopY = Math.max(0, this.hopY + this.hopVy * dt);
      if (this.hopY === 0 && this.hopVy < 0) {
        this.hopVy = 0;
        this.squash(0.85);
      }
    }
    this.root.position.y = this.hopY;

    const s = this.sampleHole();
    const stuck = s.halfFrac >= 0.55 && !s.widthOK; // 長さはあるのに幅が足りない＝引っ掛かり

    // 状態遷移
    if (this.state === 'rest') {
      if (s.halfFrac > 0.12) { this.state = 'wobble'; this.wobbleTime = 0; }
    }
    if (this.state === 'wobble') {
      this.wobbleTime += dt;
      if (s.halfFrac <= 0.06) {
        // 閉じた→立ち直る
        if (Math.abs(this.tilt) > 0.12) Sound.boing();
        this.state = 'rest';
      } else if (s.fullFrac >= FALL_FRAC && s.widthOK && this.wobbleTime > WOBBLE_MIN_TIME) {
        this.state = 'critical';
        this.critTime = 0;
        Sound.creak(1);
      }
    }
    if (this.state === 'critical') {
      const sNow = s;
      if (sNow.fullFrac < FALL_FRAC * 0.8 || !sNow.widthOK) {
        this.state = 'wobble'; // 間一髪セーフ！
      } else {
        this.critTime += dt;
        if (this.critTime >= CRIT_HOLD + CRIT_LURCH) {
          this.startFall(sNow);
          return;
        }
      }
    }

    // 傾き方向：先に飲み込まれた側へ
    if (s.fullAtHi && !s.fullAtLo) this.dir = 1;
    else if (s.fullAtLo && !s.fullAtHi) this.dir = -1;

    // 目標の傾き
    let target = 0;
    let tremble = 0;
    if (this.state === 'wobble') {
      target = this.dir * (0.06 + 0.30 * s.fullFrac + 0.10 * s.halfFrac);
      tremble = 0.25 + s.fullFrac * 0.8;
      if (s.fullFrac > 0.45 && rng() < dt * 2.2) Sound.creak(0.6 + s.fullFrac * 0.5);
    } else if (this.state === 'critical') {
      const inLurch = this.critTime > CRIT_HOLD;
      target = this.dir * (inLurch ? 0.30 : 0.44);
      tremble = inLurch ? 0.4 : 1.6;
      if (rng() < dt * 5) Sound.creak(1);
    }

    // 引っ掛かり表現：少し沈んでつっかえる
    const sinkTarget = stuck ? Math.min(0.16 * this.height, 0.26) : 0;
    this.sink = lerp(this.sink, sinkTarget, Math.min(1, dt * 6));
    if (stuck) {
      target = this.dir * Math.max(Math.abs(target), 0.14);
      this.wedgeCue -= dt;
      if (this.wedgeCue <= 0 && zipper.activity > 0.2) {
        Sound.wedge();
        this.wedgeCue = 0.8;
      }
    }

    // バネで追従＋震え
    const K = 26, D = 5.5;
    this.tiltVel += (target - this.tilt) * K * dt - this.tiltVel * D * dt;
    this.tilt += this.tiltVel * dt;
    const tr = tremble * 0.02 * Math.sin(simTime * 43 + this.zc * 7);
    this.applyStandPose(this.tilt + tr, Math.sin(simTime * 31 + this.zc * 3) * tremble * 0.012);
  }

  // footprint の端を軸にして傾ける
  applyStandPose(tilt, roll) {
    const pivotZ = -this.dir * this.footL * 0.5; // 残って支えている側の端
    this.tiltNode.position.set(0, 0, pivotZ);
    this.body.position.set(0, -this.sink, -pivotZ);
    this.tiltNode.rotation.x = tilt;
    this.tiltNode.rotation.z = roll;
  }

  startFall(s) {
    this.state = 'fall';
    this.vy = -0.6;
    this.spin = this.dir * rr(1.4, 2.2);
    if (this.dir === 0 || (s.fullAtLo && s.fullAtHi)) { this.dir = 0; this.spin = rr(-0.7, 0.7); }
    Sound.whoosh();
    requestPeek(this.zc);
    onPropStartFall(this);
  }

  updateFall(dt) {
    this.vy -= GRAVITY * dt;
    this.root.position.y += this.vy * dt;
    this.tiltNode.rotation.x += this.spin * dt;
    this.spin *= 1 - dt * 1.1;
    // 穴の中心に吸い寄せ
    this.root.position.x = lerp(this.root.position.x, 0, dt * 2);
    const restY = CUSHION_TOP + this.height * 0.4 - this.height * 0.4 * Math.min(1, Math.abs(this.tiltNode.rotation.x));
    const bottomY = CUSHION_TOP + Math.max(0.25, this.height * 0.35);
    if (this.root.position.y <= bottomY - this.height * 0.0 && this.vy < 0) {
      if (this.root.position.y <= bottomY) {
        this.root.position.y = bottomY;
        if (this.landBounces === 0) {
          Sound.thump(this.footL > 2);
          Sound.pof();
          spawnPuff(this.root.position.x, CUSHION_TOP + 0.3, this.root.position.z, 9, 0.8 + this.footL * 0.25);
          this.squash(0.72);
        } else {
          this.squash(0.88);
        }
        this.landBounces++;
        this.vy = -this.vy * 0.3;
        this.spin *= 0.4;
        if (this.vy < 1.2 || this.landBounces >= 3) {
          this.vy = 0;
          this.state = 'landed';
          this.settleT = 0;
          onPropLanded(this);
        }
      }
    }
  }

  squash(k) {
    this.body.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    this.squashT = 0.001;
  }

  updateLanded(dt) {
    // 着地後：やわらかく整う
    this.settleT += dt;
    this.tiltNode.rotation.x = lerp(this.tiltNode.rotation.x, clamp(this.tiltNode.rotation.x, -1.2, 1.2), dt * 3);
    this.tiltNode.rotation.z *= 1 - dt * 3;
  }

  updateCommon(dt) {
    if (this.squashT) {
      this.squashT += dt;
      const k = Math.min(1, this.squashT / 0.22);
      const sy = lerp(this.body.scale.y, 1, smoothstep(k));
      this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (k >= 1) { this.squashT = 0; this.body.scale.set(1, 1, 1); }
    }
  }

  updateSpawn(dt) {
    this.spawnT += dt;
    if (this.spawnT < 0) { this.root.position.y = 8.5; return; } // 出番待ち（画面外）
    const t = clamp(this.spawnT / 0.55, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    this.root.position.y = lerp(6.5, 0, e);
    if (t >= 1) {
      this.root.position.y = 0;
      this.spawning = false;
      this.squash(0.8);
      Sound.pop();
      spawnPuff(this.root.position.x, 0.15, this.zc, 4, 0.6);
    }
  }

  jiggle() {
    if (this.state === 'rest' || this.state === 'landed') {
      this.jiggleT = 0.35;
      Sound.squeak();
    }
  }

  dispose() {
    scene.remove(this.root);
    this.body.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// ステージ進行
// ---------------------------------------------------------------------------

const STAGE_SETS = [
  [['ball', 5.2], ['block', 3.7], ['pot', 2.0]],
  [['block', 5.8], ['stool', 4.3], ['chair', 1.9], ['table', -1.6]],
  [['ball', 6.1], ['stool', 4.7], ['slide', 2.4], ['house', -2.4]],
];

const game = {
  stage: 0,
  phase: 'play', // play | clear | closing | respawn
  phaseT: 0,
  ready: false,
  fallenCount: 0,
};

function stageSet(stageIdx) {
  if (stageIdx < STAGE_SETS.length) return STAGE_SETS[stageIdx];
  // 4周目以降：ランダムな組み合わせで無限リプレイ
  const smalls = ['ball', 'block', 'pot'];
  const meds = ['stool', 'chair'];
  const bigs = ['table', 'slide'];
  return [
    [pick(smalls), 6.1],
    [pick(meds), 4.7],
    [pick(bigs), 2.4],
    ['house', -2.4],
  ];
}

function spawnStage(stageIdx) {
  zipper.maxOpen = STAGE_MAX_OPEN[Math.min(stageIdx, STAGE_MAX_OPEN.length - 1)];
  const set = stageSet(stageIdx);
  set.forEach(([type, z], i) => {
    const p = new Prop(type, z);
    p.spawning = true;
    p.spawnT = -i * 0.18; // 順番にストンと登場
    p.root.position.y = 8.5;
    props.push(p);
  });
}

function onPropStartFall(p) { /* フックポイント */ }

function onPropLanded(p) {
  game.fallenCount++;
  // 全部落ちた？
  const remaining = props.filter((q) => q.state !== 'landed' && q.state !== 'gone');
  if (remaining.length === 0 && game.phase === 'play') {
    game.phase = 'clear';
    game.phaseT = 0;
  }
}

function updateGamePhase(dt) {
  game.phaseT += dt;
  if (game.phase === 'clear') {
    if (game.phaseT > 0.7) {
      Sound.chime();
      const mid = (ZIP.zStart + zipper.sliderZ) / 2;
      spawnSparkles(0, 0.6, clamp(mid, -6, 6), 22, 2.4);
      for (const p of props) {
        spawnSparkles(p.root.position.x, p.root.position.y + 0.5, p.root.position.z, 8, 1);
      }
      game.phase = 'closing';
      game.phaseT = 0;
    }
  } else if (game.phase === 'closing') {
    // 落ちた物はキラキラと消える
    for (const p of props) {
      if (p.state === 'landed') {
        p.body.scale.multiplyScalar(1 - dt * 2.4);
        if (p.body.scale.y < 0.05) { p.state = 'gone'; p.root.visible = false; }
      }
    }
    // ジッパーを自動でスーッと閉じる
    const target = ZIP.zStart;
    const prev = zipper.sliderZ;
    zipper.sliderZ = lerp(zipper.sliderZ, target, Math.min(1, dt * 3.2));
    if (Math.abs(zipper.sliderZ - prev) > 0.01) {
      tickAccum += Math.abs(zipper.sliderZ - prev);
      if (tickAccum > ZIP.toothSpacing) { tickAccum = 0; Sound.zipTick(true, 8); }
    }
    if (target - zipper.sliderZ < 0.05 && game.phaseT > 1.2) {
      zipper.sliderZ = target;
      for (const p of props) p.dispose();
      props.length = 0;
      game.stage++;
      // ストッパーが跳ねて下がる（開けられる長さが伸びる）
      const oldZ = stopper.position.z;
      zipper.maxOpen = STAGE_MAX_OPEN[Math.min(game.stage, STAGE_MAX_OPEN.length - 1)];
      stopperAnim.fromZ = oldZ;
      stopperAnim.toZ = stopperTargetZ();
      stopperAnim.t = Math.abs(stopperAnim.toZ - stopperAnim.fromZ) > 0.05 ? 0 : 1;
      if (stopperAnim.t === 0) Sound.boing();
      game.phase = 'respawn';
      game.phaseT = 0;
    }
  } else if (game.phase === 'respawn') {
    if (game.phaseT > 0.5) {
      spawnStage(game.stage);
      game.phase = 'play';
      game.phaseT = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// 入力（一本指）
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

const input = {
  dragging: false,
  pointerId: -1,
  grabOffsetZ: 0,
  targetZ: ZIP.zStart,
  lastInputAt: 0,
  hasEverDragged: false,
};
let tickAccum = 0;

function screenToWorldZ(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) return hitPoint;
  return null;
}

function projectToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function handleScreenPos() {
  const r = slider.userData.ring;
  const p = new THREE.Vector3();
  r.getWorldPosition(p);
  return projectToScreen(p.x, p.y, p.z);
}

function onPointerDown(e) {
  Sound.init();
  Sound.resume();
  input.lastInputAt = simTime;
  if (input.dragging) return;
  const hs = handleScreenPos();
  const dx = e.clientX - hs.x, dy = e.clientY - hs.y;
  const grabR = Math.min(window.innerWidth, window.innerHeight) * 0.16 + 30;
  const wp = screenToWorldZ(e.clientX, e.clientY);
  const nearSeam = wp && Math.abs(wp.x) < 1.6 && Math.abs(wp.z - zipper.sliderZ) < 2.2;
  if (Math.hypot(dx, dy) < grabR || nearSeam) {
    input.dragging = true;
    input.pointerId = e.pointerId;
    input.targetZ = zipper.sliderZ;
    // ドラッグ中はカメラを固定するので、絶対座標マッピングが安定する
    camPeek.active = false;
    input.grabOffsetZ = wp ? clamp(wp.z - zipper.sliderZ, -0.8, 2.6) : 1.4;
    input.hasEverDragged = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    Sound.pop();
    return;
  }
  // 物へのタップ→ぷるん / 床タップ→キラッ
  if (wp) {
    let tapped = null;
    for (const p of props) {
      const dxp = wp.x - p.root.position.x, dzp = wp.z - p.root.position.z;
      const r = Math.max(p.footL, p.footW) * 0.7 + 0.4;
      if (p.root.position.y > -1 && dxp * dxp + dzp * dzp < r * r) { tapped = p; break; }
    }
    if (tapped) tapped.jiggle();
    else spawnSparkles(wp.x, 0.3, wp.z, 4, 0.3);
  }
}

function onPointerMove(e) {
  if (!input.dragging || e.pointerId !== input.pointerId) return;
  input.lastInputAt = simTime;
  // ドラッグ中はカメラ固定なので絶対マッピングが安定する。
  // 線から外れても z 成分のみ使うので自動補正になる。
  const wp = screenToWorldZ(e.clientX, e.clientY);
  if (wp) input.targetZ = wp.z - input.grabOffsetZ;
}

function onPointerUp(e) {
  if (e.pointerId !== input.pointerId) return;
  input.dragging = false;
  input.pointerId = -1;
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);
window.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('dblclick', (e) => e.preventDefault());

function updateSlider(dt) {
  if (game.phase !== 'play') {
    zipper.activity = Math.max(0, zipper.activity - dt * 3);
    input.targetZ = zipper.sliderZ; // 自動閉鎖後にドラッグ継続していても跳ねない
    return;
  }
  const minZ = ZIP.zStart - zipper.maxOpen;
  let target = input.dragging ? clamp(input.targetZ, minZ, ZIP.zStart) : zipper.sliderZ;
  // ストッパーにぶつかったら小さくバウンド
  if (input.dragging && input.targetZ < minZ - 0.5 && zipper.sliderZ - minZ < 0.05) {
    stopper.rotation.z = Math.sin(simTime * 30) * 0.06;
  } else {
    stopper.rotation.z *= 1 - dt * 8;
  }
  const prev = zipper.sliderZ;
  const maxStep = 15 * dt;
  const want = clamp(target - zipper.sliderZ, -maxStep, maxStep);
  zipper.sliderZ = clamp(zipper.sliderZ + want * Math.min(1, dt * 60), minZ, ZIP.zStart);
  const moved = zipper.sliderZ - prev;
  const speed = Math.abs(moved) / Math.max(dt, 1e-4);
  zipper.activity = lerp(zipper.activity, clamp(speed / 6, 0, 1), Math.min(1, dt * 8));
  tickAccum += Math.abs(moved);
  if (tickAccum >= ZIP.toothSpacing) {
    tickAccum = 0;
    Sound.zipTick(moved > 0, speed);
  }
}

// ---------------------------------------------------------------------------
// カメラ演出（落下時に少しだけ床下を見せる）
// ---------------------------------------------------------------------------

function requestPeek(z) {
  if (input.dragging) return; // ドラッグ中はカメラを動かさない（指の対応を守る）
  if (simTime - lastPeekAt < 3.5) return;
  lastPeekAt = simTime;
  camPeek.active = true;
  camPeek.t = 0;
  camPeek.dur = 1.9;
  camPeek.z = clamp(z, -6, 5);
}

const camPosCur = camBase.pos.clone();
const camTargetCur = camBase.target.clone();
let followCur = 0;

function updateCamera(dt) {
  // スライダーが進むほどカメラも前へついていく（因果を切らさない）。
  // ただしドラッグ中は固定：指と取っ手の対応が絶対に狂わないようにする。
  const followTarget = clamp((zipper.sliderZ - ZIP.zStart) * 0.55, -6.8, 0);
  if (!input.dragging || game.phase !== 'play') {
    followCur = lerp(followCur, followTarget, Math.min(1, dt * 2.2));
  }
  let pos = camBase.pos.clone(), target = camBase.target.clone(), fov = camBase.fov;
  pos.z += followCur;
  target.z += followCur;
  if (camPeek.active) {
    camPeek.t += dt;
    const k = camPeek.t / camPeek.dur;
    if (k >= 1) camPeek.active = false;
    else {
      const w = Math.sin(Math.PI * clamp(k, 0, 1)) * 0.7; // 行って帰る
      pos = pos.lerp(new THREE.Vector3(0, pos.y - 2.4, pos.z - 0.8), w);
      target = target.lerp(new THREE.Vector3(0, -2.6, lerp(target.z, camPeek.z, 0.4)), w);
    }
  }
  camPosCur.lerp(pos, Math.min(1, dt * 5));
  camTargetCur.lerp(target, Math.min(1, dt * 5));
  camera.position.copy(camPosCur);
  camera.lookAt(camTargetCur);
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 5));
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
// ヒント表示
// ---------------------------------------------------------------------------

let hintDing = 0;

function updateHints(dt) {
  const idle = simTime - input.lastInputAt;
  const showHint = game.phase === 'play' && !input.dragging &&
    (!input.hasEverDragged || idle > 7);
  // 取っ手リング
  const ringTargetOp = showHint ? 0.55 + Math.sin(simTime * 4) * 0.35 : 0;
  hintRing.material.opacity = lerp(hintRing.material.opacity, ringTargetOp, Math.min(1, dt * 6));
  hintRing.visible = hintRing.material.opacity > 0.02;
  if (hintRing.visible) {
    const r = slider.userData.ring;
    const p = new THREE.Vector3();
    r.getWorldPosition(p);
    hintRing.position.set(p.x, 0.25, p.z);
    hintRing.scale.setScalar(1 + Math.sin(simTime * 4) * 0.08);
  }
  // 進行方向の光の粒
  const minZ = ZIP.zStart - zipper.maxOpen;
  for (let i = 0; i < hintDots.length; i++) {
    const s = hintDots[i];
    if (!showHint) { s.material.opacity = lerp(s.material.opacity, 0, Math.min(1, dt * 6)); continue; }
    const cyc = (simTime * 0.55 + i / hintDots.length) % 1;
    const z = lerp(zipper.sliderZ - 1.2, Math.max(minZ, zipper.sliderZ - 6.5), cyc);
    s.position.set(0, 0.35, z);
    const fade = Math.sin(cyc * Math.PI);
    s.material.opacity = lerp(s.material.opacity, 0.75 * fade, Math.min(1, dt * 10));
  }
  if (showHint && input.hasEverDragged && idle > 7) {
    hintDing -= dt;
    if (hintDing <= 0) { Sound.ding(); hintDing = 6; }
  }
}

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------

spawnStage(0);
game.ready = true;

let timeScale = 1;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  simTime += dt;

  updateSlider(dt);
  updateGamePhase(dt);
  deformFloor();
  updateTeeth();

  // スライダー・ストッパーの見た目
  slider.position.set(0, 0, zipper.sliderZ);
  slider.position.x = Math.sin(simTime * 47) * 0.02 * zipper.activity; // ジジジ振動
  if (stopperAnim.t < 1) {
    stopperAnim.t = Math.min(1, stopperAnim.t + dt / 0.7);
    const k = stopperAnim.t;
    stopper.position.z = lerp(stopperAnim.fromZ, stopperAnim.toZ, smoothstep(k));
    stopper.position.y = Math.sin(Math.PI * k) * 1.6; // ぴょーんと跳ねる
    if (stopperAnim.t >= 1) {
      stopper.position.y = 0;
      spawnSparkles(0, 0.4, stopper.position.z, 10, 0.8);
      Sound.thump(false);
    }
  }

  for (const p of props) { p.update(dt); p.updateCommon(dt); }
  updateParticles(dt);
  updateCamera(dt);
  updateHints(dt);

  // 床下の星がゆらゆら
  for (const s of cellarStars) {
    s.position.y = s.userData.baseY + Math.sin(simTime * 0.8 + s.userData.bob) * 0.3;
  }

  renderer.render(scene, camera);
}
frame();

// ---------------------------------------------------------------------------
// E2E・検証用フック（UIなし・ゲームに影響しない）
// ---------------------------------------------------------------------------

window.__game = {
  get ready() { return game.ready; },
  get stage() { return game.stage; },
  get phase() { return game.phase; },
  get zStart() { return ZIP.zStart; },
  get sliderZ() { return zipper.sliderZ; },
  get maxOpen() { return zipper.maxOpen; },
  openLen,
  handleScreen: handleScreenPos,
  seamScreen: (z) => projectToScreen(0, 0.3, z),
  objects: () => props.map((p) => ({ type: p.type, state: p.state, y: p.root.position.y, z: p.zc })),
  setTimeScale: (s) => { timeScale = s; },
  get dragging() { return input.dragging; },
  get targetZ() { return input.targetZ; },
};
