// Rendering, camera direction, input and UI for the scramble-crossing game.
// All crowd behaviour lives in sim.js; this file only draws it and wires up
// the one-finger controls.

import * as THREE from '../lib/three.module.min.js';
import {
  createSim, ROAD_W, CROSSWALK_MIN, CROSSWALK_MAX, DIAG_W, CORNER_EXTENT,
  GREEN_SHORT, GREEN_LONG, CROSSWALKS, mulberry32,
} from './sim.js';

const HALF = ROAD_W / 2;
const BAND_GAP = 0.3; // crosswalk band offset from the central box (must match sim)

const params = new URLSearchParams(location.search);
const E2E = params.get('e2e') === '1';
const SEED = parseInt(params.get('seed') || '12345', 10);
const AGENTS = parseInt(params.get('n') || '150', 10);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !E2E, powerPreference: 'high-performance',
});
renderer.setPixelRatio(E2E ? 1 : Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16203a);
scene.fog = new THREE.Fog(0x16203a, 70, 150);

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

scene.add(new THREE.HemisphereLight(0x8fa0d0, 0x4a505c, 1.35));
const sun = new THREE.DirectionalLight(0xffc38a, 0.9);
sun.position.set(-30, 45, -20);
scene.add(sun);

// ---------------------------------------------------------------- ground
{
  const side = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshLambertMaterial({ color: 0x646b78 })
  );
  side.rotation.x = -Math.PI / 2;
  side.position.y = -0.02;
  scene.add(side);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x363a42 });
  const roadX = new THREE.Mesh(new THREE.PlaneGeometry(240, ROAD_W), roadMat);
  roadX.rotation.x = -Math.PI / 2;
  scene.add(roadX);
  const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 240), roadMat);
  roadZ.rotation.x = -Math.PI / 2;
  roadZ.position.y = 0.001;
  scene.add(roadZ);
  const box = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_W),
    new THREE.MeshLambertMaterial({ color: 0x3e424c }));
  box.rotation.x = -Math.PI / 2;
  box.position.y = 0.002;
  scene.add(box);

  // Slightly raised sidewalk pads on the four corners.
  const padMat = new THREE.MeshLambertMaterial({ color: 0x7a8290 });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x99a0ac });
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const size = 110;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(size, 0.3, size), padMat);
    pad.position.set(sx * (HALF + size / 2), 0.02, sz * (HALF + size / 2));
    scene.add(pad);
    const curbA = new THREE.Mesh(new THREE.BoxGeometry(size, 0.32, 0.4), curbMat);
    curbA.position.set(sx * (HALF + size / 2), 0.03, sz * (HALF + 0.2));
    scene.add(curbA);
    const curbB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, size), curbMat);
    curbB.position.set(sx * (HALF + 0.2), 0.03, sz * (HALF + size / 2));
    scene.add(curbB);
  }
}

// ------------------------------------------------- crosswalk stripe meshes
const stripeMat = new THREE.MeshLambertMaterial({ color: 0xd9dde2 });
const stripeMeshes = {}; // id -> Mesh

