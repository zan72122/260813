// ジッパーハウス — 4歳向けモバイルWebゲーム
// 「チャックをあけて、ものを下に落とす」
// 文字・数値UIなし / 一本指操作 / 縦横対応
//
// 長い床ジッパーを開けると、上の物がグラッ→踏ん張り→ガタン！と床下へ落ちる。
// ラウンドが進むと、枝分かれの路線・平行する複数の線・天井の荷物ネット・
// 2階建てタワーが登場し、「どこを・どの順で・どこまで開けるか」で結果が分岐する。
// 物理は常に上から下。カメラはスライダーに接写追従し、落下をチェイスする。

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

const ROOM = { xHalf: 9.2, zNear: 10.2, zFar: -12.4, depth: 7.6 };
const CUSHION_TOP = -6.0;
const GRAVITY = 16;
const GAPE_MAX = 2.7;
const GAPE_PER_LEN = 0.27;

// グラグラ→ガタンのチューニング（v1準拠）
const WOBBLE_MIN_TIME = 0.45;
const CRIT_HOLD = 0.5;
const CRIT_LURCH = 0.14;

// ---------------------------------------------------------------------------
// サウンド（全て合成・iOSは初回タッチで解禁）
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null, master: null, noiseBuf: null, lastTick: 0, lastCreak: 0,

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

  zipTick(closing, speed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTick < 0.024) return;
    this.lastTick = now;
    const f = closing ? 1500 : 2300;
    this._noise(0.035, f + Math.random() * 500, 2.5, clamp(0.1 + speed * 0.012, 0.1, 0.3));
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
  wedge() { this._tone('sine', 300, 170, 0.14, 0.07); },
  boing() { this._tone('sine', 420, 200, 0.18, 0.09); this._tone('sine', 630, 300, 0.18, 0.04); },
  whoosh() { this._noise(0.35, 700, 0.8, 0.1); },
  thump(big) {
    this._tone('sine', big ? 85 : 120, 40, 0.28, big ? 0.32 : 0.22);
    this._noise(0.16, 240, 1.2, big ? 0.2 : 0.13);
  },
  pof() { this._noise(0.22, 320, 0.9, 0.15); },
  squeak() { this._tone('sine', 620, 900, 0.05, 0.06); this._tone('sine', 900, 620, 0.06, 0.05, 0.05); },
  rustle() { this._noise(0.3, 1100, 1.1, 0.07); },
  chime() { [523, 659, 784, 880, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.5, 0.1, i * 0.11)); },
  ding() { this._tone('triangle', 880, 880, 0.35, 0.06); },
  pop() { this._tone('sine', 500, 900, 0.07, 0.08); },
  clack() { this._noise(0.05, 2000, 3, 0.1); this._tone('square', 500, 380, 0.04, 0.05); },
};

// ---------------------------------------------------------------------------
// レンダラ・シーン
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

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 140);
const camBase = { pos: new THREE.Vector3(0, 11.8, 12.8), target: new THREE.Vector3(0, -0.6, 0.5), fov: 58 };

function layoutCamera() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  camera.aspect = aspect;
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

scene.add(new THREE.HemisphereLight(0xfff4e0, 0xcf9e7e, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(7, 16, 8);
if (!E2E) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 15; sc.bottom = -15;
  sc.near = 2; sc.far = 45;
  sun.shadow.bias = -0.0004;
}
scene.add(sun);
const cellarLight = new THREE.PointLight(0xffd9a8, 40, 22, 1.6);
cellarLight.position.set(0, -3.4, -1);
scene.add(cellarLight);

// ---------------------------------------------------------------------------
// 床下空間（v1準拠：こわくない秘密の地下）
// ---------------------------------------------------------------------------

const cellarStars = [];
{
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 1 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd9a276, roughness: 1 });
  const midZ = (ROOM.zNear + ROOM.zFar) / 2;
  const mk = (w, h, px, py, pz, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(px, py, pz); m.rotation.y = ry;
    scene.add(m);
  };
  const D = ROOM.depth;
  mk(ROOM.xHalf * 2 + 1, D, 0, -D / 2, ROOM.zFar, 0);
  mk(ROOM.zNear - ROOM.zFar + 1, D, -ROOM.xHalf, -D / 2, midZ, Math.PI / 2);
  mk(ROOM.zNear - ROOM.zFar + 1, D, ROOM.xHalf, -D / 2, midZ, -Math.PI / 2);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.xHalf * 2 + 1, ROOM.zNear - ROOM.zFar + 1), floorMat);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(0, -D, midZ);
  scene.add(fl);

  const cushionTex = makeCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#bfe8cf'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.beginPath();
        g.arc(x * 64 + (y % 2 ? 32 : 0) + 16, y * 64 + 16, 9, 0, Math.PI * 2);
        g.fill();
      }
  });
  cushionTex.wrapS = cushionTex.wrapT = THREE.RepeatWrapping;
  cushionTex.repeat.set(4, 8);
  const cush = new THREE.Mesh(
    new THREE.BoxGeometry(15, 1.6, ROOM.zNear - ROOM.zFar - 1.2),
    new THREE.MeshStandardMaterial({ map: cushionTex, roughness: 1 })
  );
  cush.position.set(0, CUSHION_TOP - 0.8, midZ);
  scene.add(cush);
  const pipe = new THREE.Mesh(
    new THREE.BoxGeometry(15.3, 0.35, ROOM.zNear - ROOM.zFar - 1),
    new THREE.MeshStandardMaterial({ color: 0x8fd8b2, roughness: 1 })
  );
  pipe.position.set(0, CUSHION_TOP - 0.05, midZ);
  scene.add(pipe);

  const sparkTexTmp = makeCanvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,236,150,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  });
  const starMat = new THREE.SpriteMaterial({ map: sparkTexTmp, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(starMat);
    s.position.set(rr(-6, 6), rr(-5.4, -1.4), rr(-9, 7));
    s.scale.setScalar(rr(0.25, 0.5));
    s.userData.bob = rr(0, Math.PI * 2);
    s.userData.baseY = s.position.y;
    scene.add(s);
    cellarStars.push(s);
  }
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
const hintTex = makeSoftCircleTexture('rgba(255,255,255,0.95)');

const particles = [];
function spawnPuff(x, y, z, n = 8, scale = 1) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.85, depthWrite: false }));
    s.position.set(x + rr(-0.7, 0.7) * scale, y + rr(0, 0.4), z + rr(-0.7, 0.7) * scale);
    s.scale.setScalar(rr(0.5, 0.9) * scale);
    s.userData = { vel: new THREE.Vector3(rr(-1, 1), rr(0.6, 1.6), rr(-1, 1)), life: 0, maxLife: rr(0.4, 0.7), grow: rr(1.8, 2.8) * scale, puff: true };
    scene.add(s);
    particles.push(s);
  }
}
function spawnSparkles(x, y, z, n = 14, spread = 1.6) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 1, depthWrite: false }));
    s.position.set(x + rr(-spread, spread), y + rr(0, 0.5), z + rr(-spread, spread));
    s.scale.setScalar(rr(0.2, 0.45));
    s.userData = { vel: new THREE.Vector3(rr(-1.6, 1.6), rr(1.5, 4), rr(-1.6, 1.6)), life: 0, maxLife: rr(0.5, 0.9), grow: 0, puff: false };
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
    if (!u.puff) u.vel.y -= 6 * dt;
    if (u.grow) s.scale.setScalar(s.scale.x + u.grow * dt);
    s.material.opacity = (u.puff ? 0.85 : 1) * (1 - u.life / u.maxLife);
  }
}

// ---------------------------------------------------------------------------
// ジッパー路線（枝分かれする経路の木）
// ---------------------------------------------------------------------------

const metalMat = new THREE.MeshStandardMaterial({ color: 0xc3d0e0, metalness: 0.3, roughness: 0.45 });
const metal2Mat = new THREE.MeshStandardMaterial({ color: 0x93a7be, metalness: 0.3, roughness: 0.5 });
const tabMat = new THREE.MeshStandardMaterial({ color: 0xf25c6e, metalness: 0.35, roughness: 0.45 });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xe3b23e, metalness: 0.5, roughness: 0.4 });
const capMat = new THREE.MeshStandardMaterial({ color: 0xe8493f, roughness: 0.5 });

