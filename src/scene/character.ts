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

    // Hair cap hugging the skull — a touch deeper than the strands so the
    // smooth dome reads as combed hair, not skin.
    const capMat = makeHairMaterial({ sway: 0 });
    capMat.color.offsetHSL(0, 0.03, -0.05);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_RADIUS + 0.028, 28, 22), capMat);
    cap.position.copy(HEAD_CENTER).add(new THREE.Vector3(0, 0.025, 0.015));
    cap.scale.set(0.97, 1.02, 1.02);
    this.group.add(cap);

    // Long back-hair mass: a fan of strands from the crown down the back.
    // Deterministic variety (no Math.random — reproducible goldens).
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // A deep-shadow bulge of gathered hair filling the space between strands —
    // it must read as the dark interior of the hair, never as scalp.
    const hairUnder = makeHairMaterial({ under: true, sway: 0 });
    const volume = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), hairUnder);
    volume.position.copy(HEAD_CENTER).add(new THREE.Vector3(0, -0.10, 0.06));
    volume.scale.set(0.235, 0.34, 0.20);
    this.group.add(volume);

    const crown = HEAD_CENTER.clone().add(new THREE.Vector3(0, HEAD_RADIUS * 0.85, 0.05));
    for (let i = 0; i < 14; i++) {
      const a = -0.95 + (i / 13) * 1.9; // fan azimuth across the back
      const r = HEAD_RADIUS + 0.03;
      const mid = new THREE.Vector3(
        Math.sin(a) * r * 1.05,
        HEAD_CENTER.y - 0.05,
        Math.cos(a) * r * (0.8 + rand() * 0.2)
      );
      const low = new THREE.Vector3(
        Math.sin(a) * (r * 0.85) + (rand() - 0.5) * 0.06,
        0.72 + rand() * 0.12,
        0.10 + rand() * 0.08
      );
      const tip = low.clone().add(new THREE.Vector3((rand() - 0.5) * 0.03, -0.14 - rand() * 0.06, -0.01));
      const pts = sampleSpline([crown, mid, low, tip], 24, 0.35);
      const thick = 0.055 + rand() * 0.025;
      const mesh = new THREE.Mesh(
        sweepTube(pts, (t) => thick * (1 - 0.5 * t) * (0.7 + 0.3 * Math.sin(t * Math.PI)) * tipTaper(t), { radial: 7 }),
        i % 3 === 0 ? hairMid : hairDark
      );
      this.group.add(mesh);
    }

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
