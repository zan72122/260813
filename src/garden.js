import * as THREE from '../lib/three.module.js';
import { clamp } from './util.js';

// Garden growth. Painting things and discovering spirits feeds a garden
// score; crossing thresholds makes the world itself bloom in stages:
//   level 1 — little butterflies come to live in the meadow
//   level 2 — a soft rainbow rises over the far hills
//   level 3 — a white great tree grows at the back of the garden
//   level 4 — the tree blossoms and petals drift over everything
// Each level-up is a visible event (growth animation + camera moment).

const THRESHOLDS = [2, 5, 8, 12];
const SAVE_KEY = 'iro-sui-sponge.garden.v1';

const PASTELS = [0xffa3c0, 0x9fd0ff, 0xffe08a, 0xb8f0a0, 0xd9b3ff];

// ------------------------------------------------------- ambient butterfly

function makeFlutter(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const wingGeo = new THREE.CircleGeometry(0.14, 8);
  wingGeo.scale(1.5, 0.9, 1);
  wingGeo.translate(0.16, 0, 0);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const geo = side < 0 ? wingGeo.clone().scale(-1, 1, 1) : wingGeo;
    const wing = new THREE.Mesh(geo, mat);
    wing.rotation.x = -Math.PI / 2;
    pivot.add(wing);
    pivot.userData.dir = side;
    g.add(pivot);
  }
  return g;
}

// ----------------------------------------------------------------- rainbow

function makeRainbow() {
  const group = new THREE.Group();
  const colors = [0xff6b7c, 0xffa14e, 0xffe066, 0x8fd971, 0x6fb6ff, 0xb78de0];
  colors.forEach((c, i) => {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(10.5 - i * 0.42, 0.26, 8, 48, Math.PI),
      new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0, depthWrite: false,
      })
    );
    group.add(arc);
  });
  group.position.set(1.5, -1.2, -20);
  group.renderOrder = 1;
  return group;
}

// ---------------------------------------------------------------- big tree

function makeTree() {
  const group = new THREE.Group();
  group.position.set(-3.2, 0, -6.6);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.8 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.9, 10), trunkMat);
  trunk.position.y = 1.45;
  trunk.castShadow = true;
  group.add(trunk);
  for (const [x, y, z, rz] of [[-0.7, 2.5, 0, 0.8], [0.75, 2.7, 0.1, -0.7]]) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 8), trunkMat);
    branch.position.set(x, y, z);
    branch.rotation.z = rz;
    group.add(branch);
  }

  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.7, emissive: 0x333333,
  });
  const crown = new THREE.Group();
  const puffs = [
    [0, 3.6, 0, 1.35], [-1.15, 3.1, 0.2, 0.95], [1.2, 3.3, 0.1, 1.0],
    [-0.4, 4.15, -0.2, 0.85], [0.65, 4.0, -0.3, 0.8],
  ];
  for (const [x, y, z, s] of puffs) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), crownMat);
    puff.scale.set(s * 1.25, s, s * 1.1);
    puff.position.set(x, y, z);
    puff.castShadow = true;
    crown.add(puff);
  }
  group.add(crown);

  // Blossom clusters revealed at level 4.
  const blossoms = new THREE.Group();
  const bloomGeo = new THREE.SphereGeometry(0.16, 8, 6);
  let s = 5;
  const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const puff = puffs[i % puffs.length];
    const a = rnd() * Math.PI * 2;
    const b = rnd() * Math.PI - Math.PI / 2;
    const color = PASTELS[i % PASTELS.length];
    const m = new THREE.Mesh(
      bloomGeo,
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.18 })
    );
    m.position.set(
      puff[0] + Math.cos(a) * Math.cos(b) * puff[3] * 1.2,
      puff[1] + Math.sin(b) * puff[3] * 0.95,
      puff[2] + Math.sin(a) * Math.cos(b) * puff[3] * 1.05
    );
    m.scale.setScalar(0.01);
    blossoms.add(m);
  }
  group.add(blossoms);

  group.scale.setScalar(0.001);
  group.visible = false;
  return { group, crown, crownMat, blossoms };
}

// ----------------------------------------------------------------- manager

export class Garden {
  constructor(scene, rng, { persist = true } = {}) {
    this.scene = scene;
    this.rng = rng;
    this.persist = persist;
    this.level = 0;
    this.paintCount = 0;
    this._pending = [];
    this._growT = -1;
    this._blossomT = -1;
    this._rainbowT = 0;

    this.butterflies = [];
    this.butterflyGroup = new THREE.Group();
    scene.add(this.butterflyGroup);
    this.rainbow = makeRainbow();
    scene.add(this.rainbow);
    this.tree = makeTree();
    scene.add(this.tree.group);
    this.petals = null;

    if (persist) {
      try {
        const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
        if (Number.isFinite(data.paintCount)) this.paintCount = data.paintCount;
      } catch (_) { /* fresh */ }
    }
  }

