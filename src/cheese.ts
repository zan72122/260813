import * as THREE from 'three';
import { clamp, lerp, mulberry32 } from './util';

/** 固定トポロジのチューブジオメトリを curve に沿って更新する */
export function makeTubeGeo(segs: number, rad: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const verts = (segs + 1) * (rad + 1);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j;
      const b = a + rad + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  geo.setIndex(idx);
  return geo;
}

const _tan = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function updateTube(
  geo: THREE.BufferGeometry,
  curve: THREE.Curve<THREE.Vector3>,
  segs: number,
  rad: number,
  radiusAt: (t: number) => number,
) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  let vi = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(clamp(t, 0, 1), _p);
    curve.getTangentAt(clamp(t, 0.001, 0.999), _tan);
    _n1.crossVectors(_tan, _up);
    if (_n1.lengthSq() < 1e-6) _n1.set(1, 0, 0);
    _n1.normalize();
    _n2.crossVectors(_tan, _n1).normalize();
    const r = radiusAt(t);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      pos.setXYZ(vi,
        _p.x + _n1.x * cx + _n2.x * cy,
        _p.y + _n1.y * cx + _n2.y * cy,
        _p.z + _n1.z * cx + _n2.z * cy);
      nor.setXYZ(vi,
        _n1.x * Math.cos(a) + _n2.x * Math.sin(a),
        _n1.y * Math.cos(a) + _n2.y * Math.sin(a),
        _n1.z * Math.cos(a) + _n2.z * Math.sin(a));
      vi++;
    }
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geo.computeBoundingSphere();
}

/** びよーんと伸びるモッツァレラ */
export class StretchCheese {
  group = new THREE.Group();
  tube: THREE.Mesh;
  blobA: THREE.Mesh;
  blobB: THREE.Mesh;
  anchor = new THREE.Vector3();
  handle = new THREE.Vector3();
  /** 見た目の追従ハンドル(ばね) */
  visHandle = new THREE.Vector3();
  private visVel = new THREE.Vector3();
  baseRadius = 0.17;
  wobblePhase = 0;
  wobbleAmp = 0;
  private segs = 48;
  private rad = 12;
  private curve: THREE.CatmullRomCurve3;
  private cps: THREE.Vector3[];

  constructor(mat: THREE.Material) {
    const geo = makeTubeGeo(this.segs, this.rad);
    this.tube = new THREE.Mesh(geo, mat);
    this.tube.castShadow = true;
    this.tube.frustumCulled = false;
    this.blobA = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat);
    this.blobB = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mat);
    this.blobA.castShadow = this.blobB.castShadow = true;
    this.group.add(this.tube, this.blobA, this.blobB);
    this.cps = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.curve = new THREE.CatmullRomCurve3(this.cps, false, 'catmullrom', 0.5);
  }

  get length() { return this.anchor.distanceTo(this.visHandle); }

  update(dt: number) {
    // ばねでハンドル追従(速く引くと揺れる)
    const k = 320, d = 18;
    const acc = this.handle.clone().sub(this.visHandle).multiplyScalar(k)
      .addScaledVector(this.visVel, -d);
    this.visVel.addScaledVector(acc, Math.min(dt, 1 / 30));
    this.visHandle.addScaledVector(this.visVel, Math.min(dt, 1 / 30));

    const A = this.anchor, B = this.visHandle;
    const L = A.distanceTo(B);
    this.wobblePhase += dt * 10;
    this.wobbleAmp = Math.max(0, this.wobbleAmp - dt * 1.6);
    // たわみ: 長いほど、ゆっくりなほど垂れる
    const sag = clamp(L * 0.16, 0.02, 0.3);
    const mid = A.clone().lerp(B, 0.5);
    mid.y -= sag;
    const q1 = A.clone().lerp(B, 0.25); q1.y -= sag * 0.7;
    const q3 = A.clone().lerp(B, 0.75); q3.y -= sag * 0.7;
    // 揺れ
    const wob = Math.sin(this.wobblePhase) * this.wobbleAmp;
    mid.y += wob * 0.5;
    q1.y += wob * 0.25;
    q3.y += wob * 0.25;
    this.cps[0].copy(A);
    this.cps[1].copy(q1);
    this.cps[2].copy(mid);
    this.cps[3].copy(q3);
    this.cps[4].copy(B);
    (this.curve as any).needsUpdate = true;
    this.curve.updateArcLengths();
    // 伸びるほど細く
    const thin = this.baseRadius / (0.75 + L * 0.9);
    const rMid = clamp(thin, 0.035, this.baseRadius);
    updateTube(this.tube.geometry, this.curve, this.segs, this.rad, (t) => {
      const bell = Math.sin(t * Math.PI);
      return lerp(this.baseRadius * 0.92, rMid, Math.pow(bell, 0.45));
    });
    const bs = this.baseRadius * 1.35;
    this.blobA.position.copy(A);
    this.blobA.scale.set(bs, bs * 0.85, bs);
    this.blobB.position.copy(B);
    this.blobB.scale.set(bs * 0.9, bs * 0.78, bs * 0.9);
  }

  /** 速く引いた時に呼ぶと揺れる */
  excite(amount: number) {
    this.wobbleAmp = clamp(this.wobbleAmp + amount, 0, 0.16);
  }

  snapTo(a: THREE.Vector3, b: THREE.Vector3) {
    this.anchor.copy(a);
    this.handle.copy(b);
    this.visHandle.copy(b);
    this.visVel.set(0, 0, 0);
  }
}

