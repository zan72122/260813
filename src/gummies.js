// The gummies themselves.
//
// One InstancedMesh per silhouette, so a whole trayful (and later a whole
// table full) costs a handful of draw calls. Per-instance state rides on
// instanced attributes; squash/stretch rides on the instance matrix, which is
// all the "bounce" a jelly needs.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QUALITY, WHITE_WORLD } from './config.js';
import { SHAPES } from './shapes.js';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aState;   // x: dust (1 = buried in starch), y: jelly (0 liquid -> 1 set), z: gloss

varying vec3 vColor;
varying vec3 vState;
varying vec3 vNrm;
varying vec3 vView;
varying float vUpY;

void main() {
  vColor = aColor;
  vState = aState;

  mat3 im = mat3(instanceMatrix);
  vec3 n = normalize(im * normal);
  vNrm = normalize(normalMatrix * n);

  vec4 world = instanceMatrix * vec4(position, 1.0);
  vUpY = position.y;                    // 0 at the bottom face, 1 at the top
  vec4 mv = modelViewMatrix * world;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uDustColor;
uniform float uTime;

varying vec3 vColor;
varying vec3 vState;
varying vec3 vNrm;
varying vec3 vView;
varying float vUpY;

void main() {
  float dust  = vState.x;
  float jelly = vState.y;
  float gloss = vState.z;

  vec3 n = normalize(vNrm);
  vec3 v = normalize(vView);
  vec3 l = normalize(uLight);

  float ndl = clamp(dot(n, l), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);

  // fake sub-surface: thin edges glow, the body stays saturated
  vec3 deep = vColor * 0.55;
  vec3 lit  = vColor * (0.72 + 0.55 * ndl);
  vec3 col  = mix(deep, lit, 0.35 + 0.65 * ndl);
  col += vColor * fres * (0.55 + 0.45 * jelly);
  // liquid catches a little light from underneath while it is still pooling
  col += vColor * (1.0 - jelly) * 0.28 * (1.0 - vUpY);

  // specular: dull while wet/dusty, mirror-bright after polishing
  vec3 h = normalize(l + v);
  float shin = mix(18.0, 120.0, gloss);
  float spec = pow(clamp(dot(n, h), 0.0, 1.0), shin) * (0.18 + 1.25 * gloss);
  spec *= (1.0 - dust);
  col += vec3(spec);

  // starch coating: kills the colour and the highlight, and softens the edge
  col = mix(col, uDustColor, dust * 0.88);
  col -= dust * 0.04 * fres;

  float alpha = mix(0.74, 0.96, jelly);
  alpha = mix(alpha, 1.0, dust);
  // fuzzy silhouette while still floured -> colour reads before the outline
  alpha *= mix(1.0, smoothstep(0.9, 0.35, fres), dust);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

function buildGeometry(spec) {
  const bevelSegments = QUALITY.grid > 64 ? 3 : 1;
  const parts = spec.parts.map((pts) => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1]);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.17,
      bevelSize: 0.17,
      bevelOffset: 0,
      bevelSegments,
      steps: 1,
    });
  });
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) parts.forEach((p) => p.dispose());

  geo.rotateX(-Math.PI / 2); // extrude along +Y
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = bb.max.y - bb.min.y;
  // normalise: footprint in [-1,1], bottom face at y = 0, top face at y = 1
  geo.translate(0, -bb.min.y, 0);
  geo.scale(1, 1 / h, 1);
  geo.computeVertexNormals();
  return geo;
}

/** @typedef {{ mesh: THREE.InstancedMesh, slot: number, shapeId: string,
 *   x: number, y: number, z: number, rot: number, size: number, thick: number,
 *   fill: number, jelly: number, dust: number, gloss: number,
 *   wobble: number, wobblePhase: number, colorHex: string }} Gummy */

