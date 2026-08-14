// 質感テストベンチ。ゲーム本体には触らず、材質だけを並べて確認する。
import { TAU, seedRandom, rand, rrange } from './util.js';
import {
  loadAssets, assetsReady, drawBeanSprite, drawBeanBlend,
  drawStickyMass, drawContactShadows, drawWetRim, drawThread, BEAN_ATLAS,
} from './natto.js';
import { drawBean, BEAN_LOOK, blendLook, drawStrand } from './art.js';

const STATES = ['dry', 'soaked', 'steamed', 'fermented', 'mixed'];
const LABEL = { dry: 'かたい豆', soaked: '水を吸った', steamed: 'むした', fermented: '発酵ご', mixed: '混ぜた' };

await loadAssets('./assets/');
if (!assetsReady()) document.body.insertAdjacentHTML('afterbegin',
  '<p style="color:#f88">assets が読めていません。npm run bake を実行してください。</p>');

/* ---------------- 1. 豆 1 粒 ---------------- */
const singles = document.getElementById('singles');
for (const s of STATES) {
  const wrap = document.createElement('div');
  const c = document.createElement('canvas');
  c.width = 200; c.height = 200;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#f6e6c6'); g.addColorStop(1, '#e2c99f');
  x.fillStyle = g; x.fillRect(0, 0, 200, 200);
  drawContactShadows(x, [{ x: 100, y: 108 }], 62, 0.26);
  drawBeanSprite(x, s, 0, 100, 100, 62, 0.15);
  wrap.appendChild(c);
  const cap = document.createElement('div');
  cap.className = 'cap'; cap.textContent = LABEL[s];
  wrap.appendChild(cap);
  singles.appendChild(wrap);
}

/* ---------------- 豆の配置を作る ---------------- */
function makeCluster(cx, cy, cols, rows, r, seed) {
  seedRandom(seed);
  const out = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push({
        x: cx + (i - (cols - 1) / 2) * r * 1.48 + rrange(-0.3, 0.3) * r,
        y: cy + (j - (rows - 1) / 2) * r * 1.22 + rrange(-0.3, 0.3) * r,
        rot: rrange(-TAU / 2, TAU / 2),
        s: rrange(0.84, 1.16),
        v: (rand() * BEAN_ATLAS.variants) | 0,
      });
    }
  }
  // 奥から手前へ描くために並べ替える
  out.sort((a, b) => a.y - b.y);
  return out;
}

// 糸は「離れた 2 粒を直線で結ぶ」のではなく「隣り合う粒のあいだに架かる」。
// 長い直線が走ると、とたんに手描きの線に見えてしまう。
function webs(beans, n, seed, r) {
  seedRandom(seed);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const a = (rand() * beans.length) | 0;
    const cand = beans
      .map((b, i) => ({ i, d: Math.hypot(b.x - beans[a].x, b.y - beans[a].y) }))
      .filter((o) => o.i !== a && o.d < r * (rand() < 0.3 ? 4.2 : 2.4))
      .sort((p, q) => p.d - q.d).slice(0, 5);
    if (!cand.length) continue;
    const c = cand[(rand() * cand.length) | 0];
    out.push({ a, b: c.i, d: c.d, ph: rand() * TAU, w: rrange(0.5, 1.35) });
  }
  return out;
}

function paintNatto(x, beans, r, sticky, t = 0) {
  drawContactShadows(x, beans, r, 0.20 + sticky * 0.14);
  drawStickyMass(x, beans, r, sticky);
  const ws = webs(beans, Math.round(sticky * 46), 99, r);
  const span = (w, A, B, i) => {
    // 端は粒の中心ではなく、相手側の表面あたりから出す
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const k = r * 0.52 / d;
    return {
      ax: A.x + dx * k, ay: A.y + dy * k - r * 0.22,
      bx: B.x - dx * k, by: B.y - dy * k - r * 0.22,
      sag: d * 0.26 + r * 0.05,
    };
  };
  // 豆の下の糸
  for (let i = 0; i < ws.length; i += 2) {
    const w = ws[i], A = beans[w.a], B = beans[w.b];
    const p = span(w, A, B, i);
    drawThread(x, p.ax, p.ay, p.bx, p.by, {
      width: r * 0.09 * w.w, sag: p.sag, wobble: r * 0.03, segs: 20,
      phase: w.ph + t, alpha: 0.5 + sticky * 0.3, shadow: false, curl: 0.4,
    });
  }
  for (const b of beans) {
    drawBeanBlend(x, 'fermented', 'mixed', sticky, b.v, b.x, b.y, r * (b.s || 1), b.rot);
  }
  drawWetRim(x, beans, r, sticky);
  // 豆の上の糸
  for (let i = 1; i < ws.length; i += 2) {
    const w = ws[i], A = beans[w.a], B = beans[w.b];
    const p = span(w, A, B, i);
    drawThread(x, p.ax, p.ay, p.bx, p.by, {
      width: r * 0.10 * w.w, sag: p.sag, wobble: r * 0.035, segs: 20,
      phase: w.ph + t, alpha: 0.55 + sticky * 0.35, curl: 0.4,
      beads: w.w > 1.3 ? 1 : 0,
    });
  }
}

