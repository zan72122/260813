import * as THREE from '../lib/three.module.js';
import { clamp, lerp } from './util.js';

// いろのせいれい — colour spirits. The first time the sponge squeezes out
// a colour the garden has never seen, a little slime spirit of that colour
// is born on the spot. Spirits live in the garden (hopping, napping,
// chasing the sponge) and a white mushroom house in the corner grows a
// coloured polka-dot on its cap for every species discovered — a wordless
// collection book. "What colour makes the next friend?" is the engine.

export const HOUSE_POS = new THREE.Vector3(-6.1, 0, -3.1);

// Ten species, classified from the dye RATIOS of the squeezed liquid.
// Order defines the dot slots on the mushroom cap.
export const SPECIES = [
  'red', 'orange', 'mango', 'yellow', 'lime',
  'green', 'blue', 'purple', 'magenta', 'cocoa',
];

// amounts: {r,b,y} (any positive scale — only ratios matter).
export function classifySpecies(amounts) {
  const total = amounts.r + amounts.b + amounts.y;
  if (total < 1e-4) return null;
  const pr = amounts.r / total, pb = amounts.b / total, py = amounts.y / total;
  const TH = 0.2;
  const hasR = pr > TH, hasB = pb > TH, hasY = py > TH;
  const n = (hasR ? 1 : 0) + (hasB ? 1 : 0) + (hasY ? 1 : 0);
  if (n === 3) return 'cocoa';
  if (n === 2) {
    if (hasR && hasB) return pr >= pb ? 'magenta' : 'purple';
    if (hasR && hasY) return pr >= py ? 'orange' : 'mango';
    return py >= pb ? 'lime' : 'green';
  }
  if (hasR) return 'red';
  if (hasB) return 'blue';
  return 'yellow';
}

// ------------------------------------------------------------------ spirit

const bodyGeo = new THREE.IcosahedronGeometry(0.3, 2);
const eyeGeo = new THREE.SphereGeometry(0.055, 10, 8);
const pupilGeo = new THREE.SphereGeometry(0.028, 8, 6);
const blushGeo = new THREE.CircleGeometry(0.035, 10);

