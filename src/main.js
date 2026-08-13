import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, damp, easeInOut, easeOut } from './util.js';
import { buildEnvironment, LAYOUT } from './environment.js';
import { makePiece, Anodizer } from './pieces.js';
import { makeWaterSurface, makeWaterVolume, makeBubbles, DripSystem, makeSparkles } from './water.js';
import { GameAudio } from './audio.js';

const L = LAYOUT;

/* ---------------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setTimeout(() => location.reload(), 300);
});

const scene = new THREE.Scene();
const FOG_DAY = new THREE.Color(0x151b21);
const FOG_NIGHT = new THREE.Color(0x04060a);
scene.fog = new THREE.Fog(FOG_DAY.clone(), 4.5, 10.5);
scene.background = scene.fog.color;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.0;

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 24);

/* ------------------------------------------------------------------ lights */
const hemi = new THREE.HemisphereLight(0x9fb4c6, 0x3a352c, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
key.position.set(-2.6, 2.7, 1.7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 9;
key.shadow.camera.left = -2.4;
key.shadow.camera.right = 3.0;
key.shadow.camera.top = 2.6;
key.shadow.camera.bottom = -0.6;
key.shadow.bias = -0.0015;
key.target.position.set(0.5, 0.7, -0.7);
scene.add(key, key.target);

const lampPoint = new THREE.PointLight(0xffd9a0, 9, 6, 2);
lampPoint.position.set(1.1, 2.32, -0.5);
scene.add(lampPoint);

// task light over the bath so the growing colour reads clearly underwater
const tankLight = new THREE.PointLight(0xfff4e0, 2.4, 2.6, 2);
tankLight.position.set(L.tank.cx, 1.78, L.tank.cz + 0.18);
scene.add(tankLight);

const spot = new THREE.SpotLight(0xf2f6ff, 0, 6, 0.34, 0.7, 1.4);
spot.position.set(L.pedestal.cx, 2.35, L.pedestal.cz + 0.85);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.002;
spot.target.position.set(L.pedestal.cx, L.pedestal.topY, L.pedestal.cz);
scene.add(spot, spot.target);

// faint warm glow for the collection shelf in gallery mode
const shelfGlow = new THREE.PointLight(0xffe2b8, 0, 1.6, 2);
shelfGlow.position.set(L.pedestal.cx + 0.52, 1.35, L.pedestal.cz + 0.25);
scene.add(shelfGlow);

/* ------------------------------------------------------------ environment */
const env = buildEnvironment(scene);

// water
const T = L.tank, wt = T.wall;
const innerW = T.w - wt * 2 - 0.005, innerD = T.d - wt * 2 - 0.005;
const waterSurface = makeWaterSurface(innerW, innerD);
waterSurface.position.set(T.cx, L.waterY, T.cz);
scene.add(waterSurface);
const waterUni = waterSurface.userData.uniforms;

const waterVolume = makeWaterVolume(innerW, L.waterY - L.benchTop - wt, innerD);
waterVolume.position.set(T.cx, (L.waterY + L.benchTop + wt) / 2, T.cz);
scene.add(waterVolume);

const bubbles = makeBubbles(320);
scene.add(bubbles);
const bubbleUni = bubbles.userData.uniforms;
bubbleUni.uWaterY.value = L.waterY - 0.008;

const ambientBubbles = makeBubbles(90);
scene.add(ambientBubbles);
const ambUni = ambientBubbles.userData.uniforms;
ambUni.uWaterY.value = L.waterY - 0.008;
ambUni.uOrigin.value.set(T.cx - T.w / 2 + 0.07, L.benchTop + 0.06, T.cz);
ambUni.uIntensity.value = 0.14;

const drips = new DripSystem(scene, L.waterY);
const audio = new GameAudio();
drips.onSplash = () => audio.drip();

const sparkles = makeSparkles();
sparkles.visible = false;
scene.add(sparkles);

/* ------------------------------------------------------------------- state */
let state = 'pick';          // pick | dip | anodize | raise | display | reset
let trayPieces = [];
let piece = null;            // the chosen charm (group)
let anodizer = null;
let attached = false;
let held = false;
let dragging = false;
let mood = 0, moodTarget = 0; // 0 workshop, 1 dark gallery
let sway = 0, swayVel = 0;
let prevCarX = 0, carVX = 0;
let lastInteract = performance.now() / 1000;
let sinceDisplay = 0;
const collection = [];

const PIECE_HANG = 0.155;    // eyelet sits this far under the hook origin
const dropFor = (eyeletY) => L.railY - PIECE_HANG - eyeletY;
const TRAY_EYELET_Y = L.benchTop + 0.125;
const DIP_EYELET_Y = L.waterY - 0.16;
const EASEL_EYELET_Y = L.pedestal.topY + 0.150;

let hookDrop = 0.35;
env.setHookDrop(hookDrop);

function spawnTrayPieces() {
  for (const p of trayPieces) scene.remove(p);
  trayPieces = [];
  for (let k = 0; k < 3; k++) {
    const p = makePiece(k, 1.35);
    p.position.set(L.tray.cx + env.standXs[k], TRAY_EYELET_Y, L.tray.cz + 0.02);
    p.rotation.x = -0.10;
    p.rotation.y = (k - 1) * 0.12;
    scene.add(p);
    trayPieces.push(p);
  }
}
spawnTrayPieces();

/* ------------------------------------------------------------ camera poses */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const POSES = {
  pick: {
    l: { pos: V(-0.60, 1.13, 0.34), tgt: V(-0.66, 0.94, -0.60), fov: 42 },
    p: { pos: V(-0.64, 1.22, 0.62), tgt: V(-0.66, 0.93, -0.60), fov: 52 },
  },
  anodize: {
    l: { pos: V(0.48, 1.28, 0.70), tgt: V(0.25, 1.03, -0.70), fov: 46 },
    p: { pos: V(0.40, 1.34, 0.96), tgt: V(0.25, 1.02, -0.70), fov: 52 },
  },
  display: {
    l: { pos: V(2.00, 1.16, 0.22), tgt: V(2.05, 1.08, -0.70), fov: 42 },
    p: { pos: V(2.04, 1.17, 0.16), tgt: V(2.05, 1.10, -0.70), fov: 46 },
  },
};
let poseName = 'pick';
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
let camFov = 46;
function desiredPose() {
  const aspect = window.innerWidth / window.innerHeight;
  return POSES[poseName][aspect < 1.0 ? 'p' : 'l'];
}
{
  const d = desiredPose();
  camPos.copy(d.pos); camTgt.copy(d.tgt); camFov = d.fov;
}

/* -------------------------------------------------------------- sequencer */
class Seq {
  constructor() { this.steps = []; this.i = 0; this.t = 0; this.done = true; this.onDone = null; }
  start(steps, onDone) {
    this.steps = steps; this.i = 0; this.t = 0; this.done = false; this.onDone = onDone;
    if (steps[0] && steps[0].begin) steps[0].begin();
  }
  update(dt) {
    if (this.done) return;
    const s = this.steps[this.i];
    this.t += dt;
    const k = Math.min(1, this.t / s.dur);
    if (s.update) s.update(k);
    if (k >= 1) {
      if (s.end) s.end();
      this.i++; this.t = 0;
      if (this.i >= this.steps.length) {
        this.done = true;
        if (this.onDone) this.onDone();
      } else if (this.steps[this.i].begin) this.steps[this.i].begin();
    }
  }
}
const seq = new Seq();

let rippleUVTarget = new THREE.Vector2(0.5, 0.5);
function triggerRipple(worldX, worldZ) {
  rippleUVTarget.set(
    clamp((worldX - (T.cx - innerW / 2)) / innerW, 0, 1),
    clamp(1 - (worldZ - (T.cz - innerD / 2)) / innerD, 0, 1)
  );
  waterUni.uRippleCenter.value.copy(rippleUVTarget);
  waterUni.uRippleT.value = 0;
}

function startDip(index) {
  const chosen = trayPieces[index];
  piece = chosen;
  anodizer = new Anodizer(piece.userData.mat);
  state = 'dip';
  hideHint(true);
  audio.click();

  const startX = env.carriage.position.x;
  const px = piece.position.x;
  const d0 = hookDrop;
  const dPick = dropFor(TRAY_EYELET_Y + 0.004);
  const dLift = dPick - 0.32;
  const dDip = dropFor(DIP_EYELET_Y);
  let splashDone = false;

  seq.start([
    { dur: 0.9, update: (k) => { env.carriage.position.x = lerp(startX, px, easeInOut(k)); } },
    { dur: 1.0, update: (k) => { setDrop(lerp(d0, dPick, easeInOut(k))); } },
    {
      dur: 0.3,
      end: () => { attached = true; env.hangWire.visible = true; audio.click(); },
    },
    { dur: 0.8, update: (k) => { setDrop(lerp(dPick, dLift, easeOut(k))); } },
    {
      dur: 1.7,
      begin: () => { poseName = 'anodize'; },
      update: (k) => { env.carriage.position.x = lerp(px, T.cx, easeInOut(k)); },
    },
    {
      dur: 2.2,
      update: (k) => {
        setDrop(lerp(dLift, dDip, easeInOut(k)));
        const eyeY = L.railY - PIECE_HANG - hookDrop;
        if (!splashDone && eyeY - 0.02 < L.waterY) {
          splashDone = true;
          audio.splash();
          triggerRipple(T.cx, T.cz);
        }
      },
    },
    { dur: 0.35 },
  ], () => { state = 'anodize'; lastInteract = now(); });
}

function startRaise() {
  state = 'raise';
  held = false;
  hideHint(true);
  btnRaise.classList.remove('show');
  audio.click();

  const dNow = hookDrop;
  const dUp = 0.42;
  const dEasel = dropFor(EASEL_EYELET_Y);
  let dripT = 0;

  seq.start([
    {
      dur: 1.9,
      update: (k) => {
        setDrop(lerp(dNow, dUp, easeInOut(k)));
        const eyeY = L.railY - PIECE_HANG - hookDrop;
        if (eyeY - 0.10 > L.waterY && piece) {
          const c = new THREE.Vector3();
          piece.userData.body.getWorldPosition(c);
          drips.emitFrom(c, 0.04, 26, 1 / 60);
        }
      },
      begin: () => { triggerRipple(T.cx, T.cz); audio.splash(); },
    },
    {
      dur: 0.9,
      update: () => {
        if (piece) {
          const c = new THREE.Vector3();
          piece.userData.body.getWorldPosition(c);
          drips.emitFrom(c, 0.04, 10, 1 / 60);
        }
      },
    },
    {
      dur: 2.3,
      begin: () => { poseName = 'display'; moodTarget = 1; },
      update: (k) => { env.carriage.position.x = lerp(T.cx, L.pedestal.cx, easeInOut(k)); },
    },
    { dur: 1.3, update: (k) => { setDrop(lerp(dUp, dEasel, easeInOut(k))); } },
    {
      dur: 0.4,
      end: () => {
        attached = false;
        env.hangWire.visible = false;
        placeOnEasel();
        audio.chime();
      },
    },
    { dur: 0.9, update: (k) => { setDrop(lerp(dEasel, 0.32, easeOut(k))); } },
  ], () => { state = 'display'; sinceDisplay = 0; lastInteract = now(); });
}

const displayHolder = new THREE.Group();
scene.add(displayHolder);
let dispYaw = 0, dispPitch = 0, dispYawV = 0, dispPitchV = 0;

function placeOnEasel() {
  displayHolder.position.set(L.pedestal.cx, L.pedestal.topY + 0.012, L.pedestal.cz + 0.03);
  displayHolder.rotation.set(0, 0, 0);
  dispYaw = 0; dispPitch = 0; dispYawV = 0; dispPitchV = 0;
  scene.remove(piece);
  displayHolder.add(piece);
  piece.position.set(0, 0.145, 0.012);
  piece.rotation.set(-0.32, 0, 0);
  sparkles.position.copy(displayHolder.position).add(new THREE.Vector3(0, 0.10, 0.05));
  sparkles.visible = true;
}

function startAgain() {
  state = 'reset';
  btnAgain.classList.remove('show');
  hideHint(true);
  audio.click();

  // move the finished charm to the collection shelf
  const finished = piece;
  piece = null;
  const from = new THREE.Vector3();
  finished.getWorldPosition(from);
  const fromQ = finished.getWorldQuaternion(new THREE.Quaternion());
  displayHolder.remove(finished);
  scene.add(finished);
  finished.position.copy(from);
  finished.quaternion.copy(fromQ);
  const spotIdx = collection.length % env.collectionSpots.length;
  if (collection.length >= env.collectionSpots.length) {
    const old = collection[collection.length - env.collectionSpots.length];
    scene.remove(old);
  }
  collection.push(finished);
  const to = env.collectionSpots[spotIdx];
  const toRot = new THREE.Euler(-0.25, -0.5 + spotIdx * 0.35, 0);
  const toQ = new THREE.Quaternion().setFromEuler(toRot);

  const carX = env.carriage.position.x;

  seq.start([
    {
      dur: 1.2,
      begin: () => { moodTarget = 0; sparkles.visible = false; },
      update: (k) => {
        const e = easeInOut(k);
        finished.position.lerpVectors(from, new THREE.Vector3(to.x, to.y + 0.12 * Math.sin(Math.PI * e), to.z), e);
        finished.quaternion.slerpQuaternions(fromQ, toQ, e);
      },
      end: () => { finished.position.copy(to); },
    },
    {
      dur: 1.6,
      begin: () => { poseName = 'pick'; spawnTrayPieces(); },
      update: (k) => { env.carriage.position.x = lerp(carX, L.tray.cx, easeInOut(k)); },
    },
  ], () => { state = 'pick'; lastInteract = now(); });
}

function setDrop(d) {
  hookDrop = d;
  env.setHookDrop(d);
}

/* ------------------------------------------------------------------- input */
const raycaster = new THREE.Raycaster();
const btnRaise = document.getElementById('btnRaise');
const btnAgain = document.getElementById('btnAgain');
const hintEl = document.getElementById('hint');

btnRaise.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.ensure();
  if (state === 'anodize') startRaise();
});
btnAgain.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  audio.ensure();
  if (state === 'display') startAgain();
});

