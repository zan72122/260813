import { SCENE_FRAG } from './shaders/scene.js';
import {
  FULLSCREEN_VERT,
  PREFILTER_FRAG,
  BLUR_FRAG,
  COMPOSITE_FRAG,
} from './shaders/post.js';
import { buildMichelLevyLUT } from './spectrum.js';

const HDR_HEADERS = {
  2: {
    vert:
      '#version 300 es\nprecision highp float;\n' +
      '#define ATTRIB in\n#define VARYOUT out\n#define VARYIN in\n' +
      '#define TEXTURE texture\n',
    frag:
      '#version 300 es\nprecision highp float;\nprecision highp int;\n' +
      '#define ATTRIB in\n#define VARYOUT out\n#define VARYIN in\n' +
      '#define TEXTURE texture\n#define FWIDTH(x) fwidth(x)\n' +
      'out vec4 gFrag_;\n#define FRAGCOLOR gFrag_\n',
  },
  1: {
    vert:
      'precision highp float;\n' +
      '#define ATTRIB attribute\n#define VARYOUT varying\n#define VARYIN varying\n' +
      '#define TEXTURE texture2D\n',
    frag:
      '#extension GL_OES_standard_derivatives : enable\n' +
      'precision highp float;\n' +
      '#define ATTRIB attribute\n#define VARYOUT varying\n#define VARYIN varying\n' +
      '#define TEXTURE texture2D\n#define FWIDTH(x) fwidth(x)\n' +
      '#define FRAGCOLOR gl_FragColor\n',
  },
};

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || '';
    const numbered = src
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
      .join('\n');
    throw new Error(`shader compile failed:\n${log}\n${numbered}`);
  }
  return s;
}

