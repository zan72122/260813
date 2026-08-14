// The white starch surface.
//
// NO powder physics. Everything is faked with three grayscale canvases that
// drive one displacement shader:
//
//   rough  : how lumpy the surface still is        (flatten swipes erase it)
//   cavity : the holes bitten by the stamp         (also reused as "buried
//            gummy bumps" once the tray is flipped)
//   cover  : how much powder is still lying there  (the brush erases it)
//
// `rough` and `cover` are erased with destination-out, so their signal lives
// in the ALPHA channel (RGB survives compositing); `cavity` is additive on an
// opaque canvas and lives in RED.
//
// The canvases keep the field's own aspect ratio, so one world unit is the
// same number of texels along x and z - a round brush stays round.
//
// A finite-difference normal off the same height function gives the surface
// its shading, so a stroke of the brush instantly reads as a groove.

import * as THREE from 'three';
import { QUALITY, TRAY, WHITE_WORLD } from './config.js';
import { traceShape } from './shapes.js';

const VERT = /* glsl */ `
uniform sampler2D uRough;
uniform sampler2D uCavity;
uniform sampler2D uCover;
uniform float uPhase;      // 0 = flat tray of starch, 1 = the mound after the flip
uniform float uLumpAmp;
uniform float uCavityDepth;
uniform float uMoundAmp;
uniform vec2 uTexel;
uniform vec2 uWorld;       // field size, so noise frequency is in world units

varying vec2 vUv;
varying vec3 vNrm;
varying float vCav;
varying float vCov;
varying float vRough;
varying float vH;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

// uPhase is a uniform, so this branch is coherent for the whole draw call and
// only one of the two height fields is ever evaluated.
float heightAt(vec2 uv) {
  vec2 w = uv * uWorld * 0.12;
  float cav = texture2D(uCavity, uv).r;
  if (uPhase < 0.5) {
    // tray phase: lumpy starch minus the stamped holes
    float rough = texture2D(uRough, uv).a;
    float lumps = (fbm(w * 6.0) - 0.5) * 2.0 * uLumpAmp * rough;
    return lumps - uCavityDepth * cav;
  }
  // mound phase: a heap of powder, humped a little over each buried gummy.
  // The edges taper so it reads as a heap poured onto a table, not a slab.
  float cov  = texture2D(uCover, uv).a;
  // a wide taper on all four sides turns the slab into a heap
  float edge = smoothstep(0.0, 0.26, uv.x) * smoothstep(0.0, 0.26, 1.0 - uv.x)
             * smoothstep(0.0, 0.28, uv.y) * smoothstep(0.0, 0.28, 1.0 - uv.y);
  float heap = (uMoundAmp * (0.6 + 0.4 * fbm(w * 4.0)) + 0.42 * cav) * edge;
  // the surface drops away quickly once the brush thins the cover, so one
  // stroke is already enough to break through to whatever is underneath
  return heap * smoothstep(0.05, 0.8, cov);
}

void main() {
  vUv = uv;
  float h = heightAt(uv);
  float hx = heightAt(uv + vec2(uTexel.x, 0.0));
  float hz = heightAt(uv + vec2(0.0, uTexel.y));

  // uv.y grows towards -z (see worldToTex), hence the sign on the z tangent
  vec3 tx = vec3(uTexel.x * uWorld.x, hx - h, 0.0);
  vec3 tz = vec3(0.0, hz - h, -uTexel.y * uWorld.y);
  vNrm = normalize(cross(tz, tx));

  vCav = texture2D(uCavity, uv).r;
  vCov = texture2D(uCover, uv).a;
  vRough = texture2D(uRough, uv).a;
  vH = h;

  vec3 p = position + vec3(0.0, h, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uShade;
uniform vec3 uLight;
uniform float uPhase;
uniform float uGrain;

varying vec2 vUv;
varying vec3 vNrm;
varying float vCav;
varying float vCov;
varying float vRough;
varying float vH;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  // crumbly, grainy edge instead of a razor-cut polygon boundary
  float grain = hash(floor(vUv * 420.0));
  if (uPhase > 0.5 && vCov < 0.10 + 0.20 * grain) discard;
  // and the heap simply stops existing where it has thinned to nothing,
  // so its tapered rim melts into the table instead of ending on a line
  if (uPhase > 0.5 && vH < 0.02 + 0.05 * grain) discard;

  vec3 n = normalize(vNrm);
  float ndl = clamp(dot(n, normalize(uLight)) * 0.5 + 0.5, 0.0, 1.0);
  float sky = clamp(n.y, 0.0, 1.0);

  vec3 col = mix(uShade, uTop, ndl * 0.75 + sky * 0.25);

  // ambient occlusion in the stamped holes, and along the brushed-away rim
  col *= 1.0 - 0.42 * vCav * (1.0 - uPhase);
  col *= 1.0 - 0.30 * smoothstep(0.6, 0.08, vCov) * uPhase;

  // dry starch sparkle
  col += (hash(floor(vUv * 900.0)) - 0.5) * uGrain;
  // still-lumpy powder looks a touch dirtier so flattening feels like progress
  col -= vRough * 0.05;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function makeCanvas(w, h, fill) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
  }
  return { canvas: c, ctx };
}

export class PowderField {
  /**
   * @param {{ phase?: number, width?: number, depth?: number }} [opts]
   */
  constructor(opts = {}) {
    this.width = opts.width ?? TRAY.w;
    this.depth = opts.depth ?? TRAY.d;
    this.texW = QUALITY.texSize;
    this.texH = Math.max(8, Math.round((QUALITY.texSize * this.depth) / this.width));

    this.rough = makeCanvas(this.texW, this.texH, '#ffffff'); // starts lumpy
    this.cavity = makeCanvas(this.texW, this.texH, '#000000'); // starts hole-free
    this.cover = makeCanvas(this.texW, this.texH, '#ffffff'); // starts covered

    this.texRough = new THREE.CanvasTexture(this.rough.canvas);
    this.texCavity = new THREE.CanvasTexture(this.cavity.canvas);
    this.texCover = new THREE.CanvasTexture(this.cover.canvas);
    for (const t of [this.texRough, this.texCavity, this.texCover]) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }

    const g = QUALITY.grid;
    const gz = Math.max(8, Math.round((g * this.depth) / this.width));
    const geo = new THREE.PlaneGeometry(this.width, this.depth, g, gz);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uRough: { value: this.texRough },
        uCavity: { value: this.texCavity },
        uCover: { value: this.texCover },
        uPhase: { value: opts.phase ?? 0 },
        uLumpAmp: { value: TRAY.lumpAmp },
        uCavityDepth: { value: TRAY.cavityDepth },
        uMoundAmp: { value: TRAY.moundAmp },
        uTexel: { value: new THREE.Vector2(1 / this.texW, 1 / this.texH) },
        uWorld: { value: new THREE.Vector2(this.width, this.depth) },
        uTop: { value: new THREE.Color(WHITE_WORLD.powder) },
        uShade: { value: new THREE.Color(WHITE_WORLD.powderShade) },
        uLight: { value: new THREE.Vector3(0.45, 1.0, 0.6).normalize() },
        uGrain: { value: 0.055 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;

    this._roughDirty = false;
    this._coverDirty = false;
    /** @type {ImageData|null} cached readback, refreshed at most every 90ms */
    this._snap = null;
    this._snapAt = -1e9;
  }

  get phase() {
    return this.material.uniforms.uPhase.value;
  }
  set phase(v) {
    this.material.uniforms.uPhase.value = v;
  }

  /** world (x,z) on the field -> canvas pixel coords */
  worldToTex(x, z) {
    return [
      ((x + this.width / 2) / this.width) * this.texW,
      ((z + this.depth / 2) / this.depth) * this.texH,
    ];
  }

  /** world units -> canvas pixels (isotropic by construction) */
  texScale() {
    return this.texW / this.width;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  _stroke(ctx, x0, z0, x1, z1, radiusWorld, passes) {
    const [px0, py0] = this.worldToTex(x0, z0);
    const [px1, py1] = this.worldToTex(x1, z1);
    const r = radiusWorld * this.texScale();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, a] of passes) {
      ctx.lineWidth = r * w;
      ctx.strokeStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // -- flattening -----------------------------------------------------------
  /** Rub the lumps out along a world-space segment. */
  smooth(x0, z0, x1, z1, radiusWorld = 1.6) {
    this._stroke(this.rough.ctx, x0, z0, x1, z1, radiusWorld, [
      [2.6, 0.14],
      [1.5, 0.34],
      [0.9, 0.6],
    ]);
    this._roughDirty = true;
  }

  /** Perfectly flat: used by the idle-assist timer and by tests. */
  smoothAll() {
    const ctx = this.rough.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, this.texW, this.texH);
    ctx.restore();
    this._roughDirty = true;
  }

  // -- stamping -------------------------------------------------------------
  /**
   * Bite the cavities into the surface. Several scaled passes give each hole a
   * soft shoulder - the little wall of starch pushed aside by the stamp.
   * @param {{x:number,z:number,spec:import('./shapes.js').ShapeSpec,size:number}[]} cells
   */
  stamp(cells) {
    const ctx = this.cavity.ctx;
    const s = this.texScale();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const c of cells) {
      const [px, py] = this.worldToTex(c.x, c.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, -1); // canvas y grows with world z; traceShape flips y
      for (const [scale, alpha] of [
        [1.5, 0.1],
        [1.34, 0.13],
        [1.18, 0.18],
        [1.06, 0.24],
        [1.0, 1.0],
      ]) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        traceShape(ctx, c.spec, 0, 0, c.size * s * scale);
      }
      ctx.restore();
    }
    ctx.restore();
    this.texCavity.needsUpdate = true;
  }

  /**
   * After the flip the cavity channel is repurposed: soft humps that hint at
   * something buried without ever showing a colour.
   * @param {{x:number,z:number,size:number}[]} spots
   */
  setBumps(spots) {
    const ctx = this.cavity.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.texW, this.texH);
    ctx.globalCompositeOperation = 'lighter';
    const s = this.texScale();
    for (const p of spots) {
      const [px, py] = this.worldToTex(p.x, p.z);
      const r = Math.max(2, p.size * s * 1.7);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.texCavity.needsUpdate = true;
  }

  // -- digging --------------------------------------------------------------
  /**
   * Sweep powder away along a world segment. Three passes, widest and
   * faintest first: the powder thins before it disappears, which is what
   * stages the reveal (colour -> outline -> whole gummy).
   */
  brush(x0, z0, x1, z1, radiusWorld = 1.35) {
    this._stroke(this.cover.ctx, x0, z0, x1, z1, radiusWorld, [
      [2.2, 0.14],
      [1.4, 0.26],
      [0.82, 0.6],
    ]);
    this._coverDirty = true;
  }

  /** Blow the last of the powder away (the finale pull-back). */
  clearCover() {
    const ctx = this.cover.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, this.texW, this.texH);
    ctx.restore();
    this._coverDirty = true;
    this._snap = null;
    this._snapAt = -1e9;
    this.texCover.needsUpdate = true;
  }

  /** Put every grain of powder back (free-play round restart). */
  resetCover() {
    const ctx = this.cover.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.texW, this.texH);
    ctx.restore();
    this._coverDirty = true;
    this._snap = null;
    this._snapAt = -1e9;
    this.texCover.needsUpdate = true;
  }

  // -- readback -------------------------------------------------------------
  _snapshot(now) {
    if (this._snap && now - this._snapAt < 90) return this._snap;
    this._snap = this.cover.ctx.getImageData(0, 0, this.texW, this.texH);
    this._snapAt = now;
    return this._snap;
  }

  /** Coverage 0..1 at a world position (1 = still buried). */
  coverAt(x, z, now = 0) {
    const img = this._snapshot(now);
    const [px, py] = this.worldToTex(x, z);
    const ix = Math.max(0, Math.min(this.texW - 1, Math.round(px)));
    const iy = Math.max(0, Math.min(this.texH - 1, Math.round(py)));
    return img.data[(iy * this.texW + ix) * 4 + 3] / 255;
  }

  /**
   * Global progress on a coarse lattice. 1 = fully flattened / fully dug out.
   * @param {'cover'|'rough'} which
   */
  measure(which = 'cover', now = 0) {
    // the cover channel already has a throttled snapshot; reuse it rather than
    // reading the whole canvas back twice per frame
    const img =
      which === 'cover'
        ? this._snapshot(now).data
        : this.rough.ctx.getImageData(0, 0, this.texW, this.texH).data;
    const step = Math.max(1, Math.floor(this.texW / 28));
    let sum = 0;
    let n = 0;
    for (let y = 0; y < this.texH; y += step) {
      for (let x = 0; x < this.texW; x += step) {
        sum += img[(y * this.texW + x) * 4 + 3] / 255;
        n++;
      }
    }
    return 1 - sum / n;
  }

  /** Upload whatever changed; call once per frame. */
  flush() {
    if (this._roughDirty) {
      this.texRough.needsUpdate = true;
      this._roughDirty = false;
    }
    if (this._coverDirty) {
      this.texCover.needsUpdate = true;
      this._coverDirty = false;
      this._snapAt = -1e9;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texRough.dispose();
    this.texCavity.dispose();
    this.texCover.dispose();
  }
}