let activePointer = null;
let lastPX = 0, lastPY = 0;

function now() { return performance.now() / 1000; }

function pickAt(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(trayPieces, true);
  if (hits.length > 0) {
    let g = hits[0].object;
    while (g.parent && !trayPieces.includes(g)) g = g.parent;
    const idx = trayPieces.indexOf(g);
    if (idx >= 0) return idx;
  }
  // generous fallback: nearest projected piece centre within 70 px
  let best = -1, bestD = 70;
  trayPieces.forEach((p, i) => {
    const s = worldToScreen(p.position.clone().add(new THREE.Vector3(0, -0.05, 0)));
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

window.addEventListener('pointerdown', (e) => {
  if (e.target !== renderer.domElement) return;
  audio.ensure();
  lastInteract = now();
  hideHint();
  if (activePointer !== null) return;
  activePointer = e.pointerId;
  lastPX = e.clientX; lastPY = e.clientY;

  if (state === 'pick') {
    const idx = pickAt(e.clientX, e.clientY);
    if (idx >= 0) startDip(idx);
  } else if (state === 'anodize') {
    held = true;
  } else if (state === 'display') {
    dragging = true;
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer) return;
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
  lastPX = e.clientX; lastPY = e.clientY;
  if (state === 'display' && dragging) {
    lastInteract = now();
    dispYawV += dx * 0.0009;
    dispPitchV += dy * 0.0007;
  }
});
const releasePointer = (e) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  held = false;
  dragging = false;
};
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('contextmenu', (e) => e.preventDefault());

/* -------------------------------------------------------------------- hint */
let hintAnchor = null;
let hintMode = '';
function showHint(mode, anchor) {
  hintMode = mode;
  hintAnchor = anchor;
  hintEl.className = 'show ' + mode;
}
function hideHint(force) {
  hintEl.className = '';
  hintAnchor = null;
  if (!force) lastInteract = now();
}
function worldToScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, behind: p.z > 1 };
}
function updateHint() {
  const idle = now() - lastInteract;
  if (seq.done === false || idle < 3.5) { if (hintAnchor) hideHint(true); return; }
  if (!hintAnchor) {
    if (state === 'pick' && trayPieces[1]) {
      showHint('tap', () => trayPieces[1].position.clone().add(new THREE.Vector3(0, -0.05, 0)));
    } else if (state === 'anodize' && !held) {
      showHint('hold', () => env.leverKnob.getWorldPosition(new THREE.Vector3()));
    } else if (state === 'display') {
      showHint('drag', () => displayHolder.position.clone().add(new THREE.Vector3(0, 0.09, 0.05)));
    }
  }
  if (hintAnchor) {
    const s = worldToScreen(hintAnchor());
    hintEl.style.left = s.x + 'px';
    hintEl.style.top = s.y + 'px';
  }
}

