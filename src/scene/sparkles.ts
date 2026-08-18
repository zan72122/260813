import * as THREE from 'three';
import { getGlowTexture } from '../hair/materials';
import { PARTICLES, REDUCED_MOTION, STYLE } from '../style';

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
}

/**
 * Quiet celebration particles — a handful of drifting light seeds, never
 * full-screen confetti (STYLE_LOCK.particles.rule).
 */
export class Sparkles {
  private scene: THREE.Scene;
  private bursts: Burst[] = [];
  private seed = 991;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  burst(at: THREE.Vector3, color: string, count = 18, speed = 0.35): void {
    const max = REDUCED_MOTION ? STYLE.motionReduction.prefersReducedMotion.burstMax : PARTICLES.burstMax;
    const n = Math.min(count, max);
    if (n <= 0) return;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      const th = this.rand() * Math.PI * 2;
      const ph = Math.acos(2 * this.rand() - 1);
      const sp = speed * (0.4 + 0.6 * this.rand());
      vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      vel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + 0.08;
      vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(color),
      size: 0.035,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(g, m);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0, maxLife: 1.6 });
  }

  tick(dt: number): void {
    for (const b of this.bursts) {
      b.life += dt;
      const posAttr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += b.vel[i] * dt;
        arr[i + 1] += b.vel[i + 1] * dt;
        arr[i + 2] += b.vel[i + 2] * dt;
        b.vel[i] *= 0.985;
        b.vel[i + 1] = b.vel[i + 1] * 0.985 - 0.12 * dt;
        b.vel[i + 2] *= 0.985;
      }
      posAttr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = 0.9 * Math.max(0, 1 - b.life / b.maxLife);
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.life >= b.maxLife) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }
}