class Track {
  // spec: { nodes: [[x,z],...], edges: [[ai,bi],...] } — nodes[0]が始端（root）
  constructor(spec, slab) {
    this.slab = slab;
    this.gapeMax = spec.gapeMax || GAPE_MAX;
    this.nodes = spec.nodes.map(([x, z]) => ({ x, z }));
    this.edges = spec.edges.map(([a, b]) => {
      const dx = this.nodes[b].x - this.nodes[a].x;
      const dz = this.nodes[b].z - this.nodes[a].z;
      const len = Math.hypot(dx, dz);
      return { a, b, len, dx: dx / len, dz: dz / len, parent: -1 };
    });
    // 木構造：edge.parent = ノードaへ流入するエッジ
    this.edges.forEach((e, i) => {
      this.edges.forEach((f, j) => { if (i !== j && f.b === e.a) e.parent = j; });
    });
    this.childrenOf = (nodeIdx) => this.edges.map((e, i) => (e.a === nodeIdx ? i : -1)).filter((i) => i >= 0);

    this.slider = { edge: 0, s: 0 };
    this.activity = 0;
    this.tickAccum = 0;
    this.openPath = [];   // [{edge, u0}] root→slider、u0=経路上の開始距離
    this.openLen = 0;
    this.updatePath();

    this.buildMeshes();
  }

  updatePath() {
    const chain = [];
    let ei = this.slider.edge;
    while (ei >= 0) { chain.unshift(ei); ei = this.edges[ei].parent; }
    let u = 0;
    this.openPath = chain.map((idx) => {
      const e = this.edges[idx];
      const seg = { edge: idx, u0: u, len: idx === this.slider.edge ? this.slider.s : e.len };
      u += seg.len;
      return seg;
    });
    this.openLen = u;
  }

  gape() { return Math.min(this.gapeMax, this.openLen * GAPE_PER_LEN); }

  lens(u) {
    if (this.openLen < 0.05 || u <= 0 || u >= this.openLen) return 0;
    return this.gape() * Math.pow(Math.sin(Math.PI * (u / this.openLen)), 0.85);
  }

  // 点(x,z)の開口情報: {d 横距離, h 開口半幅, px,pz 垂直方向}（開いていなければ h=0）
  holeAt(x, z) {
    let best = null;
    for (const seg of this.openPath) {
      if (seg.len < 0.02) continue;
      const e = this.edges[seg.edge];
      const ax = this.nodes[e.a].x, az = this.nodes[e.a].z;
      const relX = x - ax, relZ = z - az;
      const t = clamp(relX * e.dx + relZ * e.dz, 0, seg.len);
      const cx = ax + e.dx * t, cz = az + e.dz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (!best || d < best.d) {
        best = { d, u: seg.u0 + t, px: -e.dz, pz: e.dx, sideSign: Math.sign((x - cx) * -e.dz + (z - cz) * e.dx) || 1 };
      }
    }
    if (!best) return { d: 1e9, h: 0 };
    best.h = this.lens(best.u);
    return best;
  }

  sliderWorld() {
    const e = this.edges[this.slider.edge];
    return {
      x: this.nodes[e.a].x + e.dx * this.slider.s,
      z: this.nodes[e.a].z + e.dz * this.slider.s,
      dx: e.dx, dz: e.dz,
    };
  }

  // 経路上の距離u→ワールド座標（root からの既定経路。テスト・ヒント用）
  pointAt(u) {
    let ei = 0;
    while (true) {
      const e = this.edges[ei];
      if (u <= e.len) return { x: this.nodes[e.a].x + e.dx * u, z: this.nodes[e.a].z + e.dz * u };
      u -= e.len;
      const kids = this.childrenOf(e.b);
      if (!kids.length) return { x: this.nodes[e.b].x, z: this.nodes[e.b].z };
      ei = kids[0];
    }
  }

  // 目標ワールド点へスライダーを進める（分岐は指の方向で選択）
  moveToward(wx, wz, dt) {
    // 分岐点を越えた直後なら、指の向きに合わせて枝を選び直せる
    {
      const e = this.edges[this.slider.edge];
      if (e.parent >= 0 && this.slider.s < 3.5) {
        const sibs = this.childrenOf(e.a);
        if (sibs.length > 1) {
          const jx = this.nodes[e.a].x, jz = this.nodes[e.a].z;
          const mag = Math.hypot(wx - jx, wz - jz) || 1;
          let best = this.slider.edge, bestDot = -2, curDot = -2;
          for (const k of sibs) {
            const ke = this.edges[k];
            const dot = ((wx - jx) * ke.dx + (wz - jz) * ke.dz) / mag;
            if (k === this.slider.edge) curDot = dot;
            if (dot > bestDot) { bestDot = dot; best = k; }
          }
          if (best !== this.slider.edge && bestDot > 0.35 && bestDot > curDot + 0.03) {
            this.slider.edge = best;
            this.slider.s = Math.min(this.slider.s * 0.4, 0.8);
            this.updatePath();
            if (simTime - (this.lastClack || 0) > 0.2) { Sound.clack(); this.lastClack = simTime; }
          }
        }
      }
    }
    const maxStep = 18 * dt;
    let remaining = maxStep;
    let moved = 0;
    for (let iter = 0; iter < 4 && remaining > 0.001; iter++) {
      const e = this.edges[this.slider.edge];
      const ax = this.nodes[e.a].x, az = this.nodes[e.a].z;
      const proj = (wx - ax) * e.dx + (wz - az) * e.dz;
      let target = proj;
      // 分岐点越えの判定
      if (target > e.len + 0.01) {
        const step = Math.min(remaining, e.len - this.slider.s);
        if (step > 0) { this.slider.s += step; remaining -= step; moved += step; continue; }
        const kids = this.childrenOf(e.b);
        if (!kids.length) { this.slider.s = e.len; break; }
        // 指の向きに最も合う枝へ
        const bx = this.nodes[e.b].x, bz = this.nodes[e.b].z;
        let bestKid = -1, bestDot = 0.25;
        const mag = Math.hypot(wx - bx, wz - bz) || 1;
        for (const k of kids) {
          const ke = this.edges[k];
          const dot = ((wx - bx) * ke.dx + (wz - bz) * ke.dz) / mag;
          if (dot > bestDot) { bestDot = dot; bestKid = k; }
        }
        if (bestKid < 0) break;
        this.slider.edge = bestKid;
        this.slider.s = 0;
        Sound.clack();
        continue;
      }
      if (target < -0.01) {
        const step = Math.min(remaining, this.slider.s);
        if (step > 0) { this.slider.s -= step; remaining -= step; moved -= step; continue; }
        if (e.parent < 0) { this.slider.s = 0; break; }
        const pe = this.edges[e.parent];
        this.slider.edge = e.parent;
        this.slider.s = pe.len;
        continue;
      }
      // エッジ内の通常移動
      const want = clamp(target - this.slider.s, -remaining, remaining);
      this.slider.s += want;
      remaining -= Math.abs(want);
      moved += want;
      break;
    }
    this.slider.s = clamp(this.slider.s, 0, this.edges[this.slider.edge].len);
    this.updatePath();
    const speed = Math.abs(moved) / Math.max(dt, 1e-4);
    this.activity = lerp(this.activity, clamp(speed / 6, 0, 1), Math.min(1, dt * 8));
    this.tickAccum += Math.abs(moved);
    if (this.tickAccum >= 0.34) {
      this.tickAccum = 0;
      Sound.zipTick(moved < 0, speed);
    }
    return moved;
  }

  // 自動で閉じる（ラウンド終了時）
  retreat(dt) {
    const step = 9 * dt;
    let left = step;
    while (left > 0.001) {
      if (this.slider.s > 0) {
        const d = Math.min(left, this.slider.s);
        this.slider.s -= d; left -= d;
      } else {
        const e = this.edges[this.slider.edge];
        if (e.parent < 0) break;
        this.slider.edge = e.parent;
        this.slider.s = this.edges[e.parent].len;
      }
    }
    this.updatePath();
    this.tickAccum += step;
    if (this.tickAccum > 0.34) { this.tickAccum = 0; Sound.zipTick(true, 8); }
    return this.openLen < 0.03;
  }

