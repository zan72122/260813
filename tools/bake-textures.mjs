// Turn the CC0 source maps into the handful of tiles the game loads.
//
//   node tools/bake-textures.mjs
//
// The important trick: the lighting is solved HERE, at build time, from the
// normal + AO + roughness maps, and baked into a single colour image. At run
// time the game just fills with a repeating pattern — exactly the same cost
// as a flat colour — yet the surface relief catches the light.
//
// One light direction is baked in, and the game keeps every hand-drawn
// highlight and shadow pointing the same way (see LIGHT in js/light.js), so
// photographed materials and drawn shapes agree about where the sun is.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('assets/source');
const OUT = path.resolve('assets/baked');
fs.mkdirSync(OUT, { recursive: true });

// Light comes from the upper left, slightly toward the viewer.
// Screen space: +x right, +y DOWN, +z out of the screen.
const LIGHT = [-0.42, -0.52, 0.74];

const RECIPES = [
  // Workshop timber: rods, shelf, wall planks, cutting board.
  { out: 'wood', src: 'wood', size: 256,
    grade: { sat: 0.96, bright: 1.03, contrast: 1.14 } },

  // Floor and the table in the finale.
  { out: 'floor', src: 'floor', size: 256,
    grade: { sat: 0.78, bright: 1.36, contrast: 0.96 } },

  // Green bamboo pulled round to a seasoned amber.
  { out: 'bamboo', src: 'bamboo', size: 256,
    grade: { hue: -40, sat: 0.46, bright: 1.32, contrast: 0.95 } },

  // The noren cloth: indigo, keeping the weave.
  { out: 'cloth', src: 'cloth', size: 256,
    grade: { tint: '#3f5f7d', tintAmt: 0.82, bright: 0.98, contrast: 1.1 } },

  // Dough skin. The carpet weave at this scale reads as the fibrous,
  // flour-dusted surface of hand-pulled dough — the single best find in the
  // material set.
  { out: 'dough', src: 'cloth', size: 256,
    // Map to luminance and re-tint rather than boosting saturation: the
    // carpet has a faint green cast that any saturation boost amplifies.
    grade: { tint: '#fff0d2', tintAmt: 1.0, lift: 0.9, gain: 0.78 } },

  // Loose flour on the board and in the air.
  { out: 'flour', src: 'snow', size: 192, relief: 0.55,
    grade: { tint: '#fffdf8', tintAmt: 0.97, lift: 0.87, gain: 0.62 } },

  // Ice in the finished bowl.
  { out: 'ice', src: 'snow', size: 192, relief: 1.3,
    grade: { tint: '#dcf0fb', tintAmt: 0.88, bright: 1.04, contrast: 1.15 } },
];

const b64 = (p) => fs.readFileSync(p).toString('base64');
function srcSet(name) {
  const g = (k) => {
    const p = path.join(SRC, `${name}_${k}.jpg`);
    return fs.existsSync(p) ? b64(p) : null;
  };
  return { color: g('color'), normal: g('normal'), ao: g('ao'), rough: g('rough') };
}

const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
});
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas><canvas id=t></canvas>');

await page.evaluate(() => {
  window.loadTo = async (data, w, h) => {
    if (!data) return null;
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + data;
    await img.decode();
    const t = document.getElementById('t');
    t.width = w; t.height = h;
    const g = t.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };

  window.rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  };
  window.hsl2rgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { const v = l * 255; return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  };
});

