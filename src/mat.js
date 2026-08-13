// 列優先 4x4 / 3x3 行列ユーティリティ（依存なし・最小限）

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

/** 画面の短辺が fovMin ラジアンを占める投影行列（縦横どちらでも見た目が安定する） */
export function perspectiveMinAxis(out, fovMin, aspect, near, far) {
  const t = Math.tan(fovMin / 2);
  // 短辺方向の半画角を fovMin/2 に固定する
  const halfW = aspect >= 1 ? t * aspect : t;
  const halfH = aspect >= 1 ? t : t / aspect;
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = near / (halfW * near);
  out[5] = near / (halfH * near);
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** 短辺方向の半画角 tan 値（フルスクリーンシェーダと整合させるために使う） */
export function tanHalfMin(fovMin) {
  return Math.tan(fovMin / 2);
}

export function lookAt(out, eye, center, up) {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len < 1e-6) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }

  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

export function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function composeTRS(out, pos, rot3, scale) {
  // rot3: 3x3 回転（列優先9要素）
  out[0] = rot3[0] * scale; out[1] = rot3[1] * scale; out[2] = rot3[2] * scale; out[3] = 0;
  out[4] = rot3[3] * scale; out[5] = rot3[4] * scale; out[6] = rot3[5] * scale; out[7] = 0;
  out[8] = rot3[6] * scale; out[9] = rot3[7] * scale; out[10] = rot3[8] * scale; out[11] = 0;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}

export function mat3() {
  const m = new Float32Array(9);
  m[0] = m[4] = m[8] = 1;
  return m;
}

export function mul3(out, a, b) {
  const r = out === a || out === b ? new Float32Array(9) : out;
  for (let c = 0; c < 3; c++) {
    const b0 = b[c * 3], b1 = b[c * 3 + 1], b2 = b[c * 3 + 2];
    r[c * 3 + 0] = a[0] * b0 + a[3] * b1 + a[6] * b2;
    r[c * 3 + 1] = a[1] * b0 + a[4] * b1 + a[7] * b2;
    r[c * 3 + 2] = a[2] * b0 + a[5] * b1 + a[8] * b2;
  }
  if (r !== out) out.set(r);
  return out;
}

export function rotX3(out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out[0] = 1; out[1] = 0; out[2] = 0;
  out[3] = 0; out[4] = c; out[5] = s;
  out[6] = 0; out[7] = -s; out[8] = c;
  return out;
}

export function rotY3(out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out[0] = c; out[1] = 0; out[2] = -s;
  out[3] = 0; out[4] = 1; out[5] = 0;
  out[6] = s; out[7] = 0; out[8] = c;
  return out;
}

export function rotZ3(out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out[0] = c; out[1] = s; out[2] = 0;
  out[3] = -s; out[4] = c; out[5] = 0;
  out[6] = 0; out[7] = 0; out[8] = 1;
  return out;
}

export function transpose3(out, m) {
  const a = m[1], b = m[2], c = m[5];
  out[0] = m[0]; out[4] = m[4]; out[8] = m[8];
  out[1] = m[3]; out[3] = a;
  out[2] = m[6]; out[6] = b;
  out[5] = m[7]; out[7] = c;
  return out;
}

/** 列優先 3x3 × ベクトル */
export function xform3(out, m, v) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[3] * y + m[6] * z;
  out[1] = m[1] * x + m[4] * y + m[7] * z;
  out[2] = m[2] * x + m[5] * y + m[8] * z;
  return out;
}

/** mat4 の回転部分でベクトルを変換 */
export function xform4Dir(out, m, v) {
  const x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z;
  out[1] = m[1] * x + m[5] * y + m[9] * z;
  out[2] = m[2] * x + m[6] * y + m[10] * z;
  return out;
}

export function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

export function cross3(out, a, b) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 角度差を -PI..PI に折り返す */
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** フレームレート非依存の指数追従 */
export function approach(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}
