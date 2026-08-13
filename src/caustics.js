// Caustics by forward light splatting.
//
// A grid of "photons" is placed on the water surface. Each one refracts the
// light through the local surface slope, lands somewhere on the floor, and is
// splatted there additively. Its brightness is the ratio of the patch of water
// it came from to the patch of floor it covers — so wherever the surface
// focuses light, thousands of photons pile into the same thin line and it burns
// white, and wherever it defocuses, the floor goes dark. That contrast between
// hair-thin bright filaments and deep shadow is the whole point of the game.

import { Program, Target, PingPong } from './glutil.js';
import { RG_LIB } from './glsl-lib.js';

const SPLAT_VS = `#version 300 es
precision highp float;
${RG_LIB}
uniform sampler2D uSlope;
uniform vec2 uSlopeRes;
uniform ivec2 uGrid;
uniform vec2 uPool;
uniform vec2 uCPool;
uniform vec3 uLightDir;
uniform float uEta;
uniform float uThrow;
uniform vec2 uHitOffset;
uniform float uPointSize;
uniform float uGain;
out float vI;

vec2 hitPos(vec2 uv) {
  vec2 g = rgLoad(uSlope, uv, uSlopeRes);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 r = refract(uLightDir, n, uEta);
  float t = uThrow / max(-r.y, 0.15);
  return (uv - 0.5) * uPool + t * r.xz - uHitOffset;
}

void main() {
  ivec2 g = uGrid;
  vec2 uv = (vec2(float(gl_VertexID % g.x), float(gl_VertexID / g.x)) + 0.5) / vec2(g);
  vec2 e = 1.0 / vec2(g);

  vec2 p0 = hitPos(uv);
  vec2 p1 = hitPos(uv + vec2(e.x, 0.0));
  vec2 p2 = hitPos(uv + vec2(0.0, e.y));
  vec2 a = p1 - p0;
  vec2 b = p2 - p0;
  float area = abs(a.x * b.y - a.y * b.x);
  float base = (uPool.x * e.x) * (uPool.y * e.y);
  vI = uGain * min(base / max(area, base * 0.020), 45.0);

  gl_Position = vec4((p0 / uCPool) * 2.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
}
`;

const SPLAT_FS = `#version 300 es
precision mediump float;
in float vI;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float w = exp(-9.0 * dot(d, d));
  outColor = vec4(vI * w);
}
`;

const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec4 c = texture(uTex, vUv) * 0.38774;
  c += (texture(uTex, vUv + uDir) + texture(uTex, vUv - uDir)) * 0.24477;
  c += (texture(uTex, vUv + uDir * 1.9) + texture(uTex, vUv - uDir * 1.9)) * 0.06136;
  outColor = c;
}
`;

// Coarse map of light *concentration*, read back to the CPU so blooms can react.
// It squares before averaging on purpose: refraction only moves light around, so
// a plain local mean barely changes, while the mean square jumps wherever the
// net gathers into filaments — which is exactly the moment worth rewarding.
const REDUCE_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uScale;
void main() {
  float s = 0.0;
  for (int y = -2; y <= 1; y++) {
    for (int x = -2; x <= 1; x++) {
      float c = texture(uTex, vUv + vec2(float(x) + 0.5, float(y) + 0.5) * uStep).r;
      s += c * c;
    }
  }
  outColor = vec4(clamp(s * 0.0625 * uScale, 0.0, 1.0));
}
`;

const SCREEN_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const PROBE_RES = 24;

export class Caustics {
  constructor(gl, quad, opts) {
    this.gl = gl;
    this.quad = quad;
    this.res = opts.res.slice();     // caustic texture [x, y]
    this.grid = opts.grid.slice();   // photon grid [x, y]
    this.pool = opts.pool;
    this.cPool = [opts.pool[0] * 1.28, opts.pool[1] * 1.28];
    this.packed = !opts.float;

    const pre = (s) => (this.packed ? s.replace('precision highp float;', 'precision highp float;\n#define PACKED 1') : s);

    const fmt = this.packed
      ? { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR }
      : { internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.LINEAR };

    // 8-bit accumulation saturates at 1.0, so scale down going in and back up
    // on the way out; only the very hottest cores clip, and those bloom anyway.
    this.hdrScale = this.packed ? 0.10 : 1.0;

    this.pp = new PingPong(gl, this.res[0], this.res[1], fmt);
    this.probe = new Target(gl, PROBE_RES, PROBE_RES, {
      internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST,
    });

    this.pSplat = new Program(gl, pre(SPLAT_VS), SPLAT_FS, 'caustic-splat');
    this.pBlur = new Program(gl, SCREEN_VS, BLUR_FS, 'caustic-blur');
    this.pReduce = new Program(gl, SCREEN_VS, REDUCE_FS, 'caustic-reduce');

    this.emptyVao = gl.createVertexArray();
    this.reader = new AsyncReader(gl, PROBE_RES, PROBE_RES);
    this.probeData = new Uint8Array(PROBE_RES * PROBE_RES * 4);
    this.exposure = opts.exposure ?? 0.10;
    this.lightDir = new Float32Array([0, -1, 0]);
    this.hitOffset = new Float32Array([0, 0]);
    this.throw_ = opts.throw ?? 0.95;
    this.eta = 1.0 / 1.333;
  }

