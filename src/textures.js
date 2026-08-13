// 手続き生成テクスチャ（Canvas 2D）— 木目・レンガ・コンクリ床・スプライト類
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 決定的な擬似乱数（見た目の再現性のため）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grain(ctx, w, h, rnd, n, alpha, dark = true) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const s = 1 + rnd() * 2.4;
    ctx.fillStyle = dark && rnd() < 0.5
      ? `rgba(0,0,0,${alpha * rnd()})`
      : `rgba(255,255,255,${alpha * 0.55 * rnd()})`;
    ctx.fillRect(x, y, s, s);
  }
}

export function woodTexture(base = '#6b4a2f', w = 512, h = 512, seed = 7) {
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const planks = 6;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * h) / planks;
    const tint = (rnd() - 0.5) * 26;
    ctx.fillStyle = `rgba(${tint > 0 ? 255 : 0},${tint > 0 ? 230 : 0},0,${Math.abs(tint) / 255})`;
    ctx.fillRect(0, y0, w, h / planks);
    // 木目の筋
    for (let i = 0; i < 46; i++) {
      const yy = y0 + rnd() * (h / planks);
      ctx.strokeStyle = `rgba(30,16,8,${0.05 + rnd() * 0.10})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      for (let x = 0; x <= w; x += 32) {
        ctx.lineTo(x, yy + Math.sin(x * 0.02 + rnd() * 9) * 2.2 + (rnd() - 0.5) * 2);
      }
      ctx.stroke();
    }
    // 節
    if (rnd() < 0.8) {
      const kx = rnd() * w, ky = y0 + h / planks * (0.3 + rnd() * 0.4);
      const g = ctx.createRadialGradient(kx, ky, 1, kx, ky, 9 + rnd() * 8);
      g.addColorStop(0, 'rgba(28,15,7,.85)');
      g.addColorStop(1, 'rgba(28,15,7,0)');
      ctx.fillStyle = g; ctx.fillRect(kx - 20, ky - 20, 40, 40);
    }
    // 板の継ぎ目
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.fillRect(0, y0, w, 2);
  }
  grain(ctx, w, h, rnd, 2600, 0.07);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function benchTexture() {
  // 作業台天板: 焦げ跡・傷・使い込み
  const w = 512, h = 512;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const rnd = mulberry32(31);
  ctx.fillStyle = '#7a5a38'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const yy = rnd() * h;
    ctx.strokeStyle = `rgba(40,24,10,${0.06 + rnd() * 0.1})`;
    ctx.lineWidth = 0.5 + rnd() * 1.8;
    ctx.beginPath(); ctx.moveTo(0, yy);
    for (let x = 0; x <= w; x += 26) ctx.lineTo(x, yy + Math.sin(x * 0.015 + i) * 3);
    ctx.stroke();
  }
  // 焦げ跡（バーナー作業の痕跡）
  for (let i = 0; i < 9; i++) {
    const x = w * (0.25 + rnd() * 0.5), y = h * (0.3 + rnd() * 0.45);
    const r = 12 + rnd() * 30;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(18,10,6,${0.35 + rnd() * 0.3})`);
    g.addColorStop(0.6, 'rgba(30,16,6,.16)');
    g.addColorStop(1, 'rgba(30,16,6,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // 傷
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(220,190,150,${0.05 + rnd() * 0.12})`;
    ctx.lineWidth = 0.7;
    const x = rnd() * w, y = rnd() * h, a = rnd() * 7;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * (8 + rnd() * 42), y + Math.sin(a) * (8 + rnd() * 42));
    ctx.stroke();
  }
  grain(ctx, w, h, rnd, 2000, 0.06);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function brickTexture() {
  const w = 512, h = 512;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const rnd = mulberry32(99);
  ctx.fillStyle = '#4a3a3c'; ctx.fillRect(0, 0, w, h); // 目地
  const bw = 85, bh = 40;
  for (let row = 0; row < h / bh + 1; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const rr = rnd();
      const rcol = 96 + rr * 42, g = 52 + rr * 22, b = 46 + rr * 18;
      ctx.fillStyle = `rgb(${rcol | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      // レンガ表面のむら
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
        ctx.fillRect(x + 3 + rnd() * (bw - 8), y + 3 + rnd() * (bh - 8), 2 + rnd() * 5, 1 + rnd() * 3);
      }
    }
  }
  // 全体の煤け（上ほど暗く）
  const g2 = ctx.createLinearGradient(0, 0, 0, h);
  g2.addColorStop(0, 'rgba(10,8,14,.42)');
  g2.addColorStop(0.55, 'rgba(10,8,14,.08)');
  g2.addColorStop(1, 'rgba(10,8,14,.3)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, rnd, 3200, 0.08);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function floorTexture() {
  // 使い込まれたコンクリ床 + 中央の擦れ
  const w = 512, h = 512;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const rnd = mulberry32(55);
  ctx.fillStyle = '#3c3a42'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h, r = 24 + rnd() * 90;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const dark = rnd() < 0.6;
    g.addColorStop(0, dark ? 'rgba(18,17,22,.22)' : 'rgba(120,116,128,.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // ひび
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = 'rgba(14,13,18,.5)'; ctx.lineWidth = 1.1;
    let x = rnd() * w, y = rnd() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 作業位置の擦れ（明るく磨かれた跡）
  const gg = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, 190);
  gg.addColorStop(0, 'rgba(150,146,158,.18)');
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, rnd, 4200, 0.07);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, midStop = 0.25) {
  const c = canvas(size, size); const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(midStop, inner.replace(/,[^,]+\)$/, ',.5)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function flameSprite() {
  // トーチ炎: 青いコア + 橙の外炎（縦長）
  const w = 96, h = 160;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  let g = ctx.createRadialGradient(w / 2, h * 0.7, 2, w / 2, h * 0.55, h * 0.52);
  g.addColorStop(0, 'rgba(255,190,90,.95)');
  g.addColorStop(0.35, 'rgba(255,120,30,.55)');
  g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.52, w * 0.42, h * 0.48, 0, 0, 7); ctx.fill();
  g = ctx.createRadialGradient(w / 2, h * 0.78, 1, w / 2, h * 0.72, h * 0.26);
  g.addColorStop(0, 'rgba(210,235,255,1)');
  g.addColorStop(0.4, 'rgba(90,160,255,.85)');
  g.addColorStop(1, 'rgba(40,80,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.74, w * 0.2, h * 0.24, 0, 0, 7); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function windowTexture() {
  // 夜の窓: 群青の空 + 月 + 遠くの街明かり
  const w = 256, h = 320;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  const rnd = mulberry32(21);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a1030');
  g.addColorStop(0.7, '#141a44');
  g.addColorStop(1, '#232a55');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // 星
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    ctx.fillRect(rnd() * w, rnd() * h * 0.6, 1.4, 1.4);
  }
  // 月
  const mg = ctx.createRadialGradient(w * 0.72, h * 0.2, 2, w * 0.72, h * 0.2, 34);
  mg.addColorStop(0, 'rgba(255,250,225,1)');
  mg.addColorStop(0.35, 'rgba(240,235,205,.9)');
  mg.addColorStop(1, 'rgba(240,235,205,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.2, 36, 0, 7); ctx.fill();
  ctx.fillStyle = '#fdf6dc'; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.2, 15, 0, 7); ctx.fill();
  // 街のシルエット + 灯り
  ctx.fillStyle = '#05070f';
  for (let x = 0; x < w;) {
    const bw = 18 + rnd() * 30, bh = 30 + rnd() * 60;
    ctx.fillRect(x, h - bh, bw, bh);
    for (let k = 0; k < 6; k++) {
      if (rnd() < 0.5) {
        ctx.fillStyle = `rgba(255,${180 + rnd() * 60 | 0},90,${0.5 + rnd() * 0.5})`;
        ctx.fillRect(x + 3 + rnd() * (bw - 8), h - bh + 4 + rnd() * (bh - 10), 3, 4);
        ctx.fillStyle = '#05070f';
      }
    }
    x += bw + 3;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
