// 小さな WebGL2 ヘルパー。依存ライブラリなし。

export function createContext(canvas) {
  const opts = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    desynchronized: true,
  };
  const gl = canvas.getContext('webgl2', opts);
  if (!gl) return null;
  // 半精度浮動小数のレンダーターゲットが使えると、にじの階調がなめらかになる。
  gl.halfFloatRT = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
  gl.linearFloat = !!gl.getExtension('OES_texture_float_linear') || !!gl.getExtension('OES_texture_half_float_linear');
  return gl;
}

const HEADER_VS = `#version 300 es
precision highp float;
`;
const HEADER_FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
`;

export class Program {
  constructor(gl, vsSrc, fsSrc, name = 'program') {
    this.gl = gl;
    this.name = name;
    const vs = compileShader(gl, gl.VERTEX_SHADER, HEADER_VS + vsSrc, name + ':vs');
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, HEADER_FS + fsSrc, name + ':fs');
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`link failed (${name}): ` + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = p;
    this.uniforms = new Map();
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(base, gl.getUniformLocation(p, info.name));
    }
    this.attribs = new Map();
    const an = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < an; i++) {
      const info = gl.getActiveAttrib(p, i);
      this.attribs.set(info.name, gl.getAttribLocation(p, info.name));
    }
  }

  use() {
    this.gl.useProgram(this.prog);
    this._unit = 0;
    return this;
  }

  /** 値の形から型を推測してユニフォームを設定する。 */
  set(name, v) {
    const loc = this.uniforms.get(name);
    if (loc === undefined || loc === null) return this;
    const gl = this.gl;
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (typeof v === 'boolean') gl.uniform1i(loc, v ? 1 : 0);
    else if (v && v.__texture) {
      const unit = this._unit++;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, v.__texture);
      gl.uniform1i(loc, unit);
    } else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
    else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
    else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    return this;
  }

  setAll(obj) {
    for (const k in obj) this.set(k, obj[k]);
    return this;
  }
}

function compileShader(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => String(i + 1).padStart(3) + '| ' + l).join('\n');
    throw new Error(`compile failed (${name}): ${log}\n${numbered}`);
  }
  return s;
}

/** テクスチャをユニフォームとして渡すためのラッパ。 */
export function tex(texture) {
  return { __texture: texture };
}

export class RenderTarget {
  constructor(gl, w, h, { float = false, filter = null, format = null } = {}) {
    this.gl = gl;
    this.width = 0;
    this.height = 0;
    this.float = float && gl.halfFloatRT;
    this.filter = filter || gl.LINEAR;
    this.formatOverride = format;
    this.fbo = gl.createFramebuffer();
    this.texture = gl.createTexture();
    this.resize(w, h);
  }

  resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height) return this;
    const gl = this.gl;
    this.width = w;
    this.height = h;
    const internal = this.formatOverride || (this.float ? gl.RGBA16F : gl.RGBA8);
    const type = this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE && this.float) {
      // 浮動小数が使えない端末では 8bit に落とす。
      this.float = false;
      this.width = 0;
      this.height = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return this.resize(w, h);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this;
  }

  bind(clear = null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    if (clear) {
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    return this;
  }

  get uniform() { return { __texture: this.texture }; }
}

export function bindScreen(gl, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
}

/** 0..1 の単位クアッド。全画面パスにもスプライトにも使う。 */
export function createQuad(gl) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return vbo;
}

/** 全画面三角形パス用の VAO をつくる。 */
export function createFullscreen(gl) {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export const FULLSCREEN_VS = `
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** 画面ピクセル（左上原点・y下向き）を uv から求める共通スニペット。 */
export const PX_FROM_UV = `
vec2 pxFromUv(vec2 uv, vec2 res) { return vec2(uv.x * res.x, (1.0 - uv.y) * res.y); }
`;

/** 画面ピクセル（左上原点・y下向き）→ クリップ座標。 */
export const PX_TO_CLIP = `
vec4 pxToClip(vec2 p, vec2 res) {
  vec2 n = p / res;
  return vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
}
`;

export const NOISE_GLSL = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;
