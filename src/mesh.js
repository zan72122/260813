// 手続き的なジオメトリ生成（position3 / normal3 / extra1 のインターリーブ）

function pushTri(V, I, a, b, c, extraFn) {
  // フラットシェーディング用に頂点を複製し、面法線を計算する
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const l = Math.hypot(nx, ny, nz) || 1;
  const base = V.length / 7;
  for (const p of [a, b, c]) {
    V.push(p[0], p[1], p[2], nx / l, ny / l, nz / l, extraFn ? extraFn(p) : 0);
  }
  I.push(base, base + 1, base + 2);
}

function finish(V, I) {
  return {
    verts: new Float32Array(V),
    indices: (V.length / 7 > 65535 ? new Uint32Array(I) : new Uint16Array(I)),
  };
}

/**
 * 宝石ふう結晶：n 角柱＋上下の錐（結晶ごとに形が少し変わる）
 */
export function makeCrystal(rng) {
  const sides = rng.int(6, 8);
  const R = rng.range(0.36, 0.46);
  const body = rng.range(0.90, 1.25);
  const capTop = rng.range(0.55, 0.85);
  const capBot = rng.range(0.34, 0.52);
  const taper = rng.range(0.82, 1.0);
  const twist = rng.range(-0.12, 0.12);

  const jitter = [];
  for (let i = 0; i < sides; i++) jitter.push(rng.range(0.93, 1.07));

  const top = [], bot = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rr = R * jitter[i];
    top.push([Math.cos(a + twist) * rr * taper, body * 0.5, Math.sin(a + twist) * rr * taper]);
    bot.push([Math.cos(a) * rr, -body * 0.5, Math.sin(a) * rr]);
  }
  const apexT = [0, body * 0.5 + capTop, 0];
  const apexB = [0, -body * 0.5 - capBot, 0];

  const V = [], I = [];
  const minY = apexB[1], maxY = apexT[1];
  const hFn = (p) => (p[1] - minY) / (maxY - minY);

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushTri(V, I, bot[i], bot[j], top[j], hFn);
    pushTri(V, I, bot[i], top[j], top[i], hFn);
    pushTri(V, I, top[i], top[j], apexT, hFn);
    pushTri(V, I, bot[j], bot[i], apexB, hFn);
  }
  const m = finish(V, I);
  m.height = maxY - minY;
  m.bottom = minY;
  m.radius = R;
  return m;
}

/** 偏光リング：XZ 平面の円環。extra は角度 [0,1) */
export function makeRing(inner = 1.02, outer = 1.42, seg = 128, y = 0.012) {
  const V = [], I = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const t0 = i / seg, t1 = (i + 1) / seg;
    const p = (r, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const base = V.length / 7;
    const quad = [
      [p(inner, a0), t0], [p(outer, a0), t0], [p(outer, a1), t1], [p(inner, a1), t1],
    ];
    for (const [pt, t] of quad) V.push(pt[0], pt[1], pt[2], 0, 1, 0, t);
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return finish(V, I);
}

/** 台座の円盤。extra は中心からの正規化半径 */
export function makeDisc(radius = 2.4, seg = 96, y = 0) {
  const V = [], I = [];
  V.push(0, y, 0, 0, 1, 0, 0);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    V.push(Math.cos(a) * radius, y, Math.sin(a) * radius, 0, 1, 0, 1);
  }
  for (let i = 1; i <= seg; i++) I.push(0, i, i + 1);
  return finish(V, I);
}
