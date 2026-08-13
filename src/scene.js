// Scene rendering.
//
//   pass 1 (underwater) : background + floor lit by the caustic net, then the
//                         sleeping blooms, then the bubbles
//   pass 2 (surface)    : the water itself — screen-space refraction of pass 1,
//                         fresnel sky, a hard specular glint and a little sparkle
//
// Background and floor are both drawn by one fullscreen shader that intersects
// the camera ray with the two planes, so there is no pool geometry to manage
// and the silhouette stays crisp at any resolution.

import { Program, Target, SCREEN_VS } from './glutil.js';
import { RG_LIB, NOISE_LIB, POOL_LIB } from './glsl-lib.js';

export const MAX_BLOOMS = 8;
export const MAX_BUBBLES = 18;

const COMMON = `
uniform mat4 uInvVP;
uniform vec3 uCamPos;
vec3 rayDir(vec2 uv) {
  vec4 a = uInvVP * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec4 b = uInvVP * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(b.xyz / b.w - a.xyz / a.w);
}
`;

const FLOOR_FS = `#version 300 es
precision highp float;
${NOISE_LIB}
${POOL_LIB}
${COMMON}
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uCaustic;
uniform vec2 uPool;
uniform vec2 uCPool;
uniform float uFloorY;
uniform float uCScale;
uniform vec2 uCTexel;
uniform float uTime;
uniform float uRound;
uniform vec3 uFloorBase;
uniform vec3 uFloorWarm;
uniform vec3 uFloorDeep;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform float uGlow;

float causticAt(vec2 uv) { return texture(uCaustic, uv).r; }

void main() {
  vec2 uv = vUv;
  vec3 dir = rayDir(uv);

  // Background: a quiet dark room so the light net owns every bright pixel.
  vec2 q = uv - vec2(0.5, 0.55);
  float bgr = length(q * vec2(1.0, 1.15));
  vec3 col = mix(vec3(0.022, 0.040, 0.072), vec3(0.004, 0.008, 0.020), smoothstep(0.05, 0.85, bgr));
  col += vec3(0.03, 0.06, 0.10) * exp(-bgr * bgr * 6.0) * 0.35;
  float motes = pow(vnoise(uv * 26.0 + uTime * 0.015), 30.0) * 3.0;
  col += vec3(0.30, 0.50, 0.70) * motes * 0.06;

  float alpha = 1.0;
  if (dir.y < -0.001) {
    // Visibility is decided by the *water surface* footprint, so the floor and
    // the surface share one silhouette and the pool reads as a single vessel
    // instead of a tray floating above a slab.
    float ts = -uCamPos.y / dir.y;
    vec3 shit = uCamPos + dir * ts;
    float sd = poolSdf(shit.xz, uPool * 0.5, uRound);
    float t = (uFloorY - uCamPos.y) / dir.y;
    vec3 hit = uCamPos + dir * t;
    float fsd = poolSdf(hit.xz, uPool * 0.5, uRound);
    if (sd < 0.16) {
      // Past the floor's own footprint we are looking up the basin wall. Sample
      // its light from the nearest point still inside the pool so the bank
      // catches the same net and glows instead of reading as a black frame.
      float wall = smoothstep(0.0, 0.24, fsd);
      vec2 lim = uPool * 0.5 * 0.97;
      vec2 floorXZ = mix(hit.xz, clamp(hit.xz, -lim, lim), wall);

      vec2 cuv = floorXZ / uCPool + 0.5;
      vec2 e = uCTexel;
      float c0 = causticAt(cuv);
      float gx = causticAt(cuv + vec2(e.x, 0.0)) - causticAt(cuv - vec2(e.x, 0.0));
      float gy = causticAt(cuv + vec2(0.0, e.y)) - causticAt(cuv - vec2(0.0, e.y));
      // Dispersion: pull the red and blue samples apart along the light's own
      // gradient, so filaments carry a gold/cyan fringe like the real thing.
      vec2 g = normalize(vec2(gx, gy) + 1e-6) * e * 2.1;
      float cR = causticAt(cuv + g);
      float cB = causticAt(cuv - g);

      vec3 disp = vec3(cR, c0, cB) * uCScale;
      float lum = dot(disp, vec3(0.3333));

      // Pale blue where the light is thin, gold where it gathers, white where
      // it collapses into a filament.
      vec3 tint = mix(uCool, uWarm, smoothstep(0.18, 0.78, lum));
      vec3 light = tint * disp * 0.95;
      light += vec3(1.0, 0.975, 0.94) * pow(max(lum - 0.85, 0.0), 1.35) * 0.50;

      // Two octaves, not four: this is a fullscreen pass and the grain only
      // needs to break up the flat colour under the light.
      float grain = vnoise(floorXZ * 9.0 + 3.0) * 0.65 + vnoise(floorXZ * 23.0) * 0.35;
      vec3 base = mix(uFloorBase, uFloorWarm, grain);
      base *= 0.65 + 0.7 * grain;

      float inner = smoothstep(0.0, -0.22, fsd);

      vec3 floorCol = base * (0.10 + 0.95 * lum) + light * (0.55 + 0.45 * inner) * uGlow;

      // Light falls off up the bank, and the bank itself sits in shadow.
      floorCol *= 1.0 - 0.72 * wall;
      floorCol += (uFloorWarm * 0.13 + uFloorDeep * 0.34) * wall * (1.0 - wall * 0.55);

      float edge = smoothstep(0.055, -0.05, sd);
      col = mix(col, floorCol, edge);
    }
  }

  outColor = vec4(col, alpha);
}
`;

