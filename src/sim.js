// Water simulation.
//
//   state  (RG)  : h, h_prev      — damped 2D wave equation, the actual ripples
//   flow   (RG)  : vx, vy         — a slow swirling velocity field the ripples ride on
//   slope  (RG)  : dh/dx, dh/dz   — what the caustics and the surface shading read
//
// The wave equation gives interference (two taps overlap into a moiré of light)
// and natural settling for free. The flow field is what turns "finger drawing a
// circle" into a vortex: it advects the ripples, so the circular light net
// spirals into a flower instead of just fading.

import { Program, PingPong, Target, SCREEN_VS } from './glutil.js';
import { RG_LIB } from './glsl-lib.js';

const MAX_IMP = 8;

const ADVECT_FS = `#version 300 es
precision highp float;
${RG_LIB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform sampler2D uFlow;
uniform vec2 uRes;
uniform vec2 uFlowRes;
uniform float uAmount;
void main() {
  vec2 fl = rgLoad(uFlow, vUv, uFlowRes);
  vec2 uv = clamp(vUv - fl * uAmount, vec2(0.0015), vec2(0.9985));
  outColor = rgStore(rgLoad(uState, uv, uRes));
}
`;

const WAVE_FS = `#version 300 es
precision highp float;
${RG_LIB}
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uState;
uniform vec2 uRes;
uniform vec2 uPool;
uniform vec2 uC2;
uniform float uDamp;
uniform float uIdle;
uniform float uTime;
uniform int uImpCount;
uniform vec4 uImpA[${MAX_IMP}];   // uv.xy, amplitude, radius(world)
uniform vec4 uImpB[${MAX_IMP}];   // dir.xy, elongation, kind
uniform vec4 uFlower;             // center.xy, amount, phase
uniform vec4 uFlowerB;            // petals, ringFreq, radius, twist

float flowerTarget(vec2 uv) {
  vec2 p = (uv - uFlower.xy) * uPool;
  float r = length(p) + 1e-5;
  float a = atan(p.y, p.x);
  float petal = cos(uFlowerB.x * a + uFlowerB.w * r * 2.2 + uFlower.w * 0.30);
  float rings = cos(uFlowerB.y * r - uFlower.w);
  // Steeper than a gaussian so the flower is a distinct object with a rim,
  // rather than fading into ripples across the whole pool.
  float env = exp(-pow(r / uFlowerB.z, 2.8));
  return 1.25 * env * rings * (0.18 + 0.82 * petal);
}

void main() {
  vec2 t = 1.0 / uRes;
  vec2 s = rgLoad(uState, vUv, uRes);
  float h = s.x, hp = s.y;
  float hl = rgLoad(uState, vUv - vec2(t.x, 0.0), uRes).x;
  float hr = rgLoad(uState, vUv + vec2(t.x, 0.0), uRes).x;
  float hd = rgLoad(uState, vUv - vec2(0.0, t.y), uRes).x;
  float hu = rgLoad(uState, vUv + vec2(0.0, t.y), uRes).x;

  // Anisotropic Laplacian: the buffer is square but the pool usually isn't, so
  // each axis is weighted by its real world spacing. Without this, ripples come
  // out as ellipses on a phone held upright.
  float hn = 2.0 * h - hp + uC2.x * (hl + hr - 2.0 * h) + uC2.y * (hd + hu - 2.0 * h);
  hn *= uDamp;
  float hOld = h;   // this frame's height becomes next frame's "previous"

  // A breath of life so the resting pool still shows a faint drifting net.
  vec2 w = vUv * 6.2831;
  hn += uIdle * (sin(w.x * 1.3 + uTime * 0.47) * sin(w.y * 1.1 - uTime * 0.31)
               + 0.6 * sin(w.x * 0.7 - w.y * 0.9 + uTime * 0.23));

  for (int i = 0; i < ${MAX_IMP}; i++) {
    if (i >= uImpCount) break;
    vec4 A = uImpA[i];
    vec4 B = uImpB[i];
    vec2 p = (vUv - A.xy) * uPool;
    float amp = A.z;
    float s2 = A.w * A.w;
    if (B.w > 0.5) {
      // Drag: a crest stretched across the direction of travel, pushed forward
      // ahead of the finger and hollowed out behind it.
      vec2 d = B.xy;
      vec2 q = vec2(dot(p, d) / max(B.z, 0.05), dot(p, vec2(-d.y, d.x)) * max(B.z, 0.05));
      p = q;
      float dp = dot(normalize(p + vec2(1e-6)), vec2(1.0, 0.0));
      amp *= (0.30 + 0.70 * dp);
    }
    float r2 = dot(p, p) / s2;
    hn += amp * (1.0 - r2) * exp(-r2);   // mexican hat -> a clean expanding ring
  }

  // The finale: blend toward a big symmetric target so the net resolves into
  // one enormous flower, then let the wave equation dissolve it again.
  if (uFlower.z > 0.001) {
    float target = flowerTarget(vUv);
    hn = mix(hn, target, uFlower.z);
    hOld = mix(hOld, target, uFlower.z * 0.85);
  }

  // Soak up energy at the rim so nothing piles into a buzzing border.
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = max(e.x, e.y);
  float rim = 1.0 - 0.55 * smoothstep(0.90, 1.0, edge);
  hn *= rim;
  hOld *= rim;

  outColor = rgStore(vec2(clamp(hn, -1.5, 1.5), clamp(hOld, -1.5, 1.5)));
}
`;

