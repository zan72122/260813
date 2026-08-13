// Post: a soft two-scale bloom so focused caustics glow through the water,
// then filmic roll-off, vignette and a whisper of dither to kill banding.

import { Program, Target, SCREEN_VS } from './glutil.js';
import { NOISE_LIB } from './glsl-lib.js';

const BRIGHT_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  outColor = vec4(c * k, 1.0);
}
`;

const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.0703;
  outColor = vec4(c, 1.0);
}
`;

const DOWN_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(c * 0.25, 1.0);
}
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
${NOISE_LIB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uBloomAmt;
uniform float uExposure;
uniform float uTime;
uniform float uVignette;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uBloom1, vUv).rgb * 0.62 + texture(uBloom2, vUv).rgb * 0.85;
  c += b * uBloomAmt;
  c *= uExposure;
  c = aces(c);

  vec2 v = (vUv - 0.5) * vec2(1.0, 1.0);
  c *= 1.0 - uVignette * dot(v, v) * 1.55;

  c += (hash12(vUv * 1024.0 + fract(uTime) * 37.0) - 0.5) * 0.0045;
  outColor = vec4(max(c, 0.0), 1.0);
}
`;

export class Post {
  constructor(gl, quad, opts) {
    this.gl = gl;
    this.quad = quad;
    const fmt = opts.float
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
    this.fmt = fmt;
    this.w = opts.width; this.h = opts.height;
    const q = this._quarter();
    const e = this._eighth();
    this.a = new Target(gl, q[0], q[1], fmt);
    this.b = new Target(gl, q[0], q[1], fmt);
    this.c = new Target(gl, e[0], e[1], fmt);
    this.d = new Target(gl, e[0], e[1], fmt);

    this.pBright = new Program(gl, SCREEN_VS, BRIGHT_FS, 'bright');
    this.pBlur = new Program(gl, SCREEN_VS, BLUR_FS, 'post-blur');
    this.pDown = new Program(gl, SCREEN_VS, DOWN_FS, 'down');
    this.pComp = new Program(gl, SCREEN_VS, COMPOSITE_FS, 'composite');
    this.enabled = true;
  }

  _quarter() { return [Math.max(2, this.w >> 2), Math.max(2, this.h >> 2)]; }
  _eighth() { return [Math.max(2, this.w >> 3), Math.max(2, this.h >> 3)]; }

  resize(w, h) {
    this.w = w; this.h = h;
    const q = this._quarter(), e = this._eighth();
    this.a.resize(q[0], q[1]);
    this.b.resize(q[0], q[1]);
    this.c.resize(e[0], e[1]);
    this.d.resize(e[0], e[1]);
  }

  render(sceneTex, canvasW, canvasH, params) {
    const gl = this.gl;
    gl.disable(gl.BLEND);

    if (this.enabled) {
      this.a.bind();
      this.pBright.use().tex('uTex', sceneTex)
        .set('uTexel', 1 / this.w, 1 / this.h)
        .set('uThreshold', params.threshold);
      this.quad.draw();

      this.b.bind();
      this.pBlur.use().tex('uTex', this.a.texture).set('uDir', 1 / this.a.width, 0);
      this.quad.draw();
      this.a.bind();
      this.pBlur.use().tex('uTex', this.b.texture).set('uDir', 0, 1 / this.a.height);
      this.quad.draw();

      this.c.bind();
      this.pDown.use().tex('uTex', this.a.texture)
        .set('uTexel', 1 / this.a.width, 1 / this.a.height);
      this.quad.draw();
      this.d.bind();
      this.pBlur.use().tex('uTex', this.c.texture).set('uDir', 1 / this.c.width, 0);
      this.quad.draw();
      this.c.bind();
      this.pBlur.use().tex('uTex', this.d.texture).set('uDir', 0, 1 / this.c.height);
      this.quad.draw();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    this.pComp.use()
      .tex('uScene', sceneTex)
      .tex('uBloom1', this.a.texture)
      .tex('uBloom2', this.c.texture)
      .set('uBloomAmt', this.enabled ? params.bloom : 0)
      .set('uExposure', params.exposure)
      .set('uTime', params.time)
      .set('uVignette', params.vignette);
    this.quad.draw();
  }
}
