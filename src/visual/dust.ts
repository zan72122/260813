/**
 * Dust puff on `hammered` — a handful of small fading/scattering quads
 * triggered at the active leg's wedge junction. Only one leg can be mid-
 * hammer at a time (game flow enforces a single active leg), so ONE
 * reusable puff (repositioned per trigger) is enough — no per-leg
 * instancing needed here.
 */
import * as THREE from 'three';

const PARTICLE_COUNT = 7;
const MAX_DISTANCE = 0.6;
const BASE_SCALE = 0.12;

function seededDirections(count: number): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const upBias = 0.4 + (i % 3) * 0.15;
    dirs.push(new THREE.Vector3(Math.cos(a), upBias, Math.sin(a)).normalize());
  }
  return dirs;
}

/** Puff particle progress → local offset scale (0 at trigger, eases outward then holds). Pure — independently testable. */
export function dustOffsetForProgress(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return MAX_DISTANCE * (1 - Math.pow(1 - t, 2));
}

/** Puff particle progress → opacity (starts opaque-ish, fades to 0). Pure. */
export function dustOpacityForProgress(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 0.4 * (1 - t);
}

export interface DustPuff {
  group: THREE.Group;
  particles: { mesh: THREE.Mesh; dir: THREE.Vector3 }[];
  material: THREE.MeshBasicMaterial;
}

export function buildDustPuff(baseColorHex: number): DustPuff {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: baseColorHex, transparent: true, opacity: 0, depthWrite: false });
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const dirs = seededDirections(PARTICLE_COUNT);
  const particles = dirs.map((dir) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(BASE_SCALE);
    group.add(mesh);
    return { mesh, dir };
  });
  group.visible = false;
  return { group, particles, material };
}

/** Repositions the puff at `origin` and resets it to progress=0 (call this on the `hammered` event). */
export function triggerDustPuff(puff: DustPuff, origin: THREE.Vector3): void {
  puff.group.position.copy(origin);
  puff.group.visible = true;
  updateDustPuff(puff, 0);
}

/** Advances the puff's visual state to `progress` (0..1, 1 = fully dissipated). Caller (render/index.ts) drives progress from a decaying pulse. */
export function updateDustPuff(puff: DustPuff, progress: number): void {
  const offset = dustOffsetForProgress(progress);
  const opacity = dustOpacityForProgress(progress);
  puff.material.opacity = opacity;
  puff.group.visible = opacity > 0.005;
  for (const p of puff.particles) {
    p.mesh.position.copy(p.dir).multiplyScalar(offset);
  }
}
