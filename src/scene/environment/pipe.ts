// 古びた灰色土管。横倒し、外周退色ムラ、内側は暗色。setPipeXray(on)で探索時に半透明化。
import * as THREE from "three";
import { getSpot } from "../../game/spots";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const PIPE_OUTER_COLOR = new THREE.Color("#9aa0a0");
const PIPE_INNER_COLOR = new THREE.Color("#6f7674");
const LENGTH = 2.6;
const OUTER_R = 0.62;
const INNER_R = 0.46;

export interface Pipe {
  readonly group: THREE.Group;
  setPipeXray(on: boolean): void;
}

export function createPipe(): Pipe {
  const spot = getSpot("pipe");
  const rng = seededRandom(5151);
  const group = new THREE.Group();
  group.name = "pipe";

  // 外側の筒(両端は開口=内側が見える。CylinderGeometryのopenEndedをtrueにして小口円環で塞ぐ)。
  const outerGeo = new THREE.CylinderGeometry(OUTER_R, OUTER_R, LENGTH, 24, 4, true);
  paintVertexAO(outerGeo, PIPE_OUTER_COLOR, rng, { aoStrength: 0.25, hueJitter: 0.15 });
  const outerMat = standardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 1 });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  outerMesh.name = "pipe-outer";
  outerMesh.castShadow = true;
  outerMesh.receiveShadow = true;

  const innerGeo = new THREE.CylinderGeometry(INNER_R, INNER_R, LENGTH * 0.98, 20, 2, true);
  paintVertexAO(innerGeo, PIPE_INNER_COLOR, rng, { aoStrength: 0.4, hueJitter: 0.1 });
  const innerMat = standardMaterial({ color: 0xffffff, roughness: 1, side: THREE.BackSide, transparent: true, opacity: 1 });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.name = "pipe-inner";

  // 小口の輪(端の厚み)。
  const ringGeo = new THREE.RingGeometry(INNER_R, OUTER_R, 24);
  const ringMat = standardMaterial({ color: 0xffffff, roughness: 0.9 });
  paintVertexAO(ringGeo, PIPE_OUTER_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.1 });
  const ringA = new THREE.Mesh(ringGeo, ringMat);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = LENGTH / 2;
  const ringB = ringA.clone();
  ringB.position.y = -LENGTH / 2;
  ringB.rotation.x = -Math.PI / 2;

  group.add(outerMesh, innerMesh, ringA, ringB);

  // 横倒し: 円柱の軸(Y)をワールドZ軸方向に倒す。
  group.rotation.z = Math.PI / 2;
  group.position.set(spot.position.x, spot.position.y, spot.position.z);

  function setPipeXray(on: boolean): void {
    outerMat.opacity = on ? 0.28 : 1;
    outerMat.depthWrite = !on;
  }

  return { group, setPipeXray };
}