  setLight(azimuth, elevation) {
    const ce = Math.cos(elevation), se = Math.sin(elevation);
    const L = [Math.sin(azimuth) * ce, -se, Math.cos(azimuth) * ce];
    const l = Math.hypot(L[0], L[1], L[2]);
    this.lightDir[0] = L[0] / l; this.lightDir[1] = L[1] / l; this.lightDir[2] = L[2] / l;

    // Where a dead-flat surface would send this light: subtract it so the net
    // stays centred on the pool no matter how low the sun sits.
    const n = [0, 1, 0];
    const eta = this.eta;
    const ci = -(this.lightDir[0] * n[0] + this.lightDir[1] * n[1] + this.lightDir[2] * n[2]);
    const k = 1 - eta * eta * (1 - ci * ci);
    const f = eta * ci - Math.sqrt(Math.max(k, 0));
    const r = [eta * this.lightDir[0] + f * n[0], eta * this.lightDir[1] + f * n[1], eta * this.lightDir[2] + f * n[2]];
    const t = this.throw_ / Math.max(-r[1], 0.15);
    this.hitOffset[0] = t * r[0];
    this.hitOffset[1] = t * r[2];
  }

  /** Follow the pool's proportions, same reasoning as the simulation buffers. */
  resize(res, grid) {
    this.grid = grid.slice();
    if (res[0] === this.res[0] && res[1] === this.res[1]) return;
    this.res = res.slice();
    this.pp.a.resize(res[0], res[1]);
    this.pp.b.resize(res[0], res[1]);
  }

  render(slopeTexture, slopeRes) {
    const gl = this.gl;
    const spacingX = this.res[0] / this.grid[0];
    const spacingY = this.res[1] / this.grid[1];
    const pointSize = Math.max(1.0, Math.min(12.0, Math.max(spacingX, spacingY) * 1.35));
    // Energy normalisation: one splat deposits vI * pointSize^2 * SPLAT_INTEGRAL
    // over the texture, and photon density is 1/spacing^2, so this makes flat
    // water read exactly `exposure` and everything brighter is real focusing.
    const SPLAT_INTEGRAL = 0.3258;
    const gain = this.exposure * this.hdrScale * (spacingX * spacingY)
      / (pointSize * pointSize * SPLAT_INTEGRAL);

    this.pp.dst.bind().clear(0, 0, 0, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.pSplat.use()
      .tex('uSlope', slopeTexture)
      .set('uSlopeRes', slopeRes[0], slopeRes[1])
      .set('uGrid', this.grid[0], this.grid[1])
      .set('uPool', this.pool[0], this.pool[1])
      .set('uCPool', this.cPool[0], this.cPool[1])
      .set('uLightDir', this.lightDir)
      .set('uEta', this.eta)
      .set('uThrow', this.throw_)
      .set('uHitOffset', this.hitOffset)
      .set('uPointSize', pointSize)
      .set('uGain', gain);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.POINTS, 0, this.grid[0] * this.grid[1]);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.pp.swap();

    // Just enough blur to knit the splats together without softening the
    // filaments — the thin lines are the beautiful part.
    for (const dir of [[1 / this.res[0], 0], [0, 1 / this.res[1]]]) {
      this.pp.dst.bind();
      this.pBlur.use().tex('uTex', this.pp.src.texture).set('uDir', dir[0], dir[1]);
      this.quad.draw();
      this.pp.swap();
    }
  }

  /** Downsample + async readback so blooms can react to real light. */
  updateProbe() {
    const gl = this.gl;
    this.probe.bind();
    this.pReduce.use()
      .tex('uTex', this.pp.src.texture)
      .set('uStep', 1 / PROBE_RES / 2, 1 / PROBE_RES / 2)
      .set('uScale', 6.0 / (this.hdrScale * this.hdrScale));
    this.quad.draw();
    this.reader.update(this.probe, this.probeData);
  }

  /** Bilinear lookup of recent light intensity at a pool-space uv. */
  sampleProbe(u, v) {
    const N = PROBE_RES;
    const x = Math.min(Math.max(u * N - 0.5, 0), N - 1.001);
    const y = Math.min(Math.max(v * N - 0.5, 0), N - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const at = (ix, iy) => this.probeData[((iy * N) + ix) * 4] / 255;
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  get texture() { return this.pp.src.texture; }
  get outScale() { return 1 / this.hdrScale; }
}

/**
 * Non-blocking glReadPixels through a pixel buffer object. Falls back to a
 * synchronous read if fences misbehave; either way it runs a few times a second,
 * never per frame.
 */
class AsyncReader {
  constructor(gl, w, h) {
    this.gl = gl;
    this.w = w; this.h = h;
    this.bytes = w * h * 4;
    this.pending = null;
    this.sync = null;
    this.ok = true;
    try {
      this.pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.bytes, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    } catch (e) {
      this.ok = false;
    }
  }

  update(target, out) {
    const gl = this.gl;
    if (!this.ok) {
      gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return;
    }
    if (this.sync) {
      const st = gl.clientWaitSync(this.sync, 0, 0);
      if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED) {
        gl.deleteSync(this.sync);
        this.sync = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      } else if (st === gl.WAIT_FAILED) {
        gl.deleteSync(this.sync);
        this.sync = null;
        this.ok = false;
      }
      return;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }
}
