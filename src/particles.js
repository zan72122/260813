// 霧・水滴・きらめきの粒。ワールド単位でシミュレーションし、
// 描画は instancing のビルボード1枚ずつ。数は必ず上限で止める。
import { Program, createQuad, PX_TO_CLIP } from './glutil.js';
import {
  MIST_SPEED, MIST_SPREAD, MIST_DRAG, MIST_GRAVITY, MIST_LIFE, FAR_LIFE, PARTICLE_CAPS,
} from './config.js';

const STRIDE = 8; // インスタンスあたり float 数

class Pool {
  constructor(cap) {
    this.cap = cap;
    this.n = 0;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.k = new Float32Array(cap);      // 用途は種類ごと（色相など）
    this.alpha = new Float32Array(cap);  // 計算後の見た目の濃さ
  }
  spawn() {
    if (this.n >= this.cap) return -1;
    return this.n++;
  }
  kill(i) {
    const last = --this.n;
    if (i !== last) {
      this.x[i] = this.x[last]; this.y[i] = this.y[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
      this.age[i] = this.age[last]; this.life[i] = this.life[last];
      this.size[i] = this.size[last]; this.grow[i] = this.grow[last];
      this.seed[i] = this.seed[last]; this.k[i] = this.k[last];
      this.alpha[i] = this.alpha[last];
    }
  }
  clear() { this.n = 0; }
}

export class Particles {
  constructor(gl, rng) {
    this.gl = gl;
    this.rng = rng;
    this.near = new Pool(PARTICLE_CAPS.near);
    this.far = new Pool(PARTICLE_CAPS.far);
    this.drop = new Pool(PARTICLE_CAPS.droplet);
    this.spark = new Pool(PARTICLE_CAPS.sparkle);
    this.wind = 0;
    this.windTarget = 0;
    this.quality = 1;

    this.buffers = new Map();
    this.quad = createQuad(gl);
    this._buildPrograms();
    this._vaos = new Map();
    this._data = new Map();
    for (const name of ['near', 'far', 'drop', 'spark']) {
      const pool = this[name];
      const buf = gl.createBuffer();
      const arr = new Float32Array(pool.cap * STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr.byteLength, gl.DYNAMIC_DRAW);
      this.buffers.set(name, buf);
      this._data.set(name, arr);
      this._vaos.set(name, this._makeVao(buf));
    }
  }