function buildStripeGeometry(cw, w) {
  // Bars span the band width and repeat along the walking direction.
  const positions = [];
  const indices = [];
  const bandCenter = cw.side * (HALF + BAND_GAP + w / 2);
  const y = 0.03;
  let quad = 0;
  for (let k = -HALF + 0.7; k <= HALF - 0.7; k += 1.05) {
    let x0, x1, z0, z1;
    if (cw.axis === 'x') { // walking along z: bars wide in x
      x0 = bandCenter - w / 2 + 0.12; x1 = bandCenter + w / 2 - 0.12;
      z0 = k - 0.24; z1 = k + 0.24;
    } else {
      z0 = bandCenter - w / 2 + 0.12; z1 = bandCenter + w / 2 - 0.12;
      x0 = k - 0.24; x1 = k + 0.24;
    }
    positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    const b = quad * 4;
    indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
    quad++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function refreshCrosswalk(cw, w) {
  const old = stripeMeshes[cw.id];
  if (old) { old.geometry.dispose(); scene.remove(old); }
  const mesh = new THREE.Mesh(buildStripeGeometry(cw, w), stripeMat);
  stripeMeshes[cw.id] = mesh;
  scene.add(mesh);
}

// Diagonal crossing: dotted guide lines along both diagonals (fixed width).
{
  const dotGeo = new THREE.PlaneGeometry(0.55, 0.55);
  const dotMat = new THREE.MeshLambertMaterial({ color: 0xc7ccd4 });
  const tip = HALF - 0.4;
  const len = Math.hypot(tip * 2, tip * 2);
  const group = new THREE.Group();
  for (const [dx, dz] of [[1, 1], [1, -1]]) {
    const ux = dx / Math.SQRT2, uz = dz / Math.SQRT2;
    const px = -uz, pz = ux;
    for (let t = -len / 2 + 0.8; t <= len / 2 - 0.8; t += 1.7) {
      for (const s of [-1, 1]) {
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.rotation.z = Math.PI / 4;
        dot.position.set(
          ux * t + px * s * DIAG_W / 2, 0.035,
          uz * t + pz * s * DIAG_W / 2);
        group.add(dot);
      }
    }
  }
  scene.add(group);
}

// ---------------------------------------------------------------- city ring
{
  const rng = mulberry32(777);
  const windowTextures = [];
  for (let v = 0; v < 3; v++) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, 64, 128);
    for (let yy = 4; yy < 124; yy += 8) {
      for (let xx = 4; xx < 60; xx += 8) {
        if (rng() < 0.55) {
          ctx.fillStyle = rng() < 0.7 ? '#ffd98a' : '#9fd8ff';
          ctx.globalAlpha = 0.5 + rng() * 0.5;
          ctx.fillRect(xx, yy, 5, 5);
          ctx.globalAlpha = 1;
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    windowTextures.push(tex);
  }
  const bodyColors = [0x272c3c, 0x2e3346, 0x232838, 0x323950];
  const ringR = 46;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + 0.19;
    const r = ringR + rng() * 16;
    const bw = 9 + rng() * 8, bh = 14 + rng() * 30, bd = 9 + rng() * 8;
    const tex = windowTextures[i % 3];
    const mat = new THREE.MeshLambertMaterial({
      color: bodyColors[i % 4],
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9,
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    b.position.set(Math.cos(angle) * r, bh / 2, Math.sin(angle) * r);
    b.rotation.y = rng() * 0.4 - 0.2;
    scene.add(b);
  }
  // A few generic glowing billboards for big-city flavour.
  const bbColors = [0xff5f9e, 0x40d9ff, 0xffd54f];
  for (let i = 0; i < 3; i++) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 32;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 32);
    g.addColorStop(0, '#' + bbColors[i].toString(16).padStart(6, '0'));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = 'rgba(20,20,40,0.85)';
    ctx.beginPath(); ctx.arc(16 + i * 14, 16, 8, 0, 7); ctx.fill();
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) });
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat);
    // Keep billboards on the far side, away from the fixed camera quadrant.
    const ang = Math.PI * 1.05 + i * 0.85;
    bb.position.set(Math.cos(ang) * 46, 16 + i * 5, Math.sin(ang) * 46);
    bb.lookAt(0, 8, 0);
    scene.add(bb);
  }
}

// ------------------------------------------------------------ signal posts
const lampOnGreen = new THREE.MeshBasicMaterial({ color: 0x2aff7a });
const lampOffGreen = new THREE.MeshLambertMaterial({ color: 0x0d3a1e });
const lampOnRed = new THREE.MeshBasicMaterial({ color: 0xff4a3c });
const lampOffRed = new THREE.MeshLambertMaterial({ color: 0x401210 });
const redLamps = [], greenLamps = [];
{
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c414c });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x22252c });
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.4, 8);
  const headGeo = new THREE.BoxGeometry(0.9, 1.7, 0.5);
  const lampGeo = new THREE.SphereGeometry(0.26, 10, 8);
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2.2;
    g.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 4.6;
    g.add(head);
    const red = new THREE.Mesh(lampGeo, lampOnRed);
    red.position.set(0, 5.0, 0.28);
    const green = new THREE.Mesh(lampGeo, lampOffGreen);
    green.position.set(0, 4.25, 0.28);
    g.add(red); g.add(green);
    redLamps.push(red); greenLamps.push(green);
    g.position.set(sx * (HALF + 1.6), 0, sz * (HALF + 1.6));
    g.lookAt(0, 0, 0);
    scene.add(g);
  }
}

