import * as THREE from 'three';
import {
  braidSpine, spineOutward, weaveOffset, waterfallControls, hangControls,
  petalRadius, coilPoint, flowerBasis, PETAL_COUNT, BRAID_CYCLES,
  FLOWER_CENTER, FLOWER_NORMAL
} from './braidMath';
import { sweepTube, updateSweep, sampleSpline, transportFrames, tipTaper } from './geo';
import { makeHairMaterial } from './materials';
import { HAIR } from '../style';

const ARC_SEGS = 120;
const ARC_RADIAL = 7;
const TRIO_SEGS = 22;
const FALL_SEGS = 36;
const TAIL_SEGS = 110;
const TAIL_RADIAL = 8;

/**
 * HairSystem — every strand the player touches.
 *
 *  braid arc   : 3 interleaved tubes across the head; grows via drawRange
 *  trio        : the 3 loose strands ahead of the braid front
 *  waterfall   : fallen strands accumulating below the braid
 *  tail        : the finished braid's tail; widens into petals, coils into
 *                the flower (geometry updated in place each frame)
 */
export class HairSystem {
  readonly group = new THREE.Group();

  private arcMeshes: THREE.Mesh[] = [];

  readonly trioMats: THREE.MeshPhysicalMaterial[] = [];
  private trioMeshes: THREE.Mesh[] = [];
  private trioGeos: THREE.BufferGeometry[] = [];
  trioFollow = new THREE.Vector3(); // live finger-follow offset (world units)
  private trioVisible = true;

  private fallMeshes: THREE.Mesh[] = [];
  private fallGeos: THREE.BufferGeometry[] = [];
  readonly fallMat: THREE.MeshPhysicalMaterial;

  private pickMesh: THREE.Mesh | null = null;
  private pickGeo: THREE.BufferGeometry | null = null;
  readonly pickMat: THREE.MeshPhysicalMaterial;

  private tailMesh: THREE.Mesh | null = null;
  private tailGeo: THREE.BufferGeometry | null = null;
  readonly tailMat: THREE.MeshPhysicalMaterial;
  private tailHangPts: THREE.Vector3[] = [];
  private basis = flowerBasis();
  petalPulls: number[] = new Array(PETAL_COUNT).fill(0);
  coil = 0;

  braidProgress = 0;
  frontT = 0;