class Spirit {
  constructor(species, color, pos, rng) {
    this.species = species;
    this.color = color.clone();
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.position.set(pos.x, 0, pos.z);

    this.body = new THREE.Group();
    this.body.position.y = 0.27;
    this.group.add(this.body);

    const mat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.35,
      emissive: this.color.clone().multiplyScalar(0.16),
    });
    const blob = new THREE.Mesh(bodyGeo, mat);
    blob.scale.set(1, 0.88, 1);
    blob.castShadow = true;
    this.body.add(blob);

    // Simple dot-eyed face on +z.
    const eyeMatW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x2c2530, roughness: 0.4 });
    this.pupils = [];
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(eyeGeo, eyeMatW);
      white.position.set(side * 0.11, 0.05, 0.245);
      this.body.add(white);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(side * 0.105, 0.05, 0.292);
      this.body.add(pupil);
      this.pupils.push(pupil);
      const blush = new THREE.Mesh(
        blushGeo,
        new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.55 })
      );
      blush.position.set(side * 0.185, -0.03, 0.235);
      blush.lookAt(blush.position.clone().multiplyScalar(3));
      this.body.add(blush);
    }

    this.state = 'birth';
    this.t = 0;
    this.idleFor = 1.2 + rng() * 1.5;
    this.hop = null;
    this.blinkT = 1 + rng() * 3;
    this.phase = rng() * Math.PI * 2;
    this.group.scale.setScalar(0.01);
  }

  startHop(to, dur = 0.5, height = 0.42) {
    this.hop = {
      from: this.group.position.clone(),
      to: to.clone(),
      dur, height, t: 0,
    };
    const dx = to.x - this.group.position.x;
    const dz = to.z - this.group.position.z;
    if (dx * dx + dz * dz > 1e-6) this.targetRotY = Math.atan2(dx, dz);
    this.state = 'hop';
  }

  update(dt, spongePos, pickWanderPoint) {
    const rng = this.rng;
    this.t += dt;

    // Blink
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 1.6 + rng() * 3.2;
    const blink = this.state === 'nap' ? 0.12 : this.blinkT < 0.12 ? 0.15 : 1;
    for (const p of this.pupils) p.scale.y = lerp(p.scale.y, blink, Math.min(1, dt * 22));

    // Face travel direction smoothly
    if (this.targetRotY !== undefined) {
      let d = this.targetRotY - this.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.group.rotation.y += d * Math.min(1, dt * 8);
    }

    const distSponge = Math.hypot(
      spongePos.x - this.group.position.x,
      spongePos.z - this.group.position.z
    );

    switch (this.state) {
      case 'birth': {
        // Pop out of the squeezed puddle: overshoot bounce, then settle.
        const k = clamp(this.t / 0.9, 0, 1);
        const back = 1 + 2.2 * Math.pow(1 - k, 2) * Math.sin(k * Math.PI * 2.2);
        this.group.scale.setScalar(Math.max(0.01, k * back));
        this.body.position.y = 0.27 + Math.sin(clamp((this.t - 0.9) / 0.7, 0, 1) * Math.PI) * 0.5;
        if (this.t > 1.8) {
          this.group.scale.setScalar(1);
          this.state = 'idle';
          this.t = 0;
          this.idleFor = 0.8;
        }
        break;
      }
      case 'idle': {
        // Soft breathing squash.
        const b = 1 + Math.sin(this.t * 3.2 + this.phase) * 0.045;
        this.body.scale.set(1 / Math.sqrt(b), b, 1 / Math.sqrt(b));
        this.body.position.y = 0.27;
        if (this.t > this.idleFor) {
          this.t = 0;
          const roll = rng();
          if (roll < 0.12) {
            this.state = 'nap';
            this.idleFor = 3.5 + rng() * 3;
          } else if (roll < 0.42 && distSponge < 3.6 && distSponge > 1.1) {
            // Curious: hop a bit toward the sponge.
            const to = this.group.position.clone().lerp(
              new THREE.Vector3(spongePos.x, 0, spongePos.z),
              0.4
            );
            this.startHop(to);
          } else {
            this.startHop(pickWanderPoint(this.group.position));
          }
        }
        // Excited wiggle when the sponge is right here.
        if (distSponge < 1.1) {
          this.body.position.y = 0.27 + Math.abs(Math.sin(this.t * 9)) * 0.14;
          this.targetRotY = Math.atan2(
            spongePos.x - this.group.position.x,
            spongePos.z - this.group.position.z
          );
        }
        break;
      }
      case 'hop': {
        const h = this.hop;
        h.t += dt;
        const k = clamp(h.t / h.dur, 0, 1);
        this.group.position.lerpVectors(h.from, h.to, k);
        this.body.position.y = 0.27 + Math.sin(k * Math.PI) * h.height;
        // Stretch in the air, squash on landing.
        const s = 1 + Math.sin(k * Math.PI) * 0.18 - (k > 0.92 ? 0.22 : 0);
        this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
        if (k >= 1) {
          this.state = 'idle';
          this.t = 0;
          this.idleFor = 0.5 + rng() * 2.2;
        }
        break;
      }
      case 'nap': {
        const b = 1 + Math.sin(this.t * 1.6) * 0.03;
        this.body.scale.set(1 / Math.sqrt(b), b * 0.9, 1 / Math.sqrt(b));
        this.body.position.y = 0.24;
        if (this.t > this.idleFor || distSponge < 1.2) {
          this.state = 'idle';
          this.t = 0;
          this.idleFor = 1 + rng() * 2;
        }
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ house

function buildHouse() {
  const group = new THREE.Group();
  group.position.copy(HOUSE_POS);
  group.rotation.y = 0.5; // door faces the meadow centre

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.62, 0.85, 20),
    new THREE.MeshStandardMaterial({ color: 0xfaf6ec, roughness: 0.7 })
  );
  stem.position.y = 0.42;
  stem.castShadow = true;
  stem.receiveShadow = true;
  group.add(stem);

  const capGeo = new THREE.SphereGeometry(1.05, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.55 })
  );
  cap.scale.set(1, 0.78, 1);
  cap.position.y = 0.78;
  cap.castShadow = true;
  group.add(cap);

  const door = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 16),
    new THREE.MeshStandardMaterial({ color: 0x8a6743, roughness: 0.9 })
  );
  door.position.set(0, 0.34, 0.585);
  door.scale.y = 1.35;
  group.add(door);

  // Ten polka-dot slots on the cap — faint until a species is discovered.
  const dots = new Map();
  const dotGeo = new THREE.CircleGeometry(0.115, 14);
  SPECIES.forEach((species, i) => {
    const row = i < 5 ? 0 : 1;
    const col = i % 5;
    const lat = row === 0 ? 0.62 : 0.95;         // polar angle from top
    const lon = (col - 2) * 0.62 + (row ? 0.31 : 0); // spread across the front
    const r = 1.06;
    const local = new THREE.Vector3(
      r * Math.sin(lat) * Math.sin(lon),
      r * Math.cos(lat) * 0.78,
      r * Math.sin(lat) * Math.cos(lon)
    );
    const dot = new THREE.Mesh(
      dotGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
    );
    dot.position.copy(local).add(new THREE.Vector3(0, 0.78, 0));
    dot.lookAt(dot.position.clone().add(local));
    dot.userData.pop = 0;
    group.add(dot);
    dots.set(species, dot);
  });

  return { group, dots };
}