function updateSignalLamps(light, time) {
  const flashOn = Math.floor(time * 4) % 2 === 0;
  for (let i = 0; i < 4; i++) {
    if (light === 'red') {
      redLamps[i].material = lampOnRed;
      greenLamps[i].material = lampOffGreen;
    } else if (light === 'green') {
      redLamps[i].material = lampOffRed;
      greenLamps[i].material = lampOnGreen;
    } else { // flash
      redLamps[i].material = lampOffRed;
      greenLamps[i].material = flashOn ? lampOnGreen : lampOffGreen;
    }
  }
}

// ---------------------------------------------------------------- the sim
const sim = createSim({ seed: SEED, agentCount: AGENTS, instantGather: E2E });

// ---------------------------------------------------------------- crowd
const N = sim.agents.length;
const bodyGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.95, 6);
const headGeo = new THREE.SphereGeometry(0.21, 8, 6);
const hatGeo = new THREE.ConeGeometry(0.26, 0.3, 7);
const shadowGeo = new THREE.CircleGeometry(0.42, 10);

const bodyMesh = new THREE.InstancedMesh(
  bodyGeo, new THREE.MeshLambertMaterial(), N);
const headMesh = new THREE.InstancedMesh(
  headGeo, new THREE.MeshLambertMaterial(), N);
const hatAgents = sim.agents.filter(a => a.hat);
const hatMesh = new THREE.InstancedMesh(
  hatGeo, new THREE.MeshLambertMaterial(), Math.max(1, hatAgents.length));
const shadowMesh = new THREE.InstancedMesh(
  shadowGeo,
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  N);
for (const m of [bodyMesh, headMesh, hatMesh, shadowMesh]) {
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
}
{
  const c = new THREE.Color();
  sim.agents.forEach((a, i) => {
    bodyMesh.setColorAt(i, c.setHex(a.shirt));
    headMesh.setColorAt(i, c.setHex(a.skin));
  });
  hatAgents.forEach((a, i) => hatMesh.setColorAt(i, c.setHex(a.hat)));
  bodyMesh.instanceColor.needsUpdate = true;
  headMesh.instanceColor.needsUpdate = true;
  if (hatAgents.length) hatMesh.instanceColor.needsUpdate = true;
}

hatMesh.count = hatAgents.length;

const walkPhases = new Float32Array(N);
const dummy = new THREE.Object3D();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Sidewalk pads are raised; blend people up onto them near the curb.
function groundHeight(x, z) {
  const d = Math.min(Math.abs(x) - HALF, Math.abs(z) - HALF);
  if (d <= 0) return 0;
  return 0.17 * Math.min(1, d / 0.6);
}

