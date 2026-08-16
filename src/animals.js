import * as THREE from '../lib/three.module.js';
import { Paintable, Target } from './targets.js';
import { POOLS, WASH } from './world.js';
import { HOUSE_POS } from './spirits.js';
import { clamp } from './util.js';

// White animals — paintable friends. They sit perfectly still and white
// until the sponge squeezes colour over them; the colour rises from their
// feet to their ears, and then they come alive: the rabbit hops around
// the meadow, the bird sings and flies loops, the frog does big jumps.

const KEEP_OUT = [
  ...POOLS.map((p) => ({ x: p.pos.x, z: p.pos.z, r: p.radius + 0.55 })),
  { x: WASH.pos.x, z: WASH.pos.z, r: WASH.radius + 0.55 },
  { x: HOUSE_POS.x, z: HOUSE_POS.z, r: 1.4 },
];

function blocked(x, z) {
  for (const o of KEEP_OUT) {
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz < o.r * o.r) return true;
  }
  return false;
}

// Deterministic per-animal rng
function makeAnimalRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const whiteMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, emissive: 0x2e2e2e });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2530, roughness: 0.5 });

// Helper: add a paintable body part with its transform baked into the
// geometry, so every part shares group-local coordinates and one colour
// front can sweep the whole animal bottom-to-top.
function part(target, parent, geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] } = {}) {
  geo = geo.clone();
  geo.scale(...s);
  geo.rotateX(r[0]); geo.rotateY(r[1]); geo.rotateZ(r[2]);
  geo.translate(...p);
  const mesh = new THREE.Mesh(geo, whiteMat());
  mesh.castShadow = true;
  parent.add(mesh);
  target.paintables.push(new Paintable(mesh, (v) => v.y));
  return mesh;
}

function dot(parent, radius, p, mat = darkMat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), mat);
  m.position.set(...p);
  parent.add(m);
  return m;
}

const sphere = new THREE.SphereGeometry(1, 12, 10);

class Animal extends Target {
  constructor(id, pos, seed) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 0.9, 0));
    this.rng = makeAnimalRng(seed);
    this.home = pos.clone();
    this.body = new THREE.Group(); // moves relative to group when alive
    group.add(this.body);
    this.body.rotation.y = Math.atan2(-pos.x, -pos.z + 4); // face the meadow
    this.alive = false;
    this.actT = 0;
    this.waitFor = 1;
    this.hop = null;
    this._wp = new THREE.Vector3();
  }

  // Animals move: hover detection and drip aiming must follow the BODY,
  // not the empty home position.
  get worldPos() {
    return this._wp.copy(this.group.position).add(this.body.position).setY(0);
  }

  focusPoint(out) {
    return out.copy(this.focusLocal).add(this.body.position).add(this.group.position);
  }

  onSweep(progress) {
    if (progress > 0.9) this.alive = true;
  }

  pickPoint() {
    for (let i = 0; i < 10; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = 0.6 + this.rng() * 1.6;
      const x = clamp(this.home.x + Math.cos(a) * d, -6.2, 6.3);
      const z = clamp(this.home.z + Math.sin(a) * d, -4.6, 4.2);
      if (!blocked(x, z)) return new THREE.Vector3(x - this.group.position.x, 0, z - this.group.position.z);
    }
    return this.body.position.clone();
  }

  // Parabolic hop of the body (in group-local space).
  startHop(to, dur, height) {
    this.hop = { from: this.body.position.clone(), to, dur, height, t: 0 };
    const dx = to.x - this.body.position.x, dz = to.z - this.body.position.z;
    if (dx * dx + dz * dz > 1e-6) this.faceY = Math.atan2(dx, dz);
  }

  updateHop(dt, squashFn) {
    if (!this.hop) return false;
    const h = this.hop;
    h.t += dt;
    const k = clamp(h.t / h.dur, 0, 1);
    this.body.position.lerpVectors(h.from, h.to, k);
    this.body.position.y = Math.sin(k * Math.PI) * h.height;
    if (squashFn) squashFn(k);
    if (k >= 1) {
      this.hop = null;
      this.body.position.y = 0;
      return false;
    }
    return true;
  }

  faceSmooth(dt) {
    if (this.faceY === undefined) return;
    let d = this.faceY - this.body.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.body.rotation.y += d * Math.min(1, dt * 7);
  }
}

