import * as THREE from '../lib/three.module.js';
import { makeHalo, updateHalo } from './world.js';
import { clamp, lerp } from './util.js';

// White things that drink colour. Every target shares the same mechanism:
// each paintable mesh carries a per-vertex "t" coordinate (0 at the spot
// where colour enters, 1 at the far tip). When liquid lands on a target a
// colour *front* sweeps from t=0 to t=1, so petals flush from the root
// outward, jelly fills from the bottom up, wings from the body out.
// Targets can be repainted endlessly with new mixtures — that is the game.

export class Paintable {
  constructor(mesh, tFn) {
    this.mesh = mesh;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const n = pos.count;
    this.t = new Float32Array(n);
    const v = new THREE.Vector3();
    let maxT = 0.0001;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      this.t[i] = Math.max(0, tFn(v));
      maxT = Math.max(maxT, this.t[i]);
    }
    for (let i = 0; i < n; i++) this.t[i] /= maxT;
    this.cur = new Float32Array(n * 3);
    this.start = new Float32Array(n * 3);
    this.cur.fill(1);
    const colors = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    colors.array.set(this.cur);
    geo.setAttribute('color', colors);
    mesh.material.vertexColors = true;
  }

  beginSweep() {
    this.start.set(this.cur);
  }

  applyFront(front, soft, color) {
    const attr = this.mesh.geometry.attributes.color;
    const arr = attr.array;
    for (let i = 0; i < this.t.length; i++) {
      let k = clamp((front - this.t[i]) / soft, 0, 1);
      k = k * k * (3 - 2 * k);
      const o = i * 3;
      this.cur[o] = lerp(this.start[o], color.r, k);
      this.cur[o + 1] = lerp(this.start[o + 1], color.g, k);
      this.cur[o + 2] = lerp(this.start[o + 2], color.b, k);
      arr[o] = this.cur[o];
      arr[o + 1] = this.cur[o + 1];
      arr[o + 2] = this.cur[o + 2];
    }
    attr.needsUpdate = true;
  }
}

export class Target {
  constructor(id, group, focus = new THREE.Vector3(0, 1, 0)) {
    this.id = id;
    this.group = group;
    this.focusLocal = focus; // where the camera / drips aim, in local space
    this.paintables = [];
    this.colored = false;
    this.color = new THREE.Color(1, 1, 1);
    this.sweep = null;
    this.onComplete = null;
    this.halo = makeHalo(0xffffff);
    this.halo.position.y = 0.35;
    group.add(this.halo);
    this.reward = 0; // 0..1 celebration envelope
  }

  get worldPos() {
    return this.group.position;
  }

  focusPoint(out) {
    return out.copy(this.focusLocal).add(this.group.position);
  }

  get painting() {
    return !!this.sweep;
  }

  paint(color) {
    if (this.sweep) return false;
    for (const p of this.paintables) p.beginSweep();
    this.sweep = { front: 0, soft: 0.3, color: color.clone() };
    return true;
  }

  update(dt, t) {
    updateHalo(this.halo, dt);
    if (this.sweep) {
      this.sweep.front += dt * 0.55;
      const f = this.sweep.front;
      for (const p of this.paintables) p.applyFront(f, this.sweep.soft, this.sweep.color);
      this.onSweep(clamp(f / (1 + this.sweep.soft), 0, 1), dt);
      if (f >= 1 + this.sweep.soft) {
        this.color.copy(this.sweep.color);
        this.colored = true;
        this.sweep = null;
        this.reward = 1;
        if (this.onComplete) this.onComplete(this);
      }
    }
    if (this.reward > 0) this.reward = Math.max(0, this.reward - dt / 2.2);
    this.idle(dt, t);
  }

  onSweep(_progress, _dt) {}
  idle(_dt, _t) {}
}

// ---------------------------------------------------------------- flower

const petalGeoProto = (() => {
  const g = new THREE.SphereGeometry(1, 8, 10);
  g.scale(0.26, 0.055, 0.5);
  g.translate(0, 0, 0.52);
  return g;
})();