const BLOOM_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uVP;
uniform vec4 uBloomA[${MAX_BLOOMS}];  // x, z, size, type
uniform float uFloorY;
uniform vec2 uPool;
out vec2 vLocal;
flat out int vId;
void main() {
  vec4 A = uBloomA[gl_InstanceID];
  vLocal = aPos;
  vId = gl_InstanceID;
  vec3 w = vec3(A.x * uPool.x * 0.43 + aPos.x * A.z, uFloorY + 0.004, A.y * uPool.y * 0.43 + aPos.y * A.z);
  gl_Position = uVP * vec4(w, 1.0);
}
`;

const BLOOM_FS = `#version 300 es
precision highp float;
${NOISE_LIB}
in vec2 vLocal;
flat in int vId;
out vec4 outColor;
uniform vec4 uBloomA[${MAX_BLOOMS}];  // x, z, size, type
uniform vec4 uBloomB[${MAX_BLOOMS}];  // open, energy, phase, petals
uniform vec3 uWarm;
uniform vec3 uCool;
uniform float uTime;

void main() {
  vec4 B = uBloomB[vId];
  float open = B.x;
  float energy = B.y;
  float phase = B.z;
  float petals = B.w;
  float type = uBloomA[vId].w;

  vec2 p = vLocal;
  float r = length(p);
  float a = atan(p.y, p.x) + phase + open * 0.55;

  float edge;
  if (type < 0.5) {
    edge = 0.34 + 0.34 * cos(petals * a);
    edge += 0.10 * cos(petals * 2.0 * a + 1.1);
  } else if (type < 1.5) {
    float k = abs(cos(2.5 * a));
    edge = 0.20 + 0.44 * pow(k, 0.55);
  } else {
    float fan = smoothstep(-0.9, 0.5, sin(a));
    edge = (0.20 + 0.34 * fan) * (0.90 + 0.10 * cos(9.0 * a));
  }
  edge *= 0.52 + 0.95 * open;

  float d = r - edge;
  float body = smoothstep(0.055, -0.03, d);
  float ring = exp(-pow(d / (0.030 + 0.05 * open), 2.0));
  float core = exp(-pow(r / max(edge * 0.55, 0.02), 2.0));

  // Rays of light thrown out at the moment of opening.
  float rays = pow(abs(cos(petals * 0.5 * a + uTime * 0.5)), 12.0)
             * exp(-max(r - edge, 0.0) * 6.0) * open;

  vec3 warm = uWarm;
  vec3 cool = uCool;
  // A halo so an open flower sits inside its own pool of light rather than
  // looking like a sticker on the floor.
  float halo = exp(-r * r * 1.5) * open;
  vec3 col = mix(cool, warm, 0.30 + 0.45 * open + 0.25 * core);

  // Asleep it is a translucent outline you can just make out; as it charges it
  // glows from within; open, it blazes.
  float breathe = 0.86 + 0.14 * sin(uTime * 1.6 + phase * 3.0);
  float lum = 0.15 + 0.75 * energy * energy + 2.15 * open * breathe;

  float shape = body * 0.10 + ring * (0.72 + 1.3 * open)
              + core * (0.10 + 1.30 * open) + rays * 0.85;
  vec3 outc = col * shape * lum;
  outc += mix(warm, vec3(1.0), 0.5) * halo * 0.55;
  outc += vec3(1.0, 0.97, 0.93) * core * pow(open, 2.0) * 0.6;

  outColor = vec4(outc, 1.0);
}
`;

const BUBBLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uVP;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec4 uBubble[${MAX_BUBBLES}];  // x, y, z, size
out vec2 vLocal;
flat out int vId;
void main() {
  vec4 B = uBubble[gl_InstanceID];
  vLocal = aPos;
  vId = gl_InstanceID;
  vec3 w = B.xyz + (uRight * aPos.x + uUp * aPos.y) * B.w;
  gl_Position = uVP * vec4(w, 1.0);
}
`;

const BUBBLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in int vId;
out vec4 outColor;
uniform vec4 uBubble[${MAX_BUBBLES}];
uniform vec3 uCool;
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  float rim = smoothstep(0.62, 0.97, r) * smoothstep(1.0, 0.94, r);
  vec2 sp = vLocal - vec2(-0.34, 0.34);
  float spec = exp(-dot(sp, sp) / 0.035);
  vec2 sp2 = vLocal - vec2(0.30, -0.36);
  float spec2 = exp(-dot(sp2, sp2) / 0.12) * 0.35;
  vec3 col = mix(uCool, vec3(1.0), spec);
  float i = rim * 0.55 + spec * 0.85 + spec2;
  outColor = vec4(col * i * 0.55, 1.0);
}
`;

const WATER_FS = `#version 300 es
precision highp float;
${RG_LIB}
${NOISE_LIB}
${POOL_LIB}
${COMMON}
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uScene;
uniform sampler2D uSlope;
uniform vec2 uSlopeRes;
uniform vec2 uPool;
uniform float uRound;
uniform float uDepth;
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uWaterTint;
uniform vec2 uAxisX;
uniform vec2 uAxisZ;
uniform float uRefract;
uniform vec4 uHint;      // uv.xy, strength, radius
uniform float uFinale;

vec3 skyCol(vec3 d) {
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.020, 0.045, 0.085), vec3(0.10, 0.155, 0.235), pow(up, 0.65));
  float s = max(dot(d, -uLightDir), 0.0);
  c += uSunColor * pow(s, 7.0) * 0.16;
  c += uSunColor * pow(s, 90.0) * 1.1;
  c += vec3(0.16, 0.10, 0.14) * pow(max(-d.y * 0.0 + max(dot(d, vec3(0.0, 1.0, 0.0)), 0.0), 0.0), 3.0) * 0.25;
  return c;
}

