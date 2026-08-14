// 環境マップとディテールテクスチャを起動時に 1 度だけ焼く。
// 金属の映り込み・ツヤのハイライトは、この環境マップが出どころ。
import { ENV_SCALE } from '../light.js';
import { texture } from './glx.js';

const W = 128;
const H = 64;

// equirect: u = 方位 0..1, v = 仰角 0..1（1 が真上）
function envColor(u, v) {
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = (v - 0.5) * Math.PI;
  const up = Math.sin(theta);

  // 下半球: 暗い作業台。金属は「暗い所」があって初めて磨いて見える。
  if (up < 0) {
    const t = -up;
    const f = 0.30 * (1 - t * 0.55) + 0.05;
    return [f * 1.0, f * 0.88, f * 0.74];
  }

  // 上半球のベース: 地平線は暗く、天井に向かって明るくなる
  const b = 0.10 + Math.pow(up, 0.75) * 0.42;
  let r = b * 0.98;
  let g = b * 1.0;
  let bl = b * 1.06;

  // 大きな窓（左手前・やや上）— ハイライトの主役。ここだけ極端に明るい。
  const winPhi = -1.02;
  const winTheta = 0.34;
  const dp = angDelta(phi - winPhi);
  const dt = theta - winTheta;
  // 縦長の四角い窓。輪郭をはっきりさせると金属に「窓の形」が映る。
  const wx = Math.abs(dp) / 0.30;
  const wy = Math.abs(dt) / 0.52;
  const win = 1 - smoothstep(0.74, 1.0, Math.max(wx, wy));
  const halo = 1 - smoothstep(0.5, 2.6, Math.hypot(wx, wy));
  const wi = win * 8.0 + halo * 0.9;
  r += wi * 1.0;
  g += wi * 0.985;
  bl += wi * 0.95;

  // 天井の面光源（横に長い）
  const ct = 1 - smoothstep(0.55, 1.0, Math.abs(theta - 1.35) / 0.36);
  r += ct * 1.35;
  g += ct * 1.3;
  bl += ct * 1.22;

  // 右奥の小さな照明（リムの映り込み用）
  const lp = angDelta(phi - 2.15);
  const lt = theta - 0.42;
  const lamp = 1 - smoothstep(0.5, 1.0, Math.hypot(lp / 0.14, lt / 0.11));
  r += lamp * 2.6;
  g += lamp * 2.1;
  bl += lamp * 1.5;

  // 地平線の暗い帯（ここが金属の「締まり」を作る）
  const hz = 1 - smoothstep(0.0, 0.28, theta);
  r *= 1 - hz * 0.55;
  g *= 1 - hz * 0.58;
  bl *= 1 - hz * 0.6;

  return [r, g, bl];
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};
function angDelta(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// u 方向は巻き、v 方向は端を伸ばす分離可能ぼかし
function blur(src, w, h, radius) {
  const dst = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  const rr = Math.max(1, radius | 0);
  const wsum = [];
  let tot = 0;
  for (let i = -rr; i <= rr; i++) {
    const g = Math.exp((-i * i) / (2 * (rr / 2) * (rr / 2) + 1e-6));
    wsum.push(g);
    tot += g;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = -rr; i <= rr; i++) {
        const sx = (((x + i) % w) + w) % w;
        const o = (y * w + sx) * 3;
        const g = wsum[i + rr];
        a += src[o] * g;
        b += src[o + 1] * g;
        c += src[o + 2] * g;
      }
      const o = (y * w + x) * 3;
      tmp[o] = a / tot;
      tmp[o + 1] = b / tot;
      tmp[o + 2] = c / tot;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = -rr; i <= rr; i++) {
        const sy = Math.max(0, Math.min(h - 1, y + i));
        const o = (sy * w + x) * 3;
        const g = wsum[i + rr];
        a += tmp[o] * g;
        b += tmp[o + 1] * g;
        c += tmp[o + 2] * g;
      }
      const o = (y * w + x) * 3;
      dst[o] = a / tot;
      dst[o + 1] = b / tot;
      dst[o + 2] = c / tot;
    }
  }
  return dst;
}

