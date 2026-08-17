import * as THREE from '../lib/three.module.js';
import { DYE } from './dye.js';
import { clamp } from './util.js';

// Builds the static world: layered scenery (foreground meadow, midground
// bushes, faraway hills + clouds behind fog), lighting, the three dye
// pools and the clear rinsing pool. Real geometry + perspective + fog give
// depth; nothing here is a CSS trick.

export const POOLS = [
  { id: 'red',    dye: 'r', pos: new THREE.Vector3(-3.4, 0, 2.9), radius: 1.05 },
  { id: 'blue',   dye: 'b', pos: new THREE.Vector3(0.0, 0, 3.6),  radius: 1.05 },
  { id: 'yellow', dye: 'y', pos: new THREE.Vector3(3.4, 0, 2.9),  radius: 1.05 },
];

export const WASH = { id: 'wash', pos: new THREE.Vector3(5.6, 0, 0.2), radius: 1.35 };

export const WATER_Y = 0.14;

function groundMaterial(rng) {
  // Subtle noise texture so the meadow reads as grass, not flat paint.
  const size = 256;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#7ec860';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const g = 0.75 + rng() * 0.5;
    ctx.fillStyle = `rgb(${Math.floor(108 * g)},${Math.floor(190 * g)},${Math.floor(86 * g)})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2.2, 1 + rng() * 2.2);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
}

function makeSky() {
  const geo = new THREE.SphereGeometry(90, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      // Day palette; the night cycle lerps these towards indigo.
      top: { value: new THREE.Color(0x5fb7ea) },
      mid: { value: new THREE.Color(0xa8dcf5) },
      bottom: { value: new THREE.Color(0xeaf7ef) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      void main(){
        float h = normalize(vPos).y;
        vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h))
                          : mix(bottom, mid, smoothstep(-0.05, 0.25, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function makeHills(rng) {
  // Two rings of soft hills, hazier the further away (aerial perspective
  // comes from fog + desaturated far colours).
  const group = new THREE.Group();
  const rings = [
    { dist: 30, count: 10, color: 0x84c08c, scale: 1.0 },
    { dist: 46, count: 9, color: 0xa5cfdf, scale: 1.5 },
  ];
  for (const ring of rings) {
    const mat = new THREE.MeshStandardMaterial({ color: ring.color, roughness: 1 });
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + rng() * 0.5;
      const r = ring.dist + rng() * 6;
      const s = (2.2 + rng() * 2.4) * ring.scale;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
      hill.scale.set(s * 2.4, s * 0.5, s);
      hill.position.set(Math.cos(a) * r, -0.5, Math.sin(a) * r);
      group.add(hill);
    }
  }
  return group;
}

function makeClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x668899, emissiveIntensity: 0.12 });
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = 1.6 + rng() * 2.2;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
      puff.scale.set(s * 1.7, s * 0.62, s);
      puff.position.set((p - puffs / 2) * s * 1.5, rng() * 0.8, rng() * 1.2);
      cloud.add(puff);
    }
    const a = rng() * Math.PI * 2;
    cloud.position.set(Math.cos(a) * (24 + rng() * 16), 11 + rng() * 6, Math.sin(a) * (26 + rng() * 14));
    cloud.userData.drift = 0.12 + rng() * 0.2;
    group.add(cloud);
  }
  return group;
}

function makeBush(rng, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4f9e4f, roughness: 0.9 });
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const s = (0.5 + rng() * 0.5) * scale;
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
    b.scale.set(s * 1.3, s, s * 1.2);
    b.position.set((rng() - 0.5) * scale * 1.6, s * 0.55, (rng() - 0.5) * scale * 1.2);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function makeGrassTuft(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x63b84e, roughness: 0.95 });
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const h = 0.18 + rng() * 0.3;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 5), mat);
    blade.position.set((rng() - 0.5) * 0.4, h / 2, (rng() - 0.5) * 0.4);
    blade.rotation.z = (rng() - 0.5) * 0.5;
    blade.rotation.x = (rng() - 0.5) * 0.5;
    g.add(blade);
  }
  return g;
}

// A dye pool: a chunky ceramic bowl sunk into the meadow with vividly
// coloured water. The water surface gently pulses so it reads as liquid.
function makePool(def, clear = false) {
  const group = new THREE.Group();
  group.position.copy(def.pos);
  const R = def.radius;

  const rimColor = clear ? 0xf2f6f8 : 0xf6f1e8;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.17, 12, 40),
    new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.55 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 0.86, 0.34, 36, 1, true),
    new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.6, side: THREE.DoubleSide })
  );
  wall.position.y = -0.02;
  group.add(wall);

  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.88, 32),
    new THREE.MeshStandardMaterial({ color: clear ? 0xcfe8ee : 0xe8e2d5, roughness: 0.8 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.16;
  group.add(bottom);

  const waterColor = clear ? new THREE.Color(0x9fd9e8) : DYE[def.id].water.clone();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.94, 40),
    new THREE.MeshStandardMaterial({
      color: waterColor,
      roughness: 0.15,
      metalness: 0.05,
      transparent: true,
      opacity: clear ? 0.72 : 0.92,
      emissive: waterColor.clone().multiplyScalar(clear ? 0.15 : 0.32),
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  group.add(water);

  // Guide halo (hidden unless the tutorial points at this pool).
  const halo = makeHalo(clear ? 0xbfeaf5 : DYE[def.id].water.getHex(), R * 1.28);
  halo.position.y = 0.32;
  group.add(halo);

  return { group, water, halo, def, phase: def.pos.x * 1.7 + def.pos.z };
}

export function makeHalo(hexColor, baseScale = 1) {
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.055, 8, 40),
    new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0, depthWrite: false })
  );
  halo.rotation.x = Math.PI / 2;
  halo.userData.isHalo = true;
  halo.userData.active = false;
  halo.userData.t = 0;
  halo.userData.baseScale = baseScale;
  halo.renderOrder = 5;
  return halo;
}

export function updateHalo(halo, dt) {
  const target = halo.userData.active ? 1 : 0;
  halo.userData.t += (target - halo.userData.t) * Math.min(1, dt * 5);
  const t = halo.userData.t;
  halo.visible = t > 0.02;
  if (!halo.visible) return;
  halo.userData.phase = (halo.userData.phase || 0) + dt * 2.4;
  const pulse = (1 + 0.18 * Math.sin(halo.userData.phase)) * (halo.userData.baseScale || 1);
  halo.scale.setScalar(pulse);
  halo.material.opacity = t * (0.45 + 0.3 * Math.sin(halo.userData.phase * 0.5 + 1));
}

export function buildWorld(scene, rng) {
  scene.background = null; // sky dome handles it
  scene.fog = new THREE.Fog(0xcfe9f4, 20, 58);

  const sky = makeSky();
  scene.add(sky);

  // Lights: warm sun + cool sky fill.
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x86b878, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
  sun.position.set(-7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  // Ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), groundMaterial(rng));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const hills = makeHills(rng);
  scene.add(hills);
  const clouds = makeClouds(rng);
  scene.add(clouds);

  // Midground bushes framing the play space.
  const bushSpots = [
    [-6.5, -4.5, 1.5], [6.8, -4.2, 1.4], [-7.6, 0.8, 1.2], [8.0, 2.8, 1.15],
    [-5.4, -6.8, 1.8], [8.2, -5.8, 1.7], [0.4, -8.0, 2.0], [-8.6, 4.4, 1.3],
  ];
  for (const [x, z, s] of bushSpots) {
    const bush = makeBush(rng, s);
    bush.position.set(x, 0, z);
    scene.add(bush);
  }

  // Foreground grass tufts (near the camera, strengthens depth layering).
  const tuftSpots = [
    [-4.6, 5.2], [-3.4, 6.0], [4.6, 6.2], [4.4, 5.4], [-6, 3.8], [6.4, 4.2],
    [-2.8, 4.4], [2.6, 4.6], [3.4, 5.2], [-5.6, 1.4], [7.2, 1.8],
  ];
  for (const [x, z] of tuftSpots) {
    const tuft = makeGrassTuft(rng);
    tuft.position.set(x, 0, z);
    scene.add(tuft);
  }

  // Pools
  const pools = POOLS.map((def) => {
    const pool = makePool(def);
    scene.add(pool.group);
    return pool;
  });
  const wash = makePool(WASH, true);
  scene.add(wash.group);

  function update(dt, t) {
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 45) cloud.position.x = -45;
    }
    for (const p of [...pools, wash]) {
      p.water.position.y = WATER_Y + Math.sin(t * 1.3 + p.phase) * 0.008;
      p.water.rotation.z += dt * 0.05;
      updateHalo(p.halo, dt);
    }
  }

  return { pools, wash, update, sky, hemi, sun };
}
