// ポケットいっぱいのおおきなバッグ — 4歳向けモバイルWebゲーム
// 「チャックをあけると、なにかでてくる」
// 文字・数値UIなし / 一本指操作 / 縦横対応
//
// 動物型リュックの表面にある大小さまざまなジッパーポケットを開けると、
// 中身がのぞき、ムギュッと詰まり、ポンッと飛び出す。
// 口（メインジッパー）を開けると散らばったおもちゃを吸い込んで食べる。
// 全部食べたらごちそうさま→次の動物リュックが登場。

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// パラメータ・ユーティリティ
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const E2E = params.has('e2e');

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
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

let simTime = 0;

// ---------------------------------------------------------------------------
// サウンド（全て合成・iOSは初回タッチで解禁）
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null, master: null, noiseBuf: null, lastTick: 0, lastSqueak: 0,

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
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  _noise(dur, freq, q, gain, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
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

  // ジジジ…ポケットの大きさで音程が変わる
  zipTick(closing, speed, pitch = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick < 0.024) return;
    this.lastTick = now;
    const f = (closing ? 1500 : 2300) * pitch;
    this._noise(0.035, f + Math.random() * 400, 2.5, clamp(0.1 + speed * 0.012, 0.1, 0.28));
    this._tone('square', 380 * pitch, 300 * pitch, 0.02, 0.03);
  },
  squeak(pitch = 1) { // ムギュッ
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSqueak < 0.22) return;
    this.lastSqueak = now;
    this._tone('sine', 500 * pitch, 780 * pitch, 0.07, 0.06);
    this._tone('sine', 780 * pitch, 500 * pitch, 0.08, 0.05, 0.07);
  },
  pop() { this._tone('sine', 400, 950, 0.09, 0.12); this._noise(0.06, 1200, 1.5, 0.06); },
  boing() { this._tone('sine', 420, 200, 0.18, 0.09); this._tone('sine', 630, 300, 0.18, 0.04); },
  thud(big) { this._tone('sine', big ? 90 : 130, 45, 0.22, big ? 0.24 : 0.16); },
  slurp() { this._tone('sawtooth', 180, 620, 0.22, 0.05); this._noise(0.2, 900, 1.2, 0.06); },
  gulp() { this._tone('sine', 300, 90, 0.16, 0.14); this._tone('sine', 140, 70, 0.12, 0.1, 0.1); },
  burp() {
    this._tone('sawtooth', 120, 70, 0.32, 0.1);
    this._tone('sawtooth', 95, 60, 0.24, 0.07, 0.12);
  },
  cheep() {
    this._tone('sine', 1400, 1900, 0.06, 0.06);
    this._tone('sine', 1700, 1300, 0.07, 0.05, 0.08);
  },
  vroom() { this._tone('sawtooth', 90, 160, 0.18, 0.04); },
  twinkle() { [1568, 1976, 2349].forEach((f, i) => this._tone('triangle', f, f, 0.25, 0.05, i * 0.06)); },
  chime() { [523, 659, 784, 880, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.5, 0.1, i * 0.11)); },
  hearts() { [784, 988, 1175].forEach((f, i) => this._tone('sine', f, f * 1.02, 0.3, 0.07, i * 0.09)); },
  grumble() { this._tone('sine', 75, 55, 0.4, 0.09); this._tone('sine', 110, 80, 0.3, 0.05, 0.1); },
  ding() { this._tone('triangle', 880, 880, 0.35, 0.06); },
  balloonPop() { this._noise(0.12, 2500, 0.8, 0.22); this._tone('square', 300, 120, 0.05, 0.06); },
};

// ---------------------------------------------------------------------------
// レンダラ・シーン・カメラ・ライト
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: !E2E, powerPreference: 'high-performance' });
renderer.setPixelRatio(E2E ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
if (!E2E) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 背景：やわらかい部屋
{
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffeccd');
  grad.addColorStop(0.55, '#fddcc2');
  grad.addColorStop(1, '#f6c8ab');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
let isPortrait = true;

function layoutCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  camera.aspect = aspect;
  const t = clamp((aspect - 0.45) / (1.9 - 0.45), 0, 1); // 0縦 → 1横
  camera.fov = lerp(52, 44, t);
  camera.position.set(0, lerp(5.4, 4.8, t), lerp(20.5, 16.5, t));
  camera.lookAt(0, lerp(4.7, 4.0, t), 0);
  camera.updateProjectionMatrix();
  const portraitNow = aspect < 1;
  if (portraitNow !== isPortrait) {
    isPortrait = portraitNow;
    rebuildForOrientation();
  }
}

scene.add(new THREE.HemisphereLight(0xfff4e0, 0xcf9e7e, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(8, 14, 12);
if (!E2E) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 14; sc.bottom = -4;
  sc.near = 2; sc.far = 45;
  sun.shadow.bias = -0.0004;
}
scene.add(sun);

// ---------------------------------------------------------------------------
// 部屋（床と壁）
// ---------------------------------------------------------------------------

{
  const floorTex = makeCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#eeddc4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,165,125,0.4)'; g.lineWidth = 2;
    g.setLineDash([9, 7]);
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(233,169,140,0.35)';
    for (let i = 0; i < 12; i++) {
      g.beginPath(); g.arc((i * 137.5) % w, (i * 89.3) % h, 5, 0, Math.PI * 2); g.fill();
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 26),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 5);
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 24),
    new THREE.MeshStandardMaterial({ color: 0xf9d9b4, roughness: 1 })
  );
  wall.position.set(0, 12, -8);
  scene.add(wall);
}

// ---------------------------------------------------------------------------
// パーティクル
// ---------------------------------------------------------------------------

function makeSoftCircleTexture(color) {
  return makeCanvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
}
const puffTex = makeSoftCircleTexture('rgba(255,250,240,0.95)');
const sparkTex = makeSoftCircleTexture('rgba(255,236,150,1)');
const heartTex = makeCanvasTexture(64, 64, (g) => {
  g.fillStyle = '#ff7f9f';
  g.beginPath();
  g.moveTo(32, 52);
  g.bezierCurveTo(6, 34, 10, 12, 32, 22);
  g.bezierCurveTo(54, 12, 58, 34, 32, 52);
  g.fill();
});

const particles = [];
function spawnParticles(tex, x, y, z, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false }));
    const spread = opts.spread || 0.7;
    s.position.set(x + rr(-spread, spread), y + rr(0, 0.4), z + rr(-spread, spread) * 0.4);
    s.scale.setScalar(rr(0.25, 0.5) * (opts.scale || 1));
    s.userData = {
      vel: new THREE.Vector3(rr(-1.6, 1.6), rr(1.2, 3.4) * (opts.up || 1), rr(-0.5, 1.2)),
      life: 0, maxLife: rr(0.5, 0.9), grow: opts.grow || 0, gravity: opts.gravity ?? 5,
    };
    scene.add(s);
    particles.push(s);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const s = particles[i], u = s.userData;
    u.life += dt;
    if (u.life >= u.maxLife) {
      scene.remove(s); s.material.dispose(); particles.splice(i, 1);
      continue;
    }
    s.position.addScaledVector(u.vel, dt);
    u.vel.y -= u.gravity * dt;
    if (u.grow) s.scale.setScalar(s.scale.x + u.grow * dt);
    s.material.opacity = 1 - u.life / u.maxLife;
  }
}