  constructor() {
    const arcMatA = makeHairMaterial({ sway: 0.25 });
    const arcMatB = makeHairMaterial({ sway: 0.25 });
    arcMatB.color.offsetHSL(0.01, 0.02, -0.035); // subtle strand-to-strand variety
    for (let k = 0; k < 3; k++) {
      const geo = this.buildArcStrand(k);
      const mesh = new THREE.Mesh(geo, k === 1 ? arcMatB : arcMatA);
      mesh.frustumCulled = false;
      this.arcMeshes.push(mesh);
      this.group.add(mesh);
    }

    for (let k = 0; k < 3; k++) {
      // The strands the player touches are intrinsically a step brighter —
      // the affordance must survive even before the hint glow pulses.
      const mat = makeHairMaterial({ sway: 0.5 });
      mat.color.offsetHSL(0, -0.02, 0.09);
      this.trioMats.push(mat);
      const pts = this.trioPoints(k, 0, 0);
      const geo = sweepTube(pts, this.trioRadiusFn(), { radial: 7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.trioGeos.push(geo);
      this.trioMeshes.push(mesh);
      this.group.add(mesh);
    }

    this.fallMat = makeHairMaterial({ sway: 1.6 });
    this.pickMat = makeHairMaterial({ sway: 0.8 });
    this.tailMat = makeHairMaterial({ sway: 0.6 });

    this.setBraidProgress(0);
  }

  // ---------- braid arc ----------

  private arcStrandPoints(k: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < ARC_SEGS; i++) {
      const t = i / (ARC_SEGS - 1);
      pts.push(this.weavePoint(t, k, 1));
    }
    return pts;
  }

  /** Position of strand k at spine t with weave amplitude scale. */
  private weavePoint(t: number, k: number, ampScale: number): THREE.Vector3 {
    const spine = braidSpine(t);
    const out = spineOutward(t);
    const up = new THREE.Vector3(0, 1, 0);
    const o = weaveOffset(t, k);
    return spine
      .clone()
      .addScaledVector(up, o.u * 0.036 * ampScale)
      .addScaledVector(out, o.w * 0.028 * ampScale + 0.008);
  }

  private buildArcStrand(k: number): THREE.BufferGeometry {
    const pts = this.arcStrandPoints(k);
    return sweepTube(pts, (t) => HAIR.braidStrandRadius * (1 - 0.12 * Math.sin(t * Math.PI * 2 * BRAID_CYCLES)), {
      radial: ARC_RADIAL
    });
  }

  /** p 0..1 — how much of the arc is woven. drawRange keeps this free. */
  setBraidProgress(p: number): void {
    this.braidProgress = p;
    this.frontT = p;
    const segs = Math.max(0, Math.min(ARC_SEGS - 1, Math.floor(p * (ARC_SEGS - 1))));
    for (const m of this.arcMeshes) {
      m.geometry.setDrawRange(0, segs * ARC_RADIAL * 6);
      m.visible = segs > 0;
    }
    if (this.trioVisible) this.refreshTrio();
  }

  frontPoint(): THREE.Vector3 {
    return braidSpine(this.frontT);
  }

  // ---------- trio (loose strands at the front) ----------

  private trioRadiusFn(): (t: number) => number {
    return (t) => HAIR.strandRadius * (1 - 0.45 * t) * tipTaper(t);
  }

  /**
   * Loose strands fan open ahead of the front. `fan` 1 = fully open,
   * 0 = gathered (during a cross the fan closes as the weave eats it).
   * `droop` lowers the lowest strand (hinting "this one can fall").
   */
  private trioPoints(k: number, fan: number, droopK: number): THREE.Vector3[] {
    // Loose strands hug the head, flow a little further along the arc, then
    // sag under their own weight — waiting hair, not antennae.
    const pts: THREE.Vector3[] = [];
    const t0 = this.frontT;
    const reach = 0.22;
    const o = weaveOffset(t0, k);
    const isLow = o.u < -0.3;
    for (let i = 0; i < TRIO_SEGS; i++) {
      const d = i / (TRIO_SEGS - 1);
      const t = Math.min(t0 + d * reach, 1);
      const spine = braidSpine(t);
      const out = spineOutward(t);
      const up = new THREE.Vector3(0, 1, 0);
      const p = spine
        .clone()
        .addScaledVector(up, o.u * 0.034 * (0.5 + 0.9 * d * fan))
        .addScaledVector(out, o.w * 0.024 + 0.012 + 0.028 * d * fan);
      // gravity: every strand sags toward the tip; the drop candidate sags more
      p.y -= Math.pow(d, 1.7) * (0.11 + 0.05 * fan + (isLow ? droopK * 0.16 : 0));
      // finger follow, weighted toward the free end
      p.addScaledVector(this.trioFollow, d * d);
      pts.push(p);
    }
    return pts;
  }

  /** Which trio strand is currently lowest (the drop candidate). */
  lowestTrioIndex(): number {
    let best = 0;
    let bestU = Infinity;
    for (let k = 0; k < 3; k++) {
      const u = weaveOffset(this.frontT, k).u;
      if (u < bestU) {
        bestU = u;
        best = k;
      }
    }
    return best;
  }

  refreshTrio(fan = 1, droopK = 0): void {
    for (let k = 0; k < 3; k++) {
      updateSweep(this.trioGeos[k], this.trioPoints(k, fan, droopK), this.trioRadiusFn(), { radial: 7 });
    }
  }

  setTrioVisible(v: boolean): void {
    this.trioVisible = v;
    for (const m of this.trioMeshes) m.visible = v;
  }

  hideTrioStrand(k: number, hidden: boolean): void {
    this.trioMeshes[k].visible = !hidden && this.trioVisible;
  }

  // ---------- waterfall (fallen strands) ----------

  /** Create a falling strand leaving the braid at spine t. Returns its index. */
  spawnFall(t: number): number {
    const pts = sampleSpline(waterfallControls(t, 0), FALL_SEGS);
    const geo = sweepTube(pts, (s) => HAIR.strandRadius * (1 - 0.4 * s) * tipTaper(s), { radial: 7 });
    const mesh = new THREE.Mesh(geo, this.fallMat);
    mesh.frustumCulled = false;
    mesh.userData.spineT = t;
    this.fallGeos.push(geo);
    this.fallMeshes.push(mesh);
    this.group.add(mesh);
    return this.fallMeshes.length - 1;
  }

  /** settle 0..1 — morph from held to fully fallen (call each frame while animating). */
  setFall(i: number, settle: number): void {
    const t = this.fallMeshes[i].userData.spineT as number;
    const pts = sampleSpline(waterfallControls(t, settle), FALL_SEGS);
    updateSweep(this.fallGeos[i], pts, (s) => HAIR.strandRadius * (1 - 0.4 * s) * tipTaper(s), { radial: 7 });
  }

  get fallCount(): number {
    return this.fallMeshes.length;
  }

  // ---------- pick (new strand arriving from above) ----------

  private pickPoints(anim: number): THREE.Vector3[] {
    // Sweeps from the crown down to the braid front as anim 0→1.
    const crown = new THREE.Vector3(this.frontT * 0.25 - 0.02, 1.45 + 0.32, 0.12);
    const front = this.frontPoint().clone().add(new THREE.Vector3(0.02, 0.05, 0.03));
    const mid = crown.clone().lerp(front, 0.5).add(new THREE.Vector3(0.06, 0.10 * (1 - anim), 0.10));
    const reach = crown.clone().lerp(front, anim);
    const ctrl = [crown, mid.lerp(reach, anim * 0.5), reach];
    return sampleSpline(ctrl, TRIO_SEGS);
  }

  showPick(): void {
    if (!this.pickMesh) {
      this.pickGeo = sweepTube(this.pickPoints(0), (t) => HAIR.strandRadius * (1 - 0.3 * t), { radial: 7 });
      this.pickMesh = new THREE.Mesh(this.pickGeo, this.pickMat);
      this.pickMesh.frustumCulled = false;
      this.group.add(this.pickMesh);
    }
    this.pickMesh.visible = true;
    this.setPickAnim(0);
  }

  setPickAnim(anim: number): void {
    if (!this.pickGeo) return;
    updateSweep(this.pickGeo, this.pickPoints(anim), (t) => HAIR.strandRadius * (1 - 0.3 * t), { radial: 7 });
  }

  pickStartPoint(): THREE.Vector3 {
    return this.pickPoints(0)[0].clone();
  }

  hidePick(): void {
    if (this.pickMesh) this.pickMesh.visible = false;
  }

  // ---------- tail: petals & coil ----------

  buildTail(): void {
    this.tailHangPts = sampleSpline(hangControls(), TAIL_SEGS);
    this.tailGeo = sweepTube(this.tailHangPts, (s) => petalRadius(s, this.petalPulls, 0.030, 0.085), {
      radial: TAIL_RADIAL,
      flatten: () => 0.42,
      ref: FLOWER_NORMAL
    });
    this.tailMesh = new THREE.Mesh(this.tailGeo, this.tailMat);
    this.tailMesh.frustumCulled = false;
    this.group.add(this.tailMesh);
  }

  get hasTail(): boolean {
    return !!this.tailMesh;
  }

  refreshTail(): void {
    if (!this.tailGeo) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < TAIL_SEGS; i++) {
      const s = i / (TAIL_SEGS - 1);
      pts.push(coilPoint(s, this.coil, this.tailHangPts[i], this.basis));
    }
    // As it coils, petals flare a touch wider — the flower blooming.
    const bloom = 1 + this.coil * 0.3;
    updateSweep(this.tailGeo, pts, (s) => petalRadius(s, this.petalPulls, 0.030 * (1 - 0.3 * this.coil), 0.085 * bloom), {
      radial: TAIL_RADIAL,
      flatten: () => 0.42 - 0.14 * this.coil,
      ref: FLOWER_NORMAL
    });
  }