async function bake(r) {
  const maps = srcSet(r.src);
  const size = r.size;
  const dataUrl = await page.evaluate(async ([maps, size, light, grade, relief]) => {
    // Source tiles keep their aspect; wood is 2:1 and squashing it would put
    // the grain at the wrong scale.
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + maps.color;
    await img.decode();
    const ar = img.naturalWidth / img.naturalHeight;
    const W = ar >= 1 ? size : Math.round(size * ar);
    const H = ar >= 1 ? Math.round(size / ar) : size;

    const color = await window.loadTo(maps.color, W, H);
    const normal = await window.loadTo(maps.normal, W, H);
    const ao = await window.loadTo(maps.ao, W, H);
    const rough = await window.loadTo(maps.rough, W, H);

    const c = document.getElementById('c');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const outImg = g.createImageData(W, H);
    const o = outImg.data;

    const [lx, ly, lz] = light;
    // half-vector against a viewer straight on
    const hx = lx, hy = ly, hz = lz + 1;
    const hl = Math.hypot(hx, hy, hz);
    const Hx = hx / hl, Hy = hy / hl, Hz = hz / hl;

    const tint = grade.tint ? [
      parseInt(grade.tint.slice(1, 3), 16),
      parseInt(grade.tint.slice(3, 5), 16),
      parseInt(grade.tint.slice(5, 7), 16),
    ] : null;

    for (let i = 0; i < W * H; i++) {
      const k = i * 4;
      let R = color[k], G = color[k + 1], B = color[k + 2];

      // --- solve one directional light against the surface relief
      let nx = 0, ny = 0, nz = 1;
      if (normal) {
        nx = (normal[k] / 255) * 2 - 1;
        // NormalGL is +Y up; canvas y points down.
        ny = -((normal[k + 1] / 255) * 2 - 1);
        nz = (normal[k + 2] / 255) * 2 - 1;
        if (relief !== 1) { nx *= relief; ny *= relief; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
      }
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const occ = ao ? 0.34 + 0.66 * (ao[k] / 255) : 1;
      // wrapped diffuse: relief reads without any part going black
      const diff = (0.44 + 0.56 * ndl) * occ;

      const rg = rough ? rough[k] / 255 : 0.62;
      const shin = 5 + (1 - rg) * (1 - rg) * 110;
      const ks = 0.015 + (1 - rg) * (1 - rg) * 0.26;
      const ndh = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
      const spec = Math.pow(ndh, shin) * ks * 255;

      R = R * diff + spec;
      G = G * diff + spec;
      B = B * diff + spec;

      // --- grade
      if (tint) {
        let lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
        // Re-centre the luminance instead of scaling it: `lift` sets where the
        // mean lands and `gain` keeps the relief. Scaling a mid-grey source up
        // to dough-pale would otherwise flatten the very texture we came for.
        if (grade.lift !== undefined) {
          lum = grade.lift + (grade.gain ?? 1) * (lum - 0.5);
        }
        lum = Math.max(0, Math.min(1.25, lum));
        const a = grade.tintAmt ?? 1;
        R = R * (1 - a) + tint[0] * lum * a;
        G = G * (1 - a) + tint[1] * lum * a;
        B = B * (1 - a) + tint[2] * lum * a;
      }
      if (grade.hue || grade.sat !== undefined) {
        const [h, s, l] = window.rgb2hsl(R, G, B);
        const [r2, g2, b2] = window.hsl2rgb(h + (grade.hue || 0), Math.min(1, s * (grade.sat ?? 1)), l);
        R = r2; G = g2; B = b2;
      }
      if (grade.contrast !== undefined) {
        const ct = grade.contrast;
        R = (R - 128) * ct + 128;
        G = (G - 128) * ct + 128;
        B = (B - 128) * ct + 128;
      }
      const br = grade.bright ?? 1;
      o[k] = Math.max(0, Math.min(255, R * br));
      o[k + 1] = Math.max(0, Math.min(255, G * br));
      o[k + 2] = Math.max(0, Math.min(255, B * br));
      o[k + 3] = 255;
    }
    g.putImageData(outImg, 0, 0);
    return c.toDataURL('image/webp', 0.9);
  }, [maps, size, LIGHT, r.grade, r.relief ?? 1]);

  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, `${r.out}.webp`), buf);
  return buf.length;
}

// --- fully synthetic tiles ---------------------------------------------

async function bakeGrain() {
  const dataUrl = await page.evaluate(() => {
    const S = 256;
    const c = document.getElementById('c');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const im = g.createImageData(S, S);
    const d = im.data;
    // Value noise at two octaves, wrapped so the tile is seamless.
    const grid = (n) => {
      const a = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) a[i] = Math.random();
      return a;
    };
    const g1 = grid(64), g2 = grid(16);
    const smp = (a, n, x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      const at = (i, j) => a[((j % n) + n) % n * n + ((i % n) + n) % n];
      const a00 = at(xi, yi), a10 = at(xi + 1, yi), a01 = at(xi, yi + 1), a11 = at(xi + 1, yi + 1);
      return (a00 * (1 - sx) + a10 * sx) * (1 - sy) + (a01 * (1 - sx) + a11 * sx) * sy;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = smp(g1, 64, x / 4, y / 4) * 0.6 + smp(g2, 16, x / 16, y / 16) * 0.4;
        const v = 128 + (n - 0.5) * 74;
        const k = (y * S + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = v;
        d[k + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/webp', 0.9);
  });
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, 'grain.webp'), buf);
  return buf.length;
}

let total = 0;
for (const r of RECIPES) {
  const n = await bake(r);
  total += n;
  console.log(`${r.out.padEnd(8)} ${(n / 1024).toFixed(0).padStart(4)}KB`);
}
const gn = await bakeGrain();
total += gn;
console.log(`${'grain'.padEnd(8)} ${(gn / 1024).toFixed(0).padStart(4)}KB`);
console.log(`\ntotal ${(total / 1024).toFixed(0)}KB -> ${OUT}`);

await browser.close();