// ---------------------------------------------------------------------------
// バッグ（動物型リュック）の定義
// ---------------------------------------------------------------------------

const BAGS = [
  { name: 'bear', body: 0xc98f5f, belly: 0xe8c398, accent: 0x8f5f38 },
  { name: 'frog', body: 0x7ec87e, belly: 0xd9efc4, accent: 0x4d9950 },
  { name: 'cat', body: 0x9d8ec9, belly: 0xe6def4, accent: 0x6c5da0 },
];

// 中身のカタログ。need = 飛び出すのに必要な開口幅（ワールド）
const CONTENT_TYPES = {
  chick:   { need: 0.42 },
  ball:    { need: 0.48 },
  marbles: { need: 0.3 },
  marble:  { need: 0.3 },
  star:    { need: 0.42 },
  balloon: { need: 0.46 },
  car:     { need: 0.52 },
  pouch:   { need: 0.5 },
  teddy:   { need: 1.08 },
  apple:   { need: 0.44 },
  candy:   { need: 0.34 },
}

// ---------------------------------------------------------------------------
// 素材
// ---------------------------------------------------------------------------

const mats = {
  metal: new THREE.MeshStandardMaterial({ color: 0xc3d0e0, metalness: 0.3, roughness: 0.45 }),
  metal2: new THREE.MeshStandardMaterial({ color: 0x93a7be, metalness: 0.3, roughness: 0.5 }),
  tab: new THREE.MeshStandardMaterial({ color: 0xf25c6e, metalness: 0.3, roughness: 0.45 }),
  teeth: new THREE.MeshStandardMaterial({ color: 0xe3b23e, metalness: 0.5, roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x4a3038, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
  black: new THREE.MeshStandardMaterial({ color: 0x332a2a, roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xef6a5a, roughness: 0.85 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x5aa9e6, roughness: 0.85 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.85 }),
  green: new THREE.MeshStandardMaterial({ color: 0x7ec87e, roughness: 0.85 }),
  purple: new THREE.MeshStandardMaterial({ color: 0xb48ce0, roughness: 0.85 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xf78fb3, roughness: 0.85 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xfff1dc, roughness: 0.9 }),
  brown: new THREE.MeshStandardMaterial({ color: 0xc98f5f, roughness: 0.9 }),
  tongue: new THREE.MeshStandardMaterial({ color: 0xf78fb3, roughness: 0.9 }),
};
const colorMats = [mats.red, mats.blue, mats.yellow, mats.green, mats.purple, mats.pink];

const pocketTexCache = new Map();
function pocketTexture(colorHex) {
  if (pocketTexCache.has(colorHex)) return pocketTexCache.get(colorHex);
  const base = new THREE.Color(colorHex);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const tex = makeCanvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#' + light.getHexString();
    g.fillRect(0, 0, w, h);
    // ふちのステッチ
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.setLineDash([8, 6]);
    g.strokeRect(6, 6, w - 12, h - 12);
    g.setLineDash([]);
    // 中央のテープ帯（ジッパーの縫い付け）
    g.fillStyle = '#' + base.getHexString();
    g.fillRect(0, h / 2 - 13, w, 26);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(0, h / 2 - 9); g.lineTo(w, h / 2 - 9); g.stroke();
    g.beginPath(); g.moveTo(0, h / 2 + 9); g.lineTo(w, h / 2 + 9); g.stroke();
    g.setLineDash([]);
  });
  pocketTexCache.set(colorHex, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// ポケット（バッグ表面のジッパー開口。口やポーチにも使う）
// ---------------------------------------------------------------------------

const SEGX = 30, SEGY = 8;

class Pocket {
  // opts: { len, width, colorHex, pitch, isMouth }
  constructor(opts) {
    this.len = opts.len;
    this.width = opts.width;
    this.pitch = opts.pitch || 1;
    this.isMouth = !!opts.isMouth;
    this.group = new THREE.Group();
    this.sliderT = 0;       // 0=閉 1=全開
    this.gap = 0;           // 現在の最大開口幅
    this.content = null;    // 中身タイプ名 or null
    this.state = 'closed';  // closed|peek|struggle|empty
    this.struggleTime = 0;
    this.holdTime = 0;
    this.wiggle = 0;        // ヒントのもぞもぞ
    this.happy = 0;         // ごくん後のぷるぷる
    this.activity = 0;
    this.tickAccum = 0;
    this.eyeSeed = rr(0, 10);

    const L = this.len, W = this.width;
    const M = 0.26; // ふち
    // 布パッチ
    this.geo = new THREE.PlaneGeometry(L + M * 2, W * 2 + M * 2, SEGX, SEGY);
    this.base = new Float32Array(this.geo.attributes.position.array);
    const mat = new THREE.MeshStandardMaterial({
      map: pocketTexture(opts.colorHex), roughness: 0.95, side: THREE.DoubleSide,
    });
    this.patch = new THREE.Mesh(this.geo, mat);
    this.patch.castShadow = false;
    this.group.add(this.patch);

    // 中の暗がり
    const inner = new THREE.Mesh(
      new THREE.PlaneGeometry(L, W * 1.8),
      new THREE.MeshStandardMaterial({ color: 0x51343c, roughness: 1 })
    );
    inner.position.z = -0.32;
    this.group.add(inner);

    // のぞく目（中身がいる印）
    this.peekGroup = new THREE.Group();
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mats.white);
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.17, 0.02, 0);
    eyeR.position.set(0.17, 0.02, 0);
    const pupL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.black);
    const pupR = pupL.clone();
    pupL.position.set(-0.17, 0.02, 0.1);
    pupR.position.set(0.17, 0.02, 0.1);
    this.peekDome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), mats.cream);
    this.peekDome.position.set(0, -0.18, -0.05);
    this.peekGroup.add(eyeL, eyeR, pupL, pupR, this.peekDome);
    this.peekGroup.visible = false;
    this.group.add(this.peekGroup);

    // 歯（左右2列）
    this.teethCount = Math.max(6, Math.floor(L / 0.28));
    this.teeth = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.14), mats.teeth, this.teethCount * 2
    );
    this.group.add(this.teeth);
    this.toothDummy = new THREE.Object3D();

    // ミニスライダー＋取っ手リング
    this.slider = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.3), mats.metal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 10, 20), mats.tab);
    ring.position.set(-0.55, 0, 0.12);
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.1), mats.metal2);
    link.position.set(-0.32, 0, 0.1);
    this.slider.add(body, ring, link);
    this.sliderRing = ring;
    this.group.add(this.slider);

    this.deform();
  }

  // t(0..1) → パッチローカル x
  tx(t) { return -this.len / 2 + t * this.len; }

  holeHalfAt(x) {
    const x0 = this.tx(0), xs = this.tx(this.sliderT);
    const open = xs - x0;
    if (open < 0.03 || x <= x0 || x >= xs) return 0;
    const u = (x - x0) / open;
    // 長く開けるほど幅も広がる（大きい物ほど長く開けないと出ない）
    const gape = Math.min(this.width * 0.72, open * 0.26);
    return gape * Math.pow(Math.sin(Math.PI * u), 0.85);
  }

  maxGap() {
    const x0 = this.tx(0), xs = this.tx(this.sliderT);
    const open = xs - x0;
    if (open < 0.03) return 0;
    return 2 * Math.min(this.width * 0.72, open * 0.26);
  }

  deform() {
    const arr = this.geo.attributes.position.array, base = this.base;
    const cols = SEGX + 1, rows = SEGY + 1;
    const R = this.width + 0.42;
    const need = this.content ? CONTENT_TYPES[this.content].need : 0.5;
    // 中身が押すふくらみ（ヒントのもぞもぞ／ムギュムギュ共用）
    const pushAmp =
      (this.state === 'struggle' ? 0.22 + 0.1 * Math.sin(simTime * 26 + this.eyeSeed) : 0) +
      this.wiggle * (0.13 + 0.06 * Math.sin(simTime * 17 + this.eyeSeed)) +
      this.happy * (0.1 + 0.05 * Math.sin(simTime * 21));
    const pushW = Math.max(0.5, need * 0.8);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const x = base[i], y = base[i + 1];
        const h = this.holeHalfAt(x);
        const d = Math.abs(y);
        let ny = y, nz = 0;
        if (h > 0.001 && d < R) {
          const t = clamp(d / R, 0, 1);
          const fall = 1 - t * t * (3 - 2 * t);
          const s = h * fall;
          ny = Math.sign(y || 1) * (d + s);
          nz = 0.3 * s * (1 - s / h) - 0.12 * Math.min(1, h * 2) * Math.exp(-(d * d) / 0.12);
        }
        if (pushAmp > 0.001) {
          nz += pushAmp * Math.exp(-(x * x) / (pushW * pushW)) * Math.exp(-(d * d) / (this.width * this.width));
        }
        arr[i] = x; arr[i + 1] = ny; arr[i + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();

    // 歯
    let idx = 0;
    const xs = this.tx(this.sliderT);
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < this.teethCount; k++) {
        const x = this.tx((k + (side > 0 ? 0.25 : 0.75)) / this.teethCount);
        const h = this.holeHalfAt(x);
        const nearSlider = Math.abs(x - xs) < 0.4;
        this.toothDummy.position.set(x, side * (h > 0.001 ? h + 0.06 : 0.075), 0.07);
        this.toothDummy.rotation.set(h > 0.001 ? side * Math.min(0.9, h) : 0, 0, 0);
        this.toothDummy.scale.setScalar(nearSlider ? 0.001 : 1);
        this.toothDummy.updateMatrix();
        this.teeth.setMatrixAt(idx++, this.toothDummy.matrix);
      }
    }
    this.teeth.instanceMatrix.needsUpdate = true;

    // スライダー
    this.slider.position.set(xs, 0, 0.14);
  }

  // 中身の状態更新。飛び出すときは onPop(type, worldPos, worldNormal) を呼ぶ
  update(dt, onPop) {
    this.wiggle = Math.max(0, this.wiggle - dt * 1.6);
    this.happy = Math.max(0, this.happy - dt * 1.2);
    this.activity = Math.max(0, this.activity - dt * 3);
    this.gap = this.maxGap();

    if (this.content) {
      const need = CONTENT_TYPES[this.content].need;
      const peekAmt = clamp((this.gap - 0.22) / 0.3, 0, 1);
      // のぞく目
      this.peekGroup.visible = peekAmt > 0.02 && this.gap < need;
      if (this.peekGroup.visible) {
        const x0 = this.tx(0), xs = this.tx(this.sliderT);
        this.peekGroup.position.set((x0 + xs) / 2, 0, -0.15 + peekAmt * 0.4);
        this.peekGroup.scale.setScalar(0.6 + peekAmt * 0.5);
        this.peekDome.material = mats.cream;
        const look = Math.sin(simTime * 2.2 + this.eyeSeed) * 0.06;
        this.peekGroup.children[2].position.x = -0.17 + look;
        this.peekGroup.children[3].position.x = 0.17 + look;
      }

      if (this.gap >= need) {
        // ムギュムギュ…からのポンッ！
        if (this.state !== 'struggle') { this.state = 'struggle'; this.struggleTime = 0; }
        this.struggleTime += dt;
        if (rng() < dt * 5) Sound.squeak(this.pitch);
        if (this.struggleTime > 0.45) {
          const type = this.content;
          this.content = null;
          this.state = 'empty';
          this.peekGroup.visible = false;
          const wp = new THREE.Vector3((this.tx(0) + this.tx(this.sliderT)) / 2, 0, 0.3);
          this.group.localToWorld(wp);
          const wn = new THREE.Vector3(0, 0, 1).transformDirection(this.group.matrixWorld);
          Sound.pop();
          spawnParticles(sparkTex, wp.x, wp.y, wp.z, 8, { spread: 0.4 });
          onPop(type, wp, wn);
        }
      } else if (this.gap >= need * 0.45) {
        // 幅が足りない：ムギュッと詰まる（開口が中身より小さい）
        if (this.state !== 'struggle') { this.state = 'struggle'; this.struggleTime = 0; }
        this.struggleTime = Math.min(this.struggleTime + dt, 0.3); // ため続けるが出ない
        if (this.activity > 0.2 && rng() < dt * 3) Sound.squeak(this.pitch * 0.8);
      } else if (peekAmt > 0.02) {
        this.state = 'peek';
      } else {
        this.state = 'closed';
      }
    } else {
      this.state = this.gap > 0.25 ? 'empty' : 'closed';
      this.peekGroup.visible = false;
    }
    this.deform();
  }

  // 空きポケットに物をしまう
  store(type) {
    this.content = type;
    this.state = 'closed';
    this.happy = 1.2;
    Sound.gulp();
  }

  setSliderT(t, dt) {
    const prev = this.sliderT;
    const maxStep = (6 * dt) / this.len; // ワールド速度6/sを t に換算（ラチェット感）
    this.sliderT = clamp(prev + clamp(t - prev, -maxStep, maxStep), 0, 1);
    const moved = Math.abs(this.sliderT - prev) * this.len;
    if (moved > 0.0005) {
      this.activity = 1;
      this.tickAccum += moved;
      if (this.tickAccum > 0.26) {
        this.tickAccum = 0;
        Sound.zipTick(this.sliderT < prev, moved / Math.max(dt, 1e-4), this.pitch);
      }
    }
  }

  tabWorldPos(v) {
    v.copy(this.sliderRing.position).add(this.slider.position);
    this.group.localToWorld(v);
    return v;
  }

  trackWorldPos(t, v) {
    v.set(this.tx(t), 0, 0.15);
    this.group.localToWorld(v);
    return v;
  }

  dispose() {
    this.geo.dispose();
    this.teeth.geometry.dispose();
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// 飛び出した物（軽量2.5D物理）
// ---------------------------------------------------------------------------

const ITEM_BUILDERS = {
  chick() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), mats.yellow);
    body.position.y = 0.34;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), mats.yellow);
    head.position.y = 0.72;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 8), mats.red);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.7, 0.24);
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mats.black);
    e1.position.set(-0.1, 0.78, 0.19);
    const e2 = e1.clone(); e2.position.x = 0.1;
    g.add(body, head, beak, e1, e2);
    return { g, r: 0.38 };
  },
  ball() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), pick(colorMats));
    m.position.y = 0.4;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 20), mats.cream);
    band.rotation.x = Math.PI / 2; band.position.y = 0.4;
    g.add(m, band);
    return { g, r: 0.42 };
  },
  marble() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), pick(colorMats));
    m.position.y = 0.17;
    g.add(m);
    return { g, r: 0.18 };
  },
  star() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mats.yellow);
    c.position.y = 0.3;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), mats.yellow);
      p.position.set(Math.cos(a) * 0.3, 0.3 + Math.sin(a) * 0.3, 0);
      p.rotation.z = a - Math.PI / 2;
      g.add(p);
    }
    g.add(c);
    return { g, r: 0.4 };
  },
  balloon() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12), pick(colorMats));
    b.scale.y = 1.15; b.position.y = 0.66;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 8), mats.cream);
    knot.position.y = 0.12; knot.rotation.x = Math.PI;
    g.add(b, knot);
    return { g, r: 0.46 };
  },
  car() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.45), pick(colorMats));
    body.position.y = 0.28;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 0.4), mats.cream);
    top.position.set(-0.05, 0.5, 0);
    for (const sx of [-0.28, 0.28]) for (const sz of [-0.24, 0.24]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), mats.black);
      w.rotation.x = Math.PI / 2;
      w.position.set(sx, 0.13, sz);
      g.add(w);
    }
    g.add(body, top);
    return { g, r: 0.45 };
  },
  pouch() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mats.pink);
    body.scale.set(1, 0.62, 0.5);
    body.position.y = 0.3;
    g.add(body);
    return { g, r: 0.5 };
  },
  candy() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), pick(colorMats));
    c.position.y = 0.22;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 6), mats.cream);
      w.rotation.z = s * Math.PI / 2;
      w.position.set(s * 0.28, 0.22, 0);
      g.add(w);
    }
    g.add(c);
    return { g, r: 0.26 };
  },
  teddy() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), mats.brown);
    body.scale.y = 1.1; body.position.y = 0.58;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), mats.brown);
    head.position.y = 1.3;
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.cream);
    muzzle.position.set(0, 1.22, 0.32);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mats.brown);
      ear.position.set(s * 0.3, 1.62, 0);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mats.brown);
      arm.scale.set(1, 1.6, 1);
      arm.position.set(s * 0.58, 0.62, 0.1);
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.brown);
      leg.position.set(s * 0.3, 0.12, 0.15);
      g.add(ear, arm, leg);
    }
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mats.black);
    e1.position.set(-0.13, 1.36, 0.34);
    const e2 = e1.clone(); e2.position.x = 0.13;
    g.add(body, head, muzzle, e1, e2);
    return { g, r: 0.62 };
  },
  apple() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mats.red);
    a.position.y = 0.34;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), mats.brown);
    stem.position.y = 0.72;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mats.green);
    leaf.scale.set(1.6, 0.5, 0.8);
    leaf.position.set(0.12, 0.74, 0);
    g.add(a, stem, leaf);
    return { g, r: 0.36 };
  },
};