void main() {
  vec3 col = texture(uScene, vUv).rgb;
  vec3 dir = rayDir(vUv);

  if (dir.y < -0.0005) {
    float t = -uCamPos.y / dir.y;
    vec3 hit = uCamPos + dir * t;
    float sd = poolSdf(hit.xz, uPool * 0.5, uRound);
    if (sd < 0.14) {
      vec2 suv = hit.xz / uPool + 0.5;
      vec2 g = rgLoad(uSlope, suv, uSlopeRes);
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

      // Refraction: shift the lookup into the underwater buffer along the
      // surface tilt, projected into screen space.
      vec2 off = (n.x * uAxisX + n.z * uAxisZ) * uRefract;
      vec3 under = texture(uScene, clamp(vUv + off, vec2(0.001), vec2(0.999))).rgb;

      // Absorb along the real path length through the water.
      float path = uDepth / max(-dir.y, 0.18);
      under *= exp(-path * uWaterTint);

      vec3 V = normalize(uCamPos - hit);
      float ndv = max(dot(n, V), 0.0);
      float fres = 0.035 + 0.90 * pow(1.0 - ndv, 5.0);

      vec3 R = reflect(-V, n);
      vec3 sky = skyCol(R);

      vec3 L = -uLightDir;
      vec3 H = normalize(V + L);
      float ndh = max(dot(n, H), 0.0);
      float spec = pow(ndh, 900.0) * 3.4 + pow(ndh, 60.0) * 0.09;

      vec3 water = mix(under, sky, fres);
      water += uSunColor * spec;

      // Sparkle rides only on moving water, so a still pool stays calm. The
      // branch is spatially coherent — whole regions are calm or they aren't.
      float act = smoothstep(0.10, 0.55, length(g));
      if (act > 0.01) {
        float glint = pow(ndh, 260.0) * (0.35 + 1.5 * vnoise(hit.xz * 90.0 + uTime * 0.6)) * act;
        float dust = pow(vnoise(hit.xz * 46.0 - uTime * 0.11), 40.0) * 90.0 * act;
        water += uSunColor * glint * 0.55;
        water += vec3(0.75, 0.9, 1.0) * dust * 0.05;
      }

      // A thin luminous seam where the pool dissolves into the dark.
      float rimGlow = exp(-pow(max(sd, -0.05) / 0.014, 2.0));
      water += mix(vec3(0.30, 0.62, 0.85), uSunColor, 0.35) * rimGlow * (0.09 + 0.14 * uFinale);

      // Wordless "touch me" pulse before the first touch.
      if (uHint.z > 0.001) {
        vec2 hp = (suv - uHint.xy) * uPool;
        float hr = length(hp);
        float rings = exp(-pow((hr - uHint.w) / 0.035, 2.0));
        water += vec3(0.55, 0.85, 1.0) * rings * uHint.z * 0.7;
      }

      float cover = smoothstep(0.055, -0.05, sd);
      col = mix(col, water, cover);
    }
  }

  outColor = vec4(col, 1.0);
}
`;

export class Scene {
  constructor(gl, quad, opts) {
    this.gl = gl;
    this.quad = quad;
    this.pool = opts.pool;
    this.depth = opts.depth;
    this.packed = !opts.float;
    const pre = (s) => (this.packed ? s.replace('precision highp float;', 'precision highp float;\n#define PACKED 1') : s);

    const fmt = opts.float
      ? { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR }
      : { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR };
    this.fmt = fmt;
    this.under = new Target(gl, opts.width, opts.height, fmt);
    this.out = new Target(gl, opts.width, opts.height, fmt);

    this.pFloor = new Program(gl, SCREEN_VS, FLOOR_FS, 'floor');
    this.pBloom = new Program(gl, BLOOM_VS, BLOOM_FS, 'bloomers');
    this.pBubble = new Program(gl, BUBBLE_VS, BUBBLE_FS, 'bubbles');
    this.pWater = new Program(gl, SCREEN_VS, pre(WATER_FS), 'water');

    // Unit quad for the instanced billboards.
    this.spriteVao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.bloomA = new Float32Array(MAX_BLOOMS * 4);
    this.bloomB = new Float32Array(MAX_BLOOMS * 4);
    this.bubbleData = new Float32Array(MAX_BUBBLES * 4);
    this.round = 0.30;   // corner radius in world units
  }

  resize(w, h) {
    this.under.resize(w, h);
    this.out.resize(w, h);
  }

  render(env) {
    const gl = this.gl;
    const { session, camera, caustics, sim, blooms, bubbles, time } = env;
    const F = session.floor;
    const T = session.tint;

    // ---- underwater -----------------------------------------------------
    this.under.bind();
    gl.disable(gl.BLEND);
    this.pFloor.use()
      .tex('uCaustic', caustics.texture)
      .set('uInvVP', camera.invVP)
      .set('uCamPos', camera.pos)
      .set('uPool', this.pool[0], this.pool[1])
      .set('uCPool', caustics.cPool[0], caustics.cPool[1])
      .set('uFloorY', -this.depth)
      .set('uCScale', caustics.outScale)
      .set('uCTexel', 1 / caustics.res[0], 1 / caustics.res[1])
      .set('uTime', time)
      .set('uRound', this.round)
      .set('uFloorBase', F.base)
      .set('uFloorWarm', F.warm)
      .set('uFloorDeep', F.deep)
      .set('uWarm', T.warm)
      .set('uCool', T.cool)
      .set('uGlow', env.glow);
    this.quad.draw();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (blooms.length) {
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i], o = i * 4;
        this.bloomA[o] = b.x; this.bloomA[o + 1] = b.z; this.bloomA[o + 2] = b.size; this.bloomA[o + 3] = b.type;
        this.bloomB[o] = b.open; this.bloomB[o + 1] = b.energy; this.bloomB[o + 2] = b.phase; this.bloomB[o + 3] = b.petals;
      }
      this.pBloom.use()
        .set('uVP', camera.vp)
        .set('uBloomA', this.bloomA)
        .set('uBloomB', this.bloomB)
        .set('uFloorY', -this.depth)
        .set('uPool', this.pool[0], this.pool[1])
        .set('uWarm', T.warm)
        .set('uCool', T.cool)
        .set('uTime', time);
      gl.bindVertexArray(this.spriteVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, blooms.length);
      gl.bindVertexArray(null);
    }

    if (bubbles.length) {
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i], o = i * 4;
        this.bubbleData[o] = b.x; this.bubbleData[o + 1] = b.y; this.bubbleData[o + 2] = b.z; this.bubbleData[o + 3] = b.size;
      }
      this.pBubble.use()
        .set('uVP', camera.vp)
        .set('uRight', camera.right)
        .set('uUp', camera.up)
        .set('uBubble', this.bubbleData)
        .set('uCool', T.cool);
      gl.bindVertexArray(this.spriteVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, bubbles.length);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.BLEND);

    // ---- surface --------------------------------------------------------
    this.out.bind();
    this.pWater.use()
      .tex('uScene', this.under.texture)
      .tex('uSlope', sim.slopeTexture)
      .set('uSlopeRes', sim.res[0], sim.res[1])
      .set('uInvVP', camera.invVP)
      .set('uCamPos', camera.pos)
      .set('uPool', this.pool[0], this.pool[1])
      .set('uRound', this.round)
      .set('uDepth', this.depth)
      .set('uTime', time)
      .set('uLightDir', caustics.lightDir)
      .set('uSunColor', env.sunColor)
      .set('uWaterTint', env.waterAbsorb)
      .set('uAxisX', camera.axisX)
      .set('uAxisZ', camera.axisZ)
      .set('uRefract', env.refract)
      .set('uHint', env.hint)
      .set('uFinale', env.finale);
    this.quad.draw();

    return this.out.texture;
  }
}