// ---------------------------------------------------------------- rabbit

class Rabbit extends Animal {
  constructor(pos) {
    super('rabbit', pos, 77);
    const b = this.body;
    part(this, b, sphere, { s: [0.34, 0.3, 0.4], p: [0, 0.32, 0] });          // body
    part(this, b, sphere, { s: [0.23, 0.22, 0.23], p: [0, 0.72, 0.16] });     // head
    part(this, b, sphere, { s: [0.075, 0.26, 0.05], r: [0, 0, 0.16], p: [-0.11, 1.06, 0.1] }); // ears
    part(this, b, sphere, { s: [0.075, 0.26, 0.05], r: [0, 0, -0.16], p: [0.11, 1.06, 0.1] });
    part(this, b, sphere, { s: [0.1, 0.1, 0.1], p: [0, 0.34, -0.4] });        // tail
    part(this, b, sphere, { s: [0.1, 0.07, 0.16], p: [-0.16, 0.07, 0.22] });  // feet
    part(this, b, sphere, { s: [0.1, 0.07, 0.16], p: [0.16, 0.07, 0.22] });
    dot(b, 0.03, [-0.09, 0.78, 0.36]);
    dot(b, 0.03, [0.09, 0.78, 0.36]);
    dot(b, 0.025, [0, 0.7, 0.39], new THREE.MeshStandardMaterial({ color: 0xff9aa8, roughness: 0.5 }));
    this.focusLocal.set(0, 0.85, 0);
  }

  idle(dt, t) {
    // Breathing while waiting; hopping around once alive.
    if (this.updateHop(dt, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.12;
      this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    })) { this.faceSmooth(dt); return; }
    const br = 1 + Math.sin(t * 2.6) * 0.02;
    this.body.scale.set(1, br, 1);
    this.faceSmooth(dt);
    if (!this.alive) return;
    this.actT += dt;
    if (this.actT > this.waitFor) {
      this.actT = 0;
      this.waitFor = 0.6 + this.rng() * 2.4;
      const jumps = this.reward > 0 ? 0.55 : 0.35; // celebrate right after painting
      this.startHop(this.pickPoint(), 0.55, jumps);
    }
  }
}

// ------------------------------------------------------------------ bird

