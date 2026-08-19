import * as THREE from 'three';
import { Env, ENV_GLSL, LIGHT_GLSL } from '../gfx/Env';
import { detailTexture, soilTexture } from '../gfx/textures';
import { bandColor, Palette } from '../gfx/palettes';
import { fbm2, smoothstep } from '../core/math';

/**
 * The field itself.
 *
 * The ground carries a second "carpet" colour that the bloom wave reveals. That
 * is the trick that makes the horizon read as solid tulips: the distant field is
 * literally coloured like tulips, and the instanced flowers only have to supply
 * texture on top of it. Geometry count stays flat no matter how far you can see.
 */

const GROUND_VERT = /* glsl */`
${ENV_GLSL}
attribute float aOcc;   // 1 = open sky, 0 = deep inside a dug hole
varying vec3 vWorld;
varying vec3 vN;
varying float vDist;
varying float vOcc;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vOcc = aOcc;
  vec4 mv = viewMatrix * world;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GROUND_FRAG = /* glsl */`
${ENV_GLSL}
${LIGHT_GLSL}
uniform sampler2D uSoil;
uniform sampler2D uCarpet;
uniform sampler2D uDetail;
uniform float uCarpetSize;
uniform vec3  uGreen;
uniform vec3  uGreenDark;
uniform vec2  uWetCenter;
uniform float uWetRadius;
uniform float uWetAmount;
uniform vec2  uCutCenter;
uniform vec2  uCutHalf;
uniform float uCutAmount;
uniform vec3  uSoilTint;
varying vec3 vWorld;
varying vec3 vN;
varying float vDist;
varying float vOcc;

