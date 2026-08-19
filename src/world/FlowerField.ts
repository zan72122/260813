import * as THREE from 'three';
import { Env, ENV_GLSL, LIGHT_GLSL } from '../gfx/Env';
import { buildTulipGeometry, MID_TULIP, NEAR_TULIP } from '../gfx/tulipGeometry';
import { flowerPuffTexture, leafPuffTexture } from '../gfx/textures';
import { bandColor, Palette } from '../gfx/palettes';
import { QualitySettings } from '../core/Quality';
import { makeRng } from '../core/math';

/**
 * The whole flower field, in three draw calls.
 *
 * Nothing here is animated on the CPU. Each plant works out how far the bloom
 * front has passed it (`uWaveRadius`) and derives its own growth, opening and
 * sway from that single number, which is why 15,000 flowers can bloom in a wave
 * without a single per-object update.
 */

const TULIP_VERT = /* glsl */`
${ENV_GLSL}
attribute vec3  aBud;
attribute vec3  aBudNormal;
attribute float aPart;
attribute float aH;
attribute float aCup;
attribute vec3  iPos;
attribute vec3  iColor;
attribute vec3  iParam;   // x scale, y rotation, z phase
attribute vec2  iParam2;  // x wave jitter (m), y colour jitter

uniform vec3 uGreen;
uniform vec3 uGreenDark;
uniform vec3 uBudGreen;
uniform vec3 uPetalBase;
uniform float uGrowSpan;
uniform float uLeadOverride;   // hand-driven growth for the four hero plants

varying vec3  vCol;
varying vec3  vN;
varying vec3  vV;
varying float vTrans;
varying float vAO;
varying float vDist;

void main() {
  float d    = envWaveDist(iPos.xz);
  float lead = uLeadOverride > -9000.0
    ? uLeadOverride + iParam2.x
    : uWaveRadius - d + iParam2.x;

  float grow = smoothstep(0.0, uGrowSpan, lead);
  grow = grow * grow * (3.0 - 2.0 * grow);
  float open = smoothstep(uGrowSpan * 0.55, uGrowSpan * 2.1, lead);

  vec3 p = mix(aBud, position, open);
  vec3 n = normalize(mix(aBudNormal, normal, open));

  // shoot up first, fatten after: reads as growing, not inflating
  p.y  *= grow;
  p.xz *= mix(0.28, 1.0, grow);

  float s  = iParam.x;
  float c  = cos(iParam.y);
  float sn = sin(iParam.y);
  vec3 rp = vec3(c * p.x + sn * p.z, p.y, -sn * p.x + c * p.z);
  vec3 rn = vec3(c * n.x + sn * n.z, n.y, -sn * n.x + c * n.z);
  vec3 wp = rp * s + iPos;

  // one travelling wave shared by the whole field, plus a per-plant offset
  float ph = uTime * uWindSpeed + iParam.z + dot(iPos.xz, uWindDir) * 0.075;
  float w  = sin(ph) + 0.42 * sin(ph * 1.87 + 1.1);
  float h2 = aH * aH;
  wp.xz += uWindDir * (w * uWindAmp * h2 * s * 6.0);
  wp.y  -= abs(w) * uWindAmp * h2 * s * 0.9;

  vec4 world = modelMatrix * vec4(wp, 1.0);
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;

  float isPetal = step(1.5, aPart);
  float gv = hash11(iParam.z * 3.13 + 0.7);
  vec3 green = mix(uGreenDark, uGreen, 0.30 + 0.70 * aH) * (0.80 + 0.40 * gv);
  // real tulip petals pale out towards the throat of the cup
  vec3 flower = mix(mix(uPetalBase, iColor, 0.35), iColor, smoothstep(0.02, 0.30, aCup));
  flower = mix(flower, flower * 1.10, smoothstep(0.7, 1.0, aCup));
  vec3 petal = mix(uBudGreen, flower, smoothstep(0.04, 0.5, open)) * (0.93 + 0.14 * iParam2.y);
  vCol  = mix(green, petal, isPetal);
  vTrans = isPetal * 0.95 + 0.08;
  // deep inside the cup is shaded; so is the very bottom of the plant
  float cupAO = mix(0.42, 1.0, smoothstep(0.0, 0.55, aCup));
  vAO   = mix(mix(0.30, 1.0, smoothstep(0.0, 0.30, aH)), cupAO, isPetal);
  vN = rn;
  vV = normalize(cameraPosition - world.xyz);

  gl_Position = projectionMatrix * mv;
  // fully-unbloomed plants collapse to a point and cost nothing to rasterise
  if (grow <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const TULIP_FRAG = /* glsl */`
