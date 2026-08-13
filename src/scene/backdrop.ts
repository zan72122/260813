// src/scene/backdrop.ts
// 1889 Paris backdrop: gradient sky (handled by core via scene.background),
// warm haze/fog, Seine ribbon with arched bridges, instanced Haussmann
// blocks, a Trocadero silhouette across the river, a few soft cloud sprites.
// Deliberately cheap/flat/low-poly per PERFORMANCE_BUDGET + VISUAL_ACCEPTANCE
// ("no modern landmarks"). Cloud/city layout is deterministic from seed.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { MaterialSet } from '../visual/materials';
import type { CanvasTexture } from 'three';

const RIVER_Z = -70;
const CITY_Z = -95;
const MAX_BLOCKS = 48;

/**
 * Unit two-slope "mansard-ish" prism roof (R2): footprint 1x1 in x/z
 * (spanning -0.5..0.5), eave at y=-0.5 (rests flush on the building top),
 * ridge running along x at y=+0.5, z=0. Two slanted rectangular slopes
 * (front/back) + two triangular gable ends — 6 triangles total, cheaper
 * than the 12-triangle box it replaces reading as a roof. Scaled per
 * building instance (footprint width/depth + roof height) via the
 * InstancedMesh matrix, so this stays one shared geometry.
 */
