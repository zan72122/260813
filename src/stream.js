import * as THREE from '../lib/three.module.js';
import { Paintable, Target } from './targets.js';
import { clamp, lerp } from './util.js';

// The colour stream. A little white spring bowl sits at the meadow's back
// edge; behind it a dry-stone brook winds away to a small pond. Squeeze a
// colour into the spring and a bright pulse of it travels DOWN the brook,
// dyeing the water as it goes, flushing the white water-lilies on the way
// and finally filling the pond — colour you poured HERE arrives THERE.

const CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.4, 0.05, -4.7),
  new THREE.Vector3(1.7, 0.04, -5.35),
  new THREE.Vector3(3.1, 0.03, -5.7),
  new THREE.Vector3(4.6, 0.02, -5.95),
  new THREE.Vector3(5.8, 0.02, -6.2),
]);

export const SPRING_POS = CURVE.getPoint(0);

// ----------------------------------------------------------------- spring

class Spring extends Target {
  constructor() {
    const group = new THREE.Group();
    group.position.set(SPRING_POS.x, 0, SPRING_POS.z);
    super('spring', group, new THREE.Vector3(0, 0.6, 0));

    const bowlGeo = new THREE.CylinderGeometry(0.62, 0.5, 0.42, 18);
    const bowl = new THREE.Mesh(
      bowlGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x2c2c2c })
    );
    bowl.position.y = 0.21;
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    group.add(bowl);
    this.paintables.push(new Paintable(bowl, (v) => v.y + 0.21));

    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshStandardMaterial({
        color: 0xe4f2f5, roughness: 0.15, transparent: true, opacity: 0.85,
        emissive: 0x000000,
      })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.44;
    group.add(this.water);
  }

  idle(dt, t) {
    const pop = this.reward > 0 ? 1 + Math.sin(this.reward * Math.PI) * 0.08 : 1;
    this.group.scale.setScalar(pop);
    this.water.rotation.z += dt * 0.2;
  }
}

// ------------------------------------------------------------------- lily

class Lily extends Target {
  constructor(id, pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 0.35, 0));

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.3, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0x5aa860, roughness: 0.8 })
    );
    pad.position.y = 0.03;
    group.add(pad);

    const petalGeo = new THREE.SphereGeometry(1, 8, 8);
    petalGeo.scale(0.09, 0.05, 0.24);
    petalGeo.translate(0, 0, 0.2);
    const mat = () =>
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0x333333, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const around = new THREE.Group();
      around.rotation.y = (i / 7) * Math.PI * 2;
      const tilt = new THREE.Group();
      tilt.rotation.x = -0.7;
      around.add(tilt);
      const petal = new THREE.Mesh(petalGeo.clone(), mat());
      petal.castShadow = true;
      tilt.add(petal);
      around.position.y = 0.08;
      group.add(around);
      this.paintables.push(new Paintable(petal, (v) => v.z));
    }
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff3c8, roughness: 0.7 })
    );
    heart.position.y = 0.14;
    group.add(heart);
  }

  idle(dt, t) {
    const pop = this.reward > 0 ? 1 + Math.sin(this.reward * Math.PI) * 0.16 : 1;
    this.group.scale.setScalar(pop * (1 + Math.sin(t * 1.9 + this.group.position.x) * 0.015));
  }
}

// ----------------------------------------------------------------- stream