const FLOW_FS = `#version 300 es
precision highp float;
${RG_LIB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFlow;
uniform vec2 uRes;
uniform vec2 uPool;
uniform float uDecay;
uniform float uSelfAdvect;
uniform float uDiffuse;
uniform int uImpCount;
uniform vec4 uImpA[${MAX_IMP}];   // uv.xy, _, radius(world)
uniform vec4 uFlowP[${MAX_IMP}];  // push.xy, swirl, strength

void main() {
  vec2 t = 1.0 / uRes;
  vec2 here = rgLoad(uFlow, vUv, uRes);
  vec2 v = rgLoad(uFlow, clamp(vUv - here * uSelfAdvect, vec2(0.002), vec2(0.998)), uRes);

  vec2 n = rgLoad(uFlow, vUv + vec2(t.x, 0.0), uRes)
         + rgLoad(uFlow, vUv - vec2(t.x, 0.0), uRes)
         + rgLoad(uFlow, vUv + vec2(0.0, t.y), uRes)
         + rgLoad(uFlow, vUv - vec2(0.0, t.y), uRes);
  v = mix(v, n * 0.25, uDiffuse);
  v *= uDecay;

  for (int i = 0; i < ${MAX_IMP}; i++) {
    if (i >= uImpCount) break;
    vec2 p = (vUv - uImpA[i].xy) * uPool;
    float r2 = dot(p, p) / (uImpA[i].w * uImpA[i].w * 2.6);
    float g = exp(-r2);
    vec4 P = uFlowP[i];
    vec2 perp = vec2(-P.y, P.x);
    v += (P.xy + perp * P.z) * P.w * g;
  }

  vec2 e = abs(vUv - 0.5) * 2.0;
  v *= 1.0 - 0.8 * smoothstep(0.86, 1.0, max(e.x, e.y));
  outColor = rgStore(clamp(v, vec2(-0.9), vec2(0.9)));
}
`;

const SLOPE_FS = `#version 300 es
precision highp float;
${RG_LIB}
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uRes;
uniform vec2 uPool;
uniform float uScale;
uniform float uTime;
uniform float uAmbient;

void main() {
  vec2 t = 1.0 / uRes;
  float hl = rgLoad(uState, vUv - vec2(t.x, 0.0), uRes).x;
  float hr = rgLoad(uState, vUv + vec2(t.x, 0.0), uRes).x;
  float hd = rgLoad(uState, vUv - vec2(0.0, t.y), uRes).x;
  float hu = rgLoad(uState, vUv + vec2(0.0, t.y), uRes).x;

  vec2 g = vec2(hr - hl, hu - hd) / (2.0 * uPool * t);

  // Slow analytic swell layered on top: it never destabilises the solver and
  // keeps a soft living net on the floor even when nobody is touching.
  // Written as the true gradient of a sum of travelling waves — a made-up
  // slope field would not be curl-free and the caustics would look wrong.
  vec2 w = vUv * uPool;
  float ta = uTime * 0.21;
  vec2 amb = vec2(0.0);
  vec2 k1 = vec2(12.3,  5.0);  amb -= (uAmbient * 1.00) * k1 * sin(dot(w, k1) + ta * 1.7);
  vec2 k2 = vec2( 5.8,-13.2);  amb -= (uAmbient * 0.85) * k2 * sin(dot(w, k2) - ta * 1.1);
  vec2 k3 = vec2(19.8, 10.7);  amb -= (uAmbient * 0.30) * k3 * sin(dot(w, k3) + ta * 2.3);
  vec2 k4 = vec2(-9.9, 20.4);  amb -= (uAmbient * 0.26) * k4 * sin(dot(w, k4) + ta * 1.9);
  vec2 k5 = vec2(28.3,-14.9);  amb -= (uAmbient * 0.10) * k5 * sin(dot(w, k5) - ta * 2.9);

  outColor = rgStore(g * uScale + amb);
}
`;