${ENV_GLSL}
${LIGHT_GLSL}
varying vec3  vCol;
varying vec3  vN;
varying vec3  vV;
varying float vTrans;
varying float vAO;
varying float vDist;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 col = envShade(vCol, N, normalize(vV), vTrans, vAO);
  col = envSaturate(col, 1.10);
  col = envFog(col, vDist);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const PUFF_VERT = /* glsl */`
${ENV_GLSL}
attribute vec3 iPos;
attribute vec3 iColor;
attribute vec3 iParam;  // x width, y height, z phase
uniform float uIgnoreWave;
uniform vec3  uGreenDark;
varying vec3  vCol;
varying vec2  vUv;
varying float vDist;
void main() {
  float lead = uWaveRadius - envWaveDist(iPos.xz) + iParam.z * 0.6;
  float grow = mix(smoothstep(0.0, 5.0, lead), 1.0, uIgnoreWave);
  grow = grow * grow * (3.0 - 2.0 * grow);

  vec3 right = vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]);
  right = normalize(right + vec3(0.0001, 0.0, 0.0));

  float ph = uTime * uWindSpeed * 0.8 + iParam.z * 6.28 + dot(iPos.xz, uWindDir) * 0.05;
  float sway = sin(ph) * uWindAmp * 4.0;

  vec2 q = position.xy;
  vec3 wp = iPos
    + right * (q.x * iParam.x * mix(0.5, 1.0, grow))
    + vec3(0.0, 1.0, 0.0) * ((q.y + 0.5) * iParam.y * grow);
  wp.xz += uWindDir * (sway * (q.y + 0.5) * iParam.y);

  vUv = uv;
  // stems and leaves below, flower colour above
  vCol = mix(uGreenDark, iColor, smoothstep(0.02, 0.22, uv.y) * mix(1.0, 0.9, uIgnoreWave));
  vec4 world = modelMatrix * vec4(wp, 1.0);
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
  if (grow <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const PUFF_FRAG = /* glsl */`
${ENV_GLSL}
uniform sampler2D uMap;
varying vec3 vCol;
varying vec2 vUv;
varying float vDist;
void main() {
  float a = texture2D(uMap, vUv).a;
  // A low cutoff on purpose: mip filtering drags distant alpha down, and a high
  // threshold would quietly delete the whole horizon.
  if (a < 0.22) discard;
  // fake a top-lit mass without paying for real lighting
  float lift = 0.80 + 0.34 * vUv.y;
  vec3 col = vCol * lift * (uSunColor * 0.88 + uSkyColor * 0.18) * 1.04 * uExposure;
  col = envSaturate(col, 1.16);
  col = envFog(col, vDist);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export interface FieldConfig {
  palette: Palette;
  seed: number;
  /** unit vector biasing which way the bloom wave sweeps */
  waveDir: THREE.Vector2;
  origin: THREE.Vector3;
}

/**
 * Points laid out so that *screen* density stays roughly constant.
 *
 * A uniform scatter over a 300 m disc would put almost every instance at the
 * horizon, where it is a single pixel. Spacing radii logarithmically gives
 * density proportional to 1/r-squared, which is what a perspective camera undoes:
 * the field looks equally full at your feet and at the skyline, for a fixed
 * number of instances.
 */
function logPoints(n: number, rMin: number, rMax: number, rng: () => number) {
  const pts: { x: number; z: number; r: number }[] = [];
  const GA = 2.399963229728653;
  const k = Math.log(rMax / rMin);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = rMin * Math.exp(k * u);
    const a = i * GA + rng() * 0.5;
    const jit = r * 0.22;
    pts.push({
      x: Math.cos(a) * r + (rng() - 0.5) * jit,
      z: Math.sin(a) * r + (rng() - 0.5) * jit,
      r,
    });
  }
  return pts;
}

export class FlowerField {
  readonly group = new THREE.Group();
  private near!: THREE.Mesh;
  private mid!: THREE.Mesh;
  private far!: THREE.Mesh;
  private grass!: THREE.Mesh;
  private mats: THREE.ShaderMaterial[] = [];
  private cfg!: FieldConfig;

  constructor(private env: Env, private q: QualitySettings) {
    this.group.name = 'flowerField';
  }

