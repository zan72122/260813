import * as THREE from '../lib/three.module.js';
import { WATER_Y } from './world.js';

// Lightweight pooled particle effects: dye drips, absorb streams flowing
// from the water up into the sponge, celebration sparkles, water ripples,
// rinse wisps and soft ground splats. All meshes are pooled and reused.

const dropGeo = new THREE.SphereGeometry(1, 8, 6);
const sparkGeo = new THREE.OctahedronGeometry(1, 0);
const ringGeo = new THREE.TorusGeometry(1, 0.035, 6, 32);
const splatGeo = new THREE.CircleGeometry(1, 18);

export class FX {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.particles = [];
    this.pool = [];
  }

  _acquire(geo) {
    let m = this.pool.pop();
    if (!m) {
      m = new THREE.Mesh(
        dropGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
      );
    }
    m.geometry = geo;
    m.visible = true;
    m.material.opacity = 1;
    m.rotation.set(0, 0, 0);
    this.scene.add(m);
    return m;
  }

  _release(m) {
    this.scene.remove(m);
    m.visible = false;
    this.pool.push(m);
  }

  // A drop of squeezed liquid falling from `from` down to `floorY`.
  drip(from, color, floorY, onLand) {
    const m = this._acquire(dropGeo);
    m.material.color.copy(color);
    m.material.opacity = 0.95;
    const r = 0.05 + this.rng() * 0.045;
    m.scale.set(r, r * 1.35, r);
    m.position.copy(from);
    m.position.x += (this.rng() - 0.5) * 0.22;
    m.position.z += (this.rng() - 0.5) * 0.22;
    this.particles.push({
      m, type: 'drip', floorY, onLand,
      vel: new THREE.Vector3((this.rng() - 0.5) * 0.25, -0.4, (this.rng() - 0.5) * 0.25),
      life: 0, ttl: 3,
    });
  }

  // Colour visibly travelling from the water surface into the sponge.
  absorbStream(fromSurface, toSponge, color) {
    const m = this._acquire(dropGeo);
    m.material.color.copy(color);
    m.material.opacity = 0.85;
    const r = 0.035 + this.rng() * 0.03;
    m.scale.setScalar(r);
    m.position.copy(fromSurface);
    m.position.x += (this.rng() - 0.5) * 0.5;
    m.position.z += (this.rng() - 0.5) * 0.5;
    this.particles.push({
      m, type: 'absorb',
      target: toSponge.clone().add(new THREE.Vector3((this.rng() - 0.5) * 0.5, 0.1, (this.rng() - 0.5) * 0.35)),
      life: 0, ttl: 0.55 + this.rng() * 0.25,
    });
  }

  sparkleBurst(center, color, count = 26) {
    for (let i = 0; i < count; i++) {
      const m = this._acquire(sparkGeo);
      m.material.color.copy(color).lerp(new THREE.Color(1, 1, 1), this.rng() * 0.6);
      const r = 0.035 + this.rng() * 0.05;
      m.scale.setScalar(r);
      m.position.copy(center);
      const a = this.rng() * Math.PI * 2;
      const up = 1.4 + this.rng() * 2.2;
      const out = 0.6 + this.rng() * 1.6;
      this.particles.push({
        m, type: 'spark',
        vel: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        spin: (this.rng() - 0.5) * 10,
        life: 0, ttl: 0.9 + this.rng() * 0.7,
      });
    }
  }

  ripple(center, color, big = false) {
    const m = this._acquire(ringGeo);
    m.material.color.copy(color);
    m.material.opacity = 0.7;
    m.position.set(center.x, WATER_Y + 0.02, center.z);
    m.rotation.x = Math.PI / 2;
    this.particles.push({ m, type: 'ripple', life: 0, ttl: big ? 1.0 : 0.7, maxR: big ? 1.15 : 0.75 });
  }

  // Soft coloured cloud drifting in the rinse water.
  washWisp(center, color) {
    const m = this._acquire(dropGeo);
    m.material.color.copy(color);
    m.material.opacity = 0.4;
    m.scale.setScalar(0.1 + this.rng() * 0.12);
    m.position.copy(center);
    m.position.y = WATER_Y - 0.02;
    m.position.x += (this.rng() - 0.5) * 0.6;
    m.position.z += (this.rng() - 0.5) * 0.6;
    this.particles.push({
      m, type: 'wisp',
      vel: new THREE.Vector3((this.rng() - 0.5) * 0.5, 0, (this.rng() - 0.5) * 0.5),
      life: 0, ttl: 1.4 + this.rng() * 0.8,
    });
  }

  // A pretty little splat where liquid lands (fades away slowly).
  splat(pos, color, scale = 1) {
    const m = this._acquire(splatGeo);
    m.material.color.copy(color);
    m.material.opacity = 0.55;
    m.position.set(pos.x, 0.015 + this.rng() * 0.004, pos.z);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.01);
    this.particles.push({ m, type: 'splat', life: 0, ttl: 6, maxR: (0.12 + this.rng() * 0.1) * scale });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const k = p.life / p.ttl;
      let dead = k >= 1;
      switch (p.type) {
        case 'drip': {
          p.vel.y -= 9.5 * dt;
          p.m.position.addScaledVector(p.vel, dt);
          p.m.scale.y = p.m.scale.x * (1.2 + Math.min(1.2, -p.vel.y * 0.14));
          if (p.m.position.y <= p.floorY) {
            dead = true;
            if (p.onLand) p.onLand(p.m.position, p.m.material.color);
          }
          break;
        }
        case 'absorb': {
          const t = Math.min(1, k);
          p.m.position.lerp(p.target, Math.min(1, dt * (4 + t * 8)));
          p.m.material.opacity = 0.85 * (1 - t * t);
          break;
        }
        case 'spark': {
          p.vel.y -= 5.2 * dt;
          p.m.position.addScaledVector(p.vel, dt);
          p.m.rotation.x += p.spin * dt;
          p.m.rotation.z += p.spin * 0.7 * dt;
          p.m.material.opacity = 1 - k * k;
          break;
        }
        case 'ripple': {
          const r = 0.15 + k * p.maxR;
          p.m.scale.setScalar(r);
          p.m.material.opacity = 0.7 * (1 - k);
          break;
        }
        case 'wisp': {
          p.m.position.addScaledVector(p.vel, dt);
          p.m.scale.multiplyScalar(1 + dt * 0.9);
          p.m.material.opacity = 0.4 * (1 - k);
          break;
        }
        case 'splat': {
          const grow = Math.min(1, p.life * 3.5);
          p.m.scale.setScalar(p.maxR * (0.3 + 0.7 * grow));
          p.m.material.opacity = 0.55 * (1 - Math.max(0, (k - 0.4) / 0.6));
          break;
        }
      }
      if (dead) {
        this._release(p.m);
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }
  }
}
