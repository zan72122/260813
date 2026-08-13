import * as THREE from 'three';
import { makeFloorTexture, makeWallTexture, makeTankTexture } from './util.js';

/* Workshop, 1 unit = 1 m. Floor y=0.
 * Bench with the anodizing tank mid-ground, lever console foreground right,
 * technician behind the bench, display pedestal in the right dark corner,
 * clutter + window on the far wall for depth. */

export const LAYOUT = {
  room: { x: 3.2, zBack: -2.3, zFront: 2.7, h: 3.0 },
  benchTop: 0.84,
  tank: { cx: 0.25, cz: -0.72, w: 0.64, d: 0.42, h: 0.46, wall: 0.015 },
  waterY: 0.84 + 0.38,
  tray: { cx: -0.66, cz: -0.60 },
  console: { cx: 0.46, cz: 0.04, topY: 0.86 },
  railY: 2.02,
  railZ: -0.72,
  pedestal: { cx: 2.05, cz: -0.72, topY: 1.02 },
};

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = false, recv = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = recv;
  return m;
}

export function buildEnvironment(scene) {
  const L = LAYOUT;
  const refs = {};

  /* ---------- materials ---------- */
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x8b9299, metalness: 0.85, roughness: 0.45 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3c4248, metalness: 0.8, roughness: 0.55 });
  const paintBlue = new THREE.MeshStandardMaterial({ color: 0x33566b, metalness: 0.2, roughness: 0.7 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.0, roughness: 0.85 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1e20, metalness: 0, roughness: 0.95 });

  /* ---------- room shell ---------- */
  const floorTex = makeFloorTexture();
  const floor = mesh(
    new THREE.PlaneGeometry(L.room.x * 2, L.room.zFront - L.room.zBack),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0x777c80, roughness: 0.92, metalness: 0.05 }),
    0, 0, (L.room.zFront + L.room.zBack) / 2, false, true
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x5d666c, roughness: 0.95 });
  const backWall = mesh(new THREE.PlaneGeometry(L.room.x * 2, L.room.h), wallMat, 0, L.room.h / 2, L.room.zBack);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const leftWall = mesh(new THREE.PlaneGeometry(L.room.zFront - L.room.zBack, L.room.h), wallMat.clone(),
    -L.room.x, L.room.h / 2, (L.room.zFront + L.room.zBack) / 2);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);
  const rightWall = leftWall.clone();
  rightWall.position.x = L.room.x;
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);
  const ceil = mesh(new THREE.PlaneGeometry(L.room.x * 2, L.room.zFront - L.room.zBack),
    new THREE.MeshStandardMaterial({ color: 0x3a4045, roughness: 0.95 }),
    0, L.room.h, (L.room.zFront + L.room.zBack) / 2);
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);

  /* ---------- window + light shaft (far-left, depth cue) ---------- */
  const winW = 1.5, winH = 1.0, winY = 1.9, winZ = -0.9;
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64; skyCanvas.height = 64;
  {
    const g = skyCanvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#cfe6f4'); grad.addColorStop(1, '#8fb4c8');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const winPane = mesh(new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshBasicMaterial({ map: skyTex }), -L.room.x + 0.01, winY, winZ);
  winPane.rotation.y = Math.PI / 2;
  scene.add(winPane);
  refs.windowPane = winPane;
  // frame + bars
  const frameMat = darkSteel;
  for (const [w, h, dy, dz] of [[winW + 0.1, 0.06, winH / 2 + 0.03, 0], [winW + 0.1, 0.06, -winH / 2 - 0.03, 0], [0.06, winH, 0, winW / 2 + 0.02], [0.06, winH, 0, -winW / 2 - 0.02], [0.04, winH, 0, 0]]) {
    const bar = mesh(new THREE.BoxGeometry(0.05, h, w), frameMat, -L.room.x + 0.03, winY + dy, winZ + dz);
    scene.add(bar);
  }
  // fake volumetric shaft
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xcfe0ea, transparent: true, opacity: 0.055,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const shaft = mesh(new THREE.PlaneGeometry(2.6, winH * 1.15), shaftMat, -L.room.x + 1.3, winY - 0.55, winZ);
  shaft.rotation.set(0, Math.PI / 2, -0.42);
  shaft.renderOrder = 6;
  scene.add(shaft);
  refs.lightShaft = shaft;

  /* ---------- ceiling lamps ---------- */
  refs.lampMats = [];
  for (const lx of [-0.9, 1.1]) {
    const lampG = new THREE.Group();
    lampG.position.set(lx, L.room.h, -0.5);
    const wire = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 5), rubber, 0, -0.25, 0);
    lampG.add(wire);
    const shade = mesh(new THREE.CylinderGeometry(0.05, 0.17, 0.13, 20, 1, true), darkSteel, 0, -0.55, 0);
    shade.material = darkSteel.clone();
    shade.material.side = THREE.DoubleSide;
    lampG.add(shade);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9c4 });
    const bulb = mesh(new THREE.SphereGeometry(0.045, 12, 8), bulbMat, 0, -0.58, 0);
    lampG.add(bulb);
    refs.lampMats.push(bulbMat);
    scene.add(lampG);
  }

  /* ---------- far-wall clutter: shelf, canisters, pipes, drums ---------- */
  const clutter = new THREE.Group();
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4c5358, metalness: 0.4, roughness: 0.7 });
  for (const sy of [1.35, 1.8]) {
    clutter.add(mesh(new THREE.BoxGeometry(2.2, 0.04, 0.3), shelfMat, -1.6, sy, L.room.zBack + 0.18));
  }
  const canColors = [0xa8683a, 0x647d8a, 0x8a8458, 0x6d5d75, 0x4f7a68, 0x9c4f44];
  let ci = 0;
  for (const sy of [1.37, 1.82]) {
    for (let i = 0; i < 6; i++) {
      const r = 0.05 + (i % 3) * 0.012;
      const h = 0.16 + ((i * 7) % 5) * 0.02;
      const can = mesh(new THREE.CylinderGeometry(r, r, h, 12),
        new THREE.MeshStandardMaterial({ color: canColors[ci++ % canColors.length], roughness: 0.8 }),
        -2.45 + i * 0.34, sy + h / 2, L.room.zBack + 0.18);
      clutter.add(can);
    }
  }
  // pipes along the back wall
  for (const py of [2.45, 2.58]) {
    clutter.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, L.room.x * 2, 10).rotateZ(Math.PI / 2),
      steelMat, 0, py, L.room.zBack + 0.09));
  }
  // drums far left
  for (const [dx, dz] of [[-2.55, -1.8], [-2.2, -1.95]]) {
    const drum = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18), paintBlue.clone(), dx, 0.44, dz, true, true);
    clutter.add(drum);
    clutter.add(mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.03, 18), darkSteel, dx, 0.62, dz));
  }
  scene.add(clutter);

  /* ---------- work bench ---------- */
  const bench = new THREE.Group();
  const benchTopMesh = mesh(new THREE.BoxGeometry(2.3, 0.05, 0.72), steelMat, 0.16, L.benchTop - 0.025, -0.70, true, true);
  bench.add(benchTopMesh);
  const legMat = darkSteel;
  for (const [lx, lz] of [[-0.9, -0.42], [-0.9, -0.98], [1.22, -0.42], [1.22, -0.98]]) {
    bench.add(mesh(new THREE.BoxGeometry(0.06, L.benchTop - 0.05, 0.06), legMat, lx, (L.benchTop - 0.05) / 2, lz, true));
  }
  // rear modesty panel (hides legs behind the bench)
  bench.add(mesh(new THREE.BoxGeometry(2.3, L.benchTop - 0.06, 0.025), paintBlue, 0.16, (L.benchTop - 0.06) / 2, -1.0, false, true));
  // lower shelf with a worn crate
  bench.add(mesh(new THREE.BoxGeometry(2.1, 0.03, 0.6), legMat, 0.16, 0.24, -0.7, false, true));
  bench.add(mesh(new THREE.BoxGeometry(0.4, 0.26, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x4e4130, roughness: 0.95 }), -0.5, 0.385, -0.7, true));
  scene.add(bench);

  /* ---------- anodizing tank ---------- */
  const T = L.tank;
  const tankTex = makeTankTexture();
  const tankMat = new THREE.MeshStandardMaterial({ map: tankTex, color: 0xbfd3da, metalness: 0.05, roughness: 0.6 });
  const tankInnerMat = new THREE.MeshStandardMaterial({ color: 0x24333a, metalness: 0.1, roughness: 0.7 });
  const tank = new THREE.Group();
  tank.position.set(T.cx, L.benchTop, T.cz);
  const wallH = T.h, wt = T.wall;
  // bottom
  tank.add(mesh(new THREE.BoxGeometry(T.w, wt, T.d), tankInnerMat, 0, wt / 2, 0, false, true));
  // back / left / right walls (outside textured)
  const mkWall = (w, d, x, z) => {
    const m = mesh(new THREE.BoxGeometry(w, wallH, d), tankMat, x, wallH / 2, z, true, true);
    tank.add(m);
  };
  mkWall(T.w, wt, 0, -T.d / 2 + wt / 2);
  mkWall(wt, T.d, -T.w / 2 + wt / 2, 0);
  mkWall(wt, T.d, T.w / 2 - wt / 2, 0);
  // front: window frame + glass so the child can see inside
  const frameW = 0.055;
  mkWall(T.w, wt, 0, 0); // placeholder replaced below
  tank.children.pop();
  const fz = T.d / 2 - wt / 2;
  mkWall(frameW, wt, -T.w / 2 + frameW / 2, fz);
  mkWall(frameW, wt, T.w / 2 - frameW / 2, fz);
  const topBar = mesh(new THREE.BoxGeometry(T.w, 0.045, wt), tankMat, 0, wallH - 0.0225, fz, true, true);
  tank.add(topBar);
  const botBar = mesh(new THREE.BoxGeometry(T.w, 0.075, wt), tankMat, 0, 0.0375, fz, true, true);
  tank.add(botBar);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff3f2, metalness: 0, roughness: 0.06,
    transparent: true, opacity: 0.09, envMapIntensity: 1.2, side: THREE.DoubleSide,
  });
  const glass = mesh(new THREE.PlaneGeometry(T.w - frameW * 2, wallH - 0.12), glassMat, 0, (wallH - 0.12) / 2 + 0.075, fz);
  glass.renderOrder = 5;
  tank.add(glass);
  // rim lip
  const rim = mesh(new THREE.BoxGeometry(T.w + 0.03, 0.02, T.d + 0.03), tankMat, 0, wallH + 0.01, 0, true, true);
  // hole illusion: skip actual hole, rim is a frame of 4 bars
  tank.remove(rim);
  for (const [w, d, x, z] of [[T.w + 0.04, 0.045, 0, T.d / 2], [T.w + 0.04, 0.045, 0, -T.d / 2], [0.045, T.d + 0.04, T.w / 2, 0], [0.045, T.d + 0.04, -T.w / 2, 0]]) {
    tank.add(mesh(new THREE.BoxGeometry(w, 0.022, d), tankMat, x, wallH + 0.011, z, true, true));
  }
  // busbar + electrode plates (cathodes) inside
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xb0764a, metalness: 0.9, roughness: 0.4 });
  for (const ex of [-T.w / 2 + 0.05, T.w / 2 - 0.05]) {
    tank.add(mesh(new THREE.BoxGeometry(0.006, 0.3, 0.26), steelMat, ex, 0.22, 0, false, false));
  }
  tank.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, T.w + 0.06, 8).rotateZ(Math.PI / 2), copperMat, 0, wallH + 0.02, 0));
  scene.add(tank);
  refs.tank = tank;

  // cables from tank to console
  const cableMat = rubber;
  const cablePts = [
    new THREE.Vector3(T.cx + T.w / 2 + 0.02, L.benchTop + wallH - 0.02, T.cz),
    new THREE.Vector3(T.cx + T.w / 2 + 0.12, L.benchTop + 0.02, T.cz + 0.08),
    new THREE.Vector3(L.console.cx + 0.22, 0.06, L.console.cz - 0.3),
    new THREE.Vector3(L.console.cx + 0.05, 0.02, L.console.cz - 0.05),
    new THREE.Vector3(L.console.cx, L.console.topY - 0.35, L.console.cz - 0.04),
  ];
  const cableCurve = new THREE.CatmullRomCurve3(cablePts);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 32, 0.012, 6), cableMat);
  cable.castShadow = true;
  scene.add(cable);

  /* ---------- felt tray with piece stands ---------- */
  const tray = new THREE.Group();
  tray.position.set(L.tray.cx, L.benchTop, L.tray.cz);
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x2c3a55, roughness: 1.0 });
  tray.add(mesh(new THREE.BoxGeometry(0.46, 0.025, 0.3), feltMat, 0, 0.0125, 0, true, true));
  const standMat = darkSteel;
  refs.standXs = [-0.145, 0, 0.145];
  for (const sx of refs.standXs) {
    tray.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.02, 12), standMat, sx, 0.035, 0.02, true));
    tray.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 6), standMat, sx, 0.09, 0.02, true));
  }
  scene.add(tray);
  refs.tray = tray;

  /* ---------- overhead hoist: rail + carriage + hook ---------- */
  const rail = new THREE.Group();
  const railBeam = mesh(new THREE.BoxGeometry(3.6, 0.09, 0.07), paintBlue, 0.72, L.railY, L.railZ, true);
  rail.add(railBeam);
  // rail supports from ceiling
  for (const rx of [-0.7, 0.9, 2.3]) {
    rail.add(mesh(new THREE.BoxGeometry(0.05, L.room.h - L.railY - 0.045, 0.05), darkSteel,
      rx, (L.room.h + L.railY) / 2, L.railZ, true));
  }
  scene.add(rail);

  const carriage = new THREE.Group();
  carriage.position.set(L.tray.cx, L.railY, L.railZ);
  const carBody = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xc7a23a, metalness: 0.3, roughness: 0.6 }), 0, -0.02, 0, true);
  carriage.add(carBody);
  for (const wx of [-0.055, 0.055]) {
    carriage.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12).rotateX(Math.PI / 2), darkSteel, wx, 0.055, 0.045, true));
    carriage.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12).rotateX(Math.PI / 2), darkSteel, wx, 0.055, -0.045, true));
  }
  scene.add(carriage);
  refs.carriage = carriage;

  // hook assembly hangs from carriage on a cable whose length we animate
  const hookGroup = new THREE.Group();
  const hookCable = mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), steelMat, 0, 0.5, 0);
  hookGroup.add(hookCable);
  const hookBody = new THREE.Group();
  const hookShank = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), steelMat, 0, -0.012, 0, true);
  hookBody.add(hookShank);
  const hookCurve = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 8, 20, Math.PI * 1.45), steelMat);
  hookCurve.rotation.z = Math.PI * 0.79;
  hookCurve.position.y = -0.055;
  hookCurve.castShadow = true;
  hookBody.add(hookCurve);
  // titanium hanging wire (the anode connection)
  const hangWire = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.085, 6), steelMat, 0, -0.115, 0);
  hangWire.visible = false;
  hookBody.add(hangWire);
  hookGroup.add(hookBody);
  carriage.add(hookGroup);
  refs.hookGroup = hookGroup;
  refs.hookBody = hookBody;
  refs.hookCable = hookCable;
  refs.hangWire = hangWire;
  refs.setHookDrop = (drop) => {
    hookCable.scale.y = Math.max(0.02, drop);
    hookCable.position.y = -drop / 2;
    hookBody.position.y = -drop;
  };
  refs.setHookDrop(0.35);

  /* ---------- lever console (foreground, child-sized) ---------- */
  const console3 = new THREE.Group();
  console3.position.set(L.console.cx, 0, L.console.cz);
  console3.rotation.y = -0.15; // angled toward camera
  const colBody = mesh(new THREE.BoxGeometry(0.34, 0.72, 0.3), paintBlue, 0, 0.36, 0, true, true);
  console3.add(colBody);
  // worn edge highlights
  console3.add(mesh(new THREE.BoxGeometry(0.345, 0.02, 0.305), steelMat, 0, 0.72, 0));
  const slope = mesh(new THREE.BoxGeometry(0.34, 0.05, 0.32), darkSteel, 0, 0.755, 0.0);
  slope.rotation.x = -0.32;
  console3.add(slope);
  // big rounded base plate for the lever
  const plate = mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.035, 20), steelMat, 0, 0.79, 0.02, true);
  console3.add(plate);
  // lever: pivoting arm + big red ball
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.80, 0.02);
  const arm = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.27, 10), steelMat, 0, 0.135, 0, true);
  leverPivot.add(arm);
  const knob = mesh(new THREE.SphereGeometry(0.048, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xc23b2e, metalness: 0.1, roughness: 0.35 }), 0, 0.285, 0, true);
  leverPivot.add(knob);
  leverPivot.rotation.x = 0.5; // resting position, tilted toward child
  console3.add(leverPivot);
  refs.leverPivot = leverPivot;
  refs.leverKnob = knob;
  // indicator lamp (amber = current flowing)
  const lampMat2 = new THREE.MeshStandardMaterial({ color: 0x53340f, emissive: 0x000000, roughness: 0.4 });
  const indicator = mesh(new THREE.SphereGeometry(0.02, 12, 8), lampMat2, -0.09, 0.775, 0.09);
  console3.add(indicator);
  refs.indicatorMat = lampMat2;
  // rubber mat under console for grounding
  console3.add(mesh(new THREE.BoxGeometry(0.5, 0.012, 0.45), rubber, 0, 0.006, 0.02, false, true));
  scene.add(console3);
  refs.console = console3;

  /* ---------- technician (the adult by the tank) ---------- */
  const tech = buildTechnician();
  tech.group.position.set(0.0, 0, -1.62);
  tech.group.rotation.y = 0.15;
  scene.add(tech.group);
  refs.tech = tech;

  /* ---------- display corner: pedestal + easel + spotlight ---------- */
  const P = L.pedestal;
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: 0.2, roughness: 0.5 });
  const ped = new THREE.Group();
  ped.position.set(P.cx, 0, P.cz);
  ped.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), pedMat, 0, 0.03, 0, true, true));
  ped.add(mesh(new THREE.BoxGeometry(0.3, P.topY - 0.1, 0.3), pedMat, 0, (P.topY - 0.1) / 2 + 0.06, 0, true, true));
  const pedTop = mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x222327 }), 0, P.topY - 0.02, 0, true, true);
  ped.add(pedTop);
  // velvet-ish easel the charm leans on
  const easel = new THREE.Group();
  easel.position.set(0, P.topY, 0.01);
  const velvet = new THREE.MeshStandardMaterial({ color: 0x12151f, roughness: 1.0 });
  const back = mesh(new THREE.BoxGeometry(0.11, 0.13, 0.012), velvet, 0, 0.075, -0.02, true);
  back.rotation.x = -0.38;
  easel.add(back);
  easel.add(mesh(new THREE.BoxGeometry(0.13, 0.012, 0.06), velvet, 0, 0.006, 0.008, true, true));
  ped.add(easel);
  scene.add(ped);
  refs.pedestal = ped;
  refs.easel = easel;

  // shelf for finished pieces (the collection)
  const shelf = new THREE.Group();
  shelf.position.set(P.cx + 0.52, 0, P.cz + 0.05);
  shelf.add(mesh(new THREE.BoxGeometry(0.34, 0.7, 0.26), pedMat, 0, 0.35, 0, true, true));
  shelf.add(mesh(new THREE.BoxGeometry(0.38, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0x222327 }), 0, 0.715, 0, true, true));
  scene.add(shelf);
  refs.collectionShelf = shelf;
  refs.collectionSpots = [
    new THREE.Vector3(P.cx + 0.42, 0.73, P.cz + 0.11),
    new THREE.Vector3(P.cx + 0.55, 0.73, P.cz + 0.02),
    new THREE.Vector3(P.cx + 0.46, 0.73, P.cz - 0.06),
    new THREE.Vector3(P.cx + 0.60, 0.73, P.cz + 0.12),
  ];

  return refs;
}

