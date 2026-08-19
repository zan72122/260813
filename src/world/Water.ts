import * as THREE from 'three';
import { CHANNEL, GATE } from '../game/config';
import { woodTexture } from '../gfx/textures';
import { clamp01 } from '../core/math';

/**
 * The irrigation channel, the sluice gate and the water itself.
 *
 * The water is a shader on one strip of geometry: a moving front, a couple of
 * sine ripples and a specular sparkle. It reads as flowing water at a fraction
 * of the cost of anything simulated, which is exactly the trade the brief asks for.
 */

const WATER_VERT = /* glsl */`
uniform float uTime;
uniform float uFront;
uniform float uLevel;
varying vec3 vWorld;
varying vec3 vN;
varying float vEdge;
void main() {
  vec3 p = position;
  float behind = smoothstep(uFront, uFront - 0.55, p.x);
  vEdge = behind;
  float rip = sin(p.x * 17.0 - uTime * 6.0) * 0.0030
            + sin(p.x * 7.5 + uTime * 3.6 + p.z * 3.0) * 0.0024
            + sin(p.z * 20.0 + uTime * 5.0) * 0.0012;
  // the leading edge stands up in a small bow wave
  float bow = exp(-pow((p.x - uFront) / 0.16, 2.0)) * 0.030;
  p.y += (rip * behind + bow) * uLevel + (uLevel - 1.0) * 0.075;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  float dx = cos(p.x * 21.0 - uTime * 7.0) * 0.11;
  float dz = cos(p.z * 26.0 + uTime * 6.0) * 0.05;
  vN = normalize(vec3(-dx, 1.0, -dz));
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uDeep;
uniform vec3  uShallow;
uniform vec3  uSkyColor;
uniform vec3  uSunColor;
uniform vec3  uSunDir;
varying vec3 vWorld;
varying vec3 vN;
varying float vEdge;
void main() {
  if (vEdge < 0.02) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  float f = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  vec3 col = mix(uDeep, uShallow, 0.30 + 0.34 * f);
  col = mix(col, uSkyColor, 0.16 + 0.40 * f);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 90.0);
  col += uSunColor * spec * 1.6;

  // small drifting glints so the surface never looks like a flat gel
  float g = sin(vWorld.x * 23.0 + uTime * 4.0) * sin(vWorld.z * 17.0 - uTime * 2.6);
  col += uSunColor * smoothstep(0.90, 1.0, g) * 0.32;

  float a = (0.74 + 0.24 * f) * vEdge;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

export class Water {
  readonly group = new THREE.Group();
  readonly gate = new THREE.Group();
  readonly handle: THREE.Mesh;
  private board: THREE.Mesh;
  private lever!: THREE.Group;
  private surface: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private woodTex: THREE.Texture;
  private trough: THREE.Mesh;
  private open = 0;

  constructor(soilMaterial: THREE.Material, sun: THREE.Color, sky: THREE.Color, sunDir: THREE.Vector3) {
    this.woodTex = woodTexture(256);

    this.trough = new THREE.Mesh(buildTrough(), soilMaterial);
    this.trough.frustumCulled = false;
    this.group.add(this.trough);

    // ---- water surface ----------------------------------------------------
    const len = CHANNEL.toX - CHANNEL.fromX;
    const geo = new THREE.PlaneGeometry(len, CHANNEL.width * 0.86, Math.max(48, Math.round(len * 40)), 3);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CHANNEL.fromX + len / 2, CHANNEL.y + 0.014, CHANNEL.z);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFront: { value: CHANNEL.fromX - 0.2 },
        uLevel: { value: 0 },
        uDeep: { value: new THREE.Color('#1c5f88') },
        uShallow: { value: new THREE.Color('#63c6e6') },
        uSkyColor: { value: sky },
        uSunColor: { value: sun },
        uSunDir: { value: sunDir },
      },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.surface = new THREE.Mesh(geo, this.mat);
    this.surface.frustumCulled = false;
    this.surface.renderOrder = 5;
    this.group.add(this.surface);

    // ---- gate ---------------------------------------------------------------
    /*
     * A lever, not a knob on a board. The channel runs left-to-right across the
     * frame, so the sluice board itself is always edge-on to the camera; an arm
     * swinging in the XY plane is the one shape that stays readable from every
     * angle the director uses, and "pull it up" is legible without words.
     */
    const wood = new THREE.MeshLambertMaterial({ map: this.woodTex });
    const postGeo = new THREE.BoxGeometry(0.06, 0.62, 0.06);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, wood);
      p.position.set(0, 0.24, s * (CHANNEL.width * 0.5 + 0.06));
      this.gate.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, CHANNEL.width + 0.22), wood);
    top.position.set(0, 0.525, 0);
    this.gate.add(top);

    this.board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, CHANNEL.width + 0.02), wood);
    this.board.position.set(0, 0.070, 0);
    this.gate.add(this.board);

    const leverMat = new THREE.MeshPhongMaterial({ color: 0xff5f86, shininess: 46, specular: 0x66223a });
    this.lever = new THREE.Group();
    this.lever.position.set(0, 0.50, CHANNEL.width * 0.5 + 0.12);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 14), leverMat);
    hub.rotation.x = Math.PI / 2;
    this.lever.add(hub);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.24, 0.048), leverMat);
    arm.position.set(0, 0.12, 0);
    this.lever.add(arm);
    // the grip is deliberately oversized - a 4-year-old aims with a whole hand
    this.handle = new THREE.Mesh(new THREE.SphereGeometry(0.082, 20, 16), leverMat);
    this.handle.position.set(0, 0.255, 0);
    this.lever.add(this.handle);
    this.gate.add(this.lever);

    this.gate.position.set(GATE.x, CHANNEL.y, GATE.z);
    this.group.add(this.gate);
    this.group.name = 'water';
    this.setOpen(0);
  }

  /** 0 = shut, 1 = fully lifted. */
  setOpen(v: number) {
    this.open = clamp01(v);
    this.board.position.y = 0.070 + this.open * 0.320;
    // closed: arm swung down to the left. open: arm standing up. Pulling it
    // up-and-right is the gesture, which is exactly what the swipe test looks for.
    this.lever.rotation.z = 1.02 - this.open * 1.22;
  }
  get openAmount() { return this.open; }

  /** World-space position of the knob, for hit-testing and the hint hand. */
  handleWorld(out: THREE.Vector3) {
    return this.handle.getWorldPosition(out);
  }

  /** How far along the channel the water has reached, in world X. */
  setFront(x: number) { this.mat.uniforms.uFront.value = x; }
  setLevel(v: number) { this.mat.uniforms.uLevel.value = v; }
  get front() { return this.mat.uniforms.uFront.value as number; }

  update(t: number) { this.mat.uniforms.uTime.value = t; }

  reset() {
    this.setOpen(0);
    this.setFront(CHANNEL.fromX - 0.2);
    this.setLevel(0);
  }

  dispose() {
    this.mat.dispose();
    this.woodTex.dispose();
    this.surface.geometry.dispose();
    this.trough.geometry.dispose();
  }
}

/** U-shaped groove with small banks, extruded along the channel. */
function buildTrough() {
  const w = CHANNEL.width, d = CHANNEL.depth;
  /*
   * Asymmetric on purpose. Every shot looks at the channel from the +z side and
   * from low down, so the far bank is raised (it backs the water with dark soil)
   * and the near bank is kept almost flat, or it would hide the water entirely.
   */
  const profile: [number, number][] = [
    [-w * 0.5 - 0.18, 0.014],
    [-w * 0.5 - 0.05, 0.070],
    [-w * 0.5, 0.014],
    [-w * 0.34, -d],
    [w * 0.34, -d],
    [w * 0.5, 0.002],
    [w * 0.5 + 0.05, 0.014],
    [w * 0.5 + 0.20, 0.002],
  ];
  const xs: number[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) xs.push(CHANNEL.fromX - 0.30 + (CHANNEL.toX + 0.30 - (CHANNEL.fromX - 0.30)) * (i / n));
  const pos: number[] = [], idx: number[] = [], occ: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (const [dz, dy] of profile) {
      pos.push(xs[i], CHANNEL.y + dy, CHANNEL.z + dz);
      // the bottom of the groove is shaded, which gives the channel its depth
      occ.push(dy < -0.02 ? 0.45 : 1.0);
    }
  }
  const stride = profile.length;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < stride - 1; j++) {
      const a = i * stride + j, b = a + 1, c = a + stride, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