class Program {
  constructor(gl, ver, fragSrc) {
    const h = HDR_HEADERS[ver];
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, h.vert + FULLSCREEN_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, h.frag + fragSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.p = p;
    this.loc = new Map();
  }
  use() {
    this.gl.useProgram(this.p);
    return this;
  }
  u(name) {
    let l = this.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.p, name);
      this.loc.set(name, l);
    }
    return l;
  }
  f(n, v) { const l = this.u(n); if (l) this.gl.uniform1f(l, v); return this; }
  v2(n, x, y) { const l = this.u(n); if (l) this.gl.uniform2f(l, x, y); return this; }
  v4(n, x, y, z, w) { const l = this.u(n); if (l) this.gl.uniform4f(l, x, y, z, w); return this; }
  v4a(n, arr) { const l = this.u(n + '[0]'); if (l) this.gl.uniform4fv(l, arr); return this; }
  tex(n, unit, t) {
    const l = this.u(n);
    if (!l) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(l, unit);
    return this;
  }
}

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.ok = false;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { this.init(); this.lost = false; } catch (_) { /* keep the veil up */ }
    });
    this.init();
  }

  init() {
    const opts = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: !!this.opts.preserveDrawingBuffer, // only for smoke-test screenshots
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    };
    const gl =
      this.canvas.getContext('webgl2', opts) ||
      this.canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.ver = gl.getParameter(gl.VERSION).indexOf('WebGL 2') >= 0 ? 2 : 1;
    if (this.ver === 1) gl.getExtension('OES_standard_derivatives');

    // HDR render targets if we can get them; otherwise 8-bit with a 0.5 prescale
    this.halfFloat = null;
    if (this.ver === 2) {
      if (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')) {
        this.halfFloat = { internal: gl.RGBA16F, type: gl.HALF_FLOAT, format: gl.RGBA };
      }
    } else {
      const hf = gl.getExtension('OES_texture_half_float');
      if (hf && gl.getExtension('EXT_color_buffer_half_float')) {
        gl.getExtension('OES_texture_half_float_linear');
        this.halfFloat = { internal: gl.RGBA, type: hf.HALF_FLOAT_OES, format: gl.RGBA };
      }
    }
    this.hdrScale = this.halfFloat ? 1.0 : 0.5;

    // fullscreen triangle
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vbo = vbo;

    this.progScene = new Program(gl, this.ver, SCENE_FRAG);
    this.progPre = new Program(gl, this.ver, PREFILTER_FRAG);
    this.progBlur = new Program(gl, this.ver, BLUR_FRAG);
    this.progComp = new Program(gl, this.ver, COMPOSITE_FRAG);

    // Michel-Lévy lookup
    const lut = buildMichelLevyLUT();
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lut = t;

    this.targets = {};
    this.size = { w: 0, h: 0, sw: 0, sh: 0 };
    this.ok = true;
  }

  makeTarget(w, h, hdr) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr && this.halfFloat) {
      const f = this.halfFloat;
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  dispose(t) {
    if (!t) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  resize(cssW, cssH, dpr, renderScale) {
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    const sw = Math.max(2, Math.round(w * renderScale));
    const sh = Math.max(2, Math.round(h * renderScale));
    if (this.size.w === w && this.size.h === h && this.size.sw === sw && this.size.sh === sh) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.size = { w, h, sw, sh };

    const bw = Math.max(2, sw >> 2);
    const bh = Math.max(2, sh >> 2);
    this.dispose(this.targets.scene);
    this.dispose(this.targets.b0);
    this.dispose(this.targets.b1);
    this.targets.scene = this.makeTarget(sw, sh, true);
    this.targets.b0 = this.makeTarget(bw, bh, true);
    this.targets.b1 = this.makeTarget(bw, bh, true);
  }

  quad() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  bind(t) {
    const gl = this.gl;
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.size.w, this.size.h);
    }
  }

  /** @param {object} s scene uniform bundle produced by Game.uniforms() */
  draw(s) {
    if (!this.ok || this.lost) return;
    const gl = this.gl;
    const T = this.targets;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // ---- scene ----
    this.bind(T.scene);
    const p = this.progScene.use();
    p.v2('uRes', T.scene.w, T.scene.h)
      .f('uTime', s.time)
      .v4('uCam', s.cam[0], s.cam[1], s.cam[2], s.cam[3])
      .v4('uPol', s.pol[0], s.pol[1], s.pol[2], s.pol[3])
      .v4('uRing', s.ring[0], s.ring[1], s.ring[2], s.ring[3])
      .v4('uFin', s.fin[0], s.fin[1], s.fin[2], s.fin[3])
      .v4a('uObjA', s.objA)
      .v4a('uObjB', s.objB)
      .v4a('uObjC', s.objC)
      .v4a('uObjD', s.objD)
      .v4a('uObjE', s.objE)
      .v4a('uPress', s.press)
      .f('uOutScale', this.hdrScale)
      .tex('uLUT', 0, this.lut);
    this.quad();

    // ---- bloom ----
    const bloomOn = s.post[0] > 0.001 && s.quality > 0;
    if (bloomOn) {
      this.bind(T.b0);
      this.progPre
        .use()
        .v2('uTexel', 1 / T.scene.w, 1 / T.scene.h)
        .v2('uKnee', 0.88, 2.40)
        .f('uInvScale', 1 / this.hdrScale)
        .tex('uTex', 0, T.scene.tex);
      this.quad();

      const passes = s.quality > 1 ? 2 : 1;
      for (let i = 0; i < passes; i++) {
        const r = 1 + i * 1.6;
        this.bind(T.b1);
        this.progBlur.use().v2('uDir', r / T.b0.w, 0).tex('uTex', 0, T.b0.tex);
        this.quad();
        this.bind(T.b0);
        this.progBlur.use().v2('uDir', 0, r / T.b1.h).tex('uTex', 0, T.b1.tex);
        this.quad();
      }
    } else {
      this.bind(T.b0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // ---- composite ----
    this.bind(null);
    this.progComp
      .use()
      .v2('uRes', this.size.w, this.size.h)
      .f('uTime', s.time)
      .v4('uPost', s.post[0], s.post[1], s.post[2], s.post[3])
      .f('uInvScale', 1 / this.hdrScale)
      .tex('uScene', 0, T.scene.tex)
      .tex('uBloom', 1, T.b0.tex);
    this.quad();
  }
}