export class GummyField {
  /** @param {THREE.Object3D} parent */
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uLight: { value: new THREE.Vector3(0.45, 1.0, 0.6).normalize() },
        uDustColor: { value: new THREE.Color(WHITE_WORLD.powder) },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.cap = QUALITY.gummyCap;
    /** @type {Map<string, THREE.InstancedMesh>} */
    this.meshes = new Map();
    for (const spec of SHAPES) {
      const geo = buildGeometry(spec);
      const mesh = new THREE.InstancedMesh(geo, this.material, this.cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.geometry.setAttribute(
        'aColor',
        new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3),
      );
      mesh.geometry.setAttribute(
        'aState',
        new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3),
      );
      this.group.add(mesh);
      this.meshes.set(spec.id, mesh);
    }

    /** @type {Gummy[]} */
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  get count() {
    return this.items.length;
  }

  clear() {
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.items = [];
  }

  /**
   * @param {{shapeId:string,colorHex:string,x:number,y?:number,z:number,
   *          rot?:number,size?:number,thick?:number,fill?:number,
   *          jelly?:number,dust?:number,gloss?:number}} o
   * @returns {Gummy|null}
   */
  add(o) {
    const mesh = this.meshes.get(o.shapeId);
    if (!mesh || mesh.count >= this.cap) return null;
    const slot = mesh.count++;
    /** @type {Gummy} */
    const g = {
      mesh,
      slot,
      shapeId: o.shapeId,
      colorHex: o.colorHex,
      x: o.x,
      y: o.y ?? 0,
      z: o.z,
      rot: o.rot ?? 0,
      size: o.size ?? 0.7,
      thick: o.thick ?? 0.85,
      fill: o.fill ?? 0,
      jelly: o.jelly ?? 0,
      dust: o.dust ?? 0,
      gloss: o.gloss ?? 0,
      wobble: 0,
      wobblePhase: Math.random() * Math.PI * 2,
    };
    this._c.set(o.colorHex);
    const ca = mesh.geometry.getAttribute('aColor');
    ca.setXYZ(slot, this._c.r, this._c.g, this._c.b);
    ca.needsUpdate = true;
    this.items.push(g);
    this._write(g, 0);
    return g;
  }

  /** Recompute one instance's matrix + state. @param {Gummy} g */
  write(g, time = 0) {
    this._write(g, time);
  }

  /** @param {Gummy} g */
  _write(g, time) {
    const fill = Math.max(0.0001, g.fill);
    // squash/stretch: volume-ish preserving, driven by the wobble envelope
    const w = g.wobble > 0.001 ? Math.sin(time * 15 + g.wobblePhase) * g.wobble : 0;
    const sy = g.thick * fill * (1 - w * 0.55);
    const sxz = g.size * (1 + w * 0.3);

    this._e.set(0, g.rot, 0);
    this._q.setFromEuler(this._e);
    this._v.set(g.x, g.y, g.z);
    this._s.set(sxz, sy, sxz);
    this._m.compose(this._v, this._q, this._s);
    g.mesh.setMatrixAt(g.slot, this._m);
    g.mesh.instanceMatrix.needsUpdate = true;

    const st = g.mesh.geometry.getAttribute('aState');
    st.setXYZ(g.slot, g.dust, g.jelly, g.gloss);
    st.needsUpdate = true;
  }

  /** @param {Gummy} g */
  poke(g, amount = 0.22) {
    g.wobble = Math.max(g.wobble, amount);
  }

  update(dt, time) {
    this.material.uniforms.uTime.value = time;
    for (const g of this.items) {
      if (g.wobble > 0.0005) {
        g.wobble *= Math.exp(-dt * 3.4);
        if (g.wobble <= 0.0005) g.wobble = 0;
        this._write(g, time);
      }
    }
  }

  /** Rewrite every instance (after a batch of state changes). */
  sync(time = 0) {
    for (const g of this.items) this._write(g, time);
  }

  dispose() {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material.dispose();
  }
}
