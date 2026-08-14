// 回転体（ラス）ベースのメッシュ生成。
// 断面プロファイル（半径と高さの列）を Y 軸まわりに回すだけで、
// 型・皿・プリン・液面のすべてを 1 つの仕組みで作れる。
//
// 出力属性:
//   aPos   位置（静止形状）
//   aNrm   法線（静止形状）
//   aTanU  方位方向の接線（頂点シェーダで変形後の法線を出すのに使う）
//   aTanV  プロファイル方向の接線
//   aUv    x = 方位 0..1 / y = 高さ 0..1 / z = 天面での中心度 0..1

export function lathe(profile, segments = 48, opts = {}) {
  const H = opts.height || 1;
  const rows = profile.length;
  const cols = segments + 1; // 継ぎ目を複製して uv を連続させる
  const n = rows * cols;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const tanU = new Float32Array(n * 3);
  const tanV = new Float32Array(n * 3);
  const uv = new Float32Array(n * 3);

  // プロファイル上の法線（2D）を中央差分で求める
  const pn = [];
  for (let i = 0; i < rows; i++) {
    const p0 = profile[Math.max(0, i - 1)];
    const p1 = profile[Math.min(rows - 1, i + 1)];
    let dr = p1.r - p0.r;
    let dy = p1.y - p0.y;
    const l = Math.hypot(dr, dy) || 1;
    dr /= l;
    dy /= l;
    // 断面の接線 (dr, dy) を 90 度回して外向き法線 (dy, -dr)
    pn.push([dy, -dr, l]);
  }

  let o = 0;
  for (let i = 0; i < rows; i++) {
    const p = profile[i];
    const [nr, ny] = pn[i];
    for (let j = 0; j < cols; j++) {
      const a = (j / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos[o * 3] = p.r * ca;
      pos[o * 3 + 1] = p.y;
      pos[o * 3 + 2] = p.r * sa;
      nrm[o * 3] = nr * ca;
      nrm[o * 3 + 1] = ny;
      nrm[o * 3 + 2] = nr * sa;
      // 方位接線
      tanU[o * 3] = -sa;
      tanU[o * 3 + 1] = 0;
      tanU[o * 3 + 2] = ca;
      // プロファイル接線
      const p0 = profile[Math.max(0, i - 1)];
      const p1 = profile[Math.min(rows - 1, i + 1)];
      let dr = p1.r - p0.r;
      let dy = p1.y - p0.y;
      const l2 = Math.hypot(dr, dy) || 1;
      dr /= l2;
      dy /= l2;
      tanV[o * 3] = dr * ca;
      tanV[o * 3 + 1] = dy;
      tanV[o * 3 + 2] = dr * sa;
      uv[o * 3] = j / segments;
      uv[o * 3 + 1] = p.y / H;
      uv[o * 3 + 2] = p.cap ?? 0;
      o++;
    }
  }

  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return {
    aPos: pos,
    aNrm: nrm,
    aTanU: tanU,
    aTanV: tanV,
    aUv: uv,
    index: new Uint16Array(idx),
    count: idx.length,
  };
}

// --- 具体的な断面 -----------------------------------------------------------

// プリン本体（下が広い円錐台 + 天面）。天面の縁はわずかに丸める。
export function puddingProfile(rb, rt, h, sideRows = 22) {
  const p = [];
  const fillet = 2.6;
  // 底面（皿に接する側）— 少しだけ丸める
  p.push({ r: 0, y: 0, cap: 1 });
  p.push({ r: rb * 0.55, y: 0, cap: 0.45 });
  p.push({ r: rb - 1.2, y: 0, cap: 0 });
  p.push({ r: rb, y: 0.9 });
  // 側面
  for (let i = 1; i <= sideRows; i++) {
    const t = i / sideRows;
    const y = 0.9 + (h - fillet - 0.9) * t;
    const r = rb + (rt - rb) * ((y - 0) / h);
    p.push({ r, y });
  }
  // 天面の丸み
  for (let i = 1; i <= 3; i++) {
    const a = (i / 4) * (Math.PI / 2);
    p.push({ r: rt - fillet * (1 - Math.cos(a)), y: h - fillet + fillet * Math.sin(a) });
  }
  // 天面
  const rTop = rt - fillet;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    p.push({ r: rTop * (1 - t), y: h, cap: t });
  }
  return p;
}

