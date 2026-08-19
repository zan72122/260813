import * as THREE from 'three';
import { Env } from '../gfx/Env';
import { cloudTexture } from '../gfx/textures';
import { Palette } from '../gfx/palettes';
import { makeRng } from '../core/math';

/**
 * Sky dome, a few soft clouds and a distant hill silhouette.
 * Cheap on purpose - the brief is explicit that the drawing budget belongs to
 * the petals, leaves, soil, water and bulbs, not the backdrop.
 */

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */`
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 1.15 + 0.06, -1.0, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.72);
  vec3 col = mix(uHorizon, uTop, t);
  // a wide, gentle sun bloom rather than a disc: no hard highlight to stare at
  float s = clamp(dot(normalize(vDir), normalize(uSunDir)), 0.0, 1.0);
  col += uSunColor * pow(s, 5.0) * 0.35;
  col += uSunColor * pow(s, 60.0) * 0.5;
  // below the horizon fade to the horizon colour so the ground edge disappears
  col = mix(uHorizon, col, smoothstep(-0.12, 0.02, vDir.y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private clouds: THREE.Group;
  private cloudTex: THREE.Texture;
  private hills: THREE.Mesh;
  private hillMat: THREE.MeshBasicMaterial;

  constructor(env: Env, palette: Palette) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(palette.sky) },
        uHorizon: { value: new THREE.Color(palette.skyLow) },
        uSunColor: { value: env.u.uSunColor.value },
        uSunDir: { value: env.u.uSunDir.value },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    // ---- distant hills: one ring strip, flat-shaded, fog-coloured ----------
    this.hillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.fog).lerp(new THREE.Color('#8fb3cc'), 0.24), fog: false });
    this.hills = new THREE.Mesh(buildHillRing(), this.hillMat);
    this.hills.renderOrder = -9;
    this.hills.frustumCulled = false;
    this.group.add(this.hills);

    // ---- clouds -----------------------------------------------------------
    this.cloudTex = cloudTexture(256);
    this.clouds = new THREE.Group();
    const rng = makeRng(808);
    const cmat = new THREE.MeshBasicMaterial({
      map: this.cloudTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false,
      color: 0xffffff,
    });
    for (let i = 0; i < 11; i++) {
      const s = 90 + rng() * 150;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.5), cmat);
      const a = rng() * Math.PI * 2;
      const r = 260 + rng() * 260;
      q.position.set(Math.cos(a) * r, 70 + rng() * 120, Math.sin(a) * r);
      q.userData.spin = 0.004 + rng() * 0.008;
      this.clouds.add(q);
    }
    this.group.add(this.clouds);
    this.group.name = 'sky';
  }

  setPalette(p: Palette) {
    (this.mat.uniforms.uTop.value as THREE.Color).set(p.sky);
    (this.mat.uniforms.uHorizon.value as THREE.Color).set(p.skyLow);
    this.hillMat.color.set(new THREE.Color(p.fog).lerp(new THREE.Color('#8fb3cc'), 0.24));
  }

  update(dt: number, camera: THREE.Camera) {
    this.group.position.set(camera.position.x, 0, camera.position.z);
    for (const c of this.clouds.children) {
      const m = c as THREE.Mesh;
      m.lookAt(camera.position.x, m.position.y, camera.position.z);
      m.position.x += (m.userData.spin as number) * dt * 12;
      if (m.position.x > 560) m.position.x = -560;
    }
  }

  dispose() {
    this.mat.dispose();
    this.cloudTex.dispose();
    this.hills.geometry.dispose();
    this.hillMat.dispose();
  }
}

function buildHillRing(radius = 470, segs = 160) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    // low, soft and irregular: a suggestion of land, never a wall
    const h = 6 + 15 * (0.5 + 0.5 * Math.sin(a * 2.3 + 0.7))
              * (0.55 + 0.45 * Math.sin(a * 5.1 + 2.1))
              + 5 * (0.5 + 0.5 * Math.sin(a * 11.0 + 1.3));
    pos.push(x, -8, z);
    pos.push(x, h, z);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = ((i + 1) % segs) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