/* ------------------------------------------------------------------ resize */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 60));

/* -------------------------------------------------------------- main loop */
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
let timeScale = 1;

function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * timeScale;
  const t = clock.elapsedTime;

  seq.update(dt);

  /* carriage velocity + hanging sway */
  const carX = env.carriage.position.x;
  carVX = dt > 0 ? (carX - prevCarX) / dt : 0;
  prevCarX = carX;
  const swayTarget = clamp(-carVX * 0.9, -0.3, 0.3);
  swayVel += (swayTarget - sway) * 26 * dt;
  swayVel *= Math.exp(-3.4 * dt);
  sway += swayVel * dt;

  /* piece follows the hook while attached */
  if (piece && attached) {
    env.hookBody.getWorldPosition(tmpV);
    piece.position.set(tmpV.x, tmpV.y - PIECE_HANG + 0.0, tmpV.z);
    piece.rotation.z = sway;
    piece.rotation.y = damp(piece.rotation.y, 0, 2, dt);
    piece.rotation.x = damp(piece.rotation.x, 0, 3, dt);
  }

  /* anodizing */
  const overTank = piece && Math.abs(piece.position.x - T.cx) < 0.3 && Math.abs(piece.position.z - T.cz) < 0.2;
  if (piece) {
    piece.userData.mat.userData.waterUniforms.uWaterY.value = overTank ? L.waterY : -100;
  }
  let processing = false;
  if (state === 'anodize' && held && anodizer) {
    anodizer.grow(dt, 12);
    processing = true;
  }
  audio.setProcess(processing);
  env.indicatorMat.emissive.setHex(processing ? 0xffa218 : 0x000000);
  env.indicatorMat.color.setHex(processing ? 0xffb040 : 0x53340f);

  /* wetness: submerged or fresh out of the bath */
  if (anodizer && piece) {
    const eyeY = piece.position.y;
    const submerged = overTank && eyeY - 0.05 < L.waterY;
    const wetTarget = submerged || state === 'raise' ? 1 : (state === 'display' ? Math.max(0, 1 - sinceDisplay / 6) : anodizer.wet);
    anodizer.setWet(damp(anodizer.wet, wetTarget, 1.5, dt));
  }

  /* lever animation */
  const leverTarget = processing ? -0.55 : 0.5;
  env.leverPivot.rotation.x = damp(env.leverPivot.rotation.x, leverTarget, processing ? 10 : 5, dt);

  /* bubbles follow the submerged piece */
  if (piece && overTank && piece.position.y < L.waterY + 0.05) {
    piece.userData.body.getWorldPosition(tmpV);
    bubbleUni.uOrigin.value.set(tmpV.x, Math.min(tmpV.y, L.waterY - 0.03), tmpV.z);
  }
  const bubbleTarget = processing ? 1 : (state === 'anodize' ? 0.06 : 0);
  bubbleUni.uIntensity.value = damp(bubbleUni.uIntensity.value, bubbleTarget, 6, dt);
  bubbleUni.uTime.value = t;
  ambUni.uTime.value = t * 0.7;

  /* water + drips */
  waterUni.uTime.value = t;
  waterUni.uRippleT.value += dt;
  drips.update(dt);

  /* mood lighting (workshop <-> dark gallery) */
  mood = damp(mood, moodTarget, 1.8, dt);
  hemi.intensity = lerp(0.55, 0.085, mood);
  key.intensity = lerp(2.4, 0.1, mood);
  lampPoint.intensity = lerp(9, 0.5, mood);
  spot.intensity = lerp(0, 7, mood);
  tankLight.intensity = lerp(2.4, 0.2, mood);
  shelfGlow.intensity = lerp(0, 1.6, mood);
  scene.environmentIntensity = lerp(1.0, 0.22, mood);
  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, mood);
  waterUni.uDim.value = lerp(1, 0.35, mood);
  env.lightShaft.material.opacity = 0.055 * (1 - mood);
  env.lampMats.forEach((m) => m.color.setHex(0xffe9c4).multiplyScalar(lerp(1, 0.25, mood)));
  env.windowPane.material.color.setScalar(lerp(1, 0.18, mood));

  /* display tilt */
  if (state === 'display') {
    sinceDisplay += dt;
    dispYaw += dispYawV; dispPitch += dispPitchV;
    dispYawV *= Math.exp(-6 * dt); dispPitchV *= Math.exp(-6 * dt);
    dispYaw = clamp(dispYaw, -1.1, 1.1);
    dispPitch = clamp(dispPitch, -0.55, 0.4);
    if (!dragging) {
      dispYaw = damp(dispYaw, Math.sin(t * 0.5) * 0.10, 0.25, dt);
      dispPitch = damp(dispPitch, 0, 0.2, dt);
    }
    displayHolder.rotation.y = dispYaw;
    displayHolder.rotation.x = dispPitch;
    sparkles.userData.uniforms.uTime.value = t;
    sparkles.userData.uniforms.uIntensity.value = mood;
    if (sinceDisplay > 1.6) btnAgain.classList.add('show');
  }

  /* raise button appears once some colour exists and finger is lifted */
  if (state === 'anodize') {
    const show = !held && anodizer && anodizer.thickness > 26;
    btnRaise.classList.toggle('show', !!show);
  } else {
    btnRaise.classList.remove('show');
  }

  /* technician: gentle sway, watches the piece, nods while current is on */
  const tech = env.tech;
  tech.torso.rotation.z = Math.sin(t * 0.6) * 0.02;
  tech.torso.rotation.x = processing ? Math.sin(t * 3.2) * 0.02 + 0.03 : Math.sin(t * 0.4) * 0.012;
  if (piece) {
    tech.head.lookAt(piece.getWorldPosition(tmpV));
    tech.head.rotation.x = clamp(tech.head.rotation.x, -0.4, 0.35);
    tech.head.rotation.y = clamp(tech.head.rotation.y, -0.8, 0.8);
    tech.head.rotation.z = 0;
  } else {
    tech.head.rotation.x = damp(tech.head.rotation.x, 0, 2, dt);
    tech.head.rotation.y = damp(tech.head.rotation.y, Math.sin(t * 0.3) * 0.15, 2, dt);
  }

  /* camera: damped toward the active pose + breathing */
  const dp = desiredPose();
  camPos.x = damp(camPos.x, dp.pos.x, 2.0, dt);
  camPos.y = damp(camPos.y, dp.pos.y, 2.0, dt);
  camPos.z = damp(camPos.z, dp.pos.z, 2.0, dt);
  camTgt.x = damp(camTgt.x, dp.tgt.x, 2.0, dt);
  camTgt.y = damp(camTgt.y, dp.tgt.y, 2.0, dt);
  camTgt.z = damp(camTgt.z, dp.tgt.z, 2.0, dt);
  camFov = damp(camFov, dp.fov, 2.0, dt);
  if (Math.abs(camera.fov - camFov) > 0.01) {
    camera.fov = camFov;
    camera.updateProjectionMatrix();
  }
  const bx = Math.sin(t * 0.33) * 0.006, by = Math.sin(t * 0.47 + 1.3) * 0.004;
  camera.position.set(camPos.x + bx, camPos.y + by, camPos.z);
  camera.lookAt(camTgt);

  bubbleUni.uPixelRatio.value = renderer.getPixelRatio();
  ambUni.uPixelRatio.value = renderer.getPixelRatio();
  sparkles.userData.uniforms.uPixelRatio.value = renderer.getPixelRatio();

  updateHint();
  renderer.render(scene, camera);
  window.__ready = true;
}
frame();

