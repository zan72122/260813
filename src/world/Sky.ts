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
  private clouds: THREE.Mesh;
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
    // All of them in one instanced draw, billboarded in the vertex shader.
    this.cloudTex = cloudTexture(256);
    this.clouds = buildClouds(this.cloudTex, 11);
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
    const mat = this.clouds.material as THREE.ShaderMaterial;
    mat.uniforms.uDrift.value += dt * 0.9;
  }

  dispose() {
    this.mat.dispose();
    this.cloudTex.dispose();
    this.clouds.geometry.dispose();
    (this.clouds.material as THREE.Material).dispose();
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


/** Cloud quads that turn to face the camera without any per-frame CPU work. */
function buildClouds(map: THREE.Texture, count: number) {
  const rng = makeRng(808);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const iPos = new Float32Array(count * 3);
  const iSize = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const s = 90 + rng() * 150;
    const a = rng() * Math.PI * 2;
    const r = 300 + rng() * 240;
    iPos[i * 3] = Math.cos(a) * r;
    iPos[i * 3 + 1] = 80 + rng() * 130;
    iPos[i * 3 + 2] = Math.sin(a) * r;
    iSize[i * 2] = s;
    iSize[i * 2 + 1] = s * 0.5;
  }
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
  geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 2));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uDrift: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 iPos;
      attribute vec2 iSize;
      uniform float uDrift;
      varying vec2 vUv;
      void main() {
        vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(0.0001, 0.0, 0.0));
        vec3 p = iPos;
        p.x = mod(p.x + uDrift + 640.0, 1280.0) - 640.0;
        vec3 wp = p + right * (position.x * iSize.x) + vec3(0.0, 1.0, 0.0) * (position.y * iSize.y);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.01) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, t.a * 0.92);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -8;
  return mesh;
}
