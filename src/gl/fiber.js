// 海苔の繊維マットを起動時に一度だけ焼く。
// リアルタイムの制約から外れるので、繊維を1本ずつ数万本描ける。
// 出力は RGBA:
//   R,G = 接線空間の法線 xy（0.5 が平ら）
//   B   = 高さ（＝厚み。透過とアルベドに使う）
//   A   = 低周波のムラ（抄きムラ・縁のギザつきに使う）
import { rng } from '../util.js';

function heightMap(w, h, strokes, seed) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const r = rng(seed);

  // 下地: 抄いたときの大きなうねり
  x.fillStyle = '#404040';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 130; i++) {
    const px = r() * w, py = r() * h;
    const rad = (0.04 + r() * 0.13) * w;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const up = r() < 0.5;
    g.addColorStop(0, up ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  // 繊維本体。向きはほぼランダム（海苔は抄いたときに絡み合う）で、
  // わずかに横方向の癖を残す。
  x.lineCap = 'round';
  const S = w / 1024;
  for (let i = 0; i < strokes; i++) {
    const px = r() * w, py = r() * h;
    const len = (5 + r() * r() * 62) * S;
    const dir = r() < 0.62 ? (r() - 0.5) * 1.5 : (r() - 0.5) * 6.283;
    const bend = (r() - 0.5) * len * 0.5;
    const up = r() < 0.55;
    const a = 0.05 + r() * r() * 0.30;
    x.strokeStyle = up ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 0.85})`;
    x.lineWidth = (0.7 + r() * r() * 2.6) * S;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(
      px + Math.cos(dir) * len * 0.5 - Math.sin(dir) * bend,
      py + Math.sin(dir) * len * 0.5 + Math.cos(dir) * bend,
      px + Math.cos(dir) * len, py + Math.sin(dir) * len);
    x.stroke();
  }

  // ごく小さな穴（薄い所）。透過したときにここが光る。
  for (let i = 0; i < strokes * 0.03; i++) {
    const px = r() * w, py = r() * h;
    const rad = (0.6 + r() * r() * 5) * S;
    x.beginPath();
    x.ellipse(px, py, rad, rad * (0.5 + r()), r() * 6.283, 0, 6.283);
    x.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`;
    x.fill();
  }
  return x.getImageData(0, 0, w, h);
}

function mottleMap(w, h, seed) {
  const c = document.createElement('canvas');
  const sw = Math.max(8, w >> 4), sh = Math.max(8, h >> 4);
  c.width = sw; c.height = sh;
  const x = c.getContext('2d');
  const r = rng(seed);
  const img = x.createImageData(sw, sh);
  for (let i = 0; i < sw * sh; i++) {
    const v = 90 + r() * 150;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // 拡大スムージングでなめらかな低周波にする
  const big = document.createElement('canvas');
  big.width = w; big.height = h;
  const bx = big.getContext('2d');
  bx.imageSmoothingEnabled = true;
  bx.imageSmoothingQuality = 'high';
  bx.drawImage(c, 0, 0, w, h);
  return bx.getImageData(0, 0, w, h);
}

// 高さ場 → 法線（Sobel）。RGBA にまとめて返す。
export function buildFiberTexture(w, h, strokes, seed = 4242) {
  const hm = heightMap(w, h, strokes, seed).data;
  const mm = mottleMap(w, h, seed + 7).data;
  const out = new Uint8Array(w * h * 4);
  const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  const at = (x, y) => hm[(cl(y, h) * w + cl(x, w)) * 4];
  const strength = 2.4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = at(x - 1, y), r = at(x + 1, y);
      const u = at(x, y - 1), d = at(x, y + 1);
      // -1..1 に正規化した傾き
      let nx = (l - r) / 255 * strength;
      let ny = (u - d) / 255 * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      nx *= inv; ny *= inv;
      const o = (y * w + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = hm[o];
      out[o + 3] = mm[o];
    }
  }
  return { data: out, width: w, height: h };
}