  _makeVao(instBuf) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  _buildPrograms() {
    const gl = this.gl;
    const VS = `
${PX_TO_CLIP}
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aA;   // x, y, size, alpha
layout(location = 2) in vec4 aB;   // seed, k, age01, extra
uniform vec2 uRes;
uniform vec2 uAntisolar;
uniform float uRadius;
out vec2 vP;
out vec4 vB;
out float vAlpha;
out float vBack;   // 対日点まわりの後方散乱（霧がふわっと明るくなる）
void main() {
  vec2 local = aQuad * 2.0 - 1.0;
  // 種ごとにわずかに歪ませて、同じ丸が並んで見えないようにする
  float sq = 1.0 + 0.16 * sin(aB.x * 17.0);
  vec2 p = aA.xy + local * aA.z * vec2(sq, 1.0 / sq);
  float dAnti = length(aA.xy - uAntisolar) / max(uRadius, 1.0);
  vBack = exp(-dAnti * dAnti * 1.6);
  vP = local;
  vB = aB;
  vAlpha = aA.w;
  gl_Position = pxToClip(p, uRes);
}`;

    const SOFT = `
float blob(vec2 p, float seed) {
  float r = length(p);
  float a = atan(p.y, p.x);
  // ふちを少しだけ揺らして、雲のような不定形にする
  r *= 1.0 - 0.12 * sin(a * 3.0 + seed * 25.0) - 0.07 * sin(a * 5.0 - seed * 11.0);
  // ふちだけやわらかく、芯はしっかり白い（うすい膜ばかりだと霧に見えない）
  float f = max(0.0, 1.0 - r);
  return f * (0.42 + 0.58 * f);
}`;

    // 濃度バッファ（虹の出る場所を決める）
    this.pDensity = new Program(gl, VS, `
in vec2 vP; in vec4 vB; in float vAlpha; in float vBack;
${SOFT}
void main() {
  float a = blob(vP, vB.x) * vAlpha;
  outColor = vec4(a, a * vB.y, 0.0, a);
}`, 'density');

    // 白い霧そのもの
    this.pMist = new Program(gl, VS, `
in vec2 vP; in vec4 vB; in float vAlpha; in float vBack;
uniform vec3 uSunTint;
uniform vec3 uShadeTint;
uniform float uWet;
${SOFT}
void main() {
  float f = blob(vP, vB.x);
  float a = f * vAlpha;
  if (a < 0.002) discard;
  // 太陽は背後にある。だから厚いところほど光を返してきて白く輝き、
  // ふちは空の色をすこし拾って青みが残る。
  float core = smoothstep(0.0, 0.7, f);
  vec3 col = mix(uShadeTint, uSunTint, 0.30 + 0.70 * core);
  col += vBack * 0.08;
  outColor = vec4(col * a, a);
}`, 'mist');

    // 主役の水滴（透明感とハイライト）
    this.pDrop = new Program(gl, VS, `
in vec2 vP; in vec4 vB; in float vAlpha; in float vBack;
uniform vec3 uSunTint;
uniform float uArc;
vec3 spectrumSoft(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c1 = vec3(0.62, 0.50, 0.92);
  vec3 c2 = vec3(0.45, 0.78, 0.96);
  vec3 c3 = vec3(0.68, 0.95, 0.68);
  vec3 c4 = vec3(1.00, 0.95, 0.62);
  vec3 c5 = vec3(1.00, 0.66, 0.55);
  float t = x * 4.0;
  if (t < 1.0) return mix(c1, c2, t);
  if (t < 2.0) return mix(c2, c3, t - 1.0);
  if (t < 3.0) return mix(c3, c4, t - 2.0);
  return mix(c4, c5, t - 3.0);
}
void main() {
  // しずくの形：下がふくらみ、上がすこしとがる
  vec2 p = vP;
  p.y += 0.14 * (1.0 - p.y * 0.5);
  float r = length(p * vec2(1.06, 0.92));
  float body = smoothstep(1.0, 0.55, r);
  if (body < 0.004) discard;
  float rim = smoothstep(0.68, 1.0, r) * smoothstep(1.04, 0.88, r);
  float spec = smoothstep(0.40, 0.0, length(p - vec2(-0.26, -0.30)));
  vec3 refr = spectrumSoft(0.5 + 0.45 * p.x + vB.y * 0.2);
  // すきとおっていて、ふちに光と色がたまる
  vec3 col = vec3(0.80, 0.90, 0.99) * 0.42;
  col += refr * (0.22 + 0.60 * uArc) * rim * 1.25;
  col += uSunTint * (spec * 1.10 + rim * 0.30);
  float a = vAlpha * (body * 0.34 + rim * 0.16 + spec * 0.80);
  outColor = vec4(col * a, a * 0.75);
}`, 'drop');

    // きらめき（十字の小さな光）
    this.pSpark = new Program(gl, VS, `
in vec2 vP; in vec4 vB; in float vAlpha; in float vBack;
vec3 hue(float h) {
  return 0.58 + 0.42 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
}
void main() {
  vec2 p = vP;
  float r = length(p);
  float core = pow(max(0.0, 1.0 - r), 3.0);
  float fl = max(0.0, 1.0 - abs(p.x) * 7.0) * max(0.0, 1.0 - abs(p.y) * 1.35);
  float fv = max(0.0, 1.0 - abs(p.y) * 7.0) * max(0.0, 1.0 - abs(p.x) * 1.35);
  float s = core * 1.25 + (fl + fv) * 0.45;
  if (s < 0.004) discard;
  vec3 col = mix(vec3(1.0), hue(vB.y), vB.z);
  outColor = vec4(col * s * vAlpha * 0.42, 0.0);
}`, 'spark');
  }

  reset() {
    this.near.clear(); this.far.clear(); this.drop.clear(); this.spark.clear();
  }

  /** その回の風。霧の流れを毎回すこし変える。 */
  setWind(w) { this.windTarget = w; this.wind = w; }

