// ネオン管システム
// ガラス管(Physical) + 発光コア(加算) + ハロー(加算) + ガイド線 + 曲げ加工モデル
// 物理計算はせず「形状パス上の進捗 t」でTubeGeometryを再生成して曲げを偽装する。
import * as THREE from 'three';
import { SAMPLES } from './shapes.js';

const GLASS_R = 0.016;   // ガラス管半径 16mm（実物のネオン管よりやや太め＝視認性優先）
const CORE_R = 0.0075;
const HALO_R = 0.034;
const TAIL_MAX = 0.55;   // 未加工の直管の見える長さ上限 [m]

// 等弧長ポリラインをそのまま曲線として使う（getPointAtの再パラメータ化を省く）
class UniformPolyCurve extends THREE.Curve {
  constructor(pts) { super(); this.pts = pts; }
  getPoint(t, target = new THREE.Vector3()) {
    const p = this.pts, n = p.length - 1;
    const f = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.min(Math.floor(f), n - 1);
    return target.lerpVectors(p[i], p[i + 1], f - i);
  }
  getPointAt(t, target) { return this.getPoint(t, target); }
  getTangent(t, target = new THREE.Vector3()) {
    const d = 1 / (this.pts.length - 1);
    const a = this.getPoint(Math.max(t - d, 0), new THREE.Vector3());
    const b = this.getPoint(Math.min(t + d, 1), new THREE.Vector3());
    return target.subVectors(b, a).normalize();
  }
  getTangentAt(t, target) { return this.getTangent(t, target); }
}

const GRAD_GLSL = `
uniform vec3 uCols[6];
uniform float uStops[6];
uniform int uNCol;
vec3 grad(float s){
  vec3 c = uCols[0];
  for(int i=1;i<6;i++){
    if(i>=uNCol) break;
    c = mix(c, uCols[i], smoothstep(uStops[i-1], uStops[i], s));
  }
  return c;
}`;

const VERT = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalMatrix * normal;
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