export class Stream {
  constructor(scene) {
    this.spring = new Spring();
    scene.add(this.spring.group);

    // Lilies moored beside the brook; the pulse flushes them as it passes.
    this.lilies = [
      { target: new Lily('lily-a', this._sidePoint(0.4, 0.55)), at: 0.4 },
      { target: new Lily('lily-b', this._sidePoint(0.72, -0.55)), at: 0.72 },
    ];
    for (const l of this.lilies) scene.add(l.target.group);

    // Stony brook bed: wide and low, sunk into the meadow.
    const bedGeo = new THREE.TubeGeometry(CURVE, 40, 0.44, 7, false);
    bedGeo.scale(1, 0.22, 1);
    const bed = new THREE.Mesh(
      bedGeo,
      new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.9 })
    );
    bed.receiveShadow = true;
    scene.add(bed);

    // Water ribbon with a colour coordinate along its length.
    const waterGeo = new THREE.TubeGeometry(CURVE, 40, 0.32, 7, false);
    waterGeo.scale(1, 0.18, 1);
    waterGeo.translate(0, 0.045, 0);
    const count = waterGeo.attributes.position.count;
    const colors = new Float32Array(count * 3).fill(1);
    waterGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Tube vertices are ordered segment by segment: recover t per vertex.
    this.tArr = new Float32Array(count);
    const ring = count / 41; // tubularSegments + 1 rings
    for (let i = 0; i < count; i++) this.tArr[i] = Math.floor(i / ring) / 40;
    this.baseWater = new THREE.Color(0xdcedf2);
    this.curCol = [];
    for (let i = 0; i < count; i++) this.curCol.push(this.baseWater.clone());
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.15, transparent: true, opacity: 0.85,
        emissive: 0xffffff, emissiveIntensity: 0,
      })
    );
    scene.add(this.water);
    this._writeColors();

    // The pond at the end of the brook.
    const end = CURVE.getPoint(1);
    const pondGroup = new THREE.Group();
    pondGroup.position.set(end.x + 0.5, 0, end.z - 0.4);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.14, 10, 30),
      new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.85 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    pondGroup.add(rim);
    this.pondWater = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 28),
      new THREE.MeshStandardMaterial({
        color: this.baseWater.clone(), roughness: 0.12, transparent: true, opacity: 0.9,
        emissive: 0x000000,
      })
    );
    this.pondWater.rotation.x = -Math.PI / 2;
    this.pondWater.position.y = 0.1;
    pondGroup.add(this.pondWater);
    scene.add(pondGroup);
    this.pondTint = this.baseWater.clone();

    // Travelling pulse blob.
    this.pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    scene.add(this.pulse);

    this.flow = null; // {front, color, glow, startCols}
    this.glowLevel = 0;
    this.color = this.baseWater.clone();
  }

  _sidePoint(t, side) {
    const p = CURVE.getPoint(t);
    const tangent = CURVE.getTangent(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    return new THREE.Vector3(p.x + normal.x * side, 0, p.z + normal.z * side);
  }

  get targets() {
    return [this.spring, ...this.lilies.map((l) => l.target)];
  }

  // Pour a colour into the spring -> pulse travels downstream.
  pour(color, glow = 0) {
    this.flow = {
      front: 0,
      color: color.clone(),
      glow,
      start: this.curCol.map((c) => c.clone()),
      startPond: this.pondTint.clone(),
    };
    this.color.copy(color);
  }

  _writeColors() {
    const attr = this.water.geometry.attributes.color;
    for (let i = 0; i < this.curCol.length; i++) {
      const c = this.curCol[i];
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }

  pulsePosition(out) {
    if (!this.flow) return null;
    const p = CURVE.getPoint(clamp(this.flow.front, 0, 1));
    return out.set(p.x, p.y + 0.25, p.z);
  }

  update(dt, t, nightF) {
    if (this.flow) {
      const f = this.flow;
      f.front += dt / 3.6;
      const soft = 0.12;
      for (let i = 0; i < this.curCol.length; i++) {
        let k = clamp((f.front - this.tArr[i]) / soft, 0, 1);
        k = k * k * (3 - 2 * k);
        this.curCol[i].lerpColors(f.start[i], f.color, k);
      }
      this._writeColors();
      // Pulse blob rides the front.
      const p = CURVE.getPoint(clamp(f.front, 0, 1));
      this.pulse.position.set(p.x, p.y + 0.18, p.z);
      this.pulse.material.color.copy(f.color).lerp(new THREE.Color(1, 1, 1), 0.3);
      this.pulse.material.opacity = 0.9 * clamp(1.15 - f.front, 0, 1);
      this.pulse.scale.setScalar(1 + Math.sin(t * 14) * 0.15);
      // Flush the lilies as the colour reaches them.
      for (const l of this.lilies) {
        if (!l.flushed && f.front >= l.at) {
          l.flushed = true;
          l.target.paint(f.color, f.glow);
        }
      }
      // Fill the pond at the end.
      const pk = clamp((f.front - 0.95) / 0.2, 0, 1);
      this.pondTint.lerpColors(f.startPond, f.color, pk * pk * (3 - 2 * pk));
      this.pondWater.material.color.copy(this.pondTint);
      if (f.front >= 1.2) {
        this.glowLevel = f.glow;
        for (const l of this.lilies) l.flushed = false;
        this.flow = null;
      }
    }
    // Glow-poured water shines at night.
    const glowI = this.glowLevel * (0.15 + 0.5 * nightF);
    this.water.material.emissiveIntensity = glowI;
    this.water.material.emissive.copy(this.color).multiplyScalar(1);
    this.pondWater.material.emissive.copy(this.pondTint).multiplyScalar(glowI);
  }
}
