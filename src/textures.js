// すべてのテクスチャを canvas 上で手続き的に生成する。
// 外部アセットに依存しないので、モバイル回線でも初回表示が速い。
import * as THREE from 'three';
import { makeRng, clamp } from './util.js';

const N = 256;

// 256 周期でタイル可能な値ノイズ。
function makeNoise(seed) {
  const rng = makeRng(seed);
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = rng();
  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const i0 = xi & 255;
    const j0 = yi & 255;
    const i1 = (xi + 1) & 255;
    const j1 = (yi + 1) & 255;
    const a = g[j0 * N + i0];
    const b = g[j0 * N + i1];
    const c = g[j1 * N + i0];
    const d = g[j1 * N + i1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

// 基本周波数が 256 を割り切るのでタイル継ぎ目が出ない。
function fbm(noise, x, y, octaves, baseFreq) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(canvas, repeat = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// 塩田の畦（あぜ）の上面：踏み固められた土に、塩の結晶が点々と吹いている。
export function soilTexture() {
  const size = 512;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(11);
  const n2 = makeNoise(29);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const base = fbm(n1, u, v, 5, 8);
      const grit = fbm(n2, u, v, 4, 48);
      // 湿った砂土の色
      let r = 118 + base * 62 + grit * 26;
      let g = 100 + base * 56 + grit * 24;
      let b = 86 + base * 44 + grit * 22;
      // 白い塩の吹き出し
      const salt = clamp((fbm(n2, u + 0.31, v - 0.17, 4, 12) - 0.56) * 4.2, 0, 1);
      r += salt * 118;
      g += salt * 116;
      b += salt * 112;
      // 乾いてひび割れた筋
      const crack = 1 - clamp(Math.abs(fbm(n1, u + 0.7, v + 0.2, 3, 16) - 0.5) * 16, 0, 1);
      r -= crack * 34;
      g -= crack * 30;
      b -= crack * 26;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 6);
}

// 池の内側の斜面：水に濡れて色が濃く、塩の縁取りがある土。
export function bankTexture() {
  const size = 256;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(53);
  const n2 = makeNoise(97);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const base = fbm(n1, u, v, 5, 6);
      const grit = fbm(n2, u, v, 3, 40);
      let r = 86 + base * 56 + grit * 20;
      let g = 70 + base * 46 + grit * 18;
      let b = 60 + base * 38 + grit * 16;
      const salt = clamp((fbm(n2, u - 0.2, v + 0.4, 4, 10) - 0.6) * 5, 0, 1);
      r += salt * 130;
      g += salt * 126;
      b += salt * 124;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 4);
}

// 池の底：塩の結晶が固まった白い床。
export function saltBedTexture() {
  const size = 512;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(7);
  const n2 = makeNoise(131);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const base = fbm(n1, u, v, 5, 10);
      // 塩の板状結晶が作る多角形の割れ目
      const cell = 1 - clamp(Math.abs(fbm(n2, u, v, 3, 14) - 0.5) * 14, 0, 1);
      let r = 194 + base * 46;
      let g = 179 + base * 42;
      let b = 158 + base * 38;
      r -= cell * 26;
      g -= cell * 25;
      b -= cell * 22;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 5);
}

// 池の底そのもの。まだ水を張っていない池が「掘り込まれた窪み」だと
// 一目で分かるよう、周りの乾いた塩原よりはっきり暗く、湿らせておく。
export function pondFloorTexture() {
  const size = 512;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(619);
  const n2 = makeNoise(271);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const base = fbm(n1, u, v, 4, 18);
      const grit = fbm(n2, u, v, 4, 44);
      // 湿った黒い泥
      let r = 52 + base * 46 + grit * 16;
      let g = 46 + base * 42 + grit * 15;
      let b = 44 + base * 38 + grit * 14;
      // 前の工程で残った塩の膜が、まだらに白く浮いている
      const film = clamp((fbm(n2, u + 0.13, v - 0.29, 4, 20) - 0.53) * 3.4, 0, 1);
      r += film * 122;
      g += film * 118;
      b += film * 112;
      // 底に残った浅い水たまり
      const puddle = clamp((0.44 - fbm(n1, u - 0.4, v + 0.6, 3, 14)) * 4.0, 0, 1);
      r = r * (1 - puddle * 0.45) + puddle * 16;
      g = g * (1 - puddle * 0.42) + puddle * 22;
      b = b * (1 - puddle * 0.4) + puddle * 24;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 繰り返しは呼び出し側が実寸に合わせて指定する
  return finish(c, 1);
}

