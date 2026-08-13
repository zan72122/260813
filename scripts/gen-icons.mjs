#!/usr/bin/env node
/* eslint-disable no-undef -- Node組み込みスクリプト(Buffer/console)。ブラウザ向けsrc/配下とは
   別環境のビルド補助スクリプトのため、eslint.config.jsのグローバル追加はせずここで局所無効化する。 */
// public/icons/*.png をローカルで生成する(外部画像/CDN禁止のため、依存追加もせずNode組み込みの
// zlibだけでPNGを直接エンコードする。canvas系npmパッケージは使わない)。
// 「ゾウの顔」アイコンをゲームの暖色パレット(#fff8ef背景/#ffc9c0バッジ/#ff8a70アクセント)で描く。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// ---- 最小限のCRC32(PNGチャンク末尾用) ----
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 各行の先頭にフィルタタイプ0(none)を付与してから連結する。
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- ピクセル描画ヘルパー(アルファブレンド付き) ----
function makeCanvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  return { size, buf };
}
function setPixel(canvas, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const buf = canvas.buf;
  if (a >= 1) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
    return;
  }
  const dstA = buf[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  buf[i] = Math.round((r * a + buf[i] * dstA * (1 - a)) / outA);
  buf[i + 1] = Math.round((g * a + buf[i + 1] * dstA * (1 - a)) / outA);
  buf[i + 2] = Math.round((b * a + buf[i + 2] * dstA * (1 - a)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}
function fillRect(canvas, x0, y0, w, h, color) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(canvas.size, Math.ceil(y0 + h)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(canvas.size, Math.ceil(x0 + w)); x++) {
      setPixel(canvas, x, y, color[0], color[1], color[2], color[3] ?? 1);
    }
  }
}
function fillCircle(canvas, cx, cy, r, color) {
  const a = color[3] ?? 1;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(canvas.size, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(canvas.size, Math.ceil(cy + r + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= r) {
        // 端を1px分だけ薄くアンチエイリアスする
        const edge = r - d;
        const aa = edge < 1 ? Math.max(0, edge) : 1;
        setPixel(canvas, x, y, color[0], color[1], color[2], a * aa);
      }
    }
  }
}
function fillEllipse(canvas, cx, cy, rx, ry, color) {
  const a = color[3] ?? 1;
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(canvas.size, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(canvas.size, Math.ceil(cy + ry + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1) {
        const edge = (1 - d) * Math.min(rx, ry);
        const aa = edge < 1 ? Math.max(0, edge) : 1;
        setPixel(canvas, x, y, color[0], color[1], color[2], a * aa);
      }
    }
  }
}

const BG = [255, 248, 239];
const BADGE = [255, 201, 192];
const EAR = [201, 167, 156];
const HEAD = [216, 195, 180];
const BLUSH = [255, 138, 112, 0.45];
const EYE = [90, 74, 58];

/** size x size の「ゾウの顔」アイコンをRGBAバッファで描く。 */
function drawElephantIcon(size) {
  const canvas = makeCanvas(size);
  fillRect(canvas, 0, 0, size, size, [...BG, 1]);
  fillCircle(canvas, size * 0.5, size * 0.5, size * 0.47, [...BADGE, 1]);

  // 耳(左右)
  fillEllipse(canvas, size * 0.24, size * 0.48, size * 0.19, size * 0.24, [...EAR, 1]);
  fillEllipse(canvas, size * 0.76, size * 0.48, size * 0.19, size * 0.24, [...EAR, 1]);

  // 鼻(頭の下から垂れて先端がカール)
  const trunkStart = { x: size * 0.5, y: size * 0.58 };
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = trunkStart.x + Math.sin(t * 2.1) * size * 0.11 * t;
    const y = trunkStart.y + t * size * 0.32;
    const r = (size * 0.075 - size * 0.035 * t) * (1 - 0.15 * Math.sin(t * 6));
    fillCircle(canvas, x, y, Math.max(size * 0.02, r), [...HEAD, 1]);
  }
  // 鼻先のカール
  const tipT = 1;
  const tipX = trunkStart.x + Math.sin(tipT * 2.1) * size * 0.11 * tipT;
  const tipY = trunkStart.y + tipT * size * 0.32;
  fillCircle(canvas, tipX + size * 0.05, tipY - size * 0.01, size * 0.045, [...HEAD, 1]);

  // 頭(顔の土台、鼻の付け根より上に重ねて自然な輪郭にする)
  fillCircle(canvas, size * 0.5, size * 0.42, size * 0.27, [...HEAD, 1]);

  // ほっぺ(ブラッシュ)
  fillCircle(canvas, size * 0.34, size * 0.47, size * 0.05, BLUSH);
  fillCircle(canvas, size * 0.66, size * 0.47, size * 0.05, BLUSH);

  // 目
  fillCircle(canvas, size * 0.4, size * 0.38, size * 0.032, [...EYE, 1]);
  fillCircle(canvas, size * 0.6, size * 0.38, size * 0.032, [...EYE, 1]);

  return canvas.buf;
}

function writeIcon(size, filename) {
  const rgba = drawElephantIcon(size);
  const png = encodePng(size, size, rgba);
  writeFileSync(join(outDir, filename), png);
  console.log(`[gen-icons] wrote ${filename} (${size}x${size}, ${png.length} bytes)`);
}

writeIcon(192, "icon-192.png");
writeIcon(512, "icon-512.png");
writeIcon(180, "apple-touch-icon.png");