class Bird extends Animal {
  constructor(pos) {
    super('bird', pos, 131);
    // Perch stump (not paintable).
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.18, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.9 })
    );
    stump.position.y = 0.47;
    stump.castShadow = true;
    this.group.add(stump);

    this.body.position.y = 1.0;
    this.restY = 1.0;
    const b = this.body;
    part(this, b, sphere, { s: [0.19, 0.18, 0.25], p: [0, 0.08, 0] });       // body
    part(this, b, sphere, { s: [0.14, 0.14, 0.14], p: [0, 0.27, 0.14] });    // head
    part(this, b, sphere, { s: [0.05, 0.02, 0.16], r: [-0.5, 0, 0], p: [0, 0.1, -0.26] }); // tail
    dot(b, 0.026, [-0.06, 0.31, 0.25]);
    dot(b, 0.026, [0.06, 0.31, 0.25]);
    const beak = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.09, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2b25c, roughness: 0.6 })
    );
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.26, 0.29);
    b.add(beak);
    // Flapping wings (paintable, own pivots).
    this.wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.14, 0.12, 0);
      const geo = sphere.clone();
      geo.scale(0.22, 0.028, 0.14);
      geo.translate(side * 0.2, 0, 0);
      const wing = new THREE.Mesh(geo, whiteMat());
      wing.castShadow = true;
      pivot.add(wing);
      pivot.userData.dir = side;
      b.add(pivot);
      this.wings.push(pivot);
      this.paintables.push(new Paintable(wing, (v) => Math.abs(v.x)));
    }
    this.focusLocal.set(0, 0.45, 0); // relative to the body (see focusPoint)
    this.flyT = 0;
    this.flying = false;
    this.flap = 0;
  }

  idle(dt, t) {
    if (!this.alive) {
      // Still: tiny head bob only.
      this.body.position.y = this.restY + Math.sin(t * 2.2) * 0.01;
      return;
    }
    this.actT += dt;
    if (!this.flying) {
      // Sing-bob on the perch, occasionally take a flight loop.
      this.flap += dt * 3;
      this.body.position.y = this.restY + Math.abs(Math.sin(t * 6)) * 0.06 * (this.reward > 0 ? 2 : 1);
      for (const w of this.wings) w.rotation.z = (0.5 + Math.sin(this.flap) * 0.25) * w.userData.dir;
      if (this.actT > this.waitFor) {
        this.actT = 0;
        this.waitFor = 6 + this.rng() * 8;
        this.flying = true;
        this.flyT = 0;
      }
    } else {
      this.flyT += dt;
      this.flap += dt * 13;
      const T = 7; // seconds per loop flight
      const k = this.flyT / T;
      const a = k * Math.PI * 2;
      const r = Math.sin(k * Math.PI) * 2.4;
      this.body.position.set(
        Math.sin(a) * r,
        this.restY + Math.sin(k * Math.PI) * 1.6,
        -Math.sin(a * 2) * r * 0.4
      );
      this.faceY = a + Math.PI / 2;
      this.faceSmooth(dt);
      for (const w of this.wings) w.rotation.z = Math.sin(this.flap) * 0.8 * w.userData.dir;
      if (k >= 1) {
        this.flying = false;
        this.body.position.set(0, this.restY, 0);
      }
    }
  }
}

// ------------------------------------------------------------------ frog

class Frog extends Animal {
  constructor(pos) {
    super('frog', pos, 191);
    const b = this.body;
    part(this, b, sphere, { s: [0.32, 0.22, 0.3], p: [0, 0.22, 0] });        // body
    part(this, b, sphere, { s: [0.09, 0.09, 0.09], p: [-0.13, 0.44, 0.13] }); // eye bumps
    part(this, b, sphere, { s: [0.09, 0.09, 0.09], p: [0.13, 0.44, 0.13] });
    part(this, b, sphere, { s: [0.09, 0.05, 0.14], p: [-0.24, 0.05, 0.12] }); // feet
    part(this, b, sphere, { s: [0.09, 0.05, 0.14], p: [0.24, 0.05, 0.12] });
    dot(b, 0.032, [-0.13, 0.47, 0.19]);
    dot(b, 0.032, [0.13, 0.47, 0.19]);
    this.focusLocal.set(0, 0.55, 0);
  }

  idle(dt, t) {
    if (this.updateHop(dt, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.22;
      this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    })) { this.faceSmooth(dt); return; }
    // Throat puff idle.
    const puff = 1 + Math.max(0, Math.sin(t * 4.2)) * 0.05;
    this.body.scale.set(puff, 1, puff);
    this.faceSmooth(dt);
    if (!this.alive) return;
    this.actT += dt;
    if (this.actT > this.waitFor) {
      this.actT = 0;
      this.waitFor = 1.2 + this.rng() * 3;
      this.startHop(this.pickPoint(), 0.42, 0.6 + this.reward * 0.4);
    }
  }
}

export function buildAnimals(scene) {
  const animals = [
    new Rabbit(new THREE.Vector3(2.3, 0, -3.7)),
    new Bird(new THREE.Vector3(6.35, 0, -1.9)),
    new Frog(new THREE.Vector3(5.1, 0, 1.5)),
  ];
  for (const a of animals) scene.add(a.group);
  return animals;
}
