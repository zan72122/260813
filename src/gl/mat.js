// 最小限の 4x4 / 3x3 行列。すべて列優先（WebGL の既定）。
export function ident() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mul(out, a, b) {
  const o = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  if (o !== out) out.set(o);
  return out;
}

export function translate(out, x, y, z) {
  out.set(ident());
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

export function scale(out, x, y, z) {
  out.set(ident());
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

export function rotateX(out, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.set(ident());
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

export function rotateY(out, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.set(ident());
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

export function rotateZ(out, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.set(ident());
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

// 回転 + 一様スケールのみを想定した法線行列（上 3x3 をそのまま使う）
export function normalMat3(out, m) {
  out[0] = m[0];
  out[1] = m[1];
  out[2] = m[2];
  out[3] = m[4];
  out[4] = m[5];
  out[5] = m[6];
  out[6] = m[8];
  out[7] = m[9];
  out[8] = m[10];
  return out;
}

// 使い回し用の一時領域
const t1 = ident();
const t2 = ident();

// 「原点に置いて、必要なら pivot まわりに X 軸回転」を 1 回で作る
export function place(out, x, y, z, rotX = 0, pivotY = 0, sx = 1) {
  translate(out, x, y, z);
  if (sx !== 1) {
    scale(t1, sx, sx, sx);
    mul(out, out, t1);
  }
  if (rotX !== 0) {
    translate(t1, 0, pivotY, 0);
    mul(out, out, t1);
    rotateX(t2, rotX);
    mul(out, out, t2);
    translate(t1, 0, -pivotY, 0);
    mul(out, out, t1);
  }
  return out;
}