class Flower extends Target {
  constructor(id, pos, { bud = false, scale = 1 } = {}) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.scale.setScalar(scale);
    super(id, group, new THREE.Vector3(0, 1.55 * scale, 0));
    this.focusLocal.set(0, 1.55, 0); // local, group scale applies
    this.bud = bud;
    this.open = bud ? 0 : 1;
    this.openTarget = this.open;

    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4da24b, roughness: 0.8 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 1.45, 8), stemMat);
    stem.position.y = 0.72;
    stem.castShadow = true;
    group.add(stem);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), stemMat);
      leaf.scale.set(0.3, 0.05, 0.14);
      leaf.position.set(side * 0.26, 0.5 + (side > 0 ? 0.16 : 0), 0);
      leaf.rotation.z = side * -0.5;
      group.add(leaf);
    }

    this.head = new THREE.Group();
    this.head.position.y = 1.45;
    this.head.rotation.x = 0.22; // face slightly toward the camera
    group.add(this.head);

    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      side: THREE.DoubleSide,
      emissive: 0x383838, // lift shaded petal backs so buds stay bright
    });
    this.pivots = [];
    const PETALS = 9;
    for (let i = 0; i < PETALS; i++) {
      // Nested groups: outer spins the petal around the head (Y), inner
      // tilts it up/down (X) — kept separate so the bud really closes.
      const around = new THREE.Group();
      around.rotation.y = (i / PETALS) * Math.PI * 2;
      const tilt = new THREE.Group();
      around.add(tilt);
      const geo = petalGeoProto.clone();
      const petal = new THREE.Mesh(geo, petalMat.clone());
      petal.castShadow = true;
      tilt.add(petal);
      this.head.add(around);
      this.pivots.push(tilt);
      this.paintables.push(new Paintable(petal, (v) => v.z));
    }
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff3c8, roughness: 0.7 })
    );
    center.scale.y = 0.7;
    this.head.add(center);

    this.swayPhase = pos.x * 1.7;
    this._applyOpen();
  }

  _applyOpen() {
    const angle = lerp(-1.32, -0.18, this.open);
    for (let i = 0; i < this.pivots.length; i++) {
      this.pivots[i].rotation.x = angle + (i % 2 ? 0.06 : -0.04) * this.open;
    }
    const s = lerp(0.55, 1, this.open);
    this.head.scale.setScalar(s);
  }

  onSweep(progress) {
    // Buds bloom as the colour reaches the petal tips.
    if (this.bud) this.openTarget = Math.max(this.openTarget, clamp((progress - 0.35) / 0.5, 0, 1));
  }

  idle(dt, t) {
    if (this.open !== this.openTarget) {
      this.open += clamp(this.openTarget - this.open, -dt * 0.55, dt * 0.55);
      this._applyOpen();
    }
    const sway = 0.035 + this.reward * 0.1;
    this.group.rotation.z = Math.sin(t * 1.1 + this.swayPhase) * sway;
    const pop = 1 + Math.sin(Math.min(1, 1 - this.reward) * Math.PI) * 0.001; // keep scale stable
    void pop;
  }
}

// ---------------------------------------------------------------- jelly

class Jelly extends Target {
  constructor(id, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 0.7, 0));

    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.5 })
    );
    plate.position.y = 0.06;
    plate.receiveShadow = true;
    plate.castShadow = true;
    group.add(plate);

    const geo = new THREE.IcosahedronGeometry(0.62, 3);
    geo.scale(1, 0.82, 1);
    geo.translate(0, 0.52, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      transparent: true,
      opacity: 0.62,
    });
    this.blob = new THREE.Mesh(geo, mat);
    this.blob.castShadow = true;
    group.add(this.blob);
    // Colour rises from the plate to the top of the jelly.
    this.paintables.push(new Paintable(this.blob, (v) => v.y));
    this.wobble = 0;
  }

  onSweep() {
    this.wobble = Math.max(this.wobble, 0.5);
  }

  idle(dt, t) {
    this.wobble = Math.max(this.wobble - dt * 0.6, this.reward * 0.9);
    const w = 1 + Math.sin(t * 7) * 0.05 * (0.25 + this.wobble);
    this.blob.scale.set(1 / Math.sqrt(w), w, 1 / Math.sqrt(w));
  }
}

// ------------------------------------------------------------- butterfly

function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.35, 0.55, 1.05, 0.72, 1.15, 0.28);
  s.bezierCurveTo(1.2, 0.02, 0.75, -0.05, 0.45, -0.08);
  s.bezierCurveTo(0.85, -0.28, 0.9, -0.62, 0.55, -0.66);
  s.bezierCurveTo(0.25, -0.68, 0.05, -0.4, 0, -0.12);
  s.closePath();
  return s;
}