  build(cfg: FieldConfig) {
    this.cfg = cfg;
    this.dispose();
    const { palette } = cfg;
    const rng = makeRng(cfg.seed);

    const greenU = {
      uGreen: { value: new THREE.Color(palette.green) },
      uGreenDark: { value: new THREE.Color(palette.greenDark) },
      uBudGreen: { value: new THREE.Color('#6fae55') },
      uPetalBase: { value: new THREE.Color('#fff3d6') },
    };

    // ------------------------------------------------------------- near ----
    this.near = this.makeTulipMesh(
      buildTulipGeometry(NEAR_TULIP),
      logPoints(this.q.nearFlowers, 0.85, 6.5, rng),
      { min: 0.38, max: 0.54 }, greenU, rng, 3.0,
    );
    // ------------------------------------------------------------- mid -----
    this.mid = this.makeTulipMesh(
      buildTulipGeometry(MID_TULIP),
      logPoints(this.q.midFlowers, 1.1, 36, rng),
      { min: 0.34, max: 0.52 }, greenU, rng, 3.6,
    );
    // ------------------------------------------------------------- far -----
    this.far = this.makePuffMesh(this.q.farFlowers, 4.5, 300, false, rng);
    // sparse muted tufts that exist from the very first frame, so the empty
    // field still has a sense of scale before anything blooms
    this.grass = this.makePuffMesh(Math.round(this.q.farFlowers * 0.055), 2.2, 190, true, rng);

    this.group.add(this.near, this.mid, this.grass, this.far);
    return this;
  }

  private baseUniforms() {
    return { ...(this.env.u as unknown as Record<string, THREE.IUniform>) };
  }

  private makeTulipMesh(
    base: THREE.BufferGeometry,
    pts: { x: number; z: number; r: number }[],
    scale: { min: number; max: number },
    greenU: Record<string, THREE.IUniform>,
    rng: () => number,
    growSpan: number,
  ) {
    const n = pts.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const k of ['position', 'normal', 'aBud', 'aBudNormal', 'aPart', 'aH', 'aCup']) {
      geo.setAttribute(k, base.getAttribute(k));
    }
    const iPos = new Float32Array(n * 3);
    const iColor = new Float32Array(n * 3);
    const iParam = new Float32Array(n * 3);
    const iParam2 = new Float32Array(n * 2);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      iPos[i * 3] = p.x; iPos[i * 3 + 1] = 0; iPos[i * 3 + 2] = p.z;
      bandColor(p.x, p.z, this.cfg.palette, this.cfg.seed, c);
      iColor[i * 3] = c.r; iColor[i * 3 + 1] = c.g; iColor[i * 3 + 2] = c.b;
      iParam[i * 3] = scale.min + rng() * (scale.max - scale.min);
      iParam[i * 3 + 1] = rng() * Math.PI * 2;
      iParam[i * 3 + 2] = rng() * 100;
      iParam2[i * 2] = (rng() - 0.5) * 2.4;
      iParam2[i * 2 + 1] = rng();
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iParam', new THREE.InstancedBufferAttribute(iParam, 3));
    geo.setAttribute('iParam2', new THREE.InstancedBufferAttribute(iParam2, 2));
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.baseUniforms(), ...greenU,
        uGrowSpan: { value: growSpan },
        uLeadOverride: { value: -9999 },
      },
      vertexShader: TULIP_VERT,
      fragmentShader: TULIP_FRAG,
      side: THREE.DoubleSide,
    });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  private makePuffMesh(n: number, rMin: number, rMax: number, isGrass: boolean, rng: () => number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));

    const iPos = new Float32Array(n * 3);
    const iColor = new Float32Array(n * 3);
    const iParam = new Float32Array(n * 3);
    const c = new THREE.Color();
    const pts = logPoints(n, rMin, rMax, rng);
    const KHAKI = new THREE.Color('#9a9153');
    const gDark = new THREE.Color(this.cfg.palette.greenDark);
    const gLight = new THREE.Color(this.cfg.palette.green);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      iPos[i * 3] = p.x; iPos[i * 3 + 1] = 0; iPos[i * 3 + 2] = p.z;
      if (isGrass) {
        c.copy(gDark).lerp(gLight, rng() * 0.55).lerp(KHAKI, 0.35 + rng() * 0.3).multiplyScalar(0.62 + rng() * 0.24);
      } else {
        bandColor(p.x, p.z, this.cfg.palette, this.cfg.seed, c);
      }
      iColor[i * 3] = c.r; iColor[i * 3 + 1] = c.g; iColor[i * 3 + 2] = c.b;
      // puffs grow with distance so coverage holds up as the density thins out
      const w = (isGrass ? 0.16 : 0.62) + p.r * (isGrass ? 0.0085 : 0.036) * (0.75 + rng() * 0.5);
      iParam[i * 3] = w;
      iParam[i * 3 + 1] = w * (isGrass ? 1.15 : 0.78) * (0.8 + rng() * 0.45);
      iParam[i * 3 + 2] = rng();
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iParam', new THREE.InstancedBufferAttribute(iParam, 3));
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.baseUniforms(),
        uMap: { value: isGrass ? leafPuffTexture() : flowerPuffTexture() },
        uIgnoreWave: { value: isGrass ? 1 : 0 },
        uGreenDark: { value: new THREE.Color(isGrass ? '#5d6b3c' : this.cfg.palette.greenDark) },
      },
      vertexShader: PUFF_VERT,
      fragmentShader: PUFF_FRAG,
      side: THREE.DoubleSide,
    });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = isGrass ? 0 : 2;
    return mesh;
  }

  /**
   * Swap the palette without rebuilding any geometry. "Different colours" on
   * the replay menu only changes what is in the colour attributes, so there is
   * no reason to throw away 12,000 instances and make them again.
   */
  recolor(palette: Palette, seed: number) {
    this.cfg.palette = palette;
    this.cfg.seed = seed;
    const c = new THREE.Color();
    const KHAKI = new THREE.Color('#5d6b3c');
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry as THREE.InstancedBufferGeometry;
      const mat = mesh.material as THREE.ShaderMaterial;
      const isGrass = (mat.uniforms.uIgnoreWave?.value ?? 0) === 1;
      const pos = geo.getAttribute('iPos') as THREE.InstancedBufferAttribute;
      const col = geo.getAttribute('iColor') as THREE.InstancedBufferAttribute;
      const arr = col.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        if (isGrass) continue;
        bandColor(pos.getX(i), pos.getZ(i), palette, seed, c);
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
      col.needsUpdate = true;
      if (mat.uniforms.uGreen) (mat.uniforms.uGreen.value as THREE.Color).set(palette.green);
      if (mat.uniforms.uGreenDark && !isGrass) {
        (mat.uniforms.uGreenDark.value as THREE.Color).set(palette.greenDark);
      }
      if (isGrass) (mat.uniforms.uGreenDark.value as THREE.Color).copy(KHAKI);
    }
  }

  dispose() {
    for (const m of this.group.children.slice()) {
      this.group.remove(m);
      const mesh = m as THREE.Mesh;
      mesh.geometry?.dispose();
    }
    for (const m of this.mats) {
      const map = m.uniforms.uMap?.value as THREE.Texture | undefined;
      map?.dispose();
      m.dispose();
    }
    this.mats.length = 0;
  }
}