/* ---------------- 2. 粘りの段階 ---------------- */
{
  const c = document.getElementById('mass');
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#f7e8ca'); g.addColorStop(1, '#e6cda2');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const cx = (c.width / steps) * (i + 0.5);
    const beans = makeCluster(cx, 150, 3, 3, 26, 7 + i);
    paintNatto(x, beans, 26, i / (steps - 1));
    x.fillStyle = 'rgba(60,40,20,0.5)';
    x.font = '12px system-ui';
    x.textAlign = 'center';
    x.fillText(`${Math.round((i / (steps - 1)) * 100)}%`, cx, 286);
  }
}

/* ---------------- 3. 接写と びよーん ---------------- */
{
  const c = document.getElementById('closeup');
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#f9ecd2'); g.addColorStop(1, '#e8d0a6');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  const beans = makeCluster(270, 240, 4, 3, 46, 21);
  paintNatto(x, beans, 46, 0.92);
}
{
  const c = document.getElementById('lift');
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#f9ecd2'); g.addColorStop(1, '#e8d0a6');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);

  const r = 34;
  const beans = makeCluster(270, 340, 5, 2, r, 33);
  const tip = { x: 268, y: 78 };
  seedRandom(5);
  const clump = [];
  for (let i = 0; i < 6; i++) {
    clump.push({
      x: tip.x + rrange(-1, 1) * r * 1.5, y: tip.y + rrange(0.2, 1.7) * r,
      rot: rrange(-0.7, 0.7), v: (rand() * BEAN_ATLAS.variants) | 0,
    });
  }
  paintNatto(x, beans, r, 0.95);

  // 伸びる糸
  seedRandom(11);
  for (let i = 0; i < 16; i++) {
    const A = beans[(rand() * beans.length) | 0];
    const B = clump[(rand() * clump.length) | 0];
    drawThread(x, A.x, A.y - r * 0.3, B.x + rrange(-0.4, 0.4) * r, B.y + r * 0.4, {
      width: r * 0.15 * rrange(0.5, 1.4), sag: r * 0.1, wobble: r * 0.08,
      phase: rand() * TAU, alpha: 0.9, tension: 0.8, segs: 22,
      beads: rand() < 0.4 ? 1 : 0,
    });
  }
  drawStickyMass(x, clump, r, 0.95);
  for (const b of clump) drawBeanSprite(x, 'mixed', b.v, b.x, b.y, r, b.rot);
  drawWetRim(x, clump, r, 0.95);
  // 棒
  x.fillStyle = '#c99257';
  x.fillRect(tip.x - 9, 0, 18, tip.y + r * 0.2);
}

/* ---------------- 4. 旧 / 新 ---------------- */
{
  const co = document.getElementById('old');
  const xo = co.getContext('2d');
  xo.fillStyle = '#f2dcb4'; xo.fillRect(0, 0, co.width, co.height);
  seedRandom(4);
  const beans = makeCluster(260, 150, 4, 3, 34, 4);
  const look = blendLook(BEAN_LOOK.fermented, BEAN_LOOK.mixed, 0.9);
  const ws = webs(beans, 22, 99, 34);
  for (const b of beans) drawBean(xo, b.x, b.y, 34, b.rot, look);
  for (const w of ws) {
    const A = beans[w.a], B = beans[w.b];
    drawStrand(xo, A.x, A.y, B.x, B.y, {
      width: 34 * 0.19 * w.w, sag: 4, wobble: 3, phase: w.ph, alpha: 0.9,
    });
  }

  const cn = document.getElementById('new');
  const xn = cn.getContext('2d');
  xn.fillStyle = '#f2dcb4'; xn.fillRect(0, 0, cn.width, cn.height);
  paintNatto(xn, makeCluster(260, 150, 4, 3, 34, 4), 34, 0.9);
}