// 発光コア: ネオンの芯。グラデ色 + 加熱時のオレンジ白熱
const CORE_FRAG = `
precision highp float;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform float uT, uVis, uHeat, uNeon, uHeatW;
${GRAD_GLSL}
void main(){
  float s = vUv.x * uVis;                 // 形状全長=1 に正規化した弧長位置
  float edge = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float body = pow(edge, 0.55);
  float tail = 1.0 - smoothstep(uVis - 0.05, uVis, s) * step(uVis, 0.999);
  // 彩度の高い管色 + 中心軸だけ白熱（本物のネオンの見え方）
  float center = pow(edge, 7.0);
  vec3 col = (pow(grad(s), vec3(1.25)) * 1.05 + vec3(0.85) * center * 0.55) * uNeon * body;
  float d = abs(s - (uT - 0.025));
  float h = exp(-d*d/(uHeatW*uHeatW)) * uHeat;
  col += mix(vec3(1.0,0.28,0.03), vec3(1.0,0.85,0.55), h) * h * 3.0 * body;
  col *= tail;
  if (col.r + col.g + col.b < 0.004) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

// ハロー: 管周囲のにじみ。法線エッジで柔らかく
const HALO_FRAG = `
precision highp float;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform float uT, uVis, uHeat, uNeon, uHeatW;
${GRAD_GLSL}
void main(){
  float s = vUv.x * uVis;
  float edge = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float body = pow(edge, 2.0);
  float tail = 1.0 - smoothstep(uVis - 0.05, uVis, s) * step(uVis, 0.999);
  vec3 col = pow(grad(s), vec3(1.5)) * (uNeon * 0.8) * body; // 彩度を残した色のにじみ
  float d = abs(s - (uT - 0.025));
  float h = exp(-d*d/(uHeatW*uHeatW*4.0)) * uHeat;
  col += vec3(1.0, 0.42, 0.08) * h * 1.3 * body;
  col *= tail;
  if (col.r + col.g + col.b < 0.004) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

// ガイド線: 太い破線。進捗より先だけ光り、通過済みは消える
const GUIDE_FRAG = `
precision highp float;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform float uT, uTime, uShow;
void main(){
  float s = vUv.x;
  float dash = 0.35 + 0.65 * step(0.42, fract(s * 70.0 - uTime * 0.8));
  float done = 1.0 - smoothstep(uT - 0.004, uT + 0.004, s);
  float ahead = smoothstep(uT, uT + 0.015, s) * (1.0 - smoothstep(uT + 0.09, uT + 0.17, s));
  vec3 col = vec3(0.55, 0.8, 1.0) * dash * 0.5;
  col += vec3(1.0) * ahead * (0.8 + 0.35 * sin(uTime * 6.0));
  col *= (1.0 - done * 0.92) * uShow;
  if (col.r + col.g + col.b < 0.004) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

function additiveMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export class NeonTube {
  constructor(scene) {
    this.group = new THREE.Group();
    // サイン面: 作業台上のディスプレイ枠、少し後傾
    this.group.position.set(0, 1.38, -0.32);
    this.group.rotation.x = -0.10;
    scene.add(this.group);

    this.shape = null;
    this.t = 0;             // 曲げ進捗 0..1（弧長正規化）
    this.offsets = new Float32Array(SAMPLES); // 子どもの手ぶれ（面内横ずれ）
    this.uniforms = {
      uT: { value: 0 },
      uVis: { value: 0 },
      uHeat: { value: 0 },
      uNeon: { value: 0 },
      uHeatW: { value: 0.065 },
      uCols: { value: [...Array(6)].map(() => new THREE.Color(1, 1, 1)) },
      uStops: { value: [0, 0.2, 0.4, 0.6, 0.8, 1] },
      uNCol: { value: 1 },
    };
    this.guideUniforms = {
      uT: { value: 0 },
      uTime: { value: 0 },
      uShow: { value: 0 },
    };

    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8f0ea,
      metalness: 0,
      roughness: 0.09,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 0.75, // scene.environment を利用

      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
      emissive: 0x000000,
      emissiveIntensity: 0,
      depthWrite: false,
    });
    this.coreMat = additiveMat(CORE_FRAG, this.uniforms);
    this.haloMat = additiveMat(HALO_FRAG, this.uniforms); // 法線↔視線で中心明・縁弱の柔らかな暈

    this.glassMesh = new THREE.Mesh(undefined, this.glassMat);
    this.coreMesh = new THREE.Mesh(undefined, this.coreMat);
    this.haloMesh = new THREE.Mesh(undefined, this.haloMat);
    this.glassMesh.renderOrder = 20;
    this.coreMesh.renderOrder = 21;
    this.haloMesh.renderOrder = 19;
    this.caps = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(GLASS_R, 12, 10), this.glassMat);
      m.renderOrder = 20;
      this.group.add(m);
      return m;
    });
    this.group.add(this.haloMesh, this.glassMesh, this.coreMesh);

    this.guideMesh = new THREE.Mesh(undefined, additiveMat(GUIDE_FRAG, this.guideUniforms));
    this.guideMesh.renderOrder = 18;
    this.group.add(this.guideMesh);

    this._pts3 = null;   // 形状のVector3配列（サイン面ローカル）
    this._nrm2 = null;   // 面内法線
    this._visCache = -1;
    this._dirty = false;
  }

  hide() { this.group.visible = false; }

  setShape(shape) {
    this.group.visible = true;
    this.shape = shape;
    this.t = 0;
    this.offsets.fill(0);
    this._visCache = -1;
    const u = this.uniforms;
    for (let i = 0; i < 6; i++) {
      const g = shape.grad[Math.min(i, shape.grad.length - 1)];
      u.uCols.value[i].copy(g.color);
      u.uStops.value[i] = g.stop;
    }
    u.uNCol.value = shape.grad.length;
    u.uNeon.value = 0;
    u.uHeat.value = 0;
    u.uT.value = 0;
    this.glassMat.emissiveIntensity = 0;
    this.glassMat.opacity = 0.22;

    this._pts3 = shape.points.map((p) => new THREE.Vector3(p.x, p.y, 0));
    this._nrm2 = shape.points.map((p, i) => {
      const a = shape.points[Math.max(i - 1, 0)];
      const b = shape.points[Math.min(i + 1, SAMPLES - 1)];
      const tx = b.x - a.x, ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      return new THREE.Vector2(-ty / l, tx / l);
    });

    // ガイド（完成形の下書き線）
    const guideCurve = new UniformPolyCurve(this._pts3);
    this.guideMesh.geometry?.dispose();
    this.guideMesh.geometry = new THREE.TubeGeometry(guideCurve, 220, 0.006, 6, false);
    this.rebuild(true);
  }

  // 進捗tと手ぶれから可視ポリラインを生成しTubeGeometryを再構築
  rebuild(force = false) {
    if (!this.shape) return;
    const L = this.shape.length;
    const tArc = this.t * L;
    const tail = Math.min(TAIL_MAX, L - tArc);
    const visLen = tArc + tail;
    const ds = L / (SAMPLES - 1);
    const nVis = Math.max(2, Math.min(SAMPLES, Math.ceil(visLen / ds) + 1));
    if (!force && !this._dirty && nVis === this._visCache) return;
    this._visCache = nVis;
    this._dirty = false;

    const iBend = this.t * (SAMPLES - 1);
    const iB = Math.floor(iBend);
    const bendP = new THREE.Vector3();
    const bendT = new THREE.Vector3();
    {
      const f = iBend - iB;
      const p0 = this._pts3[iB], p1 = this._pts3[Math.min(iB + 1, SAMPLES - 1)];
      bendP.lerpVectors(p0, p1, f);
      const a = this._pts3[Math.max(iB - 1, 0)], b = this._pts3[Math.min(iB + 2, SAMPLES - 1)];
      bendT.subVectors(b, a).normalize();
      if (bendT.lengthSq() < 0.5) bendT.set(1, 0, 0);
    }

    const pts = [];
    for (let i = 0; i < nVis; i++) {
      const s = i * ds;
      if (s <= tArc + 1e-6) {
        const p = this._pts3[i].clone();
        const o = this.offsets[i];
        if (o !== 0) {
          p.x += this._nrm2[i].x * o;
          p.y += this._nrm2[i].y * o;
          p.z += o * 0.4; // わずかな奥行きゆらぎで有機的に
        }
        pts.push(p);
      } else {
        pts.push(bendP.clone().addScaledVector(bendT, s - tArc));
      }
    }
    const curve = new UniformPolyCurve(pts);
    const segs = Math.max(8, Math.min(240, (nVis - 1) * 1));

    for (const [mesh, r, rad] of [
      [this.glassMesh, GLASS_R, 10],
      [this.coreMesh, CORE_R, 8],
      [this.haloMesh, HALO_R, 8],
    ]) {
      mesh.geometry?.dispose();
      mesh.geometry = new THREE.TubeGeometry(curve, segs, r, rad, false);
    }
    this.caps[0].position.copy(pts[0]);
    this.caps[1].position.copy(pts[pts.length - 1]);

    this.uniforms.uT.value = this.t;
    this.uniforms.uVis.value = visLen / L;
    this.guideUniforms.uT.value = this.t;
    this._lastPts = pts;
  }

  setProgress(t) {
    t = Math.min(Math.max(t, 0), 1);
    if (t !== this.t) { this.t = t; this._dirty = true; }
  }

  addWobble(lateral) {
    // 現在の曲げ位置付近に横ずれを記録（clamp小・後で70%減衰）
    const i = Math.round(this.t * (SAMPLES - 1));
    const v = Math.min(Math.max(lateral, -0.022), 0.022);
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < SAMPLES) {
        const w = 1 - Math.abs(k) / 3;
        this.offsets[j] = this.offsets[j] * 0.6 + v * w * 0.4;
      }
    }
    this._dirty = true;
  }

  finalize() {
    // 手ぶれを軽く平滑化しつつ3割残す（子どもの曲げ跡）
    const o = this.offsets;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < SAMPLES - 1; i++) {
        o[i] = (o[i - 1] + o[i] * 2 + o[i + 1]) * 0.25;
      }
    }
    for (let i = 0; i < SAMPLES; i++) o[i] *= 0.75;
    this.t = 1;
    this._dirty = true;
    this.rebuild(true);
  }

  // 曲げ位置のワールド座標
  bendPointWorld(target = new THREE.Vector3()) {
    const i = this.t * (SAMPLES - 1);
    const i0 = Math.floor(i);
    target.lerpVectors(this._pts3[i0], this._pts3[Math.min(i0 + 1, SAMPLES - 1)], i - i0);
    return this.group.localToWorld(target);
  }

  pointWorldAt(s, target = new THREE.Vector3()) {
    const i = Math.min(Math.max(s, 0), 1) * (SAMPLES - 1);
    const i0 = Math.floor(i);
    target.lerpVectors(this._pts3[i0], this._pts3[Math.min(i0 + 1, SAMPLES - 1)], Math.min(i - i0, 1));
    return this.group.localToWorld(target);
  }

  // ワールド座標 → 最近傍の弧長パラメータ（先読み窓内）と横ずれ
  projectToGuide(worldPoint, windowAhead = 0.16) {
    const lp = this.group.worldToLocal(worldPoint.clone());
    const i0 = Math.floor(this.t * (SAMPLES - 1));
    const i1 = Math.min(SAMPLES - 1, Math.ceil((this.t + windowAhead) * (SAMPLES - 1)));
    let best = -1, bestD = Infinity;
    for (let i = i0; i <= i1; i++) {
      const p = this._pts3[i];
      const dx = lp.x - p.x, dy = lp.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return null;
    const n = this._nrm2[best];
    const p = this._pts3[best];
    const lateral = (lp.x - p.x) * n.x + (lp.y - p.y) * n.y;
    return { s: best / (SAMPLES - 1), dist: Math.sqrt(bestD), lateral };
  }

  update(time) {
    this.guideUniforms.uTime.value = time;
    if (this._dirty) this.rebuild();
  }

  showGuide(v) { this.guideUniforms.uShow.value = v; }

  setHeat(amount) { this.uniforms.uHeat.value = amount; }

  setNeon(v, avgColor) {
    this.uniforms.uNeon.value = v;
    this.glassMat.emissive.copy(avgColor || new THREE.Color(1, 1, 1));
    this.glassMat.emissiveIntensity = v * 0.14;
    this.glassMat.opacity = 0.22 + v * 0.16;
  }

  // 完成品の縮小コピー（壁のギャラリー用ジオメトリ点列）
  snapshotPoints() {
    if (!this._lastPts) return null;
    return this._lastPts.map((p) => [
      Math.round(p.x * 1000) / 1000,
      Math.round(p.y * 1000) / 1000,
      Math.round(p.z * 1000) / 1000,
    ]);
  }
}

export { UniformPolyCurve, GRAD_GLSL, VERT, additiveMat };
