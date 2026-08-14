// WebGL2 の薄いラッパ。品質ティアの判定もここで持つ。
// WebGL2 が無い端末では null を返し、呼び出し側は Canvas2D の従来経路にフォールバックする。

export const TIER = { LOW: 0, MID: 1, HIGH: 2 };

export function createGL(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      desynchronized: true,
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  // 半精度浮動小数のレンダーターゲット（HDR とブルームに使う）
  gl.floatRT =
    !!gl.getExtension('EXT_color_buffer_float') ||
    !!gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  return gl;
}

// 端末の素性から初期ティアを推定する。実測で毎秒調整するのでここは大まかでよい。
export function guessTier() {
  const m = /[?&]q=([0-2])/.exec(location.search);
  if (m) return +m[1];
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const px = window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio || 1, 2);
  if (cores <= 4 && mem <= 3) return TIER.LOW;
  if (px > 2200000 && cores <= 6) return TIER.MID;
  return TIER.HIGH;
}

// 実測フレーム時間からティアを上下させる。
export class TierGovernor {
  constructor(initial) {
    this.tier = initial;
    this.acc = 0;
    this.n = 0;
    this.cooldown = 1.5;
    this.overBudget = 0;
    this.underBudget = 0;
    this.locked = /[?&]q=[0-2]/.test(location.search);
  }
  sample(dt) {
    if (this.locked) return this.tier;
    this.cooldown -= dt;
    if (this.cooldown > 0) return this.tier;
    this.acc += dt;
    this.n++;
    if (this.n < 45) return this.tier;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    if (avg > 0.0225) {
      // 22ms 超が続いたら落とす
      this.overBudget++;
      this.underBudget = 0;
      if (this.overBudget >= 2 && this.tier > TIER.LOW) {
        this.tier--;
        this.overBudget = 0;
        this.cooldown = 3;
      }
    } else if (avg < 0.0138) {
      // 余裕があれば戻す（一度だけ）
      this.underBudget++;
      this.overBudget = 0;
      if (this.underBudget >= 6 && this.tier < TIER.HIGH) {
        this.tier++;
        this.underBudget = 0;
        this.cooldown = 4;
      }
    }
    return this.tier;
  }
}

export function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error(`[gl] ${name} compile failed:\n${log}`);
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log || '');
    if (m) console.error(lines.slice(Math.max(0, +m[1] - 4), +m[1] + 2).join('\n'));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function program(gl, vsSrc, fsSrc, name = 'program') {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, name + '.vert');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.frag');
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(`[gl] ${name} link failed:\n${gl.getProgramInfoLog(p)}`);
    return null;
  }
  // uniform / attribute の位置を一度だけ引いて持つ
  p.u = {};
  p.a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    p.u[nm] = gl.getUniformLocation(p, nm);
  }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(p, i);
    p.a[info.name] = gl.getAttribLocation(p, info.name);
  }
  return p;
}

export function texture(gl, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.min ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.mag ?? gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrapS ?? gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrapT ?? gl.CLAMP_TO_EDGE);
  return t;
}

// 単純なオフスクリーン（色 1 枚 + 任意で深度）
export class Target {
  constructor(gl, w, h, opts = {}) {
    this.gl = gl;
    this.w = 0;
    this.h = 0;
    this.half = !!opts.half && gl.floatRT;
    this.depth = !!opts.depth;
    this.tex = texture(gl, opts);
    this.fbo = gl.createFramebuffer();
    if (this.depth) this.rb = gl.createRenderbuffer();
    this.resize(w, h);
  }
  resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (this.w === w && this.h === h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.half) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    if (this.depth) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        this.rb
      );
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }
}

// マルチサンプルのレンダーバッファ（アンチエイリアス用）。
// 解決（resolve）は blitFramebuffer で行う。
export class MSTarget {
  constructor(gl, w, h, samples, half) {
    this.gl = gl;
    this.samples = samples;
    this.half = half && gl.floatRT;
    this.w = 0;
    this.h = 0;
    this.fbo = gl.createFramebuffer();
    this.rbColor = gl.createRenderbuffer();
    this.rbDepth = gl.createRenderbuffer();
    this.resize(w, h);
  }
  resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (this.w === w && this.h === h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    const fmt = this.half ? gl.RGBA16F : gl.RGBA8;
    const s = this.samples;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, fmt, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.rbColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.rbDepth);
    // ドライバによっては RGBA16F のマルチサンプルが通らない。使えるかここで確かめる。
    this.complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }
}

// 画面いっぱいの三角形（フルスクリーンパス用）
export function fullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}