export class Sim {
  constructor(gl, quad, opts) {
    this.gl = gl;
    this.quad = quad;
    this.res = opts.res.slice();          // [x, y] texels
    this.flowRes = opts.flowRes.slice();
    this.pool = opts.pool;                // [worldWidth, worldDepth]
    this.packed = !opts.float;

    const pre = (src) => (this.packed
      ? src.replace('precision highp float;', 'precision highp float;\n#define PACKED 1')
      : src);

    const texOpts = this.packed
      ? { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST }
      : { internalFormat: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT, filter: gl.LINEAR };
    this.texOpts = texOpts;

    this.state = new PingPong(gl, this.res[0], this.res[1], texOpts);
    this.flow = new PingPong(gl, this.flowRes[0], this.flowRes[1], texOpts);
    this.slope = new Target(gl, this.res[0], this.res[1], texOpts);

    this.pAdvect = new Program(gl, SCREEN_VS, pre(ADVECT_FS), 'advect');
    this.pWave = new Program(gl, SCREEN_VS, pre(WAVE_FS), 'wave');
    this.pFlow = new Program(gl, SCREEN_VS, pre(FLOW_FS), 'flow');
    this.pSlope = new Program(gl, SCREEN_VS, pre(SLOPE_FS), 'slope');

    this.impA = new Float32Array(MAX_IMP * 4);
    this.impB = new Float32Array(MAX_IMP * 4);
    this.flowP = new Float32Array(MAX_IMP * 4);
    this.queue = [];

    this.c2 = [0.30, 0.30];
    this.updatePool();
    // Damping is specified as "fraction of amplitude kept per second" so the
    // step rate can change without changing how the water feels.
    this.dampPerSecond = opts.damping ?? 0.84;
    this.idle = 0.010;
    this.time = 0;
    // `rate` is how fast the water is pulled toward the finale shape, in units
    // of e-folds per second, so the pull is identical at any step rate.
    this.flower = { x: 0.5, y: 0.5, rate: 0, phase: 0, petals: 6, rings: 9, radius: 0.9, twist: 0 };
    this.ambient = opts.ambient ?? 0.8;
    // Dialled down while the finale flower is on stage so it has the floor to
    // itself; the resting swell would otherwise cut it into a cellular mesh.
    this.ambientScale = 1;
    this.clearAll();
  }

  /**
   * Recompute the per-axis wave weights after the pool footprint changes.
   * Total weight is held at 0.85 (the scheme is stable up to 1.0), split
   * between the axes in proportion to their real cell spacing.
   */
  updatePool() {
    const dx = this.pool[0] / this.res[0];
    const dz = this.pool[1] / this.res[1];
    const x2 = dx * dx, z2 = dz * dz;
    const s = 0.85 / (x2 + z2);
    this.c2 = [s * z2, s * x2];
  }

  /**
   * Match the buffer shape to the pool shape. A square buffer over a long pool
   * would resolve ripples several times more coarsely along the depth axis and
   * they would come out blocky, so the texel count follows the footprint.
   */
  resize(res, flowRes) {
    if (res[0] === this.res[0] && res[1] === this.res[1]) return;
    this.res = res.slice();
    this.flowRes = flowRes.slice();
    this.state.a.resize(res[0], res[1]);
    this.state.b.resize(res[0], res[1]);
    this.slope.resize(res[0], res[1]);
    this.flow.a.resize(flowRes[0], flowRes[1]);
    this.flow.b.resize(flowRes[0], flowRes[1]);
    this.clearAll();
  }