const GRAV = 14;
const items = [];

class FreeItem {
  constructor(type, pos, normal) {
    this.type = type;
    const built = ITEM_BUILDERS[type]();
    this.root = built.g;
    this.r = built.r;
    this.root.position.copy(pos);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = !E2E; });
    scene.add(this.root);
    this.vel = new THREE.Vector3(
      normal.x * rr(2.5, 4) + rr(-1.2, 1.2),
      rr(2.2, 3.6),
      Math.abs(normal.z) * rr(2.5, 4) + rr(0.5, 1.5)
    );
    this.spin = rr(-3, 3);
    this.state = 'air'; // air | floor | sucked | gone
    this.floorTimer = rr(0, 2);
    this.dir = rng() < 0.5 ? -1 : 1;
    this.suckTarget = null;
    this.jiggleT = 0;
    if (type === 'balloon') this.vel.y = rr(0.5, 1.2);
  }

  update(dt) {
    const p = this.root.position;
    if (this.state === 'air') {
      if (this.type === 'balloon') {
        this.vel.y += 2.6 * dt; // 浮く！
        this.vel.multiplyScalar(1 - dt * 0.9);
        p.addScaledVector(this.vel, dt);
        p.x += Math.sin(simTime * 1.7 + this.spin) * dt * 0.5;
        this.root.rotation.z = Math.sin(simTime * 1.5 + this.spin) * 0.15;
        if (p.y > 10.5) p.y = 10.5;
        p.z = lerp(clamp(p.z, 2.2, 5), 3.4, dt * 1.2); // 画面内の帯にとどまる
        const xr = isPortrait ? 3.4 : bag.halfW + 2.5;
        p.x = clamp(p.x, -xr, xr);
        return;
      }
      this.vel.y -= GRAV * dt;
      p.addScaledVector(this.vel, dt);
      this.root.rotation.z += this.spin * dt;
      // バッグ表面ですべる
      const bagFront = 1.9;
      if (p.z < bagFront && p.y > 0.6 && Math.abs(p.x) < bag.halfW + 0.5) {
        p.z = bagFront;
        this.vel.z = Math.abs(this.vel.z) * 0.35 + 0.6;
      }
      if (p.y <= this.r) {
        p.y = this.r;
        if (Math.abs(this.vel.y) > 1.6) {
          this.vel.y = -this.vel.y * 0.42;
          this.vel.x *= 0.7; this.vel.z *= 0.7;
          Sound.thud(this.r > 0.5);
          if (this.type === 'marble') Sound.twinkle();
        } else {
          this.vel.set(0, 0, 0);
          this.state = 'floor';
          this.root.rotation.z = 0;
          spawnParticles(puffTex, p.x, 0.2, p.z, 4, { spread: 0.4, grow: 1.6, gravity: 0 });
          if (this.type === 'chick') Sound.cheep();
          if (this.type === 'star') Sound.twinkle();
        }
      }
    } else if (this.state === 'floor') {
      const xr = isPortrait ? 3.1 : bag.halfW + 3;
      p.x = clamp(p.x, -xr, xr);
      p.z = clamp(p.z, 2.2, isPortrait ? 5.4 : 6.6);
      this.floorTimer -= dt;
      if (this.type === 'car') {
        p.x += this.dir * dt * 2.2;
        this.root.rotation.y = this.dir > 0 ? 0 : Math.PI;
        const range = isPortrait ? 2.9 : bag.halfW + 2.6;
        if (Math.abs(p.x) > range) { this.dir *= -1; Sound.vroom(); }
      } else if (this.type === 'chick' && this.floorTimer <= 0) {
        this.floorTimer = rr(1.2, 3);
        this.vel.set(rr(-1, 1), 2.6, rr(-0.5, 0.5));
        this.state = 'air';
        Sound.cheep();
      } else if (this.type === 'ball' && this.floorTimer <= 0) {
        this.floorTimer = rr(2.5, 5);
        this.vel.set(rr(-0.6, 0.6), 3, rr(-0.3, 0.3));
        this.state = 'air';
      }
      // 山積みの押し合い
      for (const o of items) {
        if (o === this || o.state !== 'floor') continue;
        const dx = p.x - o.root.position.x, dz = p.z - o.root.position.z;
        const rd = this.r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.0001 && d2 < rd * rd) {
          const d = Math.sqrt(d2), push = (rd - d) * 0.5;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
        }
      }
    } else if (this.state === 'sucked') {
      const tv = this.suckTarget;
      const to = new THREE.Vector3().subVectors(tv, p);
      const d = to.length();
      if (d < 0.7) {
        this.state = 'gone';
        this.root.visible = false;
        Sound.gulp();
        onItemEaten(this);
        return;
      }
      to.normalize();
      this.vel.lerp(to.multiplyScalar(9), dt * 4);
      p.addScaledVector(this.vel, dt);
      this.root.rotation.z += dt * 8;
      const s = clamp(d / 3, 0.35, 1);
      this.root.scale.setScalar(s);
    }
    // タップのぷるん
    if (this.jiggleT > 0) {
      this.jiggleT -= dt;
      const k = Math.max(0, this.jiggleT) / 0.3;
      const s = 1 + Math.sin(k * Math.PI * 3) * 0.08 * k;
      this.root.scale.set(1 / s, s, 1 / s);
      if (this.jiggleT <= 0) this.root.scale.setScalar(1);
    }
  }

  tap() {
    if (this.type === 'pouch' && !this.opened) {
      // マトリョーシカ：ポーチのチャックが開いて中からキャンディ
      this.opened = true;
      Sound.zipTick(false, 12, 1.5);
      Sound.zipTick(false, 12, 1.5);
      setTimeout(() => Sound.pop(), 180);
      const wp = this.root.position.clone();
      wp.y += 0.5;
      spawnParticles(sparkTex, wp.x, wp.y, wp.z, 8, { spread: 0.4 });
      const candy = new FreeItem('candy', wp, new THREE.Vector3(0, 0, 0.5));
      candy.vel.set(rr(-0.8, 0.8), 3.4, rr(0.2, 1));
      items.push(candy);
      this.jiggleT = 0.3;
      return;
    }
    if (this.type === 'balloon') {
      // 風船はタップで割れて星に
      Sound.balloonPop();
      spawnParticles(sparkTex, this.root.position.x, this.root.position.y, this.root.position.z, 14, { spread: 0.5 });
      this.state = 'gone';
      this.root.visible = false;
      const star = new FreeItem('star', this.root.position.clone(), new THREE.Vector3(0, 0, 0.3));
      star.vel.set(rr(-0.5, 0.5), -1, 0.5);
      items.push(star);
      return;
    }
    this.jiggleT = 0.3;
    // ぴょんと跳ねる（開いている口があればそちらへ寄る）
    if (this.state === 'floor') {
      this.state = 'air';
      const target = nearestOpenMouthPos(this.root.position);
      if (target) {
        const to = new THREE.Vector3().subVectors(target, this.root.position);
        this.vel.set(clamp(to.x, -3, 3) * 0.8, 4.2, clamp(to.z, -3, 3) * 0.6);
      } else {
        this.vel.set(rr(-1, 1), 4, rr(-0.5, 0.5));
      }
      Sound.boing();
    }
  }

  dispose() {
    scene.remove(this.root);
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// バッグ本体の構築
// ---------------------------------------------------------------------------

const bag = {
  group: null,
  def: null,
  index: 0,
  halfW: 3.7,
  bellyH: 6.2,
  headR: 1.9,
  pockets: [],   // おなかのポケット
  mouth: null,   // 口（メインジッパー）
  eyes: [],
  pupils: [],
  face: null,
  bounce: 0,
  eaten: 0,
};

function bagDims() {
  return isPortrait
    ? { halfW: 3.6, bellyH: 6.4, headR: 1.85 }
    : { halfW: 5.6, bellyH: 4.6, headR: 1.7 };
}

// ポケットのワールド配置（おなか表面のゆるいカーブに沿わせる）
function placeOnBelly(pocket, x, y, ang) {
  const { halfW } = bag;
  const xn = clamp(x / halfW, -0.95, 0.95);
  const depth = bag.group.userData.depth;
  const zf = Math.sqrt(Math.max(0.2, 1 - xn * xn * 0.55));
  pocket.group.position.set(x, y, depth * zf + 0.06);
  pocket.group.rotation.set(0, -Math.asin(xn * 0.6) * 0.6, ang);
}

// 手続き的レイアウト：毎ラウンド配置が変わる（縦2＋横列）
function generatePocketLayout() {
  const { halfW, bellyH } = bag;
  const list = [];
  const yLo = 1.05, yHi = 0.55 + bellyH - 0.9;
  // 両サイドの縦ポケット
  const vx = halfW * 0.66;
  const vlen = Math.min(2.3, bellyH * 0.4);
  list.push({ x: -vx, y: 0.55 + bellyH * 0.5, len: vlen, ang: Math.PI / 2, size: 'M' });
  list.push({ x: vx, y: 0.55 + bellyH * 0.5, len: vlen, ang: -Math.PI / 2, size: 'M' });
  // 中央の横列
  const rows = Math.max(2, Math.floor((yHi - yLo) / 1.6));
  const innerHalf = vx - 1.1;
  const cols = innerHalf * 2 > 4.4 ? 2 : 1;
  const lRow = Math.floor(rr(0, rows)); // どの行が大ポケットか
  for (let r = 0; r < rows; r++) {
    const y = yLo + ((yHi - yLo) * (r + 0.5)) / rows + rr(-0.1, 0.1);
    for (let c = 0; c < cols; c++) {
      const isL = r === lRow && c === cols - 1;
      const size = isL ? 'L' : rng() < 0.5 ? 'S' : 'M';
      const len = (isL ? 2.6 : size === 'M' ? 2.0 : 1.6) * (cols === 2 ? 0.8 : 1);
      const cx = cols === 1
        ? rr(-0.35, 0.35)
        : (c === 0 ? -innerHalf / 2 - 0.1 : innerHalf / 2 + 0.1) + rr(-0.2, 0.2);
      list.push({ x: cx, y, len, ang: rr(-0.15, 0.15), size });
    }
  }
  return list;
}

function buildBag(defIndex) {
  const def = BAGS[defIndex % BAGS.length];
  const d = bagDims();
  bag.def = def;
  bag.index = defIndex;
  bag.halfW = d.halfW;
  bag.bellyH = d.bellyH;
  bag.headR = d.headR;
  bag.eaten = 0;
  bag.pockets = [];
  bag.eyes = []; bag.pupils = [];

  const g = new THREE.Group();
  bag.group = g;
  const depth = 1.7;
  g.userData.depth = depth;

  const bodyMat = new THREE.MeshStandardMaterial({ color: def.body, roughness: 0.95 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: def.belly, roughness: 0.95 });
  const accentMat = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.9 });

  // 胴体：縦につぶした楕円柱＋上下の丸み
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, bag.bellyH, 28, 1), bodyMat);
  body.scale.set(bag.halfW, 1, depth);
  body.position.y = 0.55 + bag.bellyH / 2;
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), bodyMat);
  bottom.scale.set(bag.halfW, 0.7, depth);
  bottom.position.y = 0.58;
  // おなかの明るいパネル
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, bag.bellyH * 0.96, 28, 1, false, -Math.PI * 0.42, Math.PI * 0.84), bellyMat);
  belly.scale.set(bag.halfW * 0.99, 1, depth * 1.02);
  belly.position.y = 0.55 + bag.bellyH / 2; // theta=0 が +z（正面）なので回転不要
  g.add(body, bottom, belly);

  // 頭
  const headCy = 0.55 + bag.bellyH + bag.headR * 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(bag.headR, 24, 16), bodyMat);
  head.scale.set(1.15, 1, 0.9);
  head.position.y = headCy;
  g.add(head);
  bag.headCy = headCy;

  // 動物ごとの飾り
  if (def.name === 'bear') {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), bodyMat);
      ear.position.set(s * bag.headR * 0.85, headCy + bag.headR * 0.75, 0);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bellyMat);
      inner.position.set(s * bag.headR * 0.85, headCy + bag.headR * 0.75, 0.32);
      g.add(ear, inner);
    }
  } else if (def.name === 'frog') {
    for (const s of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), bodyMat);
      bump.position.set(s * bag.headR * 0.62, headCy + bag.headR * 0.82, 0);
      g.add(bump);
    }
  } else if (def.name === 'cat') {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.85, 4), bodyMat);
      ear.position.set(s * bag.headR * 0.72, headCy + bag.headR * 0.9, 0);
      ear.rotation.y = Math.PI / 4;
      g.add(ear);
    }
  }

  // 目（スライダーを目で追う）
  const eyeY = def.name === 'frog' ? headCy + bag.headR * 0.82 : headCy + bag.headR * 0.25;
  const eyeZ = def.name === 'frog' ? 0.45 : bag.headR * 0.78;
  const eyeSpread = def.name === 'frog' ? bag.headR * 0.62 : bag.headR * 0.42;
  for (const s of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mats.white);
    white.position.set(s * eyeSpread, eyeY, eyeZ);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mats.black);
    pupil.position.set(s * eyeSpread, eyeY, eyeZ + 0.2);
    g.add(white, pupil);
    bag.eyes.push(white); bag.pupils.push(pupil);
  }

  // ほっぺ
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mats.pink);
    cheek.scale.z = 0.4;
    cheek.position.set(s * bag.headR * 0.8, headCy - bag.headR * 0.15, bag.headR * 0.72);
    g.add(cheek);
  }

  // 肩ひも（リュックらしさ）
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 8, 16, Math.PI), accentMat);
    strap.position.set(s * bag.halfW * 0.55, 0.6 + bag.bellyH, -depth * 0.4);
    strap.rotation.set(0.3, 0, 0);
    g.add(strap);
  }

  // おなかのポケット（手続き的レイアウト・毎ラウンド変化）
  const pcolors = [0xf28ba8, 0x7ec0f0, 0xffd34d, 0x8fd8b2, 0xc39ae8, 0xf9a76a, 0x9ad0c9];
  const layout = generatePocketLayout();
  layout.forEach((pd, i) => {
    const width = pd.size === 'L' ? 0.78 : pd.size === 'M' ? 0.58 : 0.45;
    const p = new Pocket({
      len: pd.len, width,
      colorHex: pcolors[i % pcolors.length],
      pitch: pd.size === 'L' ? 0.8 : pd.size === 'S' ? 1.35 : 1,
    });
    p.sizeClass = pd.size;
    placeOnBelly(p, pd.x, pd.y, pd.ang);
    g.add(p.group);
    bag.pockets.push(p);
  });

  // 口 = メインジッパー（開けると吸い込む）
  const mouth = new Pocket({
    len: bag.headR * 1.3, width: 0.5,
    colorHex: def.body, pitch: 0.65, isMouth: true,
  });
  mouth.group.position.set(0, headCy - bag.headR * 0.45, bag.headR * 0.74);
  mouth.group.rotation.set(-0.15, 0, 0);
  // 口の中はベロ色
  mouth.group.children[1].material = mats.tongue;
  g.add(mouth.group);
  bag.mouth = mouth;

  g.traverse((o) => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') o.castShadow = !E2E; });
  scene.add(g);
  return g;
}

