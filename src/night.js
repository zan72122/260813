import * as THREE from '../lib/three.module.js';
import { WATER_Y, makeHalo } from './world.js';
import { clamp, lerp } from './util.js';

// Night mode. A big sun medallion hangs in the sky — tap it and night
// falls: the sky turns indigo, stars come out, fireflies drift, the sun
// becomes a moon… and the MOONLIGHT POOL wakes up. Sponging its silver
// water charges the sponge with glow, and anything painted with glowing
// liquid shines in the dark. Tap the moon to bring the day back.

export const MOON_POOL = { id: 'moon', pos: new THREE.Vector3(-6.0, 0, 3.5), radius: 0.92 };
export const GLOW_TINT = new THREE.Color(0xd9f6e8);

const DAY = {
  top: new THREE.Color(0x5fb7ea), mid: new THREE.Color(0xa8dcf5), bottom: new THREE.Color(0xeaf7ef),
  fog: new THREE.Color(0xcfe9f4), hemi: 1.15, sun: 1.55,
  hemiColor: new THREE.Color(0xd8ecff), sunColor: new THREE.Color(0xfff2dc),
};
const NIGHT = {
  top: new THREE.Color(0x101b3f), mid: new THREE.Color(0x2a3268), bottom: new THREE.Color(0x51487e),
  fog: new THREE.Color(0x232a52), hemi: 0.5, sun: 0.55,
  hemiColor: new THREE.Color(0x8fa5d8), sunColor: new THREE.Color(0xaec4ff),
};

function makeMedallion() {
  const group = new THREE.Group();
  group.position.set(3.6, 3.9, -6.5); // upper-right sky in both orientations
  group.scale.setScalar(1.15);

  // Sun: warm disc + rays.
  const sun = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd75e })
  );
  sun.add(disc);
  for (let i = 0; i < 10; i++) {
    const ray = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.55, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcf45 })
    );
    const a = (i / 10) * Math.PI * 2;
    ray.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0);
    ray.rotation.z = a - Math.PI / 2;
    sun.add(ray);
  }
  group.add(sun);

  // Moon: pale sphere with craters.
  const moon = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xf2ecd8 })
  );
  moon.add(ball);
  const craterMat = new THREE.MeshBasicMaterial({ color: 0xd8d0bc });
  for (const [x, y, s] of [[-0.3, 0.25, 0.2], [0.25, -0.1, 0.14], [-0.05, -0.35, 0.11]]) {
    const crater = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), craterMat);
    crater.position.set(x, y, 0.72);
    moon.add(crater);
  }
  moon.visible = false;
  group.add(moon);

  // Generous invisible tap sphere.
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  group.add(hit);

  return { group, sun, moon, hit };
}

function makeStars(rng) {
  const N = 160;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // Random points on the upper sky dome.
    const a = rng() * Math.PI * 2;
    const h = 0.12 + rng() * 0.82;
    const r = 78;
    const c = Math.sqrt(1 - h * h);
    pos[i * 3] = Math.cos(a) * c * r;
    pos[i * 3 + 1] = h * r;
    pos[i * 3 + 2] = Math.sin(a) * c * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff7d8, size: 2.4, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const stars = new THREE.Points(geo, mat);
  stars.visible = false;
  return stars;
}