/* -------------------------------------------------- test / debug interface */
window.__game = {
  get state() { return state; },
  get thickness() { return anodizer ? anodizer.thickness : 0; },
  set thickness(v) { if (anodizer) { anodizer.thickness = v; anodizer.apply(); } },
  get timeScale() { return timeScale; },
  set timeScale(v) { timeScale = v; },
  debug() {
    return {
      seqI: seq.i, seqT: seq.t, seqDone: seq.done, steps: seq.steps.length,
      carX: env.carriage.position.x, hookDrop, attached,
      pieceY: piece ? piece.position.y : null, mood,
    };
  },
  screenPos(name) {
    const map = {
      piece0: () => trayPieces[0] && trayPieces[0].position.clone().add(new THREE.Vector3(0, -0.05, 0)),
      piece1: () => trayPieces[1] && trayPieces[1].position.clone().add(new THREE.Vector3(0, -0.05, 0)),
      piece2: () => trayPieces[2] && trayPieces[2].position.clone().add(new THREE.Vector3(0, -0.05, 0)),
      lever: () => env.leverKnob.getWorldPosition(new THREE.Vector3()),
      display: () => displayHolder.position.clone().add(new THREE.Vector3(0, 0.09, 0)),
      center: () => camTgt.clone(),
    };
    const v = map[name] && map[name]();
    if (!v) return null;
    return worldToScreen(v);
  },
};