  emitMist(nozzleX, nozzleY, dirX, dirY, dtCount, power, rng, speedBase = MIST_SPEED) {
    for (let i = 0; i < dtCount; i++) {
      const idx = this.near.spawn();
      if (idx < 0) break;
      const spread = (rng() - 0.5) * 2 * MIST_SPREAD;
      const c = Math.cos(spread), s = Math.sin(spread);
      const dx = dirX * c - dirY * s;
      const dy = dirX * s + dirY * c;
      const sp = speedBase * rng.range(0.26, 1.18) * power;
      const jx = (rng() - 0.5) * 14, jy = (rng() - 0.5) * 14;
      const P = this.near;
      P.x[idx] = nozzleX + jx + dx * 12;
      P.y[idx] = nozzleY + jy + dy * 12;
      P.vx[idx] = dx * sp;
      P.vy[idx] = dy * sp;
      P.age[idx] = 0;
      P.life[idx] = rng.range(MIST_LIFE[0], MIST_LIFE[1]);
      P.size[idx] = rng.range(9, 16);
      P.grow[idx] = rng.range(13, 26);
      P.seed[idx] = rng();
      P.k[idx] = rng.range(0.6, 1.0);
    }
  }

  emitFar(nozzleX, nozzleY, dirX, dirY, count, power, rng, speedBase = MIST_SPEED) {
    for (let i = 0; i < count; i++) {
      const idx = this.far.spawn();
      if (idx < 0) break;
      const spread = (rng() - 0.5) * 2 * (MIST_SPREAD * 1.55);
      const c = Math.cos(spread), s = Math.sin(spread);
      const dx = dirX * c - dirY * s;
      const dy = dirX * s + dirY * c;
      const sp = speedBase * 0.8 * rng.range(0.30, 0.95) * power;
      const P = this.far;
      P.x[idx] = nozzleX + (rng() - 0.5) * 26;
      P.y[idx] = nozzleY + (rng() - 0.5) * 26;
      P.vx[idx] = dx * sp;
      P.vy[idx] = dy * sp;
      P.age[idx] = 0;
      P.life[idx] = rng.range(FAR_LIFE[0], FAR_LIFE[1]);
      P.size[idx] = rng.range(34, 58);
      P.grow[idx] = rng.range(30, 56);
      P.seed[idx] = rng();
      P.k[idx] = rng.range(0.3, 0.7);
    }
  }

  emitDroplets(nozzleX, nozzleY, dirX, dirY, count, power, rng, speedBase = MIST_SPEED) {
    for (let i = 0; i < count; i++) {
      const idx = this.drop.spawn();
      if (idx < 0) break;
      const spread = (rng() - 0.5) * 2 * 0.42;
      const c = Math.cos(spread), s = Math.sin(spread);
      const dx = dirX * c - dirY * s;
      const dy = dirX * s + dirY * c;
      const sp = speedBase * rng.range(0.5, 0.92) * power;
      const P = this.drop;
      P.x[idx] = nozzleX; P.y[idx] = nozzleY;
      P.vx[idx] = dx * sp; P.vy[idx] = dy * sp;
      P.age[idx] = 0;
      P.life[idx] = rng.range(1.0, 1.8);
      P.size[idx] = rng.range(3.2, 7.0);
      P.grow[idx] = 0;
      P.seed[idx] = rng();
      P.k[idx] = rng.range(-1, 1);
    }
  }

  emitSparkle(x, y, hue, rainbowness, rng, sizeScale = 1) {
    const idx = this.spark.spawn();
    if (idx < 0) return;
    const P = this.spark;
    P.x[idx] = x; P.y[idx] = y;
    P.vx[idx] = (rng() - 0.5) * 26;
    P.vy[idx] = (rng() - 0.5) * 26 - 8;
    P.age[idx] = 0;
    P.life[idx] = rng.range(0.42, 1.05);
    P.size[idx] = rng.range(3.5, 8.5) * sizeScale;
    P.grow[idx] = rng.range(-2, 8);
    P.seed[idx] = rng();
    P.k[idx] = hue + rainbowness * 1000; // k の整数部で虹色度を運ぶ
  }