export interface BagParams {
  R: number;
  depth: number;
  rimLift: number;
  bulge: number;
  neck: number;
  knot: number;
  open: number;
  openDir: number;
  squish: number;
  thickness: number;
  wobble: number[];
}

export function defaultBagParams(): BagParams {
  return {
    R: 0.34, depth: 0, rimLift: 0, bulge: 0, neck: 0, knot: 0,
    open: 0, openDir: 0, squish: 0, thickness: 0.3,
    wobble: new Array(16).fill(1),
  };
}

/**
 * パラメトリックなブラータ袋メッシュ。
 * 球(生地玉) → 円盤 → 袋 → 口すぼみ → 結び → 切り開き を1つの
 * グリッドサーフェスで安定に変形する (soft-body 不使用)。
 */
export class BagMesh {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  knotMesh: THREE.Mesh;
  /** 中身のクリーム面 (袋が開いている時に見える) */
  innerCream: THREE.Mesh;
  innerRibbons: THREE.Group;
  params = defaultBagParams();
  fill = 0; // 0..1 中身の量
  wobbleAnim = 0; // 揺れ(詰めた直後)
  private U = 44;
  private V = 30;
  private profilePts: THREE.Vector3[] = [];
  dirty = true;

  constructor(mozzMat: THREE.Material, creamMat: THREE.Material) {
    const geo = new THREE.BufferGeometry();
    const verts = (this.U + 1) * (this.V + 1);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < this.U; i++) {
      for (let j = 0; j < this.V; j++) {
        const a = i * (this.V + 1) + j;
        const b = a + this.V + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mozzMat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    (this.mesh.material as THREE.Material).side = THREE.DoubleSide;
    this.group.add(this.mesh);

    // 結び目
    const knotG = new THREE.Group();
    const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), mozzMat);
    k1.scale.set(1, 0.75, 1);
    knotG.add(k1);
    const k2 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 16), mozzMat);
    k2.rotation.x = Math.PI / 2;
    k2.position.y = -0.04;
    knotG.add(k2);
    this.knotMesh = new THREE.Mesh();
    this.knotMesh.add(knotG);
    this.knotMesh.scale.setScalar(0.001);
    this.group.add(this.knotMesh);

    // 中身
    this.innerCream = new THREE.Mesh(new THREE.CircleGeometry(1, 28), creamMat);
    this.innerCream.rotation.x = -Math.PI / 2;
    this.innerCream.visible = false;
    this.group.add(this.innerCream);
    this.innerRibbons = new THREE.Group();
    this.group.add(this.innerRibbons);
  }

  /** 波打ち係数 (角度 rad) */
  wobbleAt(ang: number): number {
    const w = this.params.wobble;
    const n = w.length;
    const f = ((ang / (Math.PI * 2)) * n + n) % n;
    const i = Math.floor(f), t = f - i;
    return lerp(w[i % n], w[(i + 1) % n], t);
  }

  /** プロフィール制御点を作る (r, y) */
  private buildProfile(): THREE.Vector3[] {
    const p = this.params;
    const squishY = 1 - p.squish * 0.28;
    const squishR = 1 + p.squish * 0.18;
    const openN = p.neck * (1 - p.open); // 開くと首がゆるむ
    const form = Math.max(p.depth, 0.0001);
    // 円盤(0) ⇔ 袋(1) の混合
    const thick = p.thickness;
    const R = p.R * squishR;
    // 高さ
    const rimH = (thick * 0.5 + p.depth * 0.27 + p.rimLift * 0.17 + this.fill * 0.07) * squishY;
    const mouthR = lerp(R * 0.98, R * (1 - openN * 0.82) * (0.35 + (1 - p.neck) * 0.65), form)
      + p.open * R * 0.25;
    const mouthH = (rimH + openN * 0.2 + p.knot * 0.02) * squishY;
    const bulge = 1 + (p.bulge * 0.4 + this.fill * 0.28) * form;
    // 内底の高さ
    const floorY = lerp(thick * 0.95, 0.055 + this.fill * 0.02, form) * squishY;

    const pts: THREE.Vector3[] = [];
    // 中心(口の中央) — 円盤時は上面中央 / 袋時は口の中の底
    pts.push(new THREE.Vector3(0.001, lerp(thick, floorY, form), 0));
    pts.push(new THREE.Vector3(mouthR * 0.45, lerp(thick * 0.98, floorY, form), 0));
    // 口の縁 (内側)
    pts.push(new THREE.Vector3(mouthR * 0.92, lerp(thick * 0.9, mouthH, form), 0));
    // 口の縁 (外側)
    pts.push(new THREE.Vector3(mouthR * 1.02 + 0.02, lerp(thick * 0.82, mouthH, form), 0));
    // 首の付け根: 口がすぼまっても胴は丸く残す
    if (p.neck > 0.05) {
      pts.push(new THREE.Vector3(
        lerp(R * 0.97, Math.max(mouthR * 1.25, R * 0.16), openN),
        lerp(thick * 0.8, rimH * 0.93, form), 0));
    }
    // 肩→膨らみ (袋らしく丸く張り出す)
    pts.push(new THREE.Vector3(
      lerp(R * 0.9, R * bulge * 1.04, form),
      lerp(thick * 0.55, rimH * 0.6, form)));
    // 外壁下部
    pts.push(new THREE.Vector3(R * bulge * 1.06, lerp(thick * 0.25, rimH * 0.24, form)));
    // 接地
    pts.push(new THREE.Vector3(R * 0.82, 0.005));
    pts.push(new THREE.Vector3(0.001, 0.0));
    return pts;
  }

  rebuild(time = 0) {
    const p = this.params;
    const prof = this.buildProfile();
    const curve = new THREE.CatmullRomCurve3(prof, false, 'catmullrom', 0.35);
    const samples: THREE.Vector3[] = [];
    for (let j = 0; j <= this.V; j++) samples.push(curve.getPoint(j / this.V));

    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let vi = 0;
    const wobT = this.wobbleAnim;
    for (let i = 0; i <= this.U; i++) {
      const ang = (i / this.U) * Math.PI * 2;
      const w = this.wobbleAt(ang);
      // 開き: 切り方向の左右で口が離れる
      const openShift = p.open > 0.001
        ? Math.sign(Math.sin(ang - p.openDir)) * p.open * p.R * 0.5
        : 0;
      const perpX = Math.cos(p.openDir + Math.PI / 2);
      const perpZ = -Math.sin(p.openDir + Math.PI / 2);
      for (let j = 0; j <= this.V; j++) {
        const s = samples[j];
        const vT = 1 - j / this.V; // 1=口側
        let r = s.x * w;
        let y = s.y;
        // 詰めた直後のぷるぷる
        if (wobT > 0.001) {
          const sway = Math.sin(time * 16 + ang * 2) * wobT * 0.04;
          r *= 1 + sway * Math.sin((1 - vT) * Math.PI);
        }
        let x = Math.cos(ang) * r;
        let z = -Math.sin(ang) * r;
        // 開き変位 (口に近いほど)
        if (openShift !== 0 && vT > 0.5) {
          const f = (vT - 0.5) * 2;
          x += perpX * openShift * f * f;
          z += perpZ * openShift * f * f;
          y -= p.open * 0.08 * f;
        }
        pos.setXYZ(vi, x, y, z);
        vi++;
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();

    // 結び目
    const kScale = p.knot * 0.9 + 0.001;
    this.knotMesh.scale.setScalar(kScale);
    const mouthTop = samples[2];
    this.knotMesh.position.set(0, (mouthTop.y + 0.05) * (1 - p.open), 0);
    this.knotMesh.rotation.y = p.knot * 2.4;
    this.knotMesh.visible = p.knot > 0.02 && p.open < 0.6;

    // 中身クリーム面
    const showCream = this.fill > 0.02 && (p.neck < 0.5 || p.open > 0.15);
    this.innerCream.visible = showCream;
    if (showCream) {
      const prof2 = this.buildProfile();
      const mouthR = prof2[2].x;
      const floorY = prof2[0].y;
      // 開くほど中身がせり上がって見える
      const level = floorY + this.fill * (prof2[2].y - floorY) * 0.75 + 0.02 + p.open * 0.12;
      this.innerCream.position.y = Math.min(level, prof2[2].y - 0.01);
      this.innerCream.scale.setScalar(Math.max(0.05, mouthR * 0.92 + p.open * 0.05));
      this.innerRibbons.position.y = this.innerCream.position.y;
      this.innerRibbons.visible = true;
    } else {
      this.innerRibbons.visible = false;
    }
    this.dirty = false;
  }

  update(dt: number, time: number) {
    if (this.wobbleAnim > 0.001) {
      this.wobbleAnim = Math.max(0, this.wobbleAnim - dt * 1.2);
      this.dirty = true;
    }
    if (this.dirty) this.rebuild(time);
  }
}

/** stracciatella のリボン(静的カール) */
export function makeRibbon(mat: THREE.Material, seed: number, radius: number): THREE.Mesh {
  const rnd = mulberry32(seed);
  const pts: THREE.Vector3[] = [];
  const n = 7;
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = a0 + t * (2.5 + rnd() * 2.5);
    const r = radius * (0.15 + rnd() * 0.75);
    pts.push(new THREE.Vector3(
      Math.cos(a) * r,
      (rnd() - 0.3) * 0.05,
      Math.sin(a) * r,
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 24, 0.016 + rnd() * 0.008, 6, false);
  const m = new THREE.Mesh(geo, mat);
  return m;
}

/** 飛んでいく塊 (スプーンから袋へ / ちぎった紐がボウルへ) */
export class Flight {
  active = false;
  t = 0;
  dur = 0.5;
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  arc = 0.3;
  mesh: THREE.Object3D;
  onDone: (() => void) | null = null;
  constructor(mesh: THREE.Object3D) {
    this.mesh = mesh;
    mesh.visible = false;
  }
  start(from: THREE.Vector3, to: THREE.Vector3, dur = 0.5, arc = 0.3) {
    this.from.copy(from); this.to.copy(to);
    this.dur = dur; this.arc = arc;
    this.t = 0; this.active = true;
    this.mesh.visible = true;
  }
  update(dt: number) {
    if (!this.active) return;
    this.t += dt / this.dur;
    if (this.t >= 1) {
      this.active = false;
      this.mesh.visible = false;
      this.onDone?.();
      return;
    }
    const t = this.t;
    this.mesh.position.lerpVectors(this.from, this.to, t);
    this.mesh.position.y += Math.sin(t * Math.PI) * this.arc;
    const sq = 1 + Math.sin(t * Math.PI) * 0.2;
    this.mesh.scale.set(1 / sq, sq, 1 / sq);
  }
}