  _save() {
    if (!this.persist) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ paintCount: this.paintCount }));
    } catch (_) { /* ignore */ }
  }

  notePaint() {
    this.paintCount += 1;
    this._save();
  }

  // Called every frame with the current score; instant=true applies the
  // level with no fanfare (initial load). Returns a level-up event or null.
  setScore(score, instant = false) {
    let level = 0;
    for (const th of THRESHOLDS) if (score >= th) level++;
    if (level <= this.level) return null;
    this.level = level;
    return this._applyLevel(instant);
  }

  _applyLevel(instant) {
    let event = null;
    if (this.level >= 1 && this.butterflies.length === 0) {
      this._spawnButterflies(3);
      if (!instant) event = { type: 'butterflies', focus: new THREE.Vector3(0, 1.9, 0.5) };
    }
    if (this.level >= 2) {
      this._rainbowOn = true;
      if (this.butterflies.length < 5) this._spawnButterflies(2);
      if (!instant && this.level === 2) event = { type: 'rainbow', focus: new THREE.Vector3(0, 2.4, -6) };
    }
    if (this.level >= 3) {
      this.tree.group.visible = true;
      if (instant) this.tree.group.scale.setScalar(1);
      else if (this.tree.group.scale.x < 0.9) {
        this._growT = 0;
        if (this.level === 3) {
          event = {
            type: 'tree',
            focus: this.tree.group.position.clone().add(new THREE.Vector3(0, 3.2, 0)),
          };
        }
      }
    }
    if (this.level >= 4) {
      if (instant) {
        for (const m of this.tree.blossoms.children) m.scale.setScalar(1);
        this.tree.crownMat.color.set(0xffd9e8);
        this._spawnPetals();
      } else {
        this._blossomT = 0;
        event = {
          type: 'blossom',
          focus: this.tree.group.position.clone().add(new THREE.Vector3(0, 3.4, 0)),
        };
      }
      if (this.butterflies.length < 7) this._spawnButterflies(2);
    }
    return event;
  }

  _spawnButterflies(n) {
    for (let i = 0; i < n; i++) {
      const color = PASTELS[this.butterflies.length % PASTELS.length];
      const b = makeFlutter(color);
      this.butterflyGroup.add(b);
      this.butterflies.push({
        group: b,
        phase: this.rng() * Math.PI * 2,
        speed: 0.14 + this.rng() * 0.1,
        cx: (this.rng() - 0.5) * 8,
        cz: (this.rng() - 0.5) * 6 - 1,
        rx: 2 + this.rng() * 2.5,
        rz: 1.5 + this.rng() * 2,
        h: 1.5 + this.rng() * 1.3,
        flap: this.rng() * 6,
        prev: new THREE.Vector3(),
      });
    }
  }

  _spawnPetals() {
    if (this.petals) return;
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.09, 0.13);
    this.petalList = [];
    for (let i = 0; i < 34; i++) {
      const color = PASTELS[i % PASTELS.length];
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      const p = {
        m,
        x: (this.rng() - 0.5) * 14,
        y: this.rng() * 5 + 1,
        z: (this.rng() - 0.5) * 11 - 1,
        vy: 0.25 + this.rng() * 0.3,
        sway: this.rng() * Math.PI * 2,
        spin: (this.rng() - 0.5) * 3,
      };
      group.add(m);
      this.petalList.push(p);
    }
    this.petals = group;
    this.scene.add(group);
  }

  update(dt, t) {
    // Butterflies wander on soft lissajous paths.
    for (const b of this.butterflies) {
      b.phase += dt * b.speed;
      b.flap += dt * 14;
      const x = b.cx + Math.cos(b.phase * 2.1) * b.rx;
      const z = b.cz + Math.sin(b.phase * 1.3) * b.rz;
      const y = b.h + Math.sin(b.phase * 3.7) * 0.5;
      b.prev.copy(b.group.position);
      b.group.position.set(x, y, z);
      const dx = x - b.prev.x, dz = z - b.prev.z;
      if (dx * dx + dz * dz > 1e-8) b.group.rotation.y = Math.atan2(dx, dz);
      const a = Math.sin(b.flap) * 0.8;
      for (const w of b.group.children) w.rotation.z = a * w.userData.dir;
    }

    // Rainbow fade-in + gentle shimmer.
    if (this._rainbowOn && this._rainbowT < 1) this._rainbowT = Math.min(1, this._rainbowT + dt * 0.25);
    if (this._rainbowT > 0) {
      this.rainbow.children.forEach((arc, i) => {
        arc.material.opacity = this._rainbowT * (0.5 + Math.sin(t * 0.8 + i) * 0.06);
      });
    }

    // Tree growth: elastic scale-up.
    if (this._growT >= 0) {
      this._growT += dt / 3.2;
      const k = clamp(this._growT, 0, 1);
      const e = 1 + 2.7 * Math.pow(1 - k, 2.2) * Math.sin(k * Math.PI * 2.4) * (1 - k);
      this.tree.group.scale.setScalar(Math.max(0.001, k * e));
      if (k >= 1) { this.tree.group.scale.setScalar(1); this._growT = -1; }
    }

    // Blossoming: crown blushes pink, blossoms pop one after another.
    if (this._blossomT >= 0) {
      this._blossomT += dt / 2.6;
      const k = clamp(this._blossomT, 0, 1);
      this.tree.crownMat.color.lerpColors(
        new THREE.Color(0xffffff), new THREE.Color(0xffd9e8), k
      );
      this.tree.blossoms.children.forEach((m, i) => {
        const kk = clamp(k * 1.4 - (i / this.tree.blossoms.children.length) * 0.4, 0, 1);
        m.scale.setScalar(Math.max(0.01, kk * (1 + Math.sin(kk * Math.PI) * 0.6)));
      });
      if (k >= 0.65) this._spawnPetals();
      if (k >= 1) this._blossomT = -1;
    }

    // Petal blizzard.
    if (this.petalList) {
      for (const p of this.petalList) {
        p.y -= p.vy * dt;
        p.sway += dt * 1.7;
        const x = p.x + Math.sin(p.sway) * 0.6;
        if (p.y < 0.05) { p.y = 5.5 + this.rng(); p.x = (this.rng() - 0.5) * 14; }
        p.m.position.set(x, p.y, p.z);
        p.m.rotation.set(p.sway * p.spin * 0.4, p.sway * 0.7, p.sway * p.spin);
      }
    }

    // Gentle tree sway once grown.
    if (this.tree.group.visible && this._growT < 0) {
      this.tree.group.rotation.z = Math.sin(t * 0.7) * 0.012;
    }
  }
}