function updateCrowd(dt, time) {
  let hatIdx = 0;
  for (let i = 0; i < N; i++) {
    const a = sim.agents[i];
    const speedNorm = Math.min(1, a.speed / 1.25);
    walkPhases[i] += a.speed * 6.2 * dt;
    const bob = Math.abs(Math.sin(walkPhases[i] + a.wobblePhase)) * 0.08 * speedNorm;
    const sway = Math.sin(walkPhases[i] + a.wobblePhase) * 0.07 * speedNorm;
    const oops = Math.sin(time * 11 + a.wobblePhase * 3) * 0.3 * a.squeeze;
    const idle = a.speed < 0.1 ? Math.sin(time * 2.1 + a.wobblePhase) * 0.03 : 0;

    const gy = groundHeight(a.x, a.z);
    euler.set(0.1 * speedNorm, a.heading, sway + oops + idle);
    dummy.quaternion.setFromEuler(euler);
    dummy.scale.setScalar(a.scale);

    dummy.position.set(a.x, gy + 0.78 * a.scale + bob, a.z);
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(a.x, gy + 1.45 * a.scale + bob * 1.15, a.z);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);

    if (a.hat) {
      dummy.position.set(a.x, gy + 1.68 * a.scale + bob * 1.15, a.z);
      dummy.updateMatrix();
      hatMesh.setMatrixAt(hatIdx++, dummy.matrix);
    }

    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.position.set(a.x, gy + 0.055, a.z);
    dummy.scale.setScalar(a.scale);
    dummy.updateMatrix();
    shadowMesh.setMatrixAt(i, dummy.matrix);
  }
  bodyMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  hatMesh.instanceMatrix.needsUpdate = true;
  shadowMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------- density heat
const HEAT_N = 20, HEAT_EXTENT = 20;
const heatCounts = new Float32Array(HEAT_N * HEAT_N);
const heatValues = new Float32Array(HEAT_N * HEAT_N);
const heatGeo = new THREE.PlaneGeometry(
  HEAT_EXTENT * 2, HEAT_EXTENT * 2, HEAT_N - 1, HEAT_N - 1);
heatGeo.rotateX(-Math.PI / 2);
{
  const colors = new Float32Array(heatGeo.attributes.position.count * 3);
  heatGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const heatMesh = new THREE.Mesh(heatGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false, opacity: 0.85,
}));
heatMesh.position.y = 0.1;
scene.add(heatMesh);

let heatFrame = 0;
function updateHeat() {
  if (++heatFrame % 5 !== 0) return;
  sim.sampleDensity(heatCounts, HEAT_N, HEAT_EXTENT);
  const colors = heatGeo.attributes.color.array;
  for (let i = 0; i < heatValues.length; i++) {
    const cur = Math.min(1, Math.max(0, (heatCounts[i] - 2) / 5));
    heatValues[i] = Math.max(cur, heatValues[i] * 0.9);
    const v = heatValues[i];
    colors[i * 3] = v * 0.85;
    colors[i * 3 + 1] = v * 0.16;
    colors[i * 3 + 2] = v * 0.05;
  }
  heatGeo.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------- drag handles
const handleGroup = new THREE.Group();
scene.add(handleGroup);
const handles = []; // { cw, mesh }
{
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#2b6cb0';
  ctx.font = '900 84px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⇔', 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  for (const cw of CROSSWALKS) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95 }));
    disc.rotation.x = -Math.PI / 2;
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    icon.rotation.x = -Math.PI / 2;
    icon.position.y = 0.02;
    // Arrows point along the drag axis.
    if (cw.axis === 'z') { disc.rotation.z = 0; icon.rotation.z = Math.PI / 2; }
    g.add(disc); g.add(icon);
    g.position.y = 0.25;
    handleGroup.add(g);
    handles.push({ cw, mesh: g });
  }
}

function handleAnchor(cw, w) {
  const d = HALF + BAND_GAP + w + 1.6;
  if (cw.axis === 'x') return { x: cw.side * d, z: 0 };
  return { x: 0, z: cw.side * d };
}

function layoutHandles() {
  for (const h of handles) {
    const w = sim.cfg.crosswalkWidths[h.cw.id];
    const p = handleAnchor(h.cw, w);
    h.mesh.position.x = p.x;
    h.mesh.position.z = p.z;
  }
}

for (const cw of CROSSWALKS) refreshCrosswalk(cw, sim.cfg.crosswalkWidths[cw.id]);
layoutHandles();

// ------------------------------------------------------------------ camera
const AZIMUTH = Math.PI / 4;
const cam = { dist: 60, el: 0.92, targetY: 0, shake: 0 };
const camGoal = { dist: 60, el: 0.92, targetY: 0 };

