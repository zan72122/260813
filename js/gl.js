// Minimal WebGL2 helpers: programs, uniforms, quad geometry, render targets.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  gl.disable(gl.DITHER);
  return gl;
}

export function createProgram(gl, vsSrc, fsSrc, label = 'program') {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error(`[${label}] vertex shader:\n${gl.getShaderInfoLog(vs)}`);
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`[${label}] fragment shader:\n${gl.getShaderInfoLog(fs)}`);
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`[${label}] link:\n${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const locs = new Map();
  const p = {
    prog,
    label,
    loc(name) {
      if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
      return locs.get(name);
    },
    use() { gl.useProgram(prog); return p; },
    set(uniforms) { setUniforms(gl, p, uniforms); return p; },
  };
  return p;
}

// Dispatches by JS value shape: number, array (2..4 or 16), {tex, unit}.
export function setUniforms(gl, p, uniforms) {
  let autoUnit = 0;
  for (const name in uniforms) {
    const v = uniforms[name];
    const loc = p.loc(name);
    if (loc === null) continue;
    if (typeof v === 'number') {
      gl.uniform1f(loc, v);
    } else if (typeof v === 'boolean') {
      gl.uniform1i(loc, v ? 1 : 0);
    } else if (v && v.__tex) {
      const unit = v.unit !== undefined ? v.unit : autoUnit++;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, v.__tex);
      gl.uniform1i(loc, unit);
    } else if (v && v.length === 16) {
      gl.uniformMatrix4fv(loc, false, v);
    } else if (v && v.length === 2) {
      gl.uniform2f(loc, v[0], v[1]);
    } else if (v && v.length === 3) {
      gl.uniform3f(loc, v[0], v[1], v[2]);
    } else if (v && v.length === 4) {
      gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    }
  }
}

export function tex(texture, unit) {
  return { __tex: texture, unit };
}

// Fullscreen triangle (no attributes needed, uses gl_VertexID).
export function createEmptyVAO(gl) {
  return gl.createVertexArray();
}

// A unit quad from (-1,-1) to (1,1) with uv, in attribute 0/1.
export function createQuad(gl) {
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const data = new Float32Array([
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return { vao, buf };
}

export function createTexture(gl, opts = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap || gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrap || gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.min || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.mag || gl.LINEAR);
  return t;
}

export function textureFromCanvas(gl, canvas, { mips = true, wrap } = {}) {
  const t = createTexture(gl, {
    wrap,
    min: mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  });
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export function textureFromData(gl, w, h, data, { mips = true, wrap } = {}) {
  const t = createTexture(gl, {
    wrap: wrap || gl.REPEAT,
    min: mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  });
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export function createRenderTarget(gl, w, h, { depth = false } = {}) {
  const fbo = gl.createFramebuffer();
  const color = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);

  let depthBuf = null;
  if (depth) {
    depthBuf = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuf);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuf);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    fbo, color, depthBuf, width: w, height: h,
    resize(nw, nh) {
      if (nw === this.width && nh === this.height) return;
      this.width = nw; this.height = nh;
      gl.bindTexture(gl.TEXTURE_2D, color);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (depthBuf) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuf);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, nw, nh);
      }
    },
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, this.width, this.height);
    },
  };
}
