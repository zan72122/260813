// Puffs of starch and, at the very end, sparkles.
// A single fixed-size THREE.Points pool - no allocation during play.

import * as THREE from 'three';
import { QUALITY } from './config.js';
import { puffTexture } from './props.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}
`;

export class Puffs {
  /** @param {THREE.Object3D} parent */
  constructor(parent, max = QUALITY.particles ? 260 : 0) {
    this.max = max;
    this.enabled = max > 0;
    if (!this.enabled) return;

    const pos = new Float32Array(max * 3);
    const size = new Float32Array(max);
    const alpha = new Float32Array(max);
    const color = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setDrawRange(0, max);

    this.tex = puffTexture();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.tex } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    parent.add(this.points);

    this.geo = geo;
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max);
    this.cursor = 0;
    this._c = new THREE.Color();
  }

  /**
   * @param {number} x @param {number} y @param {number} z
   * @param {{count?:number,spread?:number,up?:number,size?:number,
   *          life?:number,color?:string}} [o]
   */
  burst(x, y, z, o = {}) {
    if (!this.enabled) return;
    const count = o.count ?? 18;
    const spread = o.spread ?? 1.4;
    const up = o.up ?? 1.6;
    const size = o.size ?? 1.1;
    const life = o.life ?? 0.75;
    this._c.set(o.color ?? '#ffffff');
    const pos = this.geo.getAttribute('position');
    const sz = this.geo.getAttribute('aSize');
    const al = this.geo.getAttribute('aAlpha');
    const col = this.geo.getAttribute('aColor');
    for (let i = 0; i < count; i++) {
      const k = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() ** 0.5 * spread;
      pos.setXYZ(k, x + Math.cos(a) * r * 0.4, y + Math.random() * 0.2, z + Math.sin(a) * r * 0.4);
      this.vel[k * 3] = Math.cos(a) * r * 1.5;
      this.vel[k * 3 + 1] = up * (0.5 + Math.random());
      this.vel[k * 3 + 2] = Math.sin(a) * r * 1.5;
      sz.setX(k, size * (0.6 + Math.random() * 0.8));
      al.setX(k, 0.85);
      col.setXYZ(k, this._c.r, this._c.g, this._c.b);
      this.ttl[k] = life * (0.7 + Math.random() * 0.6);
      this.life[k] = this.ttl[k];
    }
    pos.needsUpdate = sz.needsUpdate = al.needsUpdate = col.needsUpdate = true;
  }

  update(dt) {
    if (!this.enabled) return;
    const pos = this.geo.getAttribute('position');
    const al = this.geo.getAttribute('aAlpha');
    const sz = this.geo.getAttribute('aSize');
    let any = false;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) continue;
      any = true;
      this.life[k] -= dt;
      const t = Math.max(0, this.life[k] / this.ttl[k]);
      this.vel[k * 3 + 1] -= dt * 2.4;
      pos.setXYZ(
        k,
        pos.getX(k) + this.vel[k * 3] * dt,
        pos.getY(k) + this.vel[k * 3 + 1] * dt,
        pos.getZ(k) + this.vel[k * 3 + 2] * dt,
      );
      al.setX(k, t * 0.85);
      sz.setX(k, sz.getX(k) * (1 + dt * 0.9));
      if (this.life[k] <= 0) al.setX(k, 0);
    }
    if (any) {
      pos.needsUpdate = true;
      al.needsUpdate = true;
      sz.needsUpdate = true;
    }
  }

  clear() {
    if (!this.enabled) return;
    const al = this.geo.getAttribute('aAlpha');
    for (let k = 0; k < this.max; k++) {
      this.life[k] = 0;
      al.setX(k, 0);
    }
    al.needsUpdate = true;
  }

  dispose() {
    if (!this.enabled) return;
    this.geo.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}