  buildMeshes() {
    const g = new THREE.Group();
    this.group = g;
    const y = this.slab.y;

    // 歯（全エッジ分・開閉で移動）
    this.teethInfo = [];
    this.edges.forEach((e, ei) => {
      const n = Math.floor(e.len / 0.34);
      for (let i = 0; i < n; i++) {
        for (const side of [-1, 1]) {
          const t = (i + (side > 0 ? 0.3 : 0.8)) * 0.34;
          if (t > e.len) continue;
          this.teethInfo.push({ edge: ei, t, side });
        }
      }
    });
    this.teeth = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, 0.17, 0.24), toothMat, this.teethInfo.length
    );
    this.teeth.castShadow = !E2E;
    g.add(this.teeth);
    this.toothDummy = new THREE.Object3D();

    // スライダー（v1の形）
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), metalMat);
    body.position.y = 0.32;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.44, 0.7), metal2Mat);
    nose.position.set(0, 0.32, -1.15);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), metal2Mat);
    post.position.set(0, 0.7, 0.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.2, 12, 24), tabMat);
    ring.rotation.x = -Math.PI / 2.1;
    ring.position.set(0, 0.3, 1.4);
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.8), metal2Mat);
    link.position.set(0, 0.45, 0.75);
    s.add(body, nose, post, ring, link);
    s.traverse((o) => { if (o.isMesh) o.castShadow = !E2E; });
    this.sliderMesh = s;
    this.ringMesh = ring;
    g.add(s);

    // 末端の留め具＆分岐点の飾り
    this.nodes.forEach((nd, ni) => {
      const isRoot = this.edges.some((e) => e.a === ni && e.parent === -1) && !this.edges.some((e) => e.b === ni);
      const isLeaf = !this.edges.some((e) => e.a === ni);
      if (isLeaf) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 0.5), capMat);
        cap.position.set(nd.x, y + 0.17, nd.z);
        const inEdge = this.edges.find((e) => e.b === ni);
        if (inEdge) cap.rotation.y = Math.atan2(inEdge.dx, inEdge.dz);
        cap.castShadow = !E2E;
        g.add(cap);
      } else if (!isRoot && this.childrenOf(ni).length > 1) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 6), metal2Mat);
        plate.position.set(nd.x, y + 0.05, nd.z);
        g.add(plate);
      }
    });

    scene.add(g);
    this.updateMeshes();
  }

  updateMeshes() {
    const y = this.slab.y;
    const sw = this.sliderWorld();
    // 歯
    let idx = 0;
    for (const ti of this.teethInfo) {
      const e = this.edges[ti.edge];
      const ax = this.nodes[e.a].x, az = this.nodes[e.a].z;
      // 経路上か？
      let u = -1;
      for (const seg of this.openPath) {
        if (seg.edge === ti.edge && ti.t <= seg.len + 0.001) { u = seg.u0 + ti.t; break; }
      }
      const h = u >= 0 ? this.lens(u) : 0;
      const px = -e.dz, pz = e.dx;
      const off = h > 0.001 ? h + 0.1 : 0.115;
      const wx = ax + e.dx * ti.t + px * off * ti.side;
      const wz = az + e.dz * ti.t + pz * off * ti.side;
      const nearSlider = Math.hypot(wx - sw.x, wz - sw.z) < 0.8;
      this.toothDummy.position.set(wx, y + (h > 0.001 ? -0.14 * Math.min(1, h * 1.6) : 0) + 0.1, wz);
      this.toothDummy.rotation.set(0, Math.atan2(e.dx, e.dz), h > 0.001 ? -ti.side * Math.min(1, 0.35 + h * 0.35) : 0);
      this.toothDummy.scale.setScalar(nearSlider ? 0.001 : 1);
      this.toothDummy.updateMatrix();
      this.teeth.setMatrixAt(idx++, this.toothDummy.matrix);
    }
    this.teeth.instanceMatrix.needsUpdate = true;

    // スライダー
    this.sliderMesh.position.set(sw.x + Math.sin(simTime * 47) * 0.02 * this.activity, y, sw.z);
    this.sliderMesh.rotation.y = Math.atan2(-sw.dx, -sw.dz);
  }

  ringWorldPos(v) {
    this.ringMesh.getWorldPosition(v);
    return v;
  }

  dispose() {
    this.teeth.geometry.dispose();
    this.group.traverse((o) => { if (o.isMesh && o !== this.teeth) o.geometry.dispose(); });
    scene.remove(this.group);
  }
}

// ---------------------------------------------------------------------------
// スラブ（変形する布の床。天井ネットにも使う）
// ---------------------------------------------------------------------------

function makeSlabTexture(tracks, xHalf, zNear, zFar, opts = {}) {
  const W = 1024, H = 1024;
  return makeCanvasTexture(W, H, (g) => {
    const base = opts.net ? '#dcc9a6' : (opts.color || '#f6e3c8');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    if (opts.net) {
      // 網目
      g.strokeStyle = 'rgba(140,110,70,0.55)';
      g.lineWidth = 4;
      const step = 40;
      for (let x = -H; x < W + H; x += step) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke();
        g.beginPath(); g.moveTo(x + H, 0); g.lineTo(x, H); g.stroke();
      }
    } else {
      g.strokeStyle = 'rgba(197,160,120,0.4)';
      g.lineWidth = 2;
      g.setLineDash([9, 7]);
      const step = 60;
      for (let x = -H; x < W + H; x += step) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke();
        g.beginPath(); g.moveTo(x + H, 0); g.lineTo(x, H); g.stroke();
      }
      g.setLineDash([]);
      g.fillStyle = 'rgba(233,169,140,0.45)';
      for (let i = 0; i < 70; i++) {
        g.beginPath(); g.arc((i * 137.5) % W, (i * 89.3) % H, 4.5, 0, Math.PI * 2); g.fill();
      }
    }
    // 各エッジに沿ってテープ帯＋ステッチを描く
    const xC = opts.xC || 0;
    const toU = (x) => ((x - xC + xHalf) / (2 * xHalf)) * W;
    const toV = (z) => ((zNear - z) / (zNear - zFar)) * H;
    const tapePx = (0.95 / (2 * xHalf)) * W;
    for (const tr of tracks) {
      for (const e of tr.edges) {
        const a = tr.nodes[e.a], b = tr.nodes[e.b];
        g.strokeStyle = '#e2899d';
        g.lineWidth = tapePx * 2;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(toU(a.x), toV(a.z)); g.lineTo(toU(b.x), toV(b.z)); g.stroke();
        g.strokeStyle = 'rgba(255,243,234,0.9)';
        g.lineWidth = 3;
        g.setLineDash([11, 8]);
        for (const off of [-tapePx * 0.62, tapePx * 0.62]) {
          const px = -(toV(b.z) - toV(a.z)), pz = toU(b.x) - toU(a.x);
          const m = Math.hypot(px, pz) || 1;
          g.beginPath();
          g.moveTo(toU(a.x) + (px / m) * off, toV(a.z) + (pz / m) * off);
          g.lineTo(toU(b.x) + (px / m) * off, toV(b.z) + (pz / m) * off);
          g.stroke();
        }
        g.setLineDash([]);
      }
    }
  });
}