function disposeBag() {
  if (!bag.group) return;
  for (const p of bag.pockets) p.dispose();
  if (bag.mouth) bag.mouth.dispose();
  bag.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  scene.remove(bag.group);
  bag.group = null;
}

// 中身を割り当てる（毎ラウンドシャッフル）
function fillPockets() {
  const large = [], others = [];
  bag.pockets.forEach((p) => (p.sizeClass === 'L' ? large : others).push(p));
  // 大ポケットにはクマかポーチか風船
  for (const p of large) p.content = pick(['teddy', 'teddy', 'pouch', 'balloon']);
  const pool = ['chick', 'ball', 'marbles', 'star', 'balloon', 'car', 'apple', 'pouch'];
  const shuffled = pool.slice().sort(() => rng() - 0.5);
  others.forEach((p, i) => { p.content = shuffled[i % shuffled.length]; });
  for (const p of [...bag.pockets]) { p.sliderT = 0; p.state = 'closed'; p.deform(); }
  bag.mouth.sliderT = 0;
  bag.mouth.content = null;
  bag.mouth.deform();
}

// ---------------------------------------------------------------------------
// ラウンド進行
// ---------------------------------------------------------------------------

const game = {
  phase: 'enter', // enter | play | celebrate | exit
  phaseT: 0,
  round: 0,
  ready: false,
};