// ----------------------------------------------------------------- manager

const SAVE_KEY = 'iro-sui-sponge.spirits.v1';

export class SpiritManager {
  constructor(scene, fx, rng, { persist = true } = {}) {
    this.scene = scene;
    this.fx = fx;
    this.rng = rng;
    this.persist = persist;
    this.spirits = [];
    this.discovered = new Map(); // species -> hex colour
    this.onBirth = null;

    this.house = buildHouse();
    scene.add(this.house.group);

    this.obstacles = []; // filled by game: {x, z, r} keep-out circles
    this._wander = new THREE.Vector3();

    if (persist) this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      data.forEach((entry, i) => {
        if (!SPECIES.includes(entry.species) || this.discovered.has(entry.species)) return;
        const color = new THREE.Color(entry.color);
        const a = (i / Math.max(1, data.length)) * Math.PI * 2 + 0.7;
        const pos = new THREE.Vector3(
          HOUSE_POS.x + Math.cos(a) * 1.7,
          0,
          HOUSE_POS.z + Math.sin(a) * 1.7
        );
        pos.x = clamp(pos.x, -6.2, 6.2);
        pos.z = clamp(pos.z, -4.6, 4.2);
        this._addSpirit(entry.species, color, pos, true);
      });
    } catch (_) { /* corrupted save — start fresh */ }
  }

  _save() {
    if (!this.persist) return;
    try {
      const data = [...this.discovered.entries()].map(([species, hex]) => ({
        species, color: hex,
      }));
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) { /* private mode etc. */ }
  }

  _addSpirit(species, color, pos, settled = false) {
    const spirit = new Spirit(species, color, pos, this.rng);
    if (settled) {
      spirit.state = 'idle';
      spirit.group.scale.setScalar(1);
    }
    this.scene.add(spirit.group);
    this.spirits.push(spirit);
    this.discovered.set(species, `#${color.getHexString()}`);
    const dot = this.house.dots.get(species);
    if (dot) {
      dot.material.color.copy(color);
      dot.material.opacity = 1;
      if (!settled) dot.userData.pop = 1;
    }
  }

  // Called for every squeezed drip that lands. Births a new spirit the
  // first time a species is squeezed out.
  noteLiquid(amounts, color, landPos) {
    const total = amounts.r + amounts.b + amounts.y;
    if (total < 0.25) return null;
    const species = classifySpecies(amounts);
    if (!species || this.discovered.has(species)) return null;
    const pos = new THREE.Vector3(
      clamp(landPos.x + (this.rng() - 0.5) * 0.4, -6.2, 6.2),
      0,
      clamp(landPos.z + 0.75, -4.6, 4.2)
    );
    this._addSpirit(species, color, pos);
    this._save();
    this.fx.sparkleBurst(new THREE.Vector3(pos.x, 0.5, pos.z), color, 22);
    if (this.onBirth) this.onBirth(this.spirits[this.spirits.length - 1]);
    return species;
  }

  _pickWanderPoint(from) {
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rng() * Math.PI * 2;
      const d = 0.7 + this.rng() * 1.6;
      const x = clamp(from.x + Math.cos(a) * d, -6.2, 6.3);
      const z = clamp(from.z + Math.sin(a) * d, -4.6, 4.2);
      let ok = true;
      for (const o of this.obstacles) {
        const dx = x - o.x, dz = z - o.z;
        if (dx * dx + dz * dz < o.r * o.r) { ok = false; break; }
      }
      if (ok) return this._wander.set(x, 0, z);
    }
    return this._wander.copy(from);
  }

  update(dt, spongePos) {
    const pick = (from) => this._pickWanderPoint(from);
    for (const s of this.spirits) s.update(dt, spongePos, pick);
    for (const dot of this.house.dots.values()) {
      if (dot.userData.pop > 0) {
        dot.userData.pop = Math.max(0, dot.userData.pop - dt * 1.4);
        dot.scale.setScalar(1 + Math.sin(dot.userData.pop * Math.PI) * 0.9);
      }
    }
  }
}
