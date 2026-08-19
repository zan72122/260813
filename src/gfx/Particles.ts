import * as THREE from 'three';
import { softDotTexture } from './textures';

interface P {
  life: number; max: number;
  pos: THREE.Vector3; vel: THREE.Vector3;
  size0: number; size1: number;
  col: THREE.Color;
  grav: number;
  drag: number;
}

/**
 * One pooled billboard system reused for soil puffs, water droplets and petal
 * confetti. A few dozen quads at a time, so CPU updates are irrelevant and we
 * keep a single additive-free draw call.
 */
export class Particles {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private pool: P[] = [];
  private active: P[] = [];
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private tex: THREE.Texture;

  constructor(private capacity = 220, hardness = 0.2) {
    this.tex = softDotTexture(64, hardness);
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aColor', this.colAttr);
    this.geo.setAttribute('aSize', this.sizeAttr);
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, aSize * uScale / max(0.2, -mv.z));
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec4 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;

    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        size0: 1, size1: 0, col: new THREE.Color(), grav: -1, drag: 1,
      });
    }
  }

  setPixelScale(heightPx: number) { this.mat.uniforms.uScale.value = heightPx * 0.62; }

  spawn(o: {
    pos: THREE.Vector3; vel: THREE.Vector3; life: number;
    size0: number; size1: number; color: THREE.ColorRepresentation;
    grav?: number; drag?: number;
  }) {
    const p = this.pool.pop();
    if (!p) return;
    p.pos.copy(o.pos); p.vel.copy(o.vel);
    p.life = 0; p.max = o.life;
    p.size0 = o.size0; p.size1 = o.size1;
    p.col.set(o.color);
    p.grav = o.grav ?? -3.2;
    p.drag = o.drag ?? 0.6;
    this.active.push(p);
  }

  update(dt: number) {
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const siz = this.sizeAttr.array as Float32Array;
    let n = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      const t = p.life / p.max;
      p.vel.y += p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (n < this.capacity) {
        pos[n * 3] = p.pos.x; pos[n * 3 + 1] = p.pos.y; pos[n * 3 + 2] = p.pos.z;
        col[n * 4] = p.col.r; col[n * 4 + 1] = p.col.g; col[n * 4 + 2] = p.col.b;
        col[n * 4 + 3] = (1 - t) * (1 - t) * 0.95;
        siz[n] = p.size0 + (p.size1 - p.size0) * t;
        n++;
      }
    }
    this.geo.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  clear() {
    while (this.active.length) this.pool.push(this.active.pop()!);
    this.geo.setDrawRange(0, 0);
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); this.tex.dispose(); }
}