function startRound(round) {
  disposeBag();
  for (const it of items) it.dispose();
  items.length = 0;
  buildBag(round);
  fillPockets();
  game.phase = 'enter';
  game.phaseT = 0;
}

function rebuildForOrientation() {
  if (!bag.group) return;
  // 向きが変わったらバッグを組み直す（中身は引き継ぎ、ジッパーは閉じ直す）
  const savedContents = bag.pockets.map((p) => p.content).filter(Boolean);
  const round = bag.index;
  disposeBag();
  buildBag(round);
  const large = bag.pockets.filter((p) => p.sizeClass === 'L');
  const others = bag.pockets.filter((p) => p.sizeClass !== 'L');
  for (const c of savedContents) {
    let dest = null;
    if (c === 'teddy') dest = large.find((p) => !p.content) || null;
    if (!dest) dest = others.find((p) => !p.content) || large.find((p) => !p.content) || null;
    if (dest) dest.content = c;
  }
  for (const p of bag.pockets) p.deform();
  bag.mouth.deform();
}

function popContent(pocket, type, wp, wn) {
  bag.bounce = 0.5;
  if (type === 'marbles') {
    for (let i = 0; i < 5; i++) {
      const it = new FreeItem('marble', wp, wn);
      it.vel.x += rr(-1.5, 1.5);
      items.push(it);
    }
  } else {
    items.push(new FreeItem(type, wp, wn));
  }
}