function fitDistance() {
  // Vertically we want the whole scene incl. corners; horizontally it is
  // enough to fit the crowd area, so portrait screens do not zoom out to a
  // dot just to show the outer sidewalks.
  const v = THREE.MathUtils.degToRad(camera.fov / 2);
  const t = Math.tan(v);
  const dh = ((HALF + CROSSWALK_MAX + 14) * 0.82) / t;
  const dw = (HALF + CROSSWALK_MAX + 7) / (t * camera.aspect);
  return Math.max(dh, dw) * 0.95;
}

let greenBurstUntil = -1;
function directCamera(dt, time) {
  const fit = fitDistance();
  const editing = paused || sim.state === 'done';
  if (editing) {
    camGoal.el = 1.05; camGoal.dist = fit * 0.98;
  } else if (sim.state === 'crossing' || sim.state === 'clearing') {
    if (time < greenBurstUntil) {
      camGoal.el = 0.9; camGoal.dist = fit * 1.12;
    } else if (sim.jamNow > 24) {
      camGoal.el = 0.82; camGoal.dist = fit * 0.72;
    } else {
      camGoal.el = 0.9; camGoal.dist = fit * 0.95;
    }
  } else {
    camGoal.el = 0.92; camGoal.dist = fit;
  }
  const k = 1 - Math.exp(-dt / 1.1);
  cam.dist += (camGoal.dist - cam.dist) * k;
  cam.el += (camGoal.el - cam.el) * k;

  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  camera.position.set(
    Math.sin(AZIMUTH) * ce * cam.dist,
    se * cam.dist,
    Math.cos(AZIMUTH) * ce * cam.dist);
  camera.lookAt(0, 0, 0);
  scene.fog.near = cam.dist * 0.85;
  scene.fog.far = cam.dist * 2.6;
}

// ---------------------------------------------------------------- audio
let audio = null;
function initAudio() {
  if (audio || E2E) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio = ctx;
  } catch (e) { /* no audio */ }
}
function beep(freq, dur, delay = 0, type = 'sine', gain = 0.12) {
  if (!audio) return;
  const t = audio.currentTime + delay;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(t); o.stop(t + dur);
}
const sounds = {
  go() { beep(880, 0.12); beep(1320, 0.18, 0.13); },
  chirp() { beep(1760, 0.07, 0, 'sine', 0.05); },
  click() { beep(440, 0.05, 0, 'square', 0.06); },
  done() { beep(660, 0.15); beep(880, 0.2, 0.14); },
  cheer() { beep(660, 0.12); beep(880, 0.12, 0.11); beep(1100, 0.12, 0.22); beep(1320, 0.3, 0.33); },
};

// ------------------------------------------------------------------- UI
const bubble = document.getElementById('bubble');
const goBtn = document.getElementById('goBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const lenBtn = document.getElementById('lenBtn');
const lenLabel = document.getElementById('lenLabel');
const startOverlay = document.getElementById('start');
const startBtn = document.getElementById('startBtn');

let paused = false;
let started = false;
let msgTimer = 0;
let jamMsgShownThisRun = false;
let needsReset = false;

function showMsg(text, dur = 3) {
  bubble.textContent = text;
  bubble.classList.add('show');
  msgTimer = dur;
}

function updateButtons() {
  const canGo = !paused && sim.light === 'red' &&
    (sim.state === 'ready' || sim.state === 'gather');
  goBtn.classList.toggle('red', sim.light === 'red');
  goBtn.classList.toggle('green', sim.light !== 'red');
  goBtn.classList.toggle('pulse', canGo && sim.state === 'ready' && !needsReset);
  goBtn.disabled = !canGo;
  resetBtn.classList.toggle('pulse', needsReset || sim.state === 'done');
  pauseBtn.querySelector('.ico').textContent = paused ? '▶️' : '⏸️';
  pauseBtn.querySelector('span:last-child').textContent = paused ? 'うごく' : 'とめる';
  handleGroup.visible = paused || sim.state === 'done' || sim.state === 'ready';
}

goBtn.addEventListener('click', () => {
  if (sim.pressGo()) sounds.go();
});
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  sounds.click();
  if (paused) showMsg('とめたよ。みちを かえてみる？', 3.5);
});
resetBtn.addEventListener('click', () => {
  sounds.click();
  doReset();
});
lenBtn.addEventListener('click', () => {
  sounds.click();
  const nowLong = sim.cfg.greenDuration < GREEN_LONG;
  sim.setGreenDuration(nowLong ? GREEN_LONG : GREEN_SHORT);
  lenBtn.classList.toggle('long', nowLong);
  lenLabel.textContent = nowLong ? 'ながい' : 'みじかい';
  showMsg(nowLong ? 'あおが ながくなるよ!' : 'あおが みじかくなるよ!', 2.5);
  markChanged();
});