function downsample(src, w, h) {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const dst = new Float32Array(nw * nh * 3);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const sx = Math.min(w - 1, x * 2 + i);
          const sy = Math.min(h - 1, y * 2 + j);
          const o = (sy * w + sx) * 3;
          a += src[o];
          b += src[o + 1];
          c += src[o + 2];
        }
      }
      const o = (y * nw + x) * 3;
      dst[o] = a / 4;
      dst[o + 1] = b / 4;
      dst[o + 2] = c / 4;
    }
  }
  return { data: dst, w: nw, h: nh };
}

function toBytes(f, n) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.min(255, Math.round((f[i * 3] / ENV_SCALE) * 255));
    out[i * 4 + 1] = Math.min(255, Math.round((f[i * 3 + 1] / ENV_SCALE) * 255));
    out[i * 4 + 2] = Math.min(255, Math.round((f[i * 3 + 2] / ENV_SCALE) * 255));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ラフネス別にぼかしたミップ列を持つ環境マップを作る。
export function bakeEnv(gl) {
  const base = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = envColor((x + 0.5) / W, (y + 0.5) / H);
      const o = (y * W + x) * 3;
      base[o] = c[0];
      base[o + 1] = c[1];
      base[o + 2] = c[2];
    }
  }
  const tex = texture(gl, { min: gl.LINEAR_MIPMAP_LINEAR, wrapS: gl.REPEAT });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  let data = base;
  let w = W;
  let h = H;
  let level = 0;
  const levels = [];
  while (true) {
    // レベルが上がるほど強くぼかす = ラフネスが上がる
    const blurred = level === 0 ? data : blur(data, w, h, 1 + level);
    levels.push({ data: blurred, w, h });
    gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, toBytes(blurred, w * h));
    if (w === 1 && h === 1) break;
    const d = downsample(blurred, w, h);
    data = d.data;
    w = d.w;
    h = d.h;
    level++;
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level);
  return { tex, maxLod: level };
}

// --- 微細ディテール ---------------------------------------------------------
// R: 細い研磨傷 / G: 曇り（ラフネス変調） / B: 大きなうねり / A: プリンの「す」
export function bakeDetail(gl, size = 256) {
  const px = new Uint8Array(size * size * 4);
  const rnd = mulberry(9871);
  // 値ノイズ 3 オクターブ
  const grid = (n) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) g[i] = rnd();
    return g;
  };
  const g8 = grid(8);
  const g16 = grid(16);
  const g32 = grid(32);
  const g64 = grid(64);
  const smp = (g, n, x, y) => {
    const fx = x * n;
    const fy = y * n;
    const x0 = Math.floor(fx) % n;
    const y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * n + x0];
    const b = g[y0 * n + x1];
    const c = g[y1 * n + x0];
    const d = g[y1 * n + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 研磨傷: 横方向に強く引き伸ばしたノイズ
      const scratch =
        smp(g64, 64, u * 3.0, v * 48.0) * 0.6 + smp(g32, 32, u * 1.5, v * 22.0) * 0.4;
      // 曇り・指紋
      const smudge = smp(g16, 16, u * 2, v * 2) * 0.6 + smp(g32, 32, u * 4, v * 4) * 0.4;
      // うねり
      const dent = smp(g8, 8, u, v);
      // プリンの気泡「す」: まばらな点
      let bub = 0;
      const b1 = smp(g64, 64, u * 6, v * 6);
      if (b1 > 0.86) bub = (b1 - 0.86) / 0.14;
      const o = (y * size + x) * 4;
      px[o] = Math.round(scratch * 255);
      px[o + 1] = Math.round(smudge * 255);
      px[o + 2] = Math.round(dent * 255);
      px[o + 3] = Math.round(Math.min(1, bub) * 255);
    }
  }
  const tex = texture(gl, {
    min: gl.LINEAR_MIPMAP_LINEAR,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
  });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