function onItemEaten(item) {
  bag.eaten++;
  bag.bounce = 0.8;
  spawnParticles(heartTex, 0, bag.headCy + bag.headR, 2, 3, { spread: 0.8, gravity: -1.5 });
  Sound.hearts();
}

function nearestOpenMouthPos(fromPos) {
  // 開いている口（吸い込み中）を優先
  if (bag.mouth && bag.mouth.gap > 0.5) {
    const v = new THREE.Vector3();
    bag.mouth.trackWorldPos(bag.mouth.sliderT * 0.5, v);
    return v;
  }
  return null;
}

function allDone() {
  for (const p of bag.pockets) if (p.content) return false;
  for (const it of items) if (it.state === 'air' || it.state === 'floor' || it.state === 'sucked') return false;
  return true;
}

function updateGame(dt) {
  game.phaseT += dt;
  const g = bag.group;
  if (!g) return;

  if (game.phase === 'enter') {
    const k = smoothstep(clamp(game.phaseT / 1.1, 0, 1));
    g.position.x = lerp((isPortrait ? 10 : 16), 0, k);
    g.position.y = Math.abs(Math.sin(game.phaseT * 9)) * (1 - k) * 0.8;
    if (k >= 1) { game.phase = 'play'; game.phaseT = 0; Sound.boing(); }
  } else if (game.phase === 'play') {
    if (allDone() && game.phaseT > 1.5) {
      game.phase = 'celebrate';
      game.phaseT = 0;
      Sound.chime();
      Sound.burp();
      spawnParticles(heartTex, 0, bag.headCy + 1, 2.5, 8, { spread: 1.5, gravity: -1.2 });
      spawnParticles(sparkTex, 0, bag.bellyH * 0.6, 2.5, 16, { spread: 2.4 });
    }
  } else if (game.phase === 'celebrate') {
    // うれしいダンス＋口を自動で閉じる
    g.position.y = Math.abs(Math.sin(game.phaseT * 7)) * 0.6;
    g.rotation.z = Math.sin(game.phaseT * 7) * 0.05;
    bag.mouth.setSliderT(0, dt);
    if (game.phaseT > 2.2) { game.phase = 'exit'; game.phaseT = 0; }
  } else if (game.phase === 'exit') {
    const k = smoothstep(clamp(game.phaseT / 1.0, 0, 1));
    g.position.x = lerp(0, (isPortrait ? -11 : -17), k);
    g.position.y = Math.abs(Math.sin(game.phaseT * 10)) * 0.7;
    g.rotation.z = 0;
    if (k >= 1) {
      game.round++;
      startRound(game.round);
    }
  }

  // バッグのぼよん
  bag.bounce = Math.max(0, bag.bounce - dt * 2.5);
  const sq = 1 + Math.sin(bag.bounce * Math.PI) * 0.05;
  g.scale.set(1 / sq, sq, 1);

  // ポケット更新
  for (const p of bag.pockets) {
    p.update(dt, (type, wp, wn) => popContent(p, type, wp, wn));
  }
  bag.mouth.update(dt, () => {});

  // 口の吸い込み
  if (bag.mouth.gap > 0.5 && game.phase === 'play') {
    const mp = new THREE.Vector3();
    bag.mouth.trackWorldPos(bag.mouth.sliderT * 0.5, mp);
    let slurping = false;
    for (const it of items) {
      if (it.state === 'floor' || (it.state === 'air' && it.type === 'balloon')) {
        const d = it.root.position.distanceTo(mp);
        if (d < 8.5) {
          it.state = 'sucked';
          it.suckTarget = mp.clone();
          slurping = true;
        }
      } else if (it.state === 'sucked') {
        it.suckTarget.copy(mp);
      }
    }
    if (slurping) Sound.slurp();
  }

  // 空のポケットが落下物をキャッチ
  for (const it of items) {
    if (it.state !== 'air' || it.vel.y > 0) continue;
    for (const p of bag.pockets) {
      if (p.content || p.gap < 0.45) continue;
      const sp = new THREE.Vector3();
      p.trackWorldPos(p.sliderT * 0.5, sp);
      if (it.root.position.distanceTo(sp) < 0.9 && p.gap >= it.r * 1.4) {
        it.state = 'gone';
        it.root.visible = false;
        p.store(it.type);
        spawnParticles(sparkTex, sp.x, sp.y, sp.z, 6, { spread: 0.4 });
        break;
      }
    }
  }

  // 目がスライダーや飛び出た物を追う
  let lookAt = null;
  if (input.dragging && input.pocket) {
    lookAt = new THREE.Vector3();
    input.pocket.tabWorldPos(lookAt);
  } else if (items.length) {
    const last = items[items.length - 1];
    if (last.state !== 'gone') lookAt = last.root.position;
  }
  for (let i = 0; i < bag.pupils.length; i++) {
    const pu = bag.pupils[i], wh = bag.eyes[i];
    const blink = Math.sin(simTime * 0.7 + 2 * i) > 0.995;
    wh.scale.y = blink ? 0.15 : 1;
    if (lookAt) {
      const local = lookAt.clone();
      bag.group.worldToLocal(local);
      const dx = clamp((local.x - wh.position.x) * 0.03, -0.1, 0.1);
      const dy = clamp((local.y - wh.position.y) * 0.02, -0.08, 0.08);
      pu.position.x = wh.position.x + dx;
      pu.position.y = wh.position.y + dy;
    }
  }
}

