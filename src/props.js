import * as THREE from '../lib/three.module.js';
import { Paintable, Target } from './targets.js';

// Little white props scattered all over the meadow — mushrooms, stones,
// fence pieces, a bench. Each is paintable with the same colour-front
// system, so the whole garden can be painted corner to corner, one small
// satisfying pop at a time. With the shade system, ten stones can be ten
// different blues.

const whiteMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, emissive: 0x2c2c2c });

const sphere = new THREE.SphereGeometry(1, 10, 8);
const box = new THREE.BoxGeometry(1, 1, 1);

function part(target, geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] } = {}) {
  geo = geo.clone();
  geo.scale(...s);
  geo.rotateX(r[0]); geo.rotateY(r[1]); geo.rotateZ(r[2]);
  geo.translate(...p);
  const mesh = new THREE.Mesh(geo, whiteMat());
  mesh.castShadow = true;
  target.group.add(mesh);
  target.paintables.push(new Paintable(mesh, (v) => v.y));
  return mesh;
}

class Prop extends Target {
  constructor(id, pos, build) {
    const group = new THREE.Group();
    group.position.copy(pos);
    super(id, group, new THREE.Vector3(0, 0.55, 0));
    build(this);
    this.popPhase = pos.x * 3.1 + pos.z;
  }

  idle(dt, t) {
    // A happy little pop right after being painted, then a gentle breathe.
    const pop = this.reward > 0 ? 1 + Math.sin(this.reward * Math.PI) * 0.18 : 1;
    const breathe = this.colored ? 1 + Math.sin(t * 2.1 + this.popPhase) * 0.012 : 1;
    this.group.scale.setScalar(pop * breathe);
  }
}

const BUILDERS = {
  mushroom(target) {
    part(target, sphere, { s: [0.13, 0.22, 0.13], p: [0, 0.2, 0] });   // stem
    part(target, sphere, { s: [0.32, 0.2, 0.32], p: [0, 0.42, 0] });   // cap
    target.focusLocal.set(0, 0.55, 0);
  },
  stone(target) {
    part(target, sphere, { s: [0.36, 0.24, 0.3], r: [0, 0.5, 0], p: [0, 0.2, 0] });
    part(target, sphere, { s: [0.2, 0.14, 0.17], p: [0.32, 0.12, 0.14] });
    target.focusLocal.set(0, 0.4, 0);
  },
  fence(target) {
    for (const x of [-0.55, 0.55]) {
      part(target, box, { s: [0.09, 0.62, 0.09], p: [x, 0.31, 0] });
      part(target, sphere, { s: [0.07, 0.06, 0.07], p: [x, 0.64, 0] });
    }
    part(target, box, { s: [1.35, 0.07, 0.06], p: [0, 0.46, 0] });
    part(target, box, { s: [1.35, 0.07, 0.06], p: [0, 0.22, 0] });
    target.focusLocal.set(0, 0.6, 0);
  },
  bench(target) {
    part(target, box, { s: [0.95, 0.07, 0.34], p: [0, 0.34, 0] });     // seat
    part(target, box, { s: [0.95, 0.3, 0.07], p: [0, 0.56, -0.16] });  // back
    for (const x of [-0.38, 0.38]) {
      part(target, box, { s: [0.08, 0.34, 0.28], p: [x, 0.17, 0] });
    }
    target.focusLocal.set(0, 0.6, 0);
  },
};

const LAYOUT = [
  ['mushroom', -3.9, -3.6, 0.5],
  ['mushroom', 5.9, -3.9, -0.4],
  ['mushroom', -6.35, 1.9, 0.9],
  ['mushroom', 0.5, -4.55, 0.1],
  ['stone', -2.2, 2.1, 0],
  ['stone', 1.95, 1.9, 0.7],
  ['stone', -4.95, 4.0, 0.3],
  ['stone', 6.3, 3.7, -0.5],
  ['fence', -4.5, -4.65, 0.12],
  ['fence', 4.1, -4.5, -0.1],
  ['fence', 6.5, 2.2, 1.35],
  ['bench', -3.5, 1.05, 0.55],
];

export function buildProps(scene) {
  const props = LAYOUT.map(([kind, x, z, ry], i) => {
    const prop = new Prop(`${kind}-${i}`, new THREE.Vector3(x, 0, z), BUILDERS[kind]);
    prop.group.rotation.y = ry;
    scene.add(prop.group);
    return prop;
  });
  return props;
}
