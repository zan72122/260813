// Thin WebGL2 helpers: program compilation with cached uniforms, render targets,
// and the capability probe that decides between float and 8-bit-packed simulation.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  return gl;
}

export function probeCaps(gl, forcePacked = false) {
  const colorFloat = gl.getExtension('EXT_color_buffer_float');
  const colorHalf = gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const float = !forcePacked && !!(colorFloat || colorHalf);
  return {
    float,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    vertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    renderer: (() => {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    })(),
  };
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`[${label}] shader compile failed: ${log}\n${numbered}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vsSrc, fsSrc, label = 'program') {
    this.gl = gl;
    this.label = label;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + ':vs');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + ':fs');
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`[${label}] link failed: ${gl.getProgramInfoLog(p)}`);
    }
    this.program = p;
    this.uniforms = new Map();
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const loc = gl.getUniformLocation(p, info.name);
      if (!loc) continue;
      const base = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(base, { loc, type: info.type, size: info.size });
    }
    this.unit = 0;
  }

  use() {
    this.gl.useProgram(this.program);
    this.unit = 0;
    return this;
  }

  /** set('uName', value) — arrays go through the vector forms, numbers through scalars. */
  set(name, a, b, c, d) {
    const u = this.uniforms.get(name);
    if (!u) return this;
    const gl = this.gl;
    const T = gl;
    const arr = (a && a.length !== undefined) ? a : null;
    switch (u.type) {
      case T.FLOAT: arr ? gl.uniform1fv(u.loc, arr) : gl.uniform1f(u.loc, a); break;
      case T.FLOAT_VEC2: arr ? gl.uniform2fv(u.loc, arr) : gl.uniform2f(u.loc, a, b); break;
      case T.FLOAT_VEC3: arr ? gl.uniform3fv(u.loc, arr) : gl.uniform3f(u.loc, a, b, c); break;
      case T.FLOAT_VEC4: arr ? gl.uniform4fv(u.loc, arr) : gl.uniform4f(u.loc, a, b, c, d); break;
      case T.INT: case T.BOOL: arr ? gl.uniform1iv(u.loc, arr) : gl.uniform1i(u.loc, a); break;
      case T.INT_VEC2: gl.uniform2i(u.loc, a, b); break;
      case T.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, a); break;
      case T.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, a); break;
      default: break;
    }
    return this;
  }

  /** Bind a texture to the next free unit and point the sampler at it. */
  tex(name, texture) {
    const u = this.uniforms.get(name);
    if (!u) return this;
    const gl = this.gl;
    const unit = this.unit++;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.loc, unit);
    return this;
  }
}

export function createTexture(gl, w, h, opts = {}) {
  const {
    internalFormat = gl.RGBA8,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    filter = gl.LINEAR,
    wrap = gl.CLAMP_TO_EDGE,
    data = null,
  } = opts;
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

export class Target {
  constructor(gl, w, h, opts = {}) {
    this.gl = gl;
    this.width = w;
    this.height = h;
    this.opts = opts;
    this.texture = createTexture(gl, w, h, opts);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`framebuffer incomplete (0x${status.toString(16)}) at ${w}x${h}`);
    }
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    return this;
  }

  clear(r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return this;
  }

  resize(w, h) {
    if (w === this.width && h === this.height) return this;
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    this.width = w; this.height = h;
    this.texture = createTexture(gl, w, h, this.opts);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this;
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.fbo);
  }
}

/** Two targets that swap roles; `.src` is read, `.dst` is written. */
export class PingPong {
  constructor(gl, w, h, opts) {
    this.a = new Target(gl, w, h, opts);
    this.b = new Target(gl, w, h, opts);
  }
  get src() { return this.a; }
  get dst() { return this.b; }
  swap() { const t = this.a; this.a = this.b; this.b = t; }
}

/** A single triangle covering the viewport — one draw, no attribute juggling. */
export class ScreenQuad {
  constructor(gl) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

export const SCREEN_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