// ---------------------------------------------------------------------------
// 入力（一本指）
// ---------------------------------------------------------------------------

const input = {
  dragging: false,
  pointerId: -1,
  pocket: null,
  lastInputAt: 0,
  hasEverDragged: false,
};

const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();

function toScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
}

function allPockets() {
  return bag.group ? [...bag.pockets, bag.mouth] : [];
}

function onPointerDown(e) {
  Sound.init();
  Sound.resume();
  input.lastInputAt = simTime;
  if (input.dragging || game.phase !== 'play') return;

  const grabR = Math.min(window.innerWidth, window.innerHeight) * 0.11 + 24;
  let best = null, bestD = grabR;
  for (const p of allPockets()) {
    const sp = toScreen(p.tabWorldPos(_v3a));
    const d = Math.hypot(e.clientX - sp.x, e.clientY - sp.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    input.dragging = true;
    input.pointerId = e.pointerId;
    input.pocket = best;
    input.targetT = best.sliderT;
    input.hasEverDragged = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    Sound.pop();
    return;
  }
  // 物へのタップ
  for (const it of items) {
    if (it.state === 'gone') continue;
    const sp = toScreen(it.root.position);
    if (Math.hypot(e.clientX - sp.x, e.clientY - sp.y) < 60) { it.tap(); return; }
  }
  // 顔へのタップ→まばたき＆きゅっ
  if (bag.group) {
    const fp = toScreen(new THREE.Vector3(0, bag.headCy, bag.headR).applyMatrix4(bag.group.matrixWorld));
    if (Math.hypot(e.clientX - fp.x, e.clientY - fp.y) < 110) {
      bag.bounce = 0.5;
      Sound.squeak(0.7);
    }
  }
}

function onPointerMove(e) {
  if (!input.dragging || e.pointerId !== input.pointerId || !input.pocket) return;
  input.lastInputAt = simTime;
  // トラックの画面上の直線に指を射影 → t を得る（線から外れても自動補正）
  const p = input.pocket;
  const A = toScreen(p.trackWorldPos(0, _v3a));
  const B = toScreen(p.trackWorldPos(1, _v3b));
  const abx = B.x - A.x, aby = B.y - A.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1) return;
  const t = clamp(((e.clientX - A.x) * abx + (e.clientY - A.y) * aby) / len2, 0, 1);
  input.targetT = t;
}