  update(dt, time) {
    this.wind += (this.windTarget - this.wind) * (1 - Math.exp(-dt / 2.5));
    const gust = this.wind + Math.sin(time * 0.53) * 5 + Math.sin(time * 0.21 + 1.7) * 7;

    // 霧はうすい。重ねてはじめて濃くなる（＝噴いた量がそのまま見た目になる）
    this._step(this.near, dt, gust, time, MIST_DRAG, MIST_GRAVITY * 0.55, 0.40, 30);
    this._step(this.far, dt, gust * 0.7, time, MIST_DRAG * 0.8, MIST_GRAVITY * 0.3, 0.14, 18);
    this._step(this.drop, dt, gust * 0.3, time, 1.05, MIST_GRAVITY * 6.2, 0.95, 0);

    // きらめきは重力に乗らず、ふわっと消える
    const S = this.spark;
    for (let i = S.n - 1; i >= 0; i--) {
      S.age[i] += dt;
      if (S.age[i] >= S.life[i]) { S.kill(i); continue; }
      S.x[i] += S.vx[i] * dt;
      S.y[i] += S.vy[i] * dt;
      S.vy[i] += 12 * dt;
      const t = S.age[i] / S.life[i];
      S.alpha[i] = Math.sin(Math.min(1, t) * Math.PI) * 1.0;
    }
  }

  _step(P, dt, wind, time, drag, gravity, peak, turb) {
    const damp = Math.exp(-drag * dt);
    for (let i = P.n - 1; i >= 0; i--) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) { P.kill(i); continue; }
      // 粒ごとにゆらぎを持たせると、まっすぐな柱ではなく、もくもくした霧になる
      const sd = P.seed[i];
      const tx = turb ? Math.sin(time * 1.35 + sd * 41.0) * turb : 0;
      const ty = turb ? Math.cos(time * 1.07 + sd * 27.0) * turb * 0.7 : 0;
      P.vx[i] = P.vx[i] * damp + (wind + tx) * dt;
      P.vy[i] = P.vy[i] * damp + (gravity + ty) * dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      const t = P.age[i] / P.life[i];
      // 立ち上がりは速く、消えるのはゆっくり
      const fadeIn = Math.min(1, P.age[i] / 0.05);
      const fadeOut = 1 - Math.pow(Math.max(0, (t - 0.35) / 0.65), 1.5);
      P.alpha[i] = fadeIn * Math.max(0, fadeOut) * peak;
      P.size[i] += P.grow[i] * dt;
    }
  }

  /** ワールド座標 → 画面座標に変換してインスタンスバッファを埋める。 */
  _fill(name, camera, arcStrength) {
    const P = this[name];
    const arr = this._data.get(name);
    const sc = camera.scale;
    const cx = camera.width * 0.5;
    const hy = camera.horizonY;
    const px = camera.panX;
    let o = 0;
    for (let i = 0; i < P.n; i++) {
      const a = P.alpha[i];
      if (a <= 0.004) continue;
      arr[o] = cx + (P.x[i] - px) * sc;
      arr[o + 1] = hy + P.y[i] * sc;
      arr[o + 2] = P.size[i] * sc;
      arr[o + 3] = a;
      arr[o + 4] = P.seed[i];
      if (name === 'spark') {
        const k = P.k[i];
        arr[o + 5] = k % 1000;
        arr[o + 6] = Math.min(1, Math.floor(k / 1000) / 1);
      } else {
        arr[o + 5] = P.k[i];
        arr[o + 6] = P.age[i] / P.life[i];
      }
      arr[o + 7] = arcStrength;
      o += STRIDE;
    }
    const count = o / STRIDE;
    if (count > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get(name));
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr, 0, o);
    }
    return count;
  }

  _draw(name, prog, camera, uniforms, arcStrength) {
    const count = this._fill(name, camera, arcStrength);
    if (!count) return;
    const gl = this.gl;
    prog.use();
    prog.set('uRes', [camera.width, camera.height]);
    prog.set('uAntisolar', camera.antisolar);
    prog.set('uRadius', camera.radius);
    if (uniforms) prog.setAll(uniforms);
    gl.bindVertexArray(this._vaos.get(name));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  drawDensity(camera) {
    this._draw('far', this.pDensity, camera, null, 0);
    this._draw('near', this.pDensity, camera, null, 0);
  }

  drawMist(camera, sunTint, shadeTint) {
    const u = { uSunTint: sunTint, uShadeTint: shadeTint };
    this._draw('far', this.pMist, camera, u, 0);
    this._draw('near', this.pMist, camera, u, 0);
  }

  drawDroplets(camera, sunTint, arc) {
    this._draw('drop', this.pDrop, camera, { uSunTint: sunTint, uArc: arc }, arc);
  }

  drawSparkles(camera) {
    this._draw('spark', this.pSpark, camera, null, 0);
  }

  get counts() {
    return { near: this.near.n, far: this.far.n, drop: this.drop.n, spark: this.spark.n };
  }
}