function markChanged() {
  if (sim.state === 'ready') {
    sim.reset(); // re-snap the waiting crowd to the new layout
  } else if (sim.state !== 'gather') {
    needsReset = true;
  }
}

function doReset() {
  paused = false;
  needsReset = false;
  jamMsgShownThisRun = false;
  sim.reset();
  heatValues.fill(0);
  showMsg('みんな もどったよ。しんごうを おしてね!', 3);
}

// sim events -> messages
sim.onEvent = (name, payload) => {
  if (name === 'ready') {
    showMsg('しんごうを おしてね!', 4);
  } else if (name === 'green') {
    jamMsgShownThisRun = false;
    greenBurstUntil = perfTime + 2.6;
    showMsg('あおだよ! みんな いっせいに!', 3);
  } else if (name === 'flash') {
    showMsg('チカチカ! いそげ〜!', 2.5);
    sounds.chirp();
  } else if (name === 'red') {
    if (sim.agents.some(a => a.phase === 'wait')) {
      showMsg('あかに なっちゃった…', 2.5);
    }
  } else if (name === 'runEnd') {
    onRunEnd(payload);
  }
};

function onRunEnd(m) {
  sounds.done();
  const base = sim.baselineRun;
  const isBaseline = base === m;
  setTimeout(() => {
    if (isBaseline) {
      if (m.leftBehind > 5) {
        showMsg(`わたれなかった ひとが いるね…`, 3.2);
        setTimeout(() => showMsg('みちを かえてみよう!', 4), 3400);
      } else if (m.jamSum > 250) {
        showMsg('ぎゅうぎゅうだったね…', 3);
        setTimeout(() => showMsg('みちを かえてみよう!', 4), 3200);
      } else {
        showMsg('わたりきったね! みちを かえると どうなる?', 4.5);
      }
    } else {
      const smoother = m.jamSum < base.jamSum * 0.65;
      const savedAll = m.leftBehind === 0 && base.leftBehind > 5;
      if (savedAll && smoother) {
        sounds.cheer();
        showMsg('スイスイ! みんな わたれたよ! 🎉', 4.5);
      } else if (savedAll) {
        sounds.cheer();
        showMsg('みんな わたれたよ! 🎉', 4);
      } else if (smoother) {
        sounds.cheer();
        showMsg('こんどは スイスイ だったね!', 4);
      } else if (m.leftBehind < base.leftBehind) {
        showMsg('さっきより ちょっと よくなった!', 4);
      } else {
        showMsg('まだ ぎゅうぎゅう… べつのところを かえてみる?', 4.5);
      }
      setTimeout(() => showMsg('もういっかい ためしてみよう!', 3.5), 4700);
    }
  }, 600);
}

// ------------------------------------------------------------ handle drag
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
const hitPoint = new THREE.Vector3();
let dragging = null; // crosswalk being dragged

function pointerRay(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x, y }, camera);
  return raycaster.ray.intersectPlane(groundPlane, hitPoint);
}

canvas.addEventListener('pointerdown', (ev) => {
  if (!handleGroup.visible) return;
  if (!pointerRay(ev)) return;
  for (const h of handles) {
    const dx = hitPoint.x - h.mesh.position.x;
    const dz = hitPoint.z - h.mesh.position.z;
    if (Math.hypot(dx, dz) < 3.2) {
      dragging = h.cw;
      canvas.setPointerCapture(ev.pointerId);
      sounds.click();
      break;
    }
  }
});