  /** World position of petal loop i on the current tail. */
  petalWorld(i: number): THREE.Vector3 {
    const s = 0.22 + (i * 0.66) / (PETAL_COUNT - 1);
    const idx = Math.round(s * (TAIL_SEGS - 1));
    const base = this.tailHangPts[idx] ?? new THREE.Vector3();
    return coilPoint(s, this.coil, base, this.basis);
  }

  /** Outward direction (screen-space-ish) used to measure a petal pull. */
  petalOutward(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0.25).normalize();
  }

  flowerCenter(): THREE.Vector3 {
    return FLOWER_CENTER.clone();
  }

  flowerNormal(): THREE.Vector3 {
    return FLOWER_NORMAL.clone();
  }

  /** Small settle wobble on the whole flower after the gem is pinned. */
  jiggleFlower(amount: number): void {
    if (!this.tailMesh) return;
    this.tailMesh.position.set(0, 0, 0).addScaledVector(FLOWER_NORMAL, amount * 0.01);
    this.tailMesh.scale.setScalar(1 + amount * 0.03);
  }

  /** Tangent at the braid front, for hint-path orientation. */
  frontTangent(): THREE.Vector3 {
    const a = braidSpine(Math.max(this.frontT - 0.02, 0));
    const b = braidSpine(Math.min(this.frontT + 0.02, 1));
    return b.sub(a).normalize();
  }

  /** Reset everything for replay. */
  reset(): void {
    for (const m of this.fallMeshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.fallMeshes = [];
    this.fallGeos = [];
    if (this.tailMesh) {
      this.group.remove(this.tailMesh);
      this.tailGeo?.dispose();
      this.tailMesh = null;
      this.tailGeo = null;
    }
    this.hidePick();
    this.petalPulls.fill(0);
    this.coil = 0;
    this.trioFollow.set(0, 0, 0);
    this.setTrioVisible(true);
    this.setBraidProgress(0);
    this.refreshTrio(1, 0);
  }
}

/** Used by tests: expose frame computation for sanity checks. */
export { transportFrames };
