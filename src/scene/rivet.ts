// src/scene/rivet.ts
// The single hero rivet (emissive color driven by rivet.temp/cooled via
// visual/rivetColor.ts, head "morphs" round by lerping a flat-headed scale
// toward a round dome scale as rivet.formed rises) plus its forge/brazier
// with glowing coals (emissive-only + a small flickering point light).

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { rivetColorRamp } from '../visual/rivetColor';
import type { MaterialSet } from '../visual/materials';

export interface RivetRig {
  rivetGroup: Group;
  forgeGroup: Group;
  setColor(temp: number, cooled: number): void;
  setFormed(formed: number): void;
  update(dtMs: number): void;
  dispose(): void;
}

export function createRivetRig(materials: MaterialSet): RivetRig {
  // ---- rivet -----------------------------------------------------------------
  const rivetGroup = new Group();
  rivetGroup.name = 'rivet';
  const shaftGeo = new CylinderGeometry(0.045, 0.045, 0.32, 8);
  const rivetMat = new MeshStandardMaterial({ color: 0x3a2c28, roughness: 0.6, metalness: 0.5 });
  const shaft = new Mesh(shaftGeo, rivetMat);
  rivetGroup.add(shaft);

  const flatHeadGeo = new CylinderGeometry(0.09, 0.09, 0.04, 10);
  const roundHeadGeo = new SphereGeometry(0.085, 10, 8);
  const head: Mesh<BufferGeometry, MeshStandardMaterial> = new Mesh(flatHeadGeo, rivetMat);
  head.position.y = 0.18;
  rivetGroup.add(head);

  function setColor(temp: number, cooled: number): void {
    const ramp = rivetColorRamp(temp, cooled);
    rivetMat.color.setHex(ramp.color);
    rivetMat.emissive.setHex(ramp.emissive);
    rivetMat.emissiveIntensity = ramp.emissiveIntensity;
  }

  function setFormed(formed: number): void {
    const t = Math.min(Math.max(formed, 0), 1);
    // morph: interpolate scale from the flat-head geometry footprint toward
    // the round-head footprint (swap geometry at t>=1 for the true dome look
    // while animating a squash toward it below that so it visibly "balls up").
    const squashY = 1 + t * 0.9;
    const squashXZ = 1 - t * 0.15;
    if (t >= 0.999 && head.geometry !== roundHeadGeo) {
      head.geometry = roundHeadGeo;
      head.scale.set(1, 1, 1);
    } else if (t < 0.999 && head.geometry !== flatHeadGeo) {
      head.geometry = flatHeadGeo;
    }
    if (head.geometry === flatHeadGeo) {
      head.scale.set(squashXZ, squashY, squashXZ);
    }
  }
  setColor(0, 0);
  setFormed(0);

  // ---- forge / brazier ---------------------------------------------------------
  const forgeGroup = new Group();
  forgeGroup.name = 'forge';
  const bowlGeo = new CylinderGeometry(0.45, 0.32, 0.3, 10);
  const bowl = new Mesh(bowlGeo, materials.ironDark);
  bowl.position.y = 0.15;
  forgeGroup.add(bowl);
  const legGeo = new CylinderGeometry(0.03, 0.03, 0.4, 6);
  for (const [x, z] of [
    [0.25, 0.25],
    [-0.25, 0.25],
    [0.25, -0.25],
    [-0.25, -0.25],
  ] as const) {
    const leg = new Mesh(legGeo, materials.ironDark);
    leg.position.set(x, -0.05, z);
    forgeGroup.add(leg);
  }
  const coalsGeo = new SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const coals = new Mesh(coalsGeo, materials.coal);
  coals.position.y = 0.28;
  forgeGroup.add(coals);

  const glow = new PointLight(0xff5a1a, 1.2, 2.5, 2);
  glow.position.y = 0.4;
  forgeGroup.add(glow);

  let flickerPhase = 0;
  function update(dtMs: number): void {
    flickerPhase += dtMs * 0.006;
    glow.intensity = 1.0 + Math.sin(flickerPhase) * 0.15 + Math.sin(flickerPhase * 2.7) * 0.08;
  }

  function dispose(): void {
    shaftGeo.dispose();
    flatHeadGeo.dispose();
    roundHeadGeo.dispose();
    rivetMat.dispose();
    bowlGeo.dispose();
    legGeo.dispose();
    coalsGeo.dispose();
  }

  return { rivetGroup, forgeGroup, setColor, setFormed, update, dispose };
}