// プリン型（内側まで一続き）。upright=true なら開口が上。
export function moldProfile(rb, rt, h, wall) {
  const p = [];
  p.push({ r: 0, y: 0 });
  p.push({ r: rb * 0.6, y: 0 });
  p.push({ r: rb - 2, y: 0 });
  p.push({ r: rb, y: 1.6 });
  // 外側（横リブは法線マップで表現するのでここは素直な直線）
  const rows = 14;
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    p.push({ r: rb + (rt - rb) * t, y: 1.6 + (h - 1.6) * t });
  }
  // 口のふち（外へ少し巻く）
  p.push({ r: rt + 1.1, y: h + 0.7 });
  p.push({ r: rt + 0.4, y: h + 1.5 });
  p.push({ r: rt - wall + 0.6, y: h + 1.2 });
  // 内壁
  const irows = 10;
  const irb = rb - wall;
  const irt = rt - wall;
  for (let i = 0; i <= irows; i++) {
    const t = i / irows;
    p.push({ r: irt + (irb - irt) * t, y: h - (h - 2.2) * t });
  }
  // 内底
  p.push({ r: irb * 0.6, y: 2.0 });
  p.push({ r: 0, y: 1.9 });
  return p;
}

// 白い皿
export function plateProfile(R, h) {
  return [
    { r: 0, y: h, cap: 1 },
    { r: R * 0.3, y: h, cap: 0.7 },
    { r: R * 0.58, y: h - 0.15, cap: 0.4 },
    { r: R * 0.7, y: h + 0.1, cap: 0.2 },
    { r: R * 0.78, y: h + 0.7 },
    { r: R * 0.9, y: h + 1.3 },
    { r: R * 0.975, y: h + 1.5 },
    { r: R, y: h + 1.0 },
    { r: R, y: h - 1.2 },
    { r: R * 0.965, y: h - 2.4 },
    { r: R * 0.8, y: h - 4.4 },
    { r: R * 0.62, y: 1.2 },
    { r: R * 0.56, y: 0 },
    { r: R * 0.5, y: 0 },
    { r: R * 0.46, y: 1.6 },
    { r: 0, y: 2.2 },
  ];
}

// 鍋（片手鍋）。内側まで一続き。
export function potProfile(rb, rt, h, wall) {
  const p = [];
  p.push({ r: 0, y: 0 });
  p.push({ r: rb * 0.7, y: 0 });
  p.push({ r: rb - 2.5, y: 0 });
  p.push({ r: rb, y: 2.2 });
  const rows = 10;
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    p.push({ r: rb + (rt - rb) * t, y: 2.2 + (h - 2.2) * t });
  }
  p.push({ r: rt + 1.4, y: h + 0.8 });
  p.push({ r: rt + 0.5, y: h + 1.7 });
  p.push({ r: rt - wall + 0.7, y: h + 1.3 });
  const irows = 8;
  const irb = rb - wall;
  const irt = rt - wall;
  for (let i = 0; i <= irows; i++) {
    const t = i / irows;
    p.push({ r: irt + (irb - irt) * t, y: h - (h - 3.2) * t });
  }
  p.push({ r: irb * 0.65, y: 3.0 });
  p.push({ r: 0, y: 2.9 });
  return p;
}

// ボウル（丸い陶器）
export function bowlProfile(R, h, wall) {
  const p = [];
  const rows = 16;
  p.push({ r: 0, y: 0 });
  for (let i = 1; i <= rows; i++) {
    const a = (i / rows) * (Math.PI / 2);
    p.push({ r: R * Math.sin(a), y: h * (1 - Math.cos(a)) });
  }
  p.push({ r: R + 1.0, y: h + 0.6 });
  p.push({ r: R - wall + 0.5, y: h + 0.4 });
  for (let i = rows; i >= 1; i--) {
    const a = (i / rows) * (Math.PI / 2);
    p.push({ r: (R - wall) * Math.sin(a), y: h * (1 - Math.cos(a)) + wall * 0.8 });
  }
  p.push({ r: 0, y: wall * 0.8 });
  return p;
}

// 液面（ふちが盛り上がるメニスカス付き）
export function liquidProfile(R) {
  return [
    { r: 0, y: 0, cap: 1 },
    { r: R * 0.55, y: 0, cap: 0.5 },
    { r: R * 0.86, y: 0.05, cap: 0.15 },
    { r: R * 0.95, y: 0.35, cap: 0 },
    { r: R * 0.985, y: 0.95 },
    { r: R, y: 1.7 },
  ];
}

// --- GPU へのアップロード ----------------------------------------------------
export function upload(gl, prog, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bind = (name, arr, size) => {
    const loc = prog.a[name];
    if (loc == null || loc < 0) return;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  bind('aPos', mesh.aPos, 3);
  bind('aNrm', mesh.aNrm, 3);
  bind('aTanU', mesh.aTanU, 3);
  bind('aTanV', mesh.aTanV, 3);
  bind('aUv', mesh.aUv, 3);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.count };
}