canvas.addEventListener('pointermove', (ev) => {
  if (!dragging || !pointerRay(ev)) return;
  const c = dragging.axis === 'x' ? hitPoint.x * dragging.side : hitPoint.z * dragging.side;
  const w = Math.min(CROSSWALK_MAX, Math.max(CROSSWALK_MIN, c - HALF - BAND_GAP - 1.6));
  if (Math.abs(w - sim.cfg.crosswalkWidths[dragging.id]) > 0.05) {
    sim.setCrosswalkWidth(dragging.id, w);
    refreshCrosswalk(dragging, sim.cfg.crosswalkWidths[dragging.id]);
    layoutHandles();
  }
});

function endDrag() {
  if (!dragging) return;
  dragging = null;
  const w = Object.values(sim.cfg.crosswalkWidths);
  if (Math.max(...w) > CROSSWALK_MIN + 1) {
    showMsg('みちが ひろくなった!', 2.5);
  }
  markChanged();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ------------------------------------------------------------------ start
function begin() {
  if (started) return;
  started = true;
  initAudio();
  startOverlay.classList.add('hidden');
  if (!E2E) showMsg('ひとが あつまってきたよ…', 4);
}
startBtn.addEventListener('click', begin);
if (E2E) begin();

// ------------------------------------------------------------------ loop
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

let perfTime = 0;
let lastT = performance.now();
let frames = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  perfTime += dt;
  frames++;

  if (started && !paused) sim.step(dt);

  // watch for jams mid-run
  if (sim.state === 'crossing' && sim.jamNow > 26 && !jamMsgShownThisRun) {
    jamMsgShownThisRun = true;
    showMsg('ぎゅうぎゅうだね…', 3);
  }

  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) bubble.classList.remove('show');
  }

  // pulse the handles gently
  if (handleGroup.visible) {
    const s = 1 + Math.sin(perfTime * 3) * 0.06;
    for (const h of handles) h.mesh.scale.setScalar(s);
  }

  updateSignalLamps(sim.light, perfTime);
  updateCrowd(dt, perfTime);
  updateHeat();
  directCamera(dt, perfTime);
  updateButtons();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ------------------------------------------------------------- test hooks
window.__game = {
  sim,
  get frames() { return frames; },
  state: () => sim.state,
  light: () => sim.light,
  pressGo: () => sim.pressGo(),
  reset: () => doReset(),
  stepSeconds: (s) => sim.stepSeconds(s),
  setWidthAll: (w) => {
    for (const cw of CROSSWALKS) {
      sim.setCrosswalkWidth(cw.id, w);
      refreshCrosswalk(cw, sim.cfg.crosswalkWidths[cw.id]);
    }
    layoutHandles();
    markChanged();
  },
  setGreen: (s) => { sim.setGreenDuration(s); markChanged(); },
  metrics: () => sim.lastRun,
  agentCount: () => sim.agents.length,
  // Screen position of a crosswalk handle plus the outward drag direction,
  // for driving pointer-based tests.
  __project: (id) => {
    const h = handles.find(hh => hh.cw.id === id);
    if (!h) return null;
    const rect = canvas.getBoundingClientRect();
    const toScreen = (wx, wz) => {
      const v = new THREE.Vector3(wx, 0.25, wz).project(camera);
      return {
        x: (v.x + 1) / 2 * rect.width + rect.left,
        y: (-v.y + 1) / 2 * rect.height + rect.top,
      };
    };
    const w = sim.cfg.crosswalkWidths[h.cw.id];
    const p1 = toScreen(h.mesh.position.x, h.mesh.position.z);
    const pOut = handleAnchor(h.cw, w + 3);
    const p2 = toScreen(pOut.x, pOut.z);
    const dl = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    return { x: p1.x, y: p1.y, dx: (p2.x - p1.x) / dl, dy: (p2.y - p1.y) / dl };
  },
};