/* -------------------------------------------------------------------------- */
/*  Hero plants                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The four tulips that grow exactly where the child put a bulb. Same shader as
 * the field, but their growth is driven by hand so the first flower can open in
 * close-up, on cue, before the wave is allowed to start.
 */
export class HeroPlants {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(env: Env, palette: Palette, spots: { x: number; z: number }[], seed: number) {
    const base = buildTulipGeometry(NEAR_TULIP);
    const n = spots.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const k of ['position', 'normal', 'aBud', 'aBudNormal', 'aPart', 'aH', 'aCup']) {
      geo.setAttribute(k, base.getAttribute(k));
    }
    const iPos = new Float32Array(n * 3);
    const iColor = new Float32Array(n * 3);
    const iParam = new Float32Array(n * 3);
    const iParam2 = new Float32Array(n * 2);
    const rng = makeRng(seed ^ 0x5f5f);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      iPos[i * 3] = spots[i].x; iPos[i * 3 + 1] = 0; iPos[i * 3 + 2] = spots[i].z;
      // the hero colours are picked far apart in the palette so the row reads
      c.set(palette.flowers[(i * 3 + 1) % palette.flowers.length]);
      iColor[i * 3] = c.r; iColor[i * 3 + 1] = c.g; iColor[i * 3 + 2] = c.b;
      iParam[i * 3] = 0.50 + rng() * 0.07;
      iParam[i * 3 + 1] = rng() * Math.PI * 2;
      iParam[i * 3 + 2] = rng() * 100;
      // instance 0 is the one the camera watches, so it leads
      // the last one in the row leads, because that is the one the close-up watches
      iParam2[i * 2] = -(n - 1 - i) * 1.15;
      iParam2[i * 2 + 1] = rng();
    }
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iParam', new THREE.InstancedBufferAttribute(iParam, 3));
    geo.setAttribute('iParam2', new THREE.InstancedBufferAttribute(iParam2, 2));
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...(env.u as unknown as Record<string, THREE.IUniform>),
        uGreen: { value: new THREE.Color(palette.green) },
        uGreenDark: { value: new THREE.Color(palette.greenDark) },
        uBudGreen: { value: new THREE.Color('#6fae55') },
        uPetalBase: { value: new THREE.Color('#fff3d6') },
        uGrowSpan: { value: 3.0 },
        uLeadOverride: { value: -6 },
      },
      vertexShader: TULIP_VERT,
      fragmentShader: TULIP_FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Metres of "wave lead": below 0 nothing shows, ~9 is a fully open flower. */
  setLead(v: number) { this.mat.uniforms.uLeadOverride.value = v; }
  get lead() { return this.mat.uniforms.uLeadOverride.value as number; }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