class Slab {
  // opts: { y, xHalf, zNear, zFar, trackSpecs: [spec], influence, net }
  constructor(opts) {
    this.y = opts.y;
    this.x = opts.x || 0;
    this.xHalf = opts.xHalf;
    this.zNear = opts.zNear;
    this.zFar = opts.zFar;
    this.influence = opts.influence || 4.8;
    this.net = !!opts.net;
    this.netContents = [];  // {type, x, z, released}
    this.tracks = opts.trackSpecs.map((spec) => new Track(spec, this));

    const w = this.xHalf * 2, d = this.zNear - this.zFar;
    const segX = Math.min(60, Math.round(w / 0.34));
    const segZ = Math.min(78, Math.round(d / 0.34));
    this.geo = new THREE.PlaneGeometry(w, d, segX, segZ);
    this.geo.rotateX(-Math.PI / 2);
    this.geo.translate(this.x, 0, (this.zNear + this.zFar) / 2);
    this.base = new Float32Array(this.geo.attributes.position.array);
    // 開いた区間を切り抜くアルファマップ（seamをまたぐポリゴン帯を透明化）
    this.alphaCanvas = document.createElement('canvas');
    this.alphaCanvas.width = 256;
    this.alphaCanvas.height = 256;
    this.alphaTex = new THREE.CanvasTexture(this.alphaCanvas);
    // 引き伸ばされたポリゴンがミップで黒線を失わないように
    this.alphaTex.generateMipmaps = false;
    this.alphaTex.minFilter = THREE.LinearFilter;
    this.alphaTex.magFilter = THREE.LinearFilter;
    this.alphaKey = -1;
    this.redrawAlpha();
    const mat = new THREE.MeshStandardMaterial({
      map: makeSlabTexture(this.tracks, this.xHalf, this.zNear, this.zFar, { net: this.net, color: opts.color, xC: this.x }),
      roughness: 0.95,
      side: THREE.DoubleSide,
      transparent: true,
      alphaMap: this.alphaTex,
      alphaTest: 0.4,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.position.y = this.y;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.extras = new THREE.Group();
    scene.add(this.extras);
    if (this.y > 0.5 && !this.net) {
      // 上の階：前縁の厚みと支柱で「2階」だと分かるように
      const edgeMat = new THREE.MeshStandardMaterial({ color: opts.edgeColor || 0x9fb8d8, roughness: 0.9 });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(this.xHalf * 2, 0.45, 0.3), edgeMat);
      edge.position.set(this.x, this.y - 0.22, this.zNear);
      edge.castShadow = !E2E;
      this.extras.add(edge);
      const postMat = new THREE.MeshStandardMaterial({ color: 0xc99560, roughness: 0.9 });
      for (const px of [this.x - this.xHalf + 0.7, this.x + this.xHalf - 0.7]) {
        for (const pz of [this.zNear - 0.5, this.zFar + 0.9]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, this.y, 10), postMat);
          post.position.set(px, this.y / 2, pz);
          post.castShadow = !E2E;
          this.extras.add(post);
        }
      }
    }
    if (this.net) {
      // 吊りロープ（天井のさらに上へ）
      const ropeMat = new THREE.MeshStandardMaterial({ color: 0xa8875f, roughness: 1 });
      for (const px of [this.x - this.xHalf + 0.3, this.x + this.xHalf - 0.3]) {
        for (const pz of [this.zNear - 0.4, this.zFar + 0.6]) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 6), ropeMat);
          rope.position.set(px, this.y + 4, pz);
          this.extras.add(rope);
        }
      }
    }
    this.wasOpen = true;
    this.deform();
  }

  setGhost(on) {
    this.mesh.material.opacity = on ? 0.22 : 1;
    for (const tr of this.tracks) {
      tr.group.traverse((o) => {
        if (o.material && o.material.transparent !== undefined) {
          o.material = o.material; // 素材共有のため透明化はスラブのみ
        }
      });
      tr.group.visible = !on;
    }
  }

  // 開いた経路に沿って黒線を描き、seam横断ポリゴンを切り抜く
  redrawAlpha() {
    const key = this.tracks.reduce((a, t) => a + t.openLen * 7.13 + t.slider.edge, 0);
    if (Math.abs(key - this.alphaKey) < 0.01) return;
    this.alphaKey = key;
    const S = 256;
    const g = this.alphaCanvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, S, S);
    const toU = (x) => ((x - this.x + this.xHalf) / (2 * this.xHalf)) * S;
    // CanvasTextureのflipYとPlaneGeometryのUVの組で、こちらは反転が必要
    const toV = (z) => S - ((this.zNear - z) / (this.zNear - this.zFar)) * S;
    g.strokeStyle = '#000';
    g.lineCap = 'round';
    g.lineWidth = Math.max(3, (0.7 / (2 * this.xHalf)) * S);
    for (const tr of this.tracks) {
      if (tr.openLen < 1.1) continue;
      const uStart = 0.5, uEnd = tr.openLen - 0.6;
      if (uEnd <= uStart) continue;
      for (const seg of tr.openPath) {
        const s0 = Math.max(seg.u0, uStart), s1 = Math.min(seg.u0 + seg.len, uEnd);
        if (s1 <= s0) continue;
        const e = tr.edges[seg.edge];
        const ax = tr.nodes[e.a].x, az = tr.nodes[e.a].z;
        const t0 = s0 - seg.u0, t1 = s1 - seg.u0;
        g.beginPath();
        g.moveTo(toU(ax + e.dx * t0), toV(az + e.dz * t0));
        g.lineTo(toU(ax + e.dx * t1), toV(az + e.dz * t1));
        g.stroke();
      }
    }
    this.alphaTex.needsUpdate = true;
  }

  // 点の開口情報（全トラックのうち最も近い開口）
  holeAt(x, z) {
    let best = { d: 1e9, h: 0 };
    for (const tr of this.tracks) {
      const r = tr.holeAt(x, z);
      if (r.h > 0 && r.d - r.h < best.d - best.h) best = r;
    }
    return best;
  }

  isOverHole(x, z, margin = 0) {
    const r = this.holeAt(x, z);
    return r.h > 0.02 && r.d < r.h - margin;
  }

  deform() {
    const opened = this.tracks.some((t) => t.openLen > 0.02);
    const lively = this.tracks.some((t) => t.activity > 0.02) || this.net;
    if (!opened && !this.wasOpen && !lively) return;
    const arr = this.geo.attributes.position.array, base = this.base;
    const R = this.influence;
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3], bz = base[i * 3 + 2];
      let x = bx, ny = 0, z = bz;
      const r = this.holeAt(bx, bz);
      if (r.h > 0.001 && r.d < R) {
        const t = clamp(r.d / R, 0, 1);
        const fall = 1 - t * t * (3 - 2 * t);
        const s = r.h * fall;
        x = bx + r.px * r.sideSign * s * (r.px !== undefined ? 1 : 0);
        z = bz + r.pz * r.sideSign * s;
        const bulge = 0.42 * s * (1 - s / r.h);
        const roll = 0.2 * Math.min(1, r.h * 1.6) * Math.exp(-(r.d * r.d) / 0.5);
        ny = bulge - roll;
      }
      if (this.net) {
        // 中身のふくらみ：上に頭が出て、下にも少し垂れる（ハンモック感）
        for (const c of this.netContents) {
          if (c.released) continue;
          const dd = (bx - c.x) * (bx - c.x) + (bz - c.z) * (bz - c.z);
          const w = Math.exp(-dd / (c.big ? 1.3 : 0.65));
          ny += (c.big ? 0.7 : 0.5) * w * (1 + 0.06 * Math.sin(simTime * 2.4 + c.x * 3));
          ny -= 0.25 * Math.exp(-dd / 2.4);
        }
        ny += Math.sin(bx * 1.3 + simTime * 0.7) * 0.04;
      }
      arr[i * 3] = x;
      arr[i * 3 + 1] = ny;
      arr[i * 3 + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.wasOpen = opened;
  }

  update() {
    for (const tr of this.tracks) {
      tr.activity = Math.max(0, tr.activity - 0.03);
      tr.updateMeshes();
    }
    this.redrawAlpha();
    this.deform();
  }

  dispose() {
    for (const tr of this.tracks) tr.dispose();
    this.geo.dispose();
    this.alphaTex.dispose();
    scene.remove(this.mesh);
    if (this.extras) {
      this.extras.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      scene.remove(this.extras);
    }
  }
}

// ---------------------------------------------------------------------------
// 落とすもの（v1のビルダー＋ベンチ）
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

// footW: x方向 / footL: z方向
// メッシュを作らずサイズだけ知りたい時用（各ビルダーの return 値と対応させておく）
const PROP_FOOT = {
  ball: { footL: 0.92, footW: 0.92 },
  block: { footL: 1.0, footW: 1.0 },
  pot: { footL: 1.2, footW: 1.2 },
  stool: { footL: 1.5, footW: 1.5 },
  chair: { footL: 1.45, footW: 1.4 },
  table: { footL: 2.6, footW: 2.15 },
  bench: { footL: 1.1, footW: 4.4 },
  slide: { footL: 3.3, footW: 1.55 },
  house: { footL: 4.4, footW: 4.0 },
};

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
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), propMats[pick(colorPool)]);
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
    g.add(potm, rim, b1, b2);
    return { g, footL: 1.2, footW: 1.2, height: 1.45 };
  },
  stool() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.2, 16), propMats[pick(colorPool)]);
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
  bench() {
    // 平行線をまたぐ横長ベンチ
    const g = new THREE.Group();
    const c = pick(colorPool);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.1), propMats[c]);
    seat.position.y = 0.95;
    for (const sx of [-1.9, 1.9]) for (const sz of [-0.38, 0.38]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), propMats.wood2);
      leg.position.set(sx, 0.45, sz);
      g.add(leg);
    }
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 0.14), propMats[c]);
    backrest.position.set(0, 1.5, -0.48);
    g.add(seat, backrest);
    return { g, footL: 1.1, footW: 4.4, height: 1.9 };
  },
  slide() {
    const g = new THREE.Group();
    const c1 = pick(colorPool), c2 = pick(colorPool);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.18), propMats[c1]);
    ladder.position.set(0, 0.85, 1.3);
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.3), propMats.cream);
      step.position.set(0, 0.4 + i * 0.5, 1.42);
      g.add(step);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.8), propMats[c2]);
    deck.position.set(0, 1.75, 0.75);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 2.6), propMats[c2]);
    ramp.position.set(0, 0.95, -0.55);
    ramp.rotation.x = 0.6;
    for (const sz of [0.4, 1.15]) for (const sx of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8), propMats.cream);
      leg.position.set(sx, 0.85, sz);
      g.add(leg);
    }
    g.add(ladder, deck, ramp);
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
    g.add(body, roof, door, win1, win2);
    return { g, footL: 4.4, footW: 4.0, height: 4.2 };
  },
};

