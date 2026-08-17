import * as THREE from '../lib/three.module.js';
import { Paintable, Target } from './targets.js';

// Big white landmarks — the showpieces of the meadow. A windmill whose
// sails start turning once it's painted, and a little cottage whose
// windows light up warm when it gets its colour. Both are painted with
// the same bottom-to-top colour front as everything else.

const whiteMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, emissive: 0x2c2c2c });

function part(target, parent, geo, { s = [1, 1, 1], r = [0, 0, 0], p = [0, 0, 0] } = {}) {
  geo = geo.clone();
  geo.scale(...s);
  geo.rotateX(r[0]); geo.rotateY(r[1]); geo.rotateZ(r[2]);
  geo.translate(...p);
  const mesh = new THREE.Mesh(geo, whiteMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  target.paintables.push(new Paintable(mesh, (v) => v.y));
  return mesh;
}

const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 10);

class Windmill extends Target {
  constructor(pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = Math.atan2(-pos.x, -pos.z + 6); // face the meadow
    super('windmill', group, new THREE.Vector3(0, 2.1, 0));

    part(this, group, new THREE.CylinderGeometry(0.44, 0.72, 2.7, 12), { p: [0, 1.35, 0] });
    part(this, group, sphere, { s: [0.52, 0.42, 0.52], p: [0, 2.78, 0] }); // cap
    const door = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 14),
      new THREE.MeshStandardMaterial({ color: 0x8a6743, roughness: 0.9 })
    );
    door.position.set(0, 0.42, 0.64);
    door.scale.y = 1.4;
    group.add(door);

    // Sails on a rotating hub.
    this.hub = new THREE.Group();
    this.hub.position.set(0, 2.78, 0.56);
    group.add(this.hub);
    const hubCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9cfbc, roughness: 0.6 })
    );
    this.hub.add(hubCap);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      const geo = box.clone();
      geo.scale(0.3, 1.25, 0.05);
      geo.translate(0, 0.78, 0);
      const sail = new THREE.Mesh(geo, whiteMat());
      sail.castShadow = true;
      arm.add(sail);
      this.hub.add(arm);
      this.paintables.push(new Paintable(sail, (v) => v.y));
    }
    this.spinSpeed = 0.18;
  }

  idle(dt) {
    const want = this.colored ? 0.9 + this.reward * 2.4 : 0.18;
    this.spinSpeed += (want - this.spinSpeed) * Math.min(1, dt * 1.6);
    this.hub.rotation.z += dt * this.spinSpeed;
  }
}

class Cottage extends Target {
  constructor(pos) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = Math.atan2(-pos.x, -pos.z + 6);
    super('cottage', group, new THREE.Vector3(0, 1.1, 0));

    part(this, group, box, { s: [1.7, 1.0, 1.25], p: [0, 0.5, 0] });            // walls
    part(this, group, new THREE.ConeGeometry(1.28, 0.85, 4), { r: [0, Math.PI / 4, 0], p: [0, 1.42, 0] }); // roof
    part(this, group, box, { s: [0.22, 0.5, 0.22], p: [0.5, 1.7, -0.25] });     // chimney

    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a6743, roughness: 0.9 })
    );
    door.position.set(-0.3, 0.3, 0.632);
    group.add(door);

    // Windows that light up warm when the cottage is painted.
    this.windows = [];
    const winMat = () =>
      new THREE.MeshStandardMaterial({ color: 0xbcd6e4, roughness: 0.3, emissive: 0x000000 });
    for (const [x, z, ry] of [[0.35, 0.632, 0], [-0.86, 0.1, -Math.PI / 2]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), winMat());
      win.position.set(x, 0.62, z);
      win.rotation.y = ry;
      group.add(win);
      this.windows.push(win);
    }
  }

  update(dt, t, night = 0) {
    super.update(dt, t, night);
    // Painted cottage: windows glow warm, stronger in the dark.
    if (this.colored) {
      const warm = (0.55 + 0.9 * night) * (1 + 0.08 * Math.sin(t * 3.1));
      for (const w of this.windows) {
        w.material.emissive.setRGB(1.0, 0.72, 0.32);
        w.material.emissiveIntensity = warm;
      }
    }
  }

  idle(_dt, t) {
    const pop = this.reward > 0 ? 1 + Math.sin(this.reward * Math.PI) * 0.06 : 1;
    this.group.scale.setScalar(pop * (1 + Math.sin(t * 1.7) * 0.0));
  }
}

export function buildLandmarks(scene) {
  const landmarks = [
    new Windmill(new THREE.Vector3(6.0, 0, -4.6)),
    new Cottage(new THREE.Vector3(-4.3, 0, -4.7)),
  ];
  for (const l of landmarks) scene.add(l.group);
  return landmarks;
}