class Butterfly extends Target {
  constructor(id, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 1.35, 0));

    // A little branch perch.
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.085, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a6743, roughness: 0.9 })
    );
    branch.position.y = 0.6;
    branch.rotation.z = 0.12;
    branch.castShadow = true;
    group.add(branch);

    this.body = new THREE.Group();
    this.body.position.y = 1.3;
    group.add(this.body);

    const bodyMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.06, 0.42, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b5a4c, roughness: 0.7 })
    );
    bodyMesh.rotation.x = Math.PI / 2;
    this.body.add(bodyMesh);

    const wingGeoR = new THREE.ShapeGeometry(wingShape(), 10);
    wingGeoR.rotateX(-Math.PI / 2); // lie flat: extends +x, forward/back in z
    const wingGeoL = wingGeoR.clone();
    wingGeoL.scale(-1, 1, 1);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      side: THREE.DoubleSide,
      emissive: 0x303030,
    });
    this.wingPivots = [];
    for (const [geo, dir] of [[wingGeoR, 1], [wingGeoL, -1]]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(geo, wingMat.clone());
      wing.castShadow = true;
      pivot.add(wing);
      pivot.userData.dir = dir;
      this.body.add(pivot);
      this.wingPivots.push(pivot);
      this.paintables.push(new Paintable(wing, (v) => Math.abs(v.x)));
    }
    this.flap = 0;
    this.flying = false;
    this.flyT = 0;
    this.home = pos.clone();
  }

  onSweep() {}

  idle(dt, t) {
    const speed = this.flying ? 11 : 2.2;
    this.flap += dt * speed;
    // Resting: wings held up, slow breathing flutter. Flying: full beats.
    const a = this.flying
      ? Math.sin(this.flap) * 0.85
      : 0.65 + Math.sin(this.flap) * 0.3;
    for (const pivot of this.wingPivots) pivot.rotation.z = a * pivot.userData.dir;
    if (this.colored && !this.flying && this.reward > 0.4) this.flying = true;
    if (this.flying) {
      this.flyT += dt * 0.55;
      const r = 1.6 + Math.sin(this.flyT * 0.7) * 0.6;
      this.body.position.set(
        Math.cos(this.flyT) * r,
        1.3 + 0.9 + Math.sin(this.flyT * 1.7) * 0.45,
        Math.sin(this.flyT) * r * 0.7
      );
      this.body.rotation.y = -this.flyT + Math.PI / 2;
    }
  }
}

// ----------------------------------------------------------------- star

function starGeometry() {
  const shape = new THREE.Shape();
  const R = 0.62, r = 0.27;
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.08);
  return geo;
}

class Star extends Target {
  constructor(id, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 1.35, 0));

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.07, 1.05, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.7 })
    );
    pole.position.y = 0.52;
    pole.castShadow = true;
    group.add(pole);

    this.holder = new THREE.Group();
    this.holder.position.y = 1.35;
    group.add(this.holder);

    this.star = new THREE.Mesh(
      starGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 })
    );
    this.star.castShadow = true;
    this.holder.add(this.star);
    // Colour spreads from the star's centre out to the points.
    this.paintables.push(new Paintable(this.star, (v) => Math.hypot(v.x, v.y)));
    this.spin = 0;
  }

  update(dt, t) {
    super.update(dt, t);
    if (this.colored) {
      this.spin += dt * (0.8 + this.reward * 5);
      const glow = 0.18 + this.reward * 0.5;
      this.star.material.emissive.copy(this.color).multiplyScalar(glow);
    }
    this.holder.rotation.y = Math.sin(this.spin) * 0.001 + this.spin;
  }
}

// ---------------------------------------------------------------- build

export function buildTargets(scene) {
  const targets = [
    new Flower('flower-main', new THREE.Vector3(0, 0, -2.5), { bud: false, scale: 1.25 }),
    new Flower('flower-left', new THREE.Vector3(-2.8, 0, -1.6), { bud: true }),
    new Flower('flower-right', new THREE.Vector3(2.8, 0, -1.6), { bud: true }),
    new Jelly('jelly', new THREE.Vector3(-5.0, 0, 0.1)),
    new Butterfly('butterfly', new THREE.Vector3(-1.6, 0, -4.3)),
    new Star('star', new THREE.Vector3(4.9, 0, -2.7)),
  ];
  for (const t of targets) scene.add(t.group);
  return targets;
}