/** Stylized but properly proportioned adult in coveralls + hi-vis vest,
 *  hard hat and gloves. Articulation: head look, gentle sway, a nod. */
function buildTechnician() {
  const group = new THREE.Group();
  const coverall = new THREE.MeshStandardMaterial({ color: 0x33566b, roughness: 0.85 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xd97a26, roughness: 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xbfc8c4, roughness: 0.5, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9946f, roughness: 0.75 });
  const hat = new THREE.MeshStandardMaterial({ color: 0xe8e5da, roughness: 0.45 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x3a5f43, roughness: 0.9 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x211d18, roughness: 0.9 });

  const m = (geo, mat, x, y, z) => {
    const mm = new THREE.Mesh(geo, mat);
    mm.position.set(x, y, z);
    mm.castShadow = true;
    return mm;
  };

  // legs + boots (mostly hidden by the bench but keep the body grounded)
  for (const sx of [-1, 1]) {
    group.add(m(new THREE.CylinderGeometry(0.07, 0.075, 0.72, 10), coverall, sx * 0.1, 0.46, 0));
    group.add(m(new THREE.BoxGeometry(0.11, 0.09, 0.24), boot, sx * 0.1, 0.045, 0.04));
  }

  // torso pivot: everything above the waist sways / nods from here
  const torso = new THREE.Group();
  torso.position.set(0, 0.82, 0);
  group.add(torso);
  const chest = m(new THREE.CapsuleGeometry(0.125, 0.32, 6, 12), coverall, 0, 0.28, 0);
  chest.scale.set(1.15, 1, 0.72);
  torso.add(chest);
  const vestMesh = m(new THREE.CapsuleGeometry(0.132, 0.24, 6, 12), vest, 0, 0.30, 0);
  vestMesh.scale.set(1.15, 1, 0.74);
  torso.add(vestMesh);
  for (const vy of [0.24, 0.36]) {
    const band = m(new THREE.TorusGeometry(0.135, 0.011, 6, 20), stripe, 0, vy, 0);
    band.scale.x = 1.15;
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.74, 1);
    torso.add(band);
  }

  // head + hard hat + goggles
  const headG = new THREE.Group();
  headG.position.set(0, 0.62, 0);
  torso.add(headG);
  headG.add(m(new THREE.SphereGeometry(0.098, 16, 12), skin, 0, 0.05, 0));
  const hatDome = m(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hat, 0, 0.075, 0);
  headG.add(hatDome);
  const brim = m(new THREE.CylinderGeometry(0.125, 0.135, 0.014, 18), hat, 0, 0.072, 0.01);
  headG.add(brim);
  const goggles = m(new THREE.BoxGeometry(0.13, 0.032, 0.02), new THREE.MeshStandardMaterial({ color: 0x1c2a30, roughness: 0.2, metalness: 0.3 }), 0, 0.055, 0.088);
  headG.add(goggles);

  // arms: left rests toward tank, right holds the hoist pendant
  const mkArm = (sx, drop, out) => {
    const armG = new THREE.Group();
    armG.position.set(sx * 0.19, 0.42, 0);
    const upper = m(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), coverall, 0, -0.12, 0);
    armG.add(upper);
    const fore = m(new THREE.CapsuleGeometry(0.04, 0.18, 4, 8), coverall, 0, -0.3, 0.07);
    fore.rotation.x = -0.55;
    armG.add(fore);
    const hand = m(new THREE.SphereGeometry(0.05, 10, 8), glove, 0, -0.38, 0.16);
    armG.add(hand);
    armG.rotation.z = sx * -drop;
    armG.rotation.x = out;
    torso.add(armG);
    return armG;
  };
  mkArm(-1, 0.22, 0.1);
  const armR = mkArm(1, 0.12, 0.25);

  // pendant control in the right hand
  const pendant = m(new THREE.BoxGeometry(0.06, 0.11, 0.035), new THREE.MeshStandardMaterial({ color: 0xc7a23a, roughness: 0.6 }), 0, -0.42, 0.2);
  const btnU = m(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e7d4f }), 0, -0.40, 0.222);
  const btnD = m(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa33327 }), 0, -0.44, 0.222);
  armR.add(pendant); armR.add(btnU); armR.add(btnD);

  return { group, torso, head: headG };
}