// ---------------------------------------------------------------------------
// Prop（v1の状態機械＋任意方向の転倒＋多層落下）
// ---------------------------------------------------------------------------

const props = [];

class Prop {
  constructor(type, x, z, slab) {
    const built = PROP_BUILDERS[type]();
    this.type = type;
    this.slab = slab;               // いま立っている/落ちる元のスラブ
    this.root = new THREE.Group();
    this.tiltNode = new THREE.Group();
    this.body = built.g;
    this.tiltNode.add(this.body);
    this.root.add(this.tiltNode);
    this.root.position.set(x, slab ? slab.y : 0, z);
    scene.add(this.root);
    this.footL = built.footL;
    this.footW = built.footW;
    this.height = built.height;
    this.state = 'rest'; // rest wobble critical fall landed gone
    this.tilt = 0; this.tiltVel = 0;
    this.tiltDir = new THREE.Vector2(0, 1); // 倒れる水平方向
    this.wobbleTime = 0;
    this.critTime = 0;
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.spin = 0;
    this.sink = 0;
    this.landBounces = 0;
    this.wedgeCue = 0;
    this.spawning = false;
    this.spawnT = 0;
    this.squashT = 0;
    this.jiggleT = 0;
    this.body.traverse((o) => { if (o.isMesh) o.castShadow = !E2E; });
  }

