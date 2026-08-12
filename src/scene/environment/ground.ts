/**
 * Ground plane + sky dome. Two draw calls total; both are purely
 * decorative/backdrop (VISUAL_ACCEPTANCE "控えめなパリの地平・空").
 */
import * as THREE from 'three';
import { GROUND_Y } from '../layout';

export const GROUND_SIZE = 500;
export const SKY_RADIUS = 220;

export function buildGround(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = GROUND_Y;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sky dome — a large inward-facing sphere (BackSide material) so it always reads as distant backdrop, never occluding foreground geometry. */
export function buildSky(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 20, 14);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = GROUND_Y;
  return mesh;
}