void main() {
  vec2 w = vWorld.xz;

  // The cut-away trench. Removing soil in the shader means the camera can dive
  // below the surface without any of the ground meshes being rebuilt.
  if (uCutAmount > 0.001) {
    float z0 = uCutCenter.y - uCutHalf.y;
    float z1 = z0 + 2.0 * uCutHalf.y * uCutAmount;
    if (abs(w.x - uCutCenter.x) < uCutHalf.x && w.y > z0 && w.y < z1) discard;
  }
  // Three scales of noise, from one tiling texture. They do double duty: they
  // break up the bare earth AND organise the flower carpet, which keeps this
  // shader - the one that covers the whole screen - down to five fetches.
  float n1 = texture2D(uDetail, w * 1.25).r;
  float n2 = texture2D(uDetail, w * 0.155).g;
  float n3 = texture2D(uDetail, w * 0.042).b;

  vec3 soil = texture2D(uSoil, w * 0.11).rgb * uSoilTint;
  soil *= (0.72 + 0.58 * n1) * (0.88 + 0.26 * n3);

  // damp earth: darker, slightly richer, with a soft edge
  float wet = uWetAmount * (1.0 - smoothstep(uWetRadius * 0.55, uWetRadius, distance(w, uWetCenter)));
  soil = mix(soil, soil * vec3(0.52, 0.45, 0.40), wet);

  vec3 band = texture2D(uCarpet, w / uCarpetSize + 0.5).rgb;
  vec3 leafy = mix(uGreenDark, uGreen, n1 * 0.55 + n3 * 0.45);
  float density = clamp(-0.34 + 0.98 * n2 + 0.44 * n1 + 0.26 * n3, 0.0, 1.0);
  // further away the individual plants merge into solid colour, which is
  // exactly what a real tulip field does
  density = mix(density, min(1.0, density * 0.42 + 0.46), smoothstep(7.0, 55.0, vDist));
  vec3 carpet = mix(leafy, band * (0.86 + 0.30 * n1), density);
  /*
   * The far half of the wind. Near and middle-distance plants sway as geometry,
   * but at the horizon individual stems are sub-pixel; what you actually see
   * there is a slow shimmer running across the colour. This is that.
   */
  float gust = sin(dot(w, uWindDir) * 0.055 - uTime * uWindSpeed * 0.85 + n3 * 3.0);
  carpet *= 1.0 + gust * 0.085 * smoothstep(14.0, 70.0, vDist) * (uWindAmp * 22.0);

  float lead = uWaveRadius - envWaveDist(w);
  float b = smoothstep(0.0, 4.5, lead);
  vec3 albedo = mix(soil, carpet, b);

  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = envShade(albedo, N, V, 0.05 + 0.25 * b, vOcc);
  col *= mix(0.34, 1.0, vOcc);
  col = envSaturate(col, mix(1.0, 1.14, b));
  col += uSunColor * wet * 0.12 * pow(clamp(dot(reflect(-uSunDir, N), V), 0.0, 1.0), 24.0);
  col = envFog(col, vDist);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** The trench the camera dives into, in world units. */
export const CUT = { cx: 0, cz: 1.50, hx: 2.4, hz: 1.50 };

export class Ground {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  /** every material that should react to wetness / the trench opening */
  private surfaces: THREE.ShaderMaterial[] = [];
  private carpetTex: THREE.CanvasTexture;
  private soilTex: THREE.Texture;
  private detailTex: THREE.Texture;
  readonly carpetSize = 620;

  constructor(env: Env, palette: Palette, seed: number, texSize = 512) {
    this.soilTex = soilTexture(texSize);
    this.detailTex = detailTexture(256);
    this.carpetTex = this.makeCarpet(palette, seed, 512);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...(env.u as unknown as Record<string, THREE.IUniform>),
        uSoil: { value: this.soilTex },
        uCarpet: { value: this.carpetTex },
        uDetail: { value: this.detailTex },
        uCarpetSize: { value: this.carpetSize },
        uGreen: { value: new THREE.Color(palette.green) },
        uGreenDark: { value: new THREE.Color(palette.greenDark) },
        uWetCenter: { value: new THREE.Vector2(0, 0) },
        uWetRadius: { value: 3.0 },
        uWetAmount: { value: 0 },
        uCutCenter: { value: new THREE.Vector2(CUT.cx, CUT.cz) },
        uCutHalf: { value: new THREE.Vector2(CUT.hx, CUT.hz) },
        uCutAmount: { value: 0 },
        uSoilTint: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
    });
    this.surfaces.push(this.mat);
    this.mesh = new THREE.Mesh(buildFieldGeometry(), this.mat);
    this.mesh.name = 'ground';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  /** Bake the whole field's colour blocks into one small texture. */
  private makeCarpet(p: Palette, seed: number, n: number) {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d')!;
    const img = g.createImageData(n, n);
    const col = new THREE.Color();
    const S = this.carpetSize;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n - 0.5) * S;
        const z = ((j + 0.5) / n - 0.5) * S;
        bandColor(x, z, p, seed, col);
        const k = (j * n + i) * 4;
        // canvas is sRGB; getHexString round-trips through the colour manager
        const hex = col.getHex(THREE.SRGBColorSpace);
        img.data[k] = (hex >> 16) & 255;
        img.data[k + 1] = (hex >> 8) & 255;
        img.data[k + 2] = hex & 255;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  /**
   * A second surface (the planting bed) that must shade and cut identically.
   * It shares the textures but keeps its own uniform block.
   */
  createSurfaceMaterial(env: Env, palette: Palette, tint: THREE.ColorRepresentation = 0xffffff): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...(env.u as unknown as Record<string, THREE.IUniform>),
        uSoil: { value: this.soilTex },
        uCarpet: { value: this.carpetTex },
        uDetail: { value: this.detailTex },
        uCarpetSize: { value: this.carpetSize },
        uGreen: { value: new THREE.Color(palette.green) },
        uGreenDark: { value: new THREE.Color(palette.greenDark) },
        uWetCenter: { value: new THREE.Vector2(0, 0) },
        uWetRadius: { value: 3.0 },
        uWetAmount: { value: 0 },
        uCutCenter: { value: new THREE.Vector2(CUT.cx, CUT.cz) },
        uCutHalf: { value: new THREE.Vector2(CUT.hx, CUT.hz) },
        uCutAmount: { value: 0 },
        uSoilTint: { value: new THREE.Color(tint) },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      side: THREE.DoubleSide,
    });
    this.surfaces.push(m);
    return m;
  }

  setWet(center: THREE.Vector2, radius: number, amount: number) {
    for (const m of this.surfaces) {
      (m.uniforms.uWetCenter.value as THREE.Vector2).copy(center);
      m.uniforms.uWetRadius.value = radius;
      m.uniforms.uWetAmount.value = amount;
    }
  }

  /** 0 = solid ground, 1 = trench fully open. */
  setCut(amount: number) {
    for (const m of this.surfaces) m.uniforms.uCutAmount.value = amount;
  }

  rebuild(palette: Palette, seed: number) {
    this.carpetTex.dispose();
    this.carpetTex = this.makeCarpet(palette, seed, 512);
    for (const m of this.surfaces) {
      m.uniforms.uCarpet.value = this.carpetTex;
      (m.uniforms.uGreen.value as THREE.Color).set(palette.green);
      (m.uniforms.uGreenDark.value as THREE.Color).set(palette.greenDark);
      m.uniforms.uWetAmount.value = 0;
      m.uniforms.uCutAmount.value = 0;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.carpetTex.dispose();
    this.soilTex.dispose();
    this.detailTex.dispose();
  }
}

/** Height of the field at a point - flat where you plant, rolling far away. */
export function fieldHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const roll = smoothstep(38, 190, r);
  const h = (fbm2(x * 0.0075 + 3, z * 0.0075 + 3, 3, 11) - 0.5) * 2;
  const h2 = (fbm2(x * 0.026 - 5, z * 0.026 - 5, 2, 23) - 0.5) * 2;
  return roll * (h * 9.0 + h2 * 1.8) + smoothstep(150, 330, r) * 5.0;
}

/**
 * Radial disc with vertices packed towards the middle: fine detail where the
 * child is working, cheap triangles out at the horizon.
 */
function buildFieldGeometry(rings = 74, segs = 104, maxR = 330) {
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, fieldHeight(0, 0), 0);
  for (let i = 1; i <= rings; i++) {
    const r = maxR * Math.pow(i / rings, 2.35);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, fieldHeight(x, z), z);
    }
  }
  for (let j = 0; j < segs; j++) {
    idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  }
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const jn = (j + 1) % segs;
      idx.push(a0 + j, a0 + jn, a1 + j, a1 + j, a0 + jn, a1 + jn);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