// 水門の板や杭に使う、風雨にさらされた杉板。
export function woodTexture() {
  const size = 256;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(211);
  const n2 = makeNoise(17);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 木目：横方向に強く引き伸ばしたノイズ
      const grain = fbm(n1, u * 0.35, v * 5.0, 4, 12);
      const ring = Math.sin((v * 26 + grain * 6) * Math.PI) * 0.5 + 0.5;
      const wear = fbm(n2, u, v, 4, 7);
      let r = 122 + ring * 30 + wear * 40;
      let g = 100 + ring * 26 + wear * 34;
      let b = 82 + ring * 20 + wear * 26;
      // 下端に染み込んだ水と塩の跡
      const damp = clamp((v - 0.62) * 3.2, 0, 1);
      r = r * (1 - damp * 0.42) + damp * 34;
      g = g * (1 - damp * 0.42) + damp * 30;
      b = b * (1 - damp * 0.4) + damp * 30;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 1);
}

// 水門の枠や樋のコンクリート。
export function concreteTexture() {
  const size = 256;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(83);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const base = fbm(n1, u, v, 5, 9);
      const stain = clamp((fbm(n1, u + 0.5, v * 2.5, 3, 5) - 0.45) * 2.6, 0, 1);
      let r = 150 + base * 52 - stain * 46;
      let g = 146 + base * 50 - stain * 44;
      let b = 138 + base * 46 - stain * 44;
      const i = (y * size + x) * 4;
      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(b, 0, 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 2);
}

// 空の雲。アルファ付きで空ドームに重ねる。
export function cloudTexture() {
  const size = 512;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = makeNoise(1013);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let a = fbm(n1, u, v, 6, 4);
      a = clamp((a - 0.46) * 3.1, 0, 1);
      // 高さによる減衰はシェーダで行う。ここで掛けると縦方向のタイル継ぎ目が出る。
      const i = (y * size + x) * 4;
      d[i] = 255;
      d[i + 1] = 252;
      d[i + 2] = 250;
      d[i + 3] = clamp(a * 255, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, 1);
}

// 岸辺の草むら。1 枚の板に房を描いてアルファテストで抜く。
export function grassTexture() {
  const size = 128;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = makeRng(404);
  for (let i = 0; i < 46; i++) {
    const x0 = rng() * size;
    const h = size * (0.42 + rng() * 0.55);
    const bend = (rng() - 0.5) * size * 0.42;
    const w = 1.6 + rng() * 2.6;
    const g = 96 + rng() * 66;
    ctx.strokeStyle = `rgba(${Math.floor(g * 0.86)},${Math.floor(g)},${Math.floor(g * 0.52)},1)`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, size);
    ctx.quadraticCurveTo(x0 + bend * 0.3, size - h * 0.55, x0 + bend, size - h);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 光の粒・ヒント表示に使う放射状グラデーション。
export function glowTexture() {
  const size = 128;
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 樋口から落ちる水のカーテン。縦に流れる筋と泡。
export function spillTexture() {
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const rng = makeRng(77);
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const lw = 1 + rng() * 4;
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + rng() * 0.55})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 6, h * 0.4, x + (rng() - 0.5) * 8, h * 0.7, x + (rng() - 0.5) * 5, h + 10);
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + rng() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 風の流れを見せる細長い筋。
export function streakTexture() {
  const w = 256;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