function makeGableRoofGeometry(): BufferGeometry {
  const backLeft = [-0.5, -0.5, -0.5];
  const backRight = [0.5, -0.5, -0.5];
  const frontRight = [0.5, -0.5, 0.5];
  const frontLeft = [-0.5, -0.5, 0.5];
  const ridgeLeft = [-0.5, 0.5, 0];
  const ridgeRight = [0.5, 0.5, 0];
  const verts = [
    // back slope
    ...backLeft, ...backRight, ...ridgeRight,
    ...backLeft, ...ridgeRight, ...ridgeLeft,
    // front slope
    ...frontRight, ...frontLeft, ...ridgeLeft,
    ...frontRight, ...ridgeLeft, ...ridgeRight,
    // gable ends (triangles)
    ...frontLeft, ...backLeft, ...ridgeLeft,
    ...backRight, ...frontRight, ...ridgeRight,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface BackdropRig {
  group: Group;
  setDetail(detail: 'full' | 'reduced' | 'minimal'): void;
  dispose(): void;
}

export function createBackdropRig(
  materials: MaterialSet,
  cloudTexture: CanvasTexture,
  rand: () => number,
): BackdropRig {
  const group = new Group();
  group.name = 'backdrop';

  // ---- ground plane (D2: everything must sit ON real ground, nothing floats) --
  // Champ-de-Mars earth/grass, large enough to run from under the yard all the
  // way past the Seine/city and out to where fog (core/index.ts) swallows it,
  // so there is never a raw-sky gap between the yard and the distant city.
  const groundGeo = new PlaneGeometry(520, 420);
  const ground = new Mesh(groundGeo, materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -60);
  group.add(ground);

  // ---- Seine ribbon ----------------------------------------------------------
  const riverMat = new MeshBasicMaterial({ color: 0x6f93a8, transparent: true, opacity: 0.85 });
  const river = new Mesh(new PlaneGeometry(260, 14), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.05, RIVER_Z);
  group.add(river);

  // ---- Haussmann blocks (instanced): cream wall body + dark zinc mansard
  // roof (R2 — "flat-roofed modern boxes" is the failure this fixes). The
  // roof is a second InstancedMesh (own cheap 6-tri geometry) stacked on
  // each wall instance at matching footprint, so instancing + the triangle
  // budget are both kept (48 walls x 12 tri + 48 roofs x 6 tri, well under
  // budget). ------------------------------------------------------------
  const blockGeo = new BoxGeometry(1, 1, 1);
  const blockMesh = new InstancedMesh(blockGeo, materials.haussmannWall, MAX_BLOCKS);
  blockMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const roofGeo = makeGableRoofGeometry();
  const roofMesh = new InstancedMesh(roofGeo, materials.roofZinc, MAX_BLOCKS);
  roofMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const dummy = new Object3D();
  let count = 0;
  for (let i = 0; i < MAX_BLOCKS; i += 1) {
    const spread = 130;
    const x = (rand() - 0.5) * spread;
    const z = CITY_Z - rand() * 20;
    const w = 4 + rand() * 3;
    const h = 3.5 + rand() * 3;
    const d = 3 + rand() * 2;
    const rotY = (rand() - 0.5) * 0.1;
    dummy.position.set(x, h / 2, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    blockMesh.setMatrixAt(i, dummy.matrix);

    const roofHeight = h * (0.28 + rand() * 0.1);
    dummy.position.set(x, h + roofHeight / 2, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(w * 1.05, roofHeight, d * 1.05);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
    count += 1;
  }
  blockMesh.count = count;
  roofMesh.count = count;
  group.add(blockMesh);
  group.add(roofMesh);

  // ---- Trocadero silhouette (simplified twin-tower palace across the
  // river) + a central dome (R2: "one Trocadero-like domed landmark
  // silhouette") — the 1889 Palais du Trocadéro's signature Moorish-
  // Byzantine rotunda, not just twin flat-roofed towers. ------------------
  const trocadero = new Group();
  const bodyGeo = new BoxGeometry(14, 5, 3);
  const wingL = new Mesh(bodyGeo, materials.trocadero);
  wingL.position.set(-9, 2.5, CITY_Z - 10);
  const wingR = new Mesh(bodyGeo, materials.trocadero);
  wingR.position.set(9, 2.5, CITY_Z - 10);
  const towerBodyGeo = new BoxGeometry(2.4, 7, 2.4);
  const towerL = new Mesh(towerBodyGeo, materials.trocadero);
  towerL.position.set(-9, 3.5, CITY_Z - 10);
  const towerR = new Mesh(towerBodyGeo, materials.trocadero);
  towerR.position.set(9, 3.5, CITY_Z - 10);
  // central rotunda: a squat drum + a real hemispherical dome, reading as
  // the landmark silhouette even at backdrop distance/haze.
  const rotundaGeo = new CylinderGeometry(4.4, 4.6, 4, 14);
  const rotunda = new Mesh(rotundaGeo, materials.trocadero);
  rotunda.position.set(0, 2, CITY_Z - 8);
  const domeGeo = new SphereGeometry(4.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new Mesh(domeGeo, materials.domeGold);
  dome.position.set(0, 4, CITY_Z - 8);
  trocadero.add(wingL, wingR, towerL, towerR, rotunda, dome);
  group.add(trocadero);

  // ---- 1-2 arched bridges across the river ------------------------------------
  const bridgeGroup = new Group();
  const archGeo = new TorusGeometry(4, 0.35, 6, 12, Math.PI);
  const bridgeSpans = [-24, 20];
  const archMeshes: Mesh[] = [];
  for (const x of bridgeSpans) {
    const arch = new Mesh(archGeo, materials.bridgeStone);
    arch.position.set(x, 0.1, RIVER_Z);
    arch.rotation.x = Math.PI;
    arch.rotation.y = Math.PI / 2;
    bridgeGroup.add(arch);
    archMeshes.push(arch);
    const deckGeo = new BoxGeometry(3.2, 0.3, 15);
    const deck = new Mesh(deckGeo, materials.bridgeStone);
    deck.position.set(x, 3.6, RIVER_Z);
    bridgeGroup.add(deck);
    archMeshes.push(deck);
  }
  group.add(bridgeGroup);

  // ---- soft cloud sprites -----------------------------------------------------
  const cloudMat = new MeshBasicMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const cloudGeo = new PlaneGeometry(1, 1);
  const cloudCount = 6;
  const cloudMesh = new InstancedMesh(cloudGeo, cloudMat, cloudCount);
  for (let i = 0; i < cloudCount; i += 1) {
    const x = (rand() - 0.5) * 160;
    const y = 22 + rand() * 14;
    const z = CITY_Z - 30 - rand() * 40;
    const s = 14 + rand() * 12;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s, s * 0.45, 1);
    dummy.updateMatrix();
    cloudMesh.setMatrixAt(i, dummy.matrix);
  }
  cloudMesh.count = cloudCount;
  group.add(cloudMesh);

  function setDetail(detail: 'full' | 'reduced' | 'minimal'): void {
    const visibleCount =
      detail === 'full' ? count : detail === 'reduced' ? Math.round(count * 0.6) : Math.round(count * 0.3);
    blockMesh.count = visibleCount;
    roofMesh.count = visibleCount;
    cloudMesh.count = detail === 'minimal' ? Math.round(cloudCount * 0.5) : cloudCount;
  }

  function dispose(): void {
    groundGeo.dispose();
    riverMat.dispose();
    (river.geometry as PlaneGeometry).dispose();
    blockGeo.dispose();
    roofGeo.dispose();
    bodyGeo.dispose();
    towerBodyGeo.dispose();
    rotundaGeo.dispose();
    domeGeo.dispose();
    archGeo.dispose();
    archMeshes.forEach((m) => {
      const geo = m.geometry;
      if (geo !== archGeo) geo.dispose();
    });
    cloudGeo.dispose();
    cloudMat.dispose();
  }

  return { group, setDetail, dispose };
}