function onPointerUp(e) {
  if (e.pointerId !== input.pointerId) return;
  input.dragging = false;
  input.pointerId = -1;
  input.pocket = null;
  input.targetT = null;
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);
window.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('resize', layoutCamera);
if (window.visualViewport) window.visualViewport.addEventListener('resize', layoutCamera);

function updateInput(dt) {
  if (input.dragging && input.pocket && input.targetT != null && game.phase === 'play') {
    input.pocket.setSliderT(input.targetT, dt);
  }
}

// ---------------------------------------------------------------------------
// ヒント（何を触ればよいか）
// ---------------------------------------------------------------------------

const hintRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.62, 0.06, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
);
scene.add(hintRing);
let hintTimer = 0;
let hintPocket = null;

function updateHints(dt) {
  const idle = simTime - input.lastInputAt;
  const show = game.phase === 'play' && !input.dragging && (!input.hasEverDragged || idle > 6);
  if (show) {
    hintTimer -= dt;
    if (hintTimer <= 0 || !hintPocket) {
      hintTimer = 3.5;
      // 中身のあるポケット（なければ口）をもぞもぞさせる
      const withContent = bag.pockets.filter((p) => p.content);
      hintPocket = withContent.length ? pick(withContent)
        : (items.some((i) => i.state === 'floor') ? bag.mouth : null);
      if (hintPocket) {
        hintPocket.wiggle = 1.6;
        if (hintPocket.isMouth) Sound.grumble();
        else Sound.squeak(hintPocket.pitch * 0.8);
        if (input.hasEverDragged === false || idle > 10) Sound.ding();
      }
    }
  } else {
    hintPocket = null;
  }
  const targetOp = show && hintPocket ? 0.5 + Math.sin(simTime * 4) * 0.3 : 0;
  hintRing.material.opacity = lerp(hintRing.material.opacity, targetOp, Math.min(1, dt * 6));
  hintRing.visible = hintRing.material.opacity > 0.02;
  if (hintRing.visible && hintPocket) {
    hintPocket.tabWorldPos(_v3a);
    hintRing.position.copy(_v3a);
    hintRing.position.z += 0.3;
    hintRing.scale.setScalar(1 + Math.sin(simTime * 4) * 0.1);
    hintRing.lookAt(camera.position);
  }
}

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------

layoutCamera();
startRound(0);
game.ready = true;

let timeScale = 1;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  simTime += dt;

  updateInput(dt);
  updateGame(dt);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.update(dt);
    if (it.state === 'gone' && !it.root.visible) { it.dispose(); items.splice(i, 1); }
  }
  updateParticles(dt);
  updateHints(dt);

  renderer.render(scene, camera);
}
frame();

// ---------------------------------------------------------------------------
// E2E・検証用フック
// ---------------------------------------------------------------------------

window.__game = {
  get ready() { return game.ready; },
  get phase() { return game.phase; },
  get round() { return game.round; },
  get eaten() { return bag.eaten; },
  pockets: () => allPockets().map((p, i) => ({
    i, content: p.content, state: p.state,
    sliderT: p.sliderT, gap: p.gap,
    need: p.content ? CONTENT_TYPES[p.content].need : 0,
    isMouth: p.isMouth,
  })),
  pocketTabScreen: (i) => toScreen(allPockets()[i].tabWorldPos(new THREE.Vector3())),
  pocketTrackScreen: (i, t) => toScreen(allPockets()[i].trackWorldPos(t, new THREE.Vector3())),
  items: () => items.map((it) => ({
    type: it.type, state: it.state,
    x: it.root.position.x, y: it.root.position.y, z: it.root.position.z,
  })),
  setTimeScale: (s) => { timeScale = s; },
  // 検証用：中身を差し替える（E2E時のみ）
  setContent: (i, type) => {
    if (!E2E) return;
    const p = allPockets()[i];
    p.content = type || null;
    p.deform();
  },
};
