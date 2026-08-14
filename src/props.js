// The tools the child holds: tray, stamp, nozzle, brush, scraper.
// All achromatic except the nozzle, which is the very first colour the game
// ever shows.

import * as THREE from 'three';
import { QUALITY, TRAY, WHITE_WORLD } from './config.js';
import { SHAPES, shapeById } from './shapes.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const metal = (hex, rough = 0.8) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: 0.05 });

export function makeTray() {
  const g = new THREE.Group();
  const w = TRAY.w + TRAY.rim * 2;
  const d = TRAY.d + TRAY.rim * 2;
  const bodyMat = metal(WHITE_WORLD.tray, 0.85);
  const darkMat = metal(WHITE_WORLD.trayDark, 0.9);

  // slightly inset so its side faces never z-fight with the rim faces
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.42, d - 0.06), darkMat);
  floor.position.y = -1.28;
  g.add(floor);

  const rimH = 1.55;
  const mk = (sx, sz, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, rimH, sz), bodyMat);
    m.position.set(x, -1.28 + rimH / 2, z);
    g.add(m);
  };
  mk(w, TRAY.rim, 0, -(d - TRAY.rim) / 2);
  mk(w, TRAY.rim, 0, (d - TRAY.rim) / 2);
  mk(TRAY.rim, d - TRAY.rim * 2, -(w - TRAY.rim) / 2, 0);
  mk(TRAY.rim, d - TRAY.rim * 2, (w - TRAY.rim) / 2, 0);
  return g;
}

/**
 * The big stamp: a plate with every silhouette sticking out underneath.
 * @param {{x:number,z:number,shapeId:string,size:number}[]} cells
 */
export function makeStamp(cells) {
  const g = new THREE.Group();
  const plateMat = metal('#a9a29a', 0.75);
  const knobMat = metal('#8b847b', 0.7);

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(TRAY.w + 0.6, 0.7, TRAY.d + 0.5),
    plateMat,
  );
  plate.position.y = 0.35;
  g.add(plate);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.7, 14), knobMat);
  handle.position.y = 1.55;
  g.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 12), knobMat);
  knob.position.y = 2.5;
  g.add(knob);

  // the business end - one merged mesh so the whole stamp is a few draw calls
  const teeth = [];
  for (const c of cells) {
    const spec = shapeById(c.shapeId);
    for (const pts of spec.parts) {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1]);
      shape.closePath();
      const e = new THREE.ExtrudeGeometry(shape, {
        depth: 0.5,
        bevelEnabled: true,
        bevelThickness: 0.14,
        bevelSize: 0.14,
        bevelSegments: 1,
        steps: 1,
      });
      e.rotateX(-Math.PI / 2);
      e.computeBoundingBox();
      const h = e.boundingBox.max.y - e.boundingBox.min.y;
      e.translate(0, -e.boundingBox.min.y, 0);
      e.scale(c.size, TRAY.cavityDepth / h, c.size);
      e.translate(c.x, -TRAY.cavityDepth, c.z);
      teeth.push(e);
    }
  }
  if (teeth.length) {
    const merged = mergeGeometries(teeth, false);
    teeth.forEach((t) => t.dispose());
    const m = new THREE.Mesh(merged, plateMat);
    g.add(m);
  }
  return g;
}

/** Squeeze bottle. `hex` is the juice inside it. */
export function makeNozzle(hex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.78, 1.9, 18),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.35,
      transparent: true,
      opacity: 0.92,
    }),
  );
  body.position.y = 1.35;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.6, 0.75, 16), metal('#e9e4dc', 0.6));
  cap.position.y = 2.6;
  g.add(cap);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 14), metal('#d9d3cb', 0.6));
  tip.position.y = 0.2;
  tip.rotation.x = Math.PI;
  g.add(tip);
  g.userData.tipOffset = new THREE.Vector3(0, -0.25, 0);
  g.scale.setScalar(0.78);
  return g;
}

/**
 * A fat brush - deliberately much wider than a 4-year-old's aim.
 * The group origin is the tip of the bristles, so placing it on the powder
 * surface is just `position.y = surfaceY`.
 */
export function makeBrush() {
  const g = new THREE.Group();
  const wood = metal('#c9a06a', 0.85);
  const hair = metal('#f2ebdd', 0.95);
  const bristles = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.85, 1.1), hair);
  bristles.position.y = 0.4;
  g.add(bristles);
  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.66, 0.6, 14),
    metal('#b9b2a8', 0.5),
  );
  ferrule.position.y = 1.1;
  g.add(ferrule);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 3.4, 14), wood);
  handle.position.y = 3.0;
  g.add(handle);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), wood);
  cap.position.y = 4.7;
  g.add(cap);
  return g;
}

/** Flat blade used to level the starch. */
export function makeScraper() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 0.34), metal('#cdc6bc', 0.6));
  blade.position.y = 0.45;
  g.add(blade);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.9), metal('#a29b91', 0.8));
  grip.position.set(0, 1.2, 0.1);
  g.add(grip);
  return g;
}

/** Little wooden roller for the polishing step. Origin = where it touches. */
export function makeRoller() {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 18), metal('#d8b184', 0.7));
  drum.rotation.z = Math.PI / 2;
  drum.position.y = 0.7;
  g.add(drum);
  return g;
}

export function shapeCells() {
  // Layout of the stamp / the cavities: a tidy grid, varied silhouettes.
  const { cols, rows, padX, padZ } = {
    cols: 5,
    rows: 3,
    padX: TRAY.w / 5,
    padZ: TRAY.d / 3.2,
  };
  const cells = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const spec = SHAPES[n % SHAPES.length];
      cells.push({
        x: (c - (cols - 1) / 2) * padX,
        z: (r - (rows - 1) / 2) * padZ,
        shapeId: spec.id,
        spec,
        size: 0.82,
      });
      n++;
    }
  }
  return cells;
}

/** Soft round sprite used for every puff and sparkle. */
export function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

export const PROP_QUALITY = QUALITY;