  // 支持サンプリング：5×5
  sampleSupport() {
    const N = 5;
    const cx = this.root.position.x, cz = this.root.position.z;
    let over = 0, ox = 0, oz = 0, maxH = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const sx = cx + ((i / (N - 1)) - 0.5) * this.footW;
        const sz = cz + ((j / (N - 1)) - 0.5) * this.footL;
        const r = this.slab.holeAt(sx, sz);
        maxH = Math.max(maxH, r.h);
        if (r.h > 0.02 && r.d < r.h) { over++; ox += sx - cx; oz += sz - cz; }
      }
    }
    const total = N * N;
    const overFrac = over / total;
    let dir = new THREE.Vector2(0, 1);
    if (over > 0) {
      dir.set(ox / over, oz / over);
      if (dir.lengthSq() < 0.001) dir.set(0, 1);
      else dir.normalize();
    }
    const widthOK = 2 * maxH >= Math.min(this.footW, this.footL) * 0.88;
    return { overFrac, dir, widthOK, maxH };
  }

  update(dt) {
    if (this.spawning) { this.updateSpawn(dt); return; }
    switch (this.state) {
      case 'rest': case 'wobble': case 'critical': this.updateStanding(dt); break;
      case 'fall': this.updateFall(dt); break;
      case 'landed': break;
    }
    if (this.jiggleT > 0) {
      this.jiggleT -= dt;
      const k = Math.max(0, this.jiggleT) / 0.35;
      const s = 1 + Math.sin(k * Math.PI * 3) * 0.06 * k;
      this.body.scale.set(1 / s, s, 1 / s);
      if (this.jiggleT <= 0) this.body.scale.set(1, 1, 1);
    }
    if (this.squashT) {
      this.squashT += dt;
      const k = Math.min(1, this.squashT / 0.22);
      const sy = lerp(this.body.scale.y, 1, smoothstep(k));
      this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      if (k >= 1) { this.squashT = 0; this.body.scale.set(1, 1, 1); }
    }
  }

  updateStanding(dt) {
    const s = this.sampleSupport();
    const stuck = s.overFrac >= 0.5 && !s.widthOK;

    if (this.state === 'rest') {
      if (s.overFrac > 0.1) { this.state = 'wobble'; this.wobbleTime = 0; }
    }
    if (this.state === 'wobble') {
      this.wobbleTime += dt;
      if (s.overFrac <= 0.05) {
        if (Math.abs(this.tilt) > 0.12) Sound.boing();
        this.state = 'rest';
      } else if (s.overFrac >= 0.62 && s.widthOK && this.wobbleTime > WOBBLE_MIN_TIME) {
        this.state = 'critical';
        this.critTime = 0;
        Sound.creak(1);
      }
    }
    if (this.state === 'critical') {
      if (s.overFrac < 0.5 || !s.widthOK) {
        this.state = 'wobble'; // 間一髪セーフ
      } else {
        this.critTime += dt;
        if (this.critTime >= CRIT_HOLD + CRIT_LURCH) {
          this.startFall(s);
          return;
        }
      }
    }

    if (s.overFrac > 0.03) this.tiltDir.lerp(s.dir, Math.min(1, dt * 6)).normalize();

    let target = 0, tremble = 0;
    if (this.state === 'wobble') {
      target = 0.06 + 0.4 * s.overFrac;
      tremble = 0.25 + s.overFrac * 0.9;
      if (s.overFrac > 0.4 && rng() < dt * 2.2) Sound.creak(0.6 + s.overFrac * 0.5);
    } else if (this.state === 'critical') {
      const inLurch = this.critTime > CRIT_HOLD;
      target = inLurch ? 0.3 : 0.44;
      tremble = inLurch ? 0.4 : 1.6;
      if (rng() < dt * 5) Sound.creak(1);
    }

    const sinkTarget = stuck ? Math.min(0.16 * this.height, 0.26) : 0;
    this.sink = lerp(this.sink, sinkTarget, Math.min(1, dt * 6));
    if (stuck) {
      target = Math.max(target, 0.14);
      this.wedgeCue -= dt;
      const act = Math.max(...this.slab.tracks.map((t) => t.activity));
      if (this.wedgeCue <= 0 && act > 0.2) { Sound.wedge(); this.wedgeCue = 0.8; }
    }

    const K = 26, D = 5.5;
    this.tiltVel += (target - this.tilt) * K * dt - this.tiltVel * D * dt;
    this.tilt += this.tiltVel * dt;
    const tr = tremble * 0.02 * Math.sin(simTime * 43 + this.root.position.z * 7);
    this.applyStandPose(this.tilt + tr, Math.sin(simTime * 31 + this.root.position.x * 3) * tremble * 0.012);
  }

  applyStandPose(tilt, wob) {
    // tiltDir 方向へ、footprintの先端エッジを軸に倒れる
    const d = this.tiltDir;
    const ext = Math.abs(d.x) * this.footW * 0.5 + Math.abs(d.y) * this.footL * 0.5;
    // 支えている側（tiltDirの逆側）の端を軸に
    this.tiltNode.position.set(-d.x * ext, 0, -d.y * ext);
    this.body.position.set(d.x * ext, -this.sink, d.y * ext);
    const axis = new THREE.Vector3(d.y, 0, -d.x); // up×dir
    this.tiltNode.quaternion.setFromAxisAngle(axis, tilt + wob);
  }

  startFall(s) {
    this.state = 'fall';
    this.vy = -0.6;
    this.spin = rr(1.4, 2.2);
    Sound.whoosh();
    requestChase(this);
  }

  updateFall(dt) {
    const prevY = this.root.position.y;
    this.vy -= GRAVITY * dt;
    this.root.position.y += this.vy * dt;
    this.root.position.x += this.vx * dt;
    this.root.position.z += this.vz * dt;
    this.vx *= 1 - dt * 1.2;
    this.vz *= 1 - dt * 1.2;
    // 回転しながら穴中心へ吸い寄せ
    const axis = new THREE.Vector3(this.tiltDir.y, 0, -this.tiltDir.x);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, this.spin * dt);
    this.tiltNode.quaternion.premultiply(q);
    this.spin *= 1 - dt * 1.1;

    // 下のスラブ or 床下に着地（高速落下でも面交差で確実に判定）
    const below = slabsBelow(this.slab, this.root.position.x, this.root.position.z);
    for (const sl of below) {
      const surfaceY = sl.y;
      if (prevY > surfaceY - 0.02 && this.root.position.y <= surfaceY + 0.02 && this.vy < 0) {
        // 穴が開いていれば素通り
        if (this.canPassThrough(sl)) {
          this.slab = sl;
          Sound.whoosh();
          continue;
        }
        // 着地：このスラブの住人になる（また落とせる）
        this.root.position.y = surfaceY;
        this.slab = sl;
        this.state = 'rest';
        this.tilt = 0; this.tiltVel = 0;
        this.tiltNode.quaternion.identity();
        this.tiltNode.position.set(0, 0, 0);
        this.body.position.set(0, 0, 0);
        this.squash(0.72);
        Sound.thump(this.footL > 2);
        spawnPuff(this.root.position.x, surfaceY + 0.2, this.root.position.z, 6, 0.7 + this.footL * 0.2);
        return;
      }
    }
    // 床下クッション
    const bottomY = CUSHION_TOP + Math.max(0.25, this.height * 0.35);
    if (this.root.position.y <= bottomY && this.vy < 0) {
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
        onPropLanded(this);
      }
    }
  }

  canPassThrough(slab) {
    const cx = this.root.position.x, cz = this.root.position.z;
    let over = 0, maxH = 0;
    const pts = [[0, 0], [-this.footW / 3, 0], [this.footW / 3, 0], [0, -this.footL / 3], [0, this.footL / 3]];
    for (const [dx, dz] of pts) {
      const r = slab.holeAt(cx + dx, cz + dz);
      maxH = Math.max(maxH, r.h);
      if (r.h > 0.02 && r.d < r.h) over++;
    }
    return over >= 4 && 2 * maxH >= Math.min(this.footW, this.footL) * 0.85;
  }

  squash(k) {
    this.body.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    this.squashT = 0.001;
  }

  updateSpawn(dt) {
    this.spawnT += dt;
    if (this.spawnT < 0) { this.root.position.y = this.slab.y + 8.5; return; }
    const t = clamp(this.spawnT / 0.55, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    this.root.position.y = lerp(this.slab.y + 6.5, this.slab.y, e);
    if (t >= 1) {
      this.root.position.y = this.slab.y;
      this.spawning = false;
      this.squash(0.8);
      Sound.pop();
      spawnPuff(this.root.position.x, this.slab.y + 0.15, this.root.position.z, 4, 0.6);
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
// ラウンド定義
// ---------------------------------------------------------------------------

const slabs = [];

function slabsBelow(fromSlab, x, z) {
  const fromY = fromSlab ? fromSlab.y : 99;
  return slabs
    .filter((s) => s.y < fromY - 0.5 &&
      x > s.x - s.xHalf && x < s.x + s.xHalf && z < s.zNear && z > s.zFar)
    .sort((a, b) => b.y - a.y);
}

function straightSpec(x, z0, z1, gapeMax) {
  return { nodes: [[x, z0], [x, z1]], edges: [[0, 1]], gapeMax };
}

// 開口はレンズ（葉っぱ）形で、根元とスライダー先端の両方でゼロ幅にすぼまる。
// 枝や線の「先端そのもの」に物を置くと、全開してもスライダーがほぼ真上に
// 来てしまい永遠に開ききらない。先端から少し内側（既定2.5）へ引いた点を返す。
function insetFromEnd(ax, az, bx, bz, inset = 2.5) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const t = Math.max(0, len - inset);
  return { x: ax + (dx / len) * t, z: az + (dz / len) * t };
}

// 先端から insetFromEnd() で何単位ぶん離せば、指定した footprint の物体が
// 全開時に確実に「widthOK」を満たせるかを解析的に求める（安全マージン込み）。
// totalLen: そのトラックが全開したときの経路全長 / gapeMaxForTrack: そのトラックの上限開口幅
function safeLeafInset(totalLen, gapeMaxForTrack, minFootprintDim) {
  const gape = Math.min(gapeMaxForTrack, totalLen * GAPE_PER_LEN);
  const needed = minFootprintDim * 0.44; // widthOK 判定: 2*h >= minFootprintDim*0.88
  const ratio = needed / gape;
  if (ratio >= 0.98) return totalLen * 0.5; // このトラックでは物理的にほぼ不可能。中央に妥協配置
  const ang = Math.asin(Math.pow(ratio, 1 / 0.85));
  const safeFrac = 1 - ang / Math.PI - 0.05; // 少し余裕を持たせる
  return totalLen * (1 - Math.max(0.3, safeFrac));
}

// 各ラウンドのビルダー。戻り値: { slabs:[Slab], props:[Prop], ceiling? }
const ROUND_BUILDERS = [
  // R1: 1本の長い幹線（v1の感触）
  function r1() {
    const slab = new Slab({
      y: 0, xHalf: ROOM.xHalf, zNear: ROOM.zNear, zFar: ROOM.zFar,
      trackSpecs: [straightSpec(0, 7.6, -10.5)],
    });
    const ps = [
      new Prop('ball', rr(-0.1, 0.1), 5.2, slab),
      new Prop('block', rr(-0.1, 0.1), 3.5, slab),
      new Prop('pot', rr(-0.1, 0.1), 1.6, slab),
      new Prop('stool', rr(-0.1, 0.1), -1.2, slab),
      new Prop('table', 0, -5.2, slab),
    ];
    return { slabs: [slab], props: ps };
  },
  // R2: 分岐路線（幹線→左右の枝）
  function r2() {
    const spec = {
      nodes: [[0, 7.6], [0, 1.2], [-4.6, -6.4], [4.6, -6.4], [0, -8.5]],
      edges: [[0, 1], [1, 2], [1, 3], [1, 4]],
      gapeMax: 2.2, // 真ん中の線が脇の枝の物まで届かない幅
    };
    const slab = new Slab({
      y: 0, xHalf: ROOM.xHalf, zNear: ROOM.zNear, zFar: ROOM.zFar,
      trackSpecs: [spec],
    });
    const midA = { x: -2.6, z: -3.1 };  // 左枝の中間
    const midB = { x: 2.6, z: -3.1 };   // 右枝の中間
    // 枝の先端（葉ノード）から内側へ2.5離した点に置く（開口がすぼまる領域を避ける）
    const leafA = insetFromEnd(0, 1.2, -4.6, -6.4);
    const leafB = insetFromEnd(0, 1.2, 4.6, -6.4);
    const leafC = insetFromEnd(0, 1.2, 0, -8.5);
    const ps = [
      new Prop('ball', 0, 5.4, slab),
      new Prop(pick(['pot', 'block']), midA.x, midA.z, slab),
      new Prop(pick(['chair', 'stool']), midB.x, midB.z, slab),
      new Prop('slide', leafA.x, leafA.z, slab),
      new Prop(pick(['table', 'chair']), leafB.x, leafB.z, slab),
      new Prop('block', leafC.x, leafC.z, slab),
    ];
    return { slabs: [slab], props: ps };
  },
  // R3: 平行2線＋横倒し（ベンチは両方開けないと落ちない）
  function r3() {
    const slab = new Slab({
      y: 0, xHalf: ROOM.xHalf, zNear: ROOM.zNear, zFar: ROOM.zFar,
      trackSpecs: [straightSpec(-2.2, 7.6, -9.5, 1.6), straightSpec(2.2, 7.6, -9.5, 1.6)],
      influence: 2.6,
    });
    // 2線をまたぐベンチ(footW=4.4)は、線どうしの間隔(4.4)ちょうどに横幅が
    // 一致するため、footprint中央付近のサンプル点は"どちらの線からも遠い"。
    // 開口幅は先端に近いほどすぼまる（レンズ形）ので、先端寄りに置くと
    // 中央サンプルが必要な幅(隣接線から1.1)を満たせず、全開してもずっと
    // 「グラグラ」のまま絶対に落ちない。安全な位置まで根元寄りに置く。
    const ps = [
      new Prop('ball', -2.2, 5.0, slab),
      new Prop('block', 2.2, 4.4, slab),
      new Prop('bench', 0, 1.4, slab),
      new Prop('pot', -2.2, -1.0, slab),
      new Prop('table', 2.2, -2.6, slab),
      new Prop('bench', 0, -4.6, slab),
    ];
    return { slabs: [slab], props: ps };
  },
  // R4: 天井の荷物ネット＋床
  function r4() {
    const floor = new Slab({
      y: 0, xHalf: ROOM.xHalf, zNear: ROOM.zNear, zFar: ROOM.zFar,
      trackSpecs: [straightSpec(0, 7.6, -10.5)],
    });
    const net = new Slab({
      y: 6.6, x: 2.0, xHalf: 2.2, zNear: 7.4, zFar: -9.5,
      trackSpecs: [straightSpec(2.0, 6.6, -8.8, 1.5)],
      net: true, influence: 2.4,
    });
    net.netContents = [
      { type: 'ball', x: 2.0 + rr(-0.3, 0.3), z: 3.6 },
      { type: 'block', x: 2.0 + rr(-0.3, 0.3), z: 1.0 },
      { type: 'pot', x: 2.0 + rr(-0.3, 0.3), z: -1.8 },
      { type: 'stool', x: 2.0, z: -4.4, big: true },
      { type: 'ball', x: 2.0 + rr(-0.3, 0.3), z: -6.4 },
    ];
    const ps = [new Prop('block', 0, -7.8, floor)];
    return { slabs: [floor, net], props: ps, ceiling: net, focusFloor: true };
  },
  // R5: 2階建てタワー（連鎖落下。ロフトの穴と床の線は同じ x=0 に揃う）
  function r5() {
    const floor = new Slab({
      y: 0, xHalf: ROOM.xHalf, zNear: ROOM.zNear, zFar: ROOM.zFar,
      trackSpecs: [straightSpec(0, 7.6, -10.5)],
    });
    const loft = new Slab({
      y: 4.4, xHalf: 7.2, zNear: 1.6, zFar: -11.4,
      trackSpecs: [straightSpec(0, 0.8, -10.4)],
      color: '#e6ddf4', edgeColor: 0xb2a2d6,
    });
    const ps = [
      new Prop('ball', 0, -1.4, loft),
      new Prop('pot', 0, -4.2, loft),
      new Prop('chair', 0, -7.6, loft),
      new Prop('ball', 0, 5.6, floor),
      new Prop('stool', 0, 3.2, floor),
    ];
    return { slabs: [floor, loft], props: ps, tower: true };
  },
];

// R6以降：テンプレートを乱択して大物混合
function buildEndless(round) {
  const t = Math.floor(rng() * ROUND_BUILDERS.length);
  const built = ROUND_BUILDERS[t]();
  // 大物を追加：単線ラウンドのみ（分岐した枝は短く、house 級の footprint だと
  // 安全マージンが枝の途中の物と衝突するため対象外にする）
  const slab = built.slabs[0];
  const tr = slab.tracks[0];
  if (!built.ceiling && !built.tower && slab.tracks.length === 1 && tr.edges.length === 1 && rng() < 0.8) {
    const type = pick(['house', 'slide']);
    const foot = PROP_FOOT[type];
    const le = tr.edges[0];
    const totalLen = le.len;
    let inset = safeLeafInset(totalLen, tr.gapeMax, Math.min(foot.footL, foot.footW)) + 0.3;
    // 既存の一番奥の物（table）と footprint が重ならないよう、必要ならさらに奥へ
    const others = built.props.map((p) => ({
      distFromB: Math.hypot(tr.nodes[le.b].x - p.root.position.x, tr.nodes[le.b].z - p.root.position.z),
      halfExtent: Math.max(foot.footL, foot.footW) / 2 + 0.9,
    }));
    for (const o of others) {
      if (Math.abs(o.distFromB - inset) < o.halfExtent) inset = Math.max(inset, o.distFromB + o.halfExtent);
    }
    inset = Math.min(inset, totalLen * 0.75);
    const bx = tr.nodes[le.b].x - le.dx * inset;
    const bz = tr.nodes[le.b].z - le.dz * inset;
    built.props.push(new Prop(type, bx, bz, slab));
  }
  return built;
}

// ---------------------------------------------------------------------------
// ゲーム進行
// ---------------------------------------------------------------------------

const game = {
  round: 0,
  phase: 'play', // play | clear | closing | respawn
  phaseT: 0,
  ready: false,
  ceiling: null,
};

function startRound(round) {
  for (const s of slabs) s.dispose();
  slabs.length = 0;
  for (const p of props) p.dispose();
  props.length = 0;
  const built = round < ROUND_BUILDERS.length ? ROUND_BUILDERS[round]() : buildEndless(round);
  slabs.push(...built.slabs);
  game.ceiling = built.ceiling || null;
  built.props.forEach((p, i) => {
    p.spawning = true;
    p.spawnT = -i * 0.15;
    p.root.position.y = p.slab.y + 8.5;
    props.push(p);
  });
  // 最初の注目：通常は一番上のスラブ、天井ラウンドは床側
  const sorted = slabs.slice().sort((a, b) => (built.focusFloor ? a.y - b.y : b.y - a.y));
  focusTrack = sorted[0] ? sorted[0].tracks[0] : null;
  chaseProp = null;
  game.phase = 'play';
  game.phaseT = 0;
}

function onPropLanded(p) {
  const remaining = props.filter((q) => q.state !== 'landed');
  const netLeft = game.ceiling ? game.ceiling.netContents.filter((c) => !c.released).length : 0;
  if (remaining.length === 0 && netLeft === 0 && game.phase === 'play') {
    game.phase = 'clear';
    game.phaseT = 0;
  }
}

function updateGamePhase(dt) {
  game.phaseT += dt;
  if (game.phase === 'clear') {
    if (game.phaseT > 0.7) {
      Sound.chime();
      spawnSparkles(0, 0.6, 0, 22, 2.6);
      for (const p of props) {
        spawnSparkles(p.root.position.x, p.root.position.y + 0.5, p.root.position.z, 6, 1);
      }
      game.phase = 'closing';
      game.phaseT = 0;
    }
  } else if (game.phase === 'closing') {
    for (const p of props) {
      if (p.state === 'landed') {
        p.body.scale.multiplyScalar(1 - dt * 2.4);
        if (p.body.scale.y < 0.05) { p.state = 'gone'; p.root.visible = false; }
      }
    }
    let allClosed = true;
    for (const s of slabs) for (const tr of s.tracks) {
      if (!tr.retreat(dt)) allClosed = false;
    }
    if (allClosed && game.phaseT > 1.0) {
      game.round++;
      game.phase = 'respawn';
      game.phaseT = 0;
    }
  } else if (game.phase === 'respawn') {
    if (game.phaseT > 0.4) startRound(game.round);
  }

  // 天井ネット：開口が中身の真上に達したら降らせる
  if (game.ceiling) {
    for (const c of game.ceiling.netContents) {
      if (c.released) continue;
      const r = game.ceiling.holeAt(c.x, c.z);
      const need = c.big ? 0.66 : 0.46;
      if (r.h > need && r.d < r.h) {
        c.released = true;
        Sound.rustle();
        Sound.pop();
        const p = new Prop(c.type, c.x, c.z, game.ceiling);
        p.root.position.y = game.ceiling.y - 0.3;
        p.state = 'fall';
        p.vy = -0.5;
        // 網の縁を転がって床の線の近くへ落ちる
        p.vx = (0 - c.x) * rr(0.7, 1.0);
        p.spin = rr(-1.5, 1.5);
        props.push(p);
        requestChase(p);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 入力（一本指・複数スライダー対応）
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const input = {
  dragging: false,
  pointerId: -1,
  track: null,
  grabOffset: 0,
  lastInputAt: 0,
  hasEverDragged: false,
};

function allTracks() {
  const out = [];
  for (const s of slabs) for (const tr of s.tracks) out.push(tr);
  return out;
}

function screenToSlabPoint(cx, cy, slabY) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(slabY + 0.3));
  if (raycaster.ray.intersectPlane(plane, hitPoint)) return hitPoint;
  return null;
}

function projectToScreen(x, y, z) {
  const v = _v3.set(x, y, z).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function onPointerDown(e) {
  Sound.init();
  Sound.resume();
  input.lastInputAt = simTime;
  if (input.dragging || game.phase !== 'play') return;
  // 一番近い取っ手をつかむ
  const grabR = Math.min(window.innerWidth, window.innerHeight) * 0.14 + 28;
  let best = null, bestD = grabR;
  const rp = new THREE.Vector3();
  for (const tr of allTracks()) {
    tr.ringWorldPos(rp);
    const sp = projectToScreen(rp.x, rp.y, rp.z);
    const d = Math.hypot(e.clientX - sp.x, e.clientY - sp.y);
    if (d < bestD) { bestD = d; best = tr; }
  }
  if (best) {
    input.dragging = true;
    input.pointerId = e.pointerId;
    input.track = best;
    focusTrack = best;
    const wp = screenToSlabPoint(e.clientX, e.clientY, best.slab.y);
    if (wp) {
      const e0 = best.edges[best.slider.edge];
      const ax = best.nodes[e0.a].x, az = best.nodes[e0.a].z;
      const proj = (wp.x - ax) * e0.dx + (wp.z - az) * e0.dz;
      // 取っ手はスライダーの後方（進行方向の逆）にあるので、offsetは負が標準
      input.grabOffset = clamp(proj - best.slider.s, -2.6, 0.8);
    } else input.grabOffset = -1.4;
    input.hasEverDragged = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    Sound.pop();
    return;
  }
  // 物へのタップ→ぷるん
  const wp0 = screenToSlabPoint(e.clientX, e.clientY, 0);
  if (wp0) {
    for (const p of props) {
      const dxp = wp0.x - p.root.position.x, dzp = wp0.z - p.root.position.z;
      const r = Math.max(p.footL, p.footW) * 0.7 + 0.4;
      if (p.root.position.y > -1 && dxp * dxp + dzp * dzp < r * r) { p.jiggle(); return; }
    }
    spawnSparkles(wp0.x, 0.3, wp0.z, 4, 0.3);
  }
}

function onPointerMove(e) {
  if (!input.dragging || e.pointerId !== input.pointerId || !input.track) return;
  input.lastInputAt = simTime;
  const tr = input.track;
  const wp = screenToSlabPoint(e.clientX, e.clientY, tr.slab.y);
  if (!wp) return;
  // grabOffsetぶん戻した点を目標に（線から外れても最寄り射影で自動補正）
  const e0 = tr.edges[tr.slider.edge];
  input.targetX = wp.x - e0.dx * input.grabOffset;
  input.targetZ = wp.z - e0.dz * input.grabOffset;
}

function onPointerUp(e) {
  if (e.pointerId !== input.pointerId) return;
  input.dragging = false;
  input.pointerId = -1;
  input.track = null;
  input.targetX = input.targetZ = null;
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', onPointerUp);
window.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('dblclick', (e) => e.preventDefault());

function updateInput(dt) {
  if (input.dragging && input.track && input.targetX != null && game.phase === 'play') {
    input.track.moveToward(input.targetX, input.targetZ, dt);
  }
}

// ---------------------------------------------------------------------------
// カメラ（接写追従＋落下チェイス。ドラッグ中は固定）
// ---------------------------------------------------------------------------

let focusTrack = null;
let chaseProp = null;
let chaseTimer = 0;

function requestChase(p) {
  chaseProp = p;
  chaseTimer = 0;
}

const camPosCur = camBase.pos.clone();
const camTargetCur = camBase.target.clone();
const followCur = new THREE.Vector3();

function updateCamera(dt) {
  const tr = focusTrack || (allTracks()[0] || null);
  // 多層ラウンドは高く・引いた構図（上のスラブの奥まで指が届くように）
  const maxY = slabs.reduce((m, s) => Math.max(m, s.y), 0);
  const liftY = maxY * 0.5, liftZ = maxY * 0.85, liftT = maxY * 0.42;
  // スライダー追従（接写）：ドラッグ中は固定。
  // しばらく触っていないときは俯瞰へ戻る（全部の取っ手が見えるように）
  if (tr && (!input.dragging || game.phase !== 'play')) {
    const idle = simTime - input.lastInputAt;
    const overview = !chaseProp && (idle > 1.6 || game.phase !== 'play');
    const k = overview ? 0 : 1;
    const sw = tr.sliderWorld();
    const rootN = tr.nodes[0];
    const fx = clamp((sw.x - rootN.x) * 0.55, -5.5, 5.5) * k;
    const fz = clamp((sw.z - rootN.z) * 0.45, -6.2, 0) * k;
    followCur.lerp(_v3.set(fx, 0, fz), Math.min(1, dt * 1.8));
  }
  let pos = camBase.pos.clone().add(followCur);
  let target = camBase.target.clone().add(followCur);
  pos.y += liftY; pos.z += liftZ;
  target.y += liftT;

  // 落下チェイス：穴と着地点が同時に入るよう下へ寄る
  if (chaseProp) {
    chaseTimer += dt;
    const done = chaseProp.state === 'landed' || chaseProp.state === 'gone' ||
      chaseProp.state === 'rest' || chaseTimer > 3.2;
    if (done && chaseTimer > 1.2) chaseProp = null;
    else if (!input.dragging) {
      const pp = chaseProp.root.position;
      const w = smoothstep(clamp(chaseTimer / 0.5, 0, 1)) * 0.85;
      pos = pos.lerp(_v3.set(pp.x * 0.4, pos.y - 3.2, pos.z - 0.8), w);
      target = target.lerp(new THREE.Vector3(pp.x * 0.6, clamp(pp.y, -4.5, 5) - 0.6, pp.z * 0.7), w);
    }
  }

  camPosCur.lerp(pos, Math.min(1, dt * 5));
  camTargetCur.lerp(target, Math.min(1, dt * 5));
  camera.position.copy(camPosCur);
  camera.lookAt(camTargetCur);
}

// タワーのカットアウェイ：下の階を操作中は上の階の布を薄く
// （ジッパー・取っ手・物はそのまま見せる）
function updateGhosting() {
  const focusY = focusTrack ? focusTrack.slab.y : 0;
  for (const s of slabs) {
    // ネットは細い帯なので隠さない（中身のふくらみを見せ続ける）
    const ghost = s.y > focusY + 0.5 && !s.net;
    s.mesh.material.opacity = lerp(s.mesh.material.opacity, ghost ? 0.25 : 1, 0.1);
  }
}

// ---------------------------------------------------------------------------
// ヒント
// ---------------------------------------------------------------------------

const hintRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.1, 0.08, 8, 40),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
);
hintRing.rotation.x = -Math.PI / 2;
scene.add(hintRing);

const hintDots = [];
{
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hintTex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.setScalar(0.5);
    scene.add(s);
    hintDots.push(s);
  }
}
let hintDing = 0;

function updateHints(dt) {
  const idle = simTime - input.lastInputAt;
  const show = game.phase === 'play' && !input.dragging && (!input.hasEverDragged || idle > 7);
  const tr = focusTrack || allTracks()[0];
  const targetOp = show ? 0.55 + Math.sin(simTime * 4) * 0.35 : 0;
  hintRing.material.opacity = lerp(hintRing.material.opacity, targetOp, Math.min(1, dt * 6));
  hintRing.visible = hintRing.material.opacity > 0.02 && !!tr;
  if (hintRing.visible && tr) {
    const rp = new THREE.Vector3();
    tr.ringWorldPos(rp);
    hintRing.position.set(rp.x, tr.slab.y + 0.25, rp.z);
    hintRing.scale.setScalar(1 + Math.sin(simTime * 4) * 0.08);
  }
  for (let i = 0; i < hintDots.length; i++) {
    const s = hintDots[i];
    if (!show || !tr) { s.material.opacity = lerp(s.material.opacity, 0, Math.min(1, dt * 6)); continue; }
    const cyc = (simTime * 0.55 + i / hintDots.length) % 1;
    const u = tr.openLen + 1.0 + cyc * 5.5;
    const pt = tr.pointAt(u);
    s.position.set(pt.x, tr.slab.y + 0.35, pt.z);
    s.material.opacity = lerp(s.material.opacity, 0.75 * Math.sin(cyc * Math.PI), Math.min(1, dt * 10));
  }
  if (show && input.hasEverDragged && idle > 7) {
    hintDing -= dt;
    if (hintDing <= 0) { Sound.ding(); hintDing = 6; }
  }
}

// ---------------------------------------------------------------------------
// メインループ
// ---------------------------------------------------------------------------

startRound(0);
game.ready = true;

let timeScale = 1;
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
  simTime += dt;

  updateInput(dt);
  updateGamePhase(dt);
  for (const s of slabs) s.update();
  for (const p of props) p.update(dt);
  updateParticles(dt);
  updateCamera(dt);
  updateGhosting();
  updateHints(dt);

  for (const s of cellarStars) {
    s.position.y = s.userData.baseY + Math.sin(simTime * 0.8 + s.userData.bob) * 0.3;
  }

  renderer.render(scene, camera);
}
frame();

// ---------------------------------------------------------------------------
// E2E・検証用フック
// ---------------------------------------------------------------------------

window.__game = {
  get ready() { return game.ready; },
  get round() { return game.round; },
  get phase() { return game.phase; },
  tracks: () => allTracks().map((tr, i) => {
    const rp = new THREE.Vector3();
    tr.ringWorldPos(rp);
    return {
      i,
      slabY: tr.slab.y,
      openLen: tr.openLen,
      handle: projectToScreen(rp.x, rp.y, rp.z),
      nodes: tr.nodes.map((n) => ({ x: n.x, z: n.z })),
      edges: tr.edges.map((e) => ({ a: e.a, b: e.b })),
      sliderEdge: tr.slider.edge,
    };
  }),
  screenAt: (x, y, z) => projectToScreen(x, y, z),
  props: () => props.map((p) => ({
    type: p.type, state: p.state,
    x: p.root.position.x, y: p.root.position.y, z: p.root.position.z,
    slabY: p.slab ? p.slab.y : null,
  })),
  netContents: () => (game.ceiling ? game.ceiling.netContents.map((c) => ({ type: c.type, released: !!c.released })) : []),
  setTimeScale: (s) => { timeScale = s; },
  gotoRound: (n) => { if (E2E) { game.round = n; startRound(n); } },
};