function makeMoonPool() {
  const group = new THREE.Group();
  group.position.copy(MOON_POOL.pos);
  const R = MOON_POOL.radius;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.15, 12, 36),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.5 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  rim.castShadow = true;
  group.add(rim);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 0.86, 0.32, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.55, side: THREE.DoubleSide })
  );
  wall.position.y = -0.02;
  group.add(wall);
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.88, 28),
    new THREE.MeshStandardMaterial({ color: 0xcdd6e4, roughness: 0.7 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.15;
  group.add(bottom);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.93, 36),
    new THREE.MeshStandardMaterial({
      color: GLOW_TINT.clone(),
      roughness: 0.1,
      transparent: true,
      opacity: 0,
      emissive: GLOW_TINT.clone(),
      emissiveIntensity: 0,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  group.add(water);

  const halo = makeHalo(0xcdf5e4, R * 1.3);
  halo.position.y = 0.3;
  group.add(halo);

  return { group, water, halo };
}

export class NightCycle {
  constructor(scene, world, rng) {
    this.world = world;
    this.night = 0;        // animated 0..1
    this.target = 0;       // 0 = day, 1 = night
    this.medallion = makeMedallion();
    scene.add(this.medallion.group);
    this.stars = makeStars(rng);
    scene.add(this.stars);
    this.moonPool = makeMoonPool();
    scene.add(this.moonPool.group);
    this.moonHintShown = false;

    // Fireflies: soft glowing motes that drift at night.
    this.fireflies = [];
    const fireflyGroup = new THREE.Group();
    for (let i = 0; i < 15; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xdcffa8, transparent: true, opacity: 0 })
      );
      fireflyGroup.add(m);
      this.fireflies.push({
        m,
        phase: rng() * Math.PI * 2,
        cx: (rng() - 0.5) * 11,
        cz: (rng() - 0.5) * 8 - 0.5,
        rx: 0.8 + rng() * 1.8,
        rz: 0.7 + rng() * 1.5,
        h: 0.6 + rng() * 1.6,
        speed: 0.3 + rng() * 0.4,
        blink: rng() * 10,
      });
    }
    scene.add(fireflyGroup);
  }

  get isNight() {
    return this.target === 1;
  }

  toggle() {
    this.target = this.target === 1 ? 0 : 1;
    if (this.target === 1 && !this.moonHintShown) {
      // First nightfall: point at the waking moonlight pool.
      this.moonHintShown = true;
      this.moonHintTimer = 7;
    }
    return this.target === 1;
  }

  // Sponge may drink glow only while the pool is awake.
  poolActive() {
    return this.night > 0.55;
  }

  inMoonPool(pos) {
    const dx = pos.x - MOON_POOL.pos.x, dz = pos.z - MOON_POOL.pos.z;
    return dx * dx + dz * dz < (MOON_POOL.radius - 0.02) ** 2;
  }

  update(dt, t) {
    const w = this.world;
    this.night += clamp(this.target - this.night, -dt / 2.4, dt / 2.4);
    const n = this.night;
    const k = n * n * (3 - 2 * n);

    // Sky, fog, lights.
    const u = w.sky.material.uniforms;
    u.top.value.lerpColors(DAY.top, NIGHT.top, k);
    u.mid.value.lerpColors(DAY.mid, NIGHT.mid, k);
    u.bottom.value.lerpColors(DAY.bottom, NIGHT.bottom, k);
    w.sky.material.uniformsNeedUpdate = true;
    if (w.sun.parent && w.sun.parent.fog) { /* noop */ }
    const scene = this.stars.parent;
    if (scene && scene.fog) scene.fog.color.lerpColors(DAY.fog, NIGHT.fog, k);
    w.hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, k);
    w.hemi.color.lerpColors(DAY.hemiColor, NIGHT.hemiColor, k);
    w.sun.intensity = lerp(DAY.sun, NIGHT.sun, k);
    w.sun.color.lerpColors(DAY.sunColor, NIGHT.sunColor, k);

    // Medallion: crossfade sun <-> moon, gentle bob.
    this.medallion.sun.visible = k < 0.5;
    this.medallion.moon.visible = k >= 0.5;
    this.medallion.group.position.y = 3.9 + Math.sin(t * 0.7) * 0.12;
    this.medallion.sun.rotation.z = t * 0.1;

    // Stars + fireflies fade with night.
    this.stars.visible = k > 0.02;
    this.stars.material.opacity = k * 0.9;
    for (const f of this.fireflies) {
      f.phase += dt * f.speed;
      f.blink += dt * (3 + f.speed);
      const vis = k * (0.55 + 0.45 * Math.sin(f.blink));
      f.m.material.opacity = Math.max(0, vis);
      f.m.position.set(
        f.cx + Math.cos(f.phase * 1.7) * f.rx,
        f.h + Math.sin(f.phase * 2.3) * 0.3,
        f.cz + Math.sin(f.phase * 1.1) * f.rz
      );
      f.m.visible = k > 0.02;
    }

    // Moonlight pool wakes at night.
    const water = this.moonPool.water;
    water.material.opacity = k * 0.9;
    water.material.emissiveIntensity = k * (0.75 + 0.2 * Math.sin(t * 2.1));
    water.rotation.z += dt * 0.06;
    if (this.moonHintTimer > 0) {
      this.moonHintTimer -= dt;
      this.moonPool.halo.userData.active = this.moonHintTimer > 0 && this.poolActive();
    } else {
      this.moonPool.halo.userData.active = false;
    }
    this.moonPool.halo.visible = true;
    // updateHalo is driven by world for its own pools; drive ours here.
    const halo = this.moonPool.halo;
    const target = halo.userData.active ? 1 : 0;
    halo.userData.t = (halo.userData.t || 0) + (target - halo.userData.t) * Math.min(1, dt * 5);
    halo.userData.phase = (halo.userData.phase || 0) + dt * 2.4;
    const pulse = (1 + 0.18 * Math.sin(halo.userData.phase)) * halo.userData.baseScale;
    halo.scale.setScalar(pulse);
    halo.material.opacity = halo.userData.t * (0.45 + 0.3 * Math.sin(halo.userData.phase * 0.5 + 1));
    halo.visible = halo.userData.t > 0.02;
  }
}
