// WebGL2 の薄いラッパ

export function createGL(canvas) {
  const opts = {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    desynchronized: true,
  };
  const gl = canvas.getContext('webgl2', opts);
  if (!gl) throw new Error('WebGL2 not supported');
  return gl;
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '';
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');
    throw new Error(`shader compile failed [${label}]\n${log}\n${numbered}`);
  }
  return sh;
}

export class Program {
  constructor(gl, vsSrc, fsSrc, label = 'prog') {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + '.vert');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + '.frag');
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`link failed [${label}]: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.p = p;
    this.loc = new Map();
  }
  use() { this.gl.useProgram(this.p); return this; }
  u(name) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.p, name));
    return this.loc.get(name);
  }
  f(n, v) { this.gl.uniform1f(this.u(n), v); return this; }
  i(n, v) { this.gl.uniform1i(this.u(n), v); return this; }
  v2(n, x, y) { this.gl.uniform2f(this.u(n), x, y); return this; }
  v3(n, x, y, z) { this.gl.uniform3f(this.u(n), x, y, z); return this; }
  v4(n, x, y, z, w) { this.gl.uniform4f(this.u(n), x, y, z, w); return this; }
  m3(n, m) { this.gl.uniformMatrix3fv(this.u(n), false, m); return this; }
  m4(n, m) { this.gl.uniformMatrix4fv(this.u(n), false, m); return this; }
  tex(n, unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.u(n), unit);
    return this;
  }
}

/** position(3) + normal(3) + extra(1) をインターリーブした VAO */
export function createMeshVAO(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);

  const stride = 7 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  const type = mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  return { vao, vbo, ibo, count: mesh.indices.length, type };
}

export function destroyMeshVAO(gl, m) {
  if (!m) return;
  gl.deleteVertexArray(m.vao);
  gl.deleteBuffer(m.vbo);
  gl.deleteBuffer(m.ibo);
}

/** 画面いっぱいの三角形（属性なし・gl_VertexID で生成） */
export function createFullscreenVAO(gl) {
  const vao = gl.createVertexArray();
  return { vao, count: 3 };
}

export class RenderTarget {
  constructor(gl, w, h, { depth = false, linear = true } = {}) {
    this.gl = gl;
    this.w = 0; this.h = 0;
    this.depthEnabled = depth;
    this.linear = linear;
    this.fbo = gl.createFramebuffer();
    this.tex = gl.createTexture();
    this.depth = depth ? gl.createRenderbuffer() : null;
    this.resize(w, h);
  }
  resize(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w === this.w && h === this.h) return this;
    const gl = this.gl;
    this.w = w; this.h = h;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = this.linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);

    if (this.depth) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this;
  }
  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    return this;
  }
}
