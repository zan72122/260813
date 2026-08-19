import * as THREE from 'three';
import { makeSkinMaterial, makeDressMaterial, makeHairMaterial } from '../hair/materials';
import { sweepTube, sampleSpline, tipTaper } from '../hair/geo';
import { HEAD_CENTER, HEAD_RADIUS } from '../hair/braidMath';
import { PALETTE } from '../style';

/**
 * The girl — seen from behind, a quiet silhouette. Procedural, no assets.
 * The base hair mass is deliberately darker/rougher than the interactive
 * strands so the braid always reads in front of it (value hierarchy).
 */
export class Character {
  readonly group = new THREE.Group();
  private swayTime = 0;

  constructor() {
    const skin = makeSkinMaterial();
    const dress = makeDressMaterial();

    // Head (mostly hidden by hair, but its curve shapes the silhouette).
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS, 28, 22), skin);
    head.name = 'skin-head';
    head.position.copy(HEAD_CENTER);
    head.scale.set(0.94, 1.05, 1.0);
    this.group.add(head);

    // Neck.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.22, 16), skin);
    neck.position.set(0, 1.22, -0.02);
    this.group.add(neck);

    // Dress — a long lathe silhouette melting into the ground mist.
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.075, 1.26),
      new THREE.Vector2(0.16, 1.17),
      new THREE.Vector2(0.27, 1.06),
      new THREE.Vector2(0.30, 0.92),
      new THREE.Vector2(0.27, 0.72),
      new THREE.Vector2(0.33, 0.46),
      new THREE.Vector2(0.46, 0.18),
      new THREE.Vector2(0.52, 0.04)
    ];
    const dressMesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), dress);
    dressMesh.position.z = -0.02;
    this.group.add(dressMesh);

    // A thin brass trim ring at the collar — the single "上質" accent.
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.006, 8, 40),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(PALETTE.dressTrim),
        roughness: 0.35,
        metalness: 0.8
      })
    );
    trim.position.set(0, 1.245, -0.02);
    trim.rotation.x = Math.PI / 2;
    this.group.add(trim);

    // --- Base hair ---
    const hairDark = makeHairMaterial({ shadowTint: true, sway: 0.4 });
    const hairMid = makeHairMaterial({ sway: 0.7 });

    // Deterministic variety (no Math.random — reproducible goldens).
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    // Under-cap: sits just beneath the crown strands so any sliver of gap
    // reads as the dark interior of the hair — never as scalp. It is a
    // shadow, not a surface: deep, rough, no highlight.
    // Same scale ratios as the skull with a small uniform offset, so the
    // margin to the strand shell is constant everywhere — any local bulge
    // would poke between strands and read as a bald patch.
    const underCap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS + 0.002, 28, 22), makeHairMaterial({ shadowTint: true, sway: 0 }));
    underCap.name = 'underCap';
    underCap.position.copy(HEAD_CENTER);
    underCap.scale.set(0.94, 1.05, 1.0);
    this.group.add(underCap);

    // Crown: hair must read as flowing strands, never as a smooth dome.
    // A whorl (つむじ) at the top sends combed strands spiralling down the
    // skull on every side, tucking under the braid line and the back mass.
    const headScale = new THREE.Vector3(0.94, 1.05, 1.0);
    const onSkull = (theta: number, phi: number, off: number): THREE.Vector3 => {
      const u = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
      return HEAD_CENTER.clone().add(
        new THREE.Vector3(
          u.x * (headScale.x * HEAD_RADIUS + off),
          u.y * (headScale.y * HEAD_RADIUS + off),
          u.z * (headScale.z * HEAD_RADIUS + off)
        )
      );
    };
    // One continuous strand system: each strand runs whorl → skull → hanging
    // tip in a single sweep, so there is no seam, no exposed "hole", and no
    // row of tips across the middle of the head.
    const STRANDS = 36;
    for (let i = 0; i < STRANDS; i++) {
      const phi0 = (i / STRANDS) * Math.PI * 2 + 0.09;
      const swirl = 0.45 + rand() * 0.2; // one combing direction for the whole whorl
      const theta0 = 0.03 + rand() * 0.05;
      const backness = 0.5 * (1 + Math.cos(phi0 + swirl * 0.7)); // 1 = lands on the back
      const baseOff = 0.020 + (i % 3) * 0.003;

      // Skull-hugging section: whorl down to just past the widest point.
      // Dense control points — a sparse spline cuts chords INSIDE the skull
      // and buries the strand under the shadow cap.
      const thetaExit = 1.55 + 0.25 * backness;
      const skullPts: THREE.Vector3[] = [];
      for (const t of [0, 0.12, 0.26, 0.42, 0.6, 0.8, 1]) {
        const theta = theta0 + (thetaExit - theta0) * Math.pow(t, 0.9);
        const phi = phi0 + swirl * t;
        skullPts.push(onSkull(theta, phi, baseOff + 0.010 * Math.sin(t * Math.PI)));
      }
      const exit = skullPts[skullPts.length - 1];

      // Hanging section: falls with gravity, gathering gently inward.
      // Hem heights vary only a little — a calm U-hem, not a sawtooth.
      const hemY = 0.70 + 0.035 * (((i * 7) % 5) / 4) + 0.06 * (1 - backness);
      const behind = exit.z > 0;
      const hang1 = new THREE.Vector3(
        exit.x * 0.98,
        (exit.y + hemY) / 2,
        behind ? Math.max(exit.z * 0.9, 0.06) + 0.03 : exit.z * 1.02
      );
      const hang2 = new THREE.Vector3(
        exit.x * 0.9,
        hemY,
        behind ? Math.max(exit.z * 0.75, 0.05) : exit.z * 0.95
      );
      const pts = sampleSpline([...skullPts, hang1, hang2], 30, 0.4);
      const thick = 0.040 + rand() * 0.008;
      const radiusFn = (t: number): number =>
        thick * (0.5 + 0.5 * Math.min(t * 4, 1)) * (1 - 0.25 * t) * tipTaper(t);
      const mesh = new THREE.Mesh(sweepTube(pts, radiusFn, { radial: 7 }), i % 4 === 0 ? hairDark : hairMid);
      mesh.name = 'strand';
      this.group.add(mesh);
    }
    // Deep filler layer: coarse dark strands hugging the skull under the top
    // layer, so wherever the combed strands part, the gap shows more hair —
    // ridged and strand-like — instead of a smooth surface.
    for (let i = 0; i < 12; i++) {
      const phiF = -1.0 + (i / 11) * 2.0;
      const ptsF: THREE.Vector3[] = [];
      for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const theta = 0.10 + t * 1.6;
        ptsF.push(onSkull(theta, phiF + 0.25 * t, 0.007));
      }
      const fill = new THREE.Mesh(
        sweepTube(sampleSpline(ptsF, 20, 0.4), (t) => 0.055 * (0.7 + 0.3 * Math.min(t * 3, 1)), { radial: 7 }),
        hairDark
      );
      fill.name = 'filler';
      this.group.add(fill);
    }

    // A deep-shadow bulge of gathered hair filling the space between strands —
    // it must read as the dark interior of the hair, never as scalp.
    const hairUnder = makeHairMaterial({ under: true, sway: 0 });
    const volume = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), hairUnder);
    volume.name = 'volume';
    volume.position.copy(HEAD_CENTER).add(new THREE.Vector3(0, -0.16, 0.05));
    volume.scale.set(0.215, 0.28, 0.16);
    this.group.add(volume);

    // A lower shadow mass behind the hem, so the valleys between strand tips
    // read as the dark inside of the hair — never as gaps onto the dress.
    const hemShadow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), hairUnder);
    hemShadow.name = 'hemShadow';
    hemShadow.position.set(0, 1.02, 0.03);
    hemShadow.scale.set(0.24, 0.34, 0.12);
    this.group.add(hemShadow);

    // Two brighter side strands framing the face edges (seen as silhouette).
    for (const side of [-1, 1]) {
      const pts = sampleSpline(
        [
          HEAD_CENTER.clone().add(new THREE.Vector3(side * 0.16, 0.24, -0.05)),
          new THREE.Vector3(side * (HEAD_RADIUS + 0.05), 1.42, -0.10),
          new THREE.Vector3(side * (HEAD_RADIUS + 0.02), 1.12, -0.06),
          new THREE.Vector3(side * 0.20, 0.92, -0.02)
        ],
        20
      );
      const mesh = new THREE.Mesh(sweepTube(pts, (t) => 0.045 * (1 - 0.5 * t) * tipTaper(t), { radial: 7 }), hairMid);
      this.group.add(mesh);
    }
  }

  /** Gentle life: breath sway + a tiny head tilt toward the working side. */
  tick(dt: number, tiltToward = 0): void {
    this.swayTime += dt;
    const s = Math.sin(this.swayTime * 0.7) * 0.006;
    this.group.rotation.z = s + tiltToward * 0.03;
    this.group.rotation.y = Math.sin(this.swayTime * 0.45) * 0.008;
  }
}