  clearAll() {
    for (const t of [this.state.a, this.state.b, this.flow.a, this.flow.b, this.slope]) {
      // 0.5,0.5 decodes to 0.0 in packed mode and is harmless in float mode.
      t.bind().clear(this.packed ? 0.5 : 0, this.packed ? 0.5 : 0, this.packed ? 0.5 : 0, this.packed ? 0.5 : 1);
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /**
   * @param {object} imp uv {x,y}, amp, radius (world units), dir {x,y},
   *   elongation, kind (0 tap / 1 drag), push, swirl
   */
  addImpulse(imp) {
    if (this.queue.length < 64) this.queue.push(imp);
  }

  _uploadImpulses(n) {
    for (let i = 0; i < n; i++) {
      const q = this.queue[i];
      const o = i * 4;
      this.impA[o] = q.u; this.impA[o + 1] = q.v; this.impA[o + 2] = q.amp; this.impA[o + 3] = q.radius;
      this.impB[o] = q.dx; this.impB[o + 1] = q.dy; this.impB[o + 2] = q.elong; this.impB[o + 3] = q.kind;
      this.flowP[o] = q.dx * q.push; this.flowP[o + 1] = q.dy * q.push;
      this.flowP[o + 2] = q.swirl; this.flowP[o + 3] = q.flowAmp;
    }
  }

  step(dt) {
    const gl = this.gl;
    this.time += dt;

    const n = Math.min(this.queue.length, MAX_IMP);
    this._uploadImpulses(n);

    gl.disable(gl.BLEND);

    // --- flow field -------------------------------------------------------
    this.flow.dst.bind();
    this.pFlow.use()
      .tex('uFlow', this.flow.src.texture)
      .set('uRes', this.flowRes[0], this.flowRes[1])
      .set('uPool', this.pool[0], this.pool[1])
      .set('uDecay', 0.986)
      .set('uSelfAdvect', 0.010)
      .set('uDiffuse', 0.16)
      .set('uImpCount', n)
      .set('uImpA', this.impA)
      .set('uFlowP', this.flowP);
    this.quad.draw();
    this.flow.swap();

    // --- advect the ripples along the flow --------------------------------
    this.state.dst.bind();
    this.pAdvect.use()
      .tex('uState', this.state.src.texture)
      .tex('uFlow', this.flow.src.texture)
      .set('uRes', this.res[0], this.res[1])
      .set('uFlowRes', this.flowRes[0], this.flowRes[1])
      .set('uAmount', 0.020);
    this.quad.draw();
    this.state.swap();

    // --- wave step + impulses --------------------------------------------
    this.state.dst.bind();
    this.pWave.use()
      .tex('uState', this.state.src.texture)
      .set('uRes', this.res[0], this.res[1])
      .set('uPool', this.pool[0], this.pool[1])
      .set('uC2', this.c2[0], this.c2[1])
      .set('uDamp', Math.pow(this.dampPerSecond, dt))
      .set('uIdle', this.idle * dt)
      .set('uTime', this.time)
      .set('uImpCount', n)
      .set('uImpA', this.impA)
      .set('uImpB', this.impB)
      .set('uFlower', this.flower.x, this.flower.y, 1.0 - Math.exp(-this.flower.rate * dt), this.flower.phase)
      .set('uFlowerB', this.flower.petals, this.flower.rings, this.flower.radius, this.flower.twist);
    this.quad.draw();
    this.state.swap();

    this.queue.splice(0, n);
  }

  /** Rebuild the slope texture the renderer samples. Once per frame is enough. */
  updateSlope() {
    this.slope.bind();
    this.pSlope.use()
      .tex('uState', this.state.src.texture)
      .set('uRes', this.res[0], this.res[1])
      .set('uPool', this.pool[0], this.pool[1])
      .set('uScale', 0.018)
      .set('uTime', this.time)
      .set('uAmbient', 0.0030 * this.ambient * this.ambientScale);
    this.quad.draw();
  }

  get slopeTexture() { return this.slope.texture; }
  get stateTexture() { return this.state.src.texture; }
  get flowTexture() { return this.flow.src.texture; }
}
