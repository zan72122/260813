// ゲーム本体。
//
// 遊びの筋道はひとつだけ：
//   からっぽの池を見る → 水門をあける → 水が流れて池が満ちる → 次の池へ送る
//   → 太陽と風で水が減る → 色がどんどん濃いピンクになる → 高いところから全部を見る → もういちど
//
// 文字も点数も制限時間も失敗もない。指一本、どこを触っても前に進む。
import * as THREE from 'three';
import { createWaterUniforms } from './water.js';
import { createSky } from './sky.js';
import {
  buildWorld,
  updatePondMesh,
  updateGateMesh,
  FLOOR,
  TOP,
  SEA_LEVEL,
} from './world.js';
import { buildFarField } from './farfield.js';
import { buildProps } from './props.js';
import { CameraRig, pose } from './cameraRig.js';
import { Hint } from './hint.js';
import { Sound } from './audio.js';
import { SingleTouch } from './input.js';
import { glowTexture } from './textures.js';
import { clamp, lerp, damp, smoothstep, makeRng } from './util.js';

const FILL_SECONDS = 6.2;
const SUN_ACTIONS = 3;
const WIND_ACTIONS = 2;
const IDLE_HELP = 5.0; // これだけ待つとヒントが大きくなる
const IDLE_AUTO = 17.0; // これだけ待つと自動で先へ進む

// 太陽の向き。高さは変えず、触ると「強くなる」ことで因果を伝える。
// 低い位置に置くことで、操作中のカメラの画角に必ず収まり、
// 逆光で畦の輪郭が立ち、水面に太陽へ伸びるきらめきの道ができる。
const SUN_EL = 0.20; // rad ≒ 11.5°
const SUN_AZ = -1.68; // rad, 画面のほぼ正面（縦画面の狭い横画角にも収まる）

const POSES = {
  intro: pose([0, -0.2, -4], [0.05, 0.62, 1], 22, 14, 54),
  g0: pose([-8, -0.1, -18.2], [0.17, 0.40, 1], 8.5, 5.8, 46),
  g0watch: pose([-8, -0.15, -13.0], [0.14, 0.35, 1], 12, 8.4, 50),
  g1: pose([0, -0.1, -10.2], [0.42, 0.40, 1], 8.5, 5.8, 46),
  g1watch: pose([5.5, -0.15, -10.5], [0.34, 0.36, 1], 12, 8.4, 50),
  g2: pose([6, -0.1, -3.0], [-0.22, 0.42, 1], 8.5, 5.8, 46),
  g2watch: pose([1.5, -0.15, 3.0], [-0.10, 0.34, 1], 14, 9.6, 52),
  // 太陽の工程：太陽が画面の上のほうに必ず入る浅い俯角にする
  sun: pose([0, 0.6, -8], [0.05, 0.213, 1], 24, 14, 54),
  // 風の工程：もう少し見下ろし、水面をさざめかせる風がよく見えるようにする
  wind: pose([0, 0.4, -7], [0.06, 0.40, 1], 26, 16, 56),
  // クライマックス：ぐっと高い俯瞰。ピンクの面積が一気に画面を埋める。
  climax: pose([0, 0, -4], [0.0, 0.84, 1], 42, 30, 58),
  // その後、少し起こして地平線まで続く塩田を見せる
  vista: pose([0, 0, -4], [0.0, 0.445, 1], 46, 34, 60),
};
POSES.sun.maxRatio = 1.3;
POSES.wind.maxRatio = 1.3;
POSES.climax.maxRatio = 1.7;
POSES.vista.maxRatio = 1.8;

// 明るさの移り変わり。終盤はわずかに金色へ寄せ、ピンクが最も映える光にする。
const LIGHT_DAY = {
  sun: 0xffeed4,
  sunI: 3.6,
  skyTop: 0x5f9fd8,
  skyHorizon: 0xdfe9ee,
  hemiSky: 0x9dc4e6,
  hemiGround: 0x8a7a6a,
  hemiI: 1.15,
  fog: 0xd9e4ea,
};
const LIGHT_GOLD = {
  sun: 0xffe6c8,
  sunI: 4.2,
  skyTop: 0x5891cf,
  skyHorizon: 0xffe8dc,
  hemiSky: 0xbcd3ee,
  hemiGround: 0xa08265,
  hemiI: 1.25,
  fog: 0xf5e2dc,
};

function mixPreset(a, b, t) {
  const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return {
    sun: c(a.sun, b.sun),
    sunI: lerp(a.sunI, b.sunI, t),
    skyTop: c(a.skyTop, b.skyTop),
    skyHorizon: c(a.skyHorizon, b.skyHorizon),
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiGround: c(a.hemiGround, b.hemiGround),
    hemiI: lerp(a.hemiI, b.hemiI, t),
    fog: c(a.fog, b.fog),
  };
}

export class Game {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.35, 1400);
    this.rig = new CameraRig(this.camera);
    this.sound = new Sound();
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.rng = makeRng(4242);

    this.shared = createWaterUniforms();
    this.build();
    this.bindInput();
    this.reset();
  }

  build() {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0xd9e4ea, 0.0021);

    scene.add(createSky(this.shared));
    this.sky = scene.getObjectByName('sky');

    this.hemi = new THREE.HemisphereLight(0x9dc4e6, 0x8a7a6a, 1.15);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffeed4, 3.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    // 太陽が低いぶん、影テクセルは地面上で縦に引き伸ばされる。
    // 範囲を絞り、法線方向へ逃がすことで、平らな地面に縞が出るのを防ぐ。
    sc.left = -22;
    sc.right = 22;
    sc.top = 22;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 130;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.12;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // 逆光になる手前の面がつぶれないよう、カメラ側から弱い補助光を当てる。
    // 影は落とさない。材質と接地が読めるだけの光量にとどめる。
    this.fill = new THREE.DirectionalLight(0xc8dcf0, 0.75);
    this.fill.position.set(6, 14, 34);
    scene.add(this.fill);

    this.world = buildWorld(scene, this.shared);
    this.far = buildFarField(scene, this.shared, this.world.materials.matSoil);
    this.props = buildProps(scene, this.world);
    this.hint = new Hint(scene);

    this.buildSparkles();
    this.buildReplayButton();

    this.camera.add(this.replay.group);
    scene.add(this.camera);
  }

  // クライマックスで水面から立ちのぼる、きらきらした粒。
  buildSparkles() {
    const n = 280;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const rng = makeRng(555);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rng() - 0.5) * 46;
      pos[i * 3 + 1] = FLOOR + rng() * 4;
      pos[i * 3 + 2] = -20 + rng() * 34;
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uMap: { value: glowTexture() },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        varying float vTw;
        void main() {
          vec3 p = position;
          p.y += mod( uTime * ( 0.25 + aSeed * 0.5 ) + aSeed * 7.0, 5.5 );
          p.x += sin( uTime * 0.7 + aSeed * 12.0 ) * 0.6;
          vTw = 0.35 + 0.65 * pow( abs( sin( uTime * 2.0 + aSeed * 20.0 ) ), 3.0 );
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_PointSize = ( 18.0 + aSeed * 22.0 ) / max( -mv.z, 1.0 ) * 8.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying float vTw;
        void main() {
          vec4 t = texture2D( uMap, gl_PointCoord );
          gl_FragColor = vec4( vec3( 1.0, 0.88, 0.93 ), t.a * vTw * uOpacity * 0.7 );
        }
      `,
    });
    this.sparkles = new THREE.Points(geo, mat);
    this.sparkles.frustumCulled = false;
    this.sparkles.visible = false;
    this.scene.add(this.sparkles);
  }

  // もういちど遊ぶボタン。文字は使わず、ぐるりと回る矢印だけで示す。
  buildReplayButton() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.145, 32), mat.clone());
    disc.material.color.set(0xe8407a);
    disc.material.opacity = 0;
    g.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.082, 0.019, 8, 32, Math.PI * 1.45),
      mat.clone()
    );
    ring.rotation.z = -0.35;
    g.add(ring);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.062, 3), mat.clone());
    head.position.set(0.079, 0.03, 0);
    head.rotation.z = -1.15;
    g.add(head);

    g.position.set(0, 0, -1);
    g.renderOrder = 990;
    g.visible = false;

    const hit = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    g.add(hit);

    this.replay = { group: g, parts: [disc, ring, head], hit, opacity: 0 };
  }

  bindInput() {
    this.touch = new SingleTouch(this.canvas);
    this.touch.onDown = (s) => this.onDown(s);
    this.touch.onMove = (s) => this.onMove(s);
    this.touch.onUp = (s) => this.onUp(s);
  }

  // ---------------------------------------------------------------- 状態
  reset() {
    this.phase = 'intro';
    this.phaseTime = 0;
    this.idle = 0;
    this.evap = 0;
    this.sunActions = 0;
    this.windActions = 0;
    this.sunHeat = 0;
    this.windLevel = 0.12;
    this.windBurst = 0;
    this.goldT = 0;
    this.reveal = 0;
    this.sparkleAmt = 0;
    this.gateIndex = 0;
    this.dragGate = null;
    this.dragStartY = 0;
    this.dragStartOpen = 0;
    this.acted = false;
    this.introMoved = false;
    this.rig.sway = 1;

    for (const p of this.world.ponds) {
      p.level = FLOOR;
      p.salinity = 0.02;
      p.crust = 0;
      p.inflow = 0;
      p.filling = false;
      p.filled = false;
      updatePondMesh(p);
    }
    for (const g of this.world.gates) {
      g.open = 0;
      g.targetOpen = 0;
      g.unlocked = false;
      g.done = false;
      g.board.position.y = g.boardClosedY;
      g.flow.visible = false;
      g.spill.visible = false;
    }
    for (const f of this.props.flamingos) {
      f.group.visible = false;
      f.group.scale.setScalar(0.0001);
    }
    this.far.farMat.uniforms.uReveal.value = 0;
    this.sparkles.visible = false;
    this.replay.group.visible = false;
    this.replay.opacity = 0;
    this.rig.lookEnabled = false;
    this.rig.setLook(0, 0);
    this.rig.jumpTo(POSES.intro);
    this.hint.hide();
    this.applyLight(0);
    this.updateSunVector();
  }

  get activeGate() {
    return this.gateIndex < this.world.gates.length ? this.world.gates[this.gateIndex] : null;
  }

  setPhase(name, camPose, dur = 2.2) {
    this.phase = name;
    this.phaseTime = 0;
    this.idle = 0;
    this.acted = false;
    // 指示はその工程のあいだだけ出す。消し忘れて画面に残らないよう、必ずここで畳む。
    this.hint.hide();
    if (camPose) this.rig.moveTo(camPose, dur);
  }

  // ---------------------------------------------------------------- 入力
  raycastFirst(objects) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(objects, true);
    return hits.length ? hits[0] : null;
  }

  onDown(s) {
    this.sound.init();
    this.idle = 0;
    this.pointer.set(s.nx, s.ny);

    if (this.phase === 'gate') {
      const g = this.activeGate;
      if (g && this.raycastFirst([g.proxy])) {
        this.dragGate = g;
        this.dragStartY = s.ny;
        this.dragStartOpen = g.targetOpen;
      }
    }
  }

  onMove(s) {
    this.idle = 0;
    this.pointer.set(s.nx, s.ny);

    if (this.dragGate) {
      // 指を上げた分だけ板が上がる。下げても閉じない（失敗させない）。
      const lift = (s.ny - this.dragStartY) * 2.4;
      this.dragGate.targetOpen = clamp(this.dragStartOpen + lift, this.dragStartOpen, 1);
      if (this.dragGate.targetOpen > 0.12) this.openGate(this.dragGate);
      return;
    }

    if (this.phase === 'finale') {
      this.rig.setLook(-s.totalX * 0.55, s.totalY * 0.3);
    }

    // 風の工程は、なぞった距離がそのまま風になる
    if (this.phase === 'wind' && Math.abs(s.totalX) > 0.22 && !this.acted) {
      this.acted = true;
      this.doWind();
    }
  }

  onUp(s) {
    this.idle = 0;
    this.pointer.set(s.nx, s.ny);
    const wasDrag = this.dragGate;
    this.dragGate = null;

    if (this.phase === 'gate') {
      const g = this.activeGate;
      if (!g) return;
      // 板を少しでも動かした／どこかを軽く触った／上へなぞった
      // ——いずれでも必ず開く。4 歳が雑に触っても必ず前へ進む。
      if (wasDrag || s.isTap || s.totalY > 0.08 || s.moved > 0.2) this.openGate(g);
      return;
    }

    if (this.phase === 'sun') {
      this.doSun();
      return;
    }

    if (this.phase === 'wind') {
      if (!this.acted) this.doWind();
      this.acted = false;
      return;
    }

    if (this.phase === 'finale' && this.phaseTime > 2.6 && s.isTap) {
      this.doReplay();
    }
  }

  // ------------------------------------------------------------ 遊びの操作
  openGate(g) {
    if (g.done) return;
    g.done = true;
    g.targetOpen = 1;
    const dest = this.world.pondById[g.def.dest];
    dest.filling = true;
    dest.inflowPos.copy(g.dropPos);
    this.hint.hide();
    this.sound.wood();
    setTimeout(() => this.sound.splash(), 260);
    this.sound.chime(this.gateIndex);
    this.setPhase('filling', POSES[`${g.def.id}watch`], 2.6);
  }

  doSun() {
    if (this.sunActions >= SUN_ACTIONS) return;
    this.sunActions++;
    this.sunHeat = 1;
    this.evap = Math.min(1, this.evap + 0.245);
    this.sound.chime(this.sunActions + 1);
    this.idle = 0;
    if (this.sunActions >= SUN_ACTIONS) {
      this.hint.hide();
      setTimeout(() => {
        if (this.phase === 'sun') this.setPhase('wind', POSES.wind, 2.6);
      }, 1500);
    }
  }

  doWind() {
    if (this.windActions >= WIND_ACTIONS) return;
    this.windActions++;
    this.windBurst = 1;
    this.evap = Math.min(1, this.evap + 0.145);
    this.sound.gust();
    this.sound.chime(this.windActions + 2);
    this.spawnStreaks();
    this.idle = 0;
    if (this.windActions >= WIND_ACTIONS) {
      this.hint.hide();
      setTimeout(() => {
        if (this.phase === 'wind') this.startClimax();
      }, 1800);
    }
  }

  startClimax() {
    this.setPhase('climax', POSES.climax, 7.0);
    this.hint.hide();
    this.sound.fanfare();
    this.sparkles.visible = true;
    for (const f of this.props.flamingos) f.group.visible = true;
  }

  doReplay() {
    this.sound.chime(0);
    this.reset();
  }

  spawnStreaks() {
    const rng = this.rng;
    for (const st of this.props.streaks) {
      if (st.life > 0) continue;
      st.life = 1;
      st.x = -34 - rng() * 12;
      st.y = TOP + 0.2 + rng() * 3.4;
      st.z = -22 + rng() * 34;
      st.speed = 24 + rng() * 20;
      st.len = 5 + rng() * 7;
      st.sprite.visible = true;
    }
  }

  // ------------------------------------------------------------ 環境の更新
  updateSunVector() {
    const el = SUN_EL;
    const az = SUN_AZ;
    const d = this.shared.uSunDir.value;
    d.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.sun.position.copy(d).multiplyScalar(60);
    this.sun.target.position.set(0, 0, -6);
    this.props.sunGroup.position.copy(d).multiplyScalar(240);
  }

  applyLight(goldT) {
    const p = mixPreset(LIGHT_DAY, LIGHT_GOLD, goldT);
    // 太陽を触るほど、光そのものが強くなる
    const heat = 1 + this.sunHeat * 0.16 + this.evap * 0.12;
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunI * heat;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.shared.uSunColor.value.copy(p.sun).convertSRGBToLinear().multiplyScalar(heat);
    this.shared.uSkyTop.value.copy(p.skyTop).convertSRGBToLinear();
    this.shared.uSkyHorizon.value.copy(p.skyHorizon).convertSRGBToLinear();
    this.scene.fog.color.copy(p.fog);
    this.props.hills.material.color.copy(p.fog).lerp(new THREE.Color(0x63788c), 0.55);
  }

  // ---------------------------------------------------------------- 毎フレーム
  update(dt) {
    this.phaseTime += dt;
    this.idle += dt;
    const t = this.clock.getElapsedTime();

    this.stepPhase(dt);
    this.stepWater(dt);
    this.stepGates(dt);
    this.stepEffects(dt, t);

    this.shared.uTime.value = t;
    this.sky.material.uniforms.uTime.value = t;
    this.props.grass.uniforms.uTime.value = t;
    this.props.grass.uniforms.uWind.value = this.windLevel;
    this.sparkles.material.uniforms.uTime.value = t;

    this.sunHeat = damp(this.sunHeat, 0, 0.7, dt);
    this.applyLight(this.goldT);

    const aspect = this.camera.aspect;
    this.rig.update(dt, aspect);
    this.hint.update(dt, this.camera);
    this.updateReplayButton(dt);
  }

  stepPhase(dt) {
    const g = this.activeGate;

    switch (this.phase) {
      case 'intro':
        // まず、からっぽの池をひと呼吸見せる。それから最初の水門へ寄っていく。
        if (!this.introMoved && this.phaseTime > 1.7) {
          this.introMoved = true;
          this.rig.moveTo(POSES.g0, 4.0);
        }
        if (this.phaseTime > 5.9) this.setPhase('gate', null);
        break;

      case 'gate':
        if (g) {
          this.hint.show(g.handleWorld, 'lift', 1.0);
          this.hint.setUrgency(smoothstep(IDLE_HELP, IDLE_HELP + 6, this.idle));
          if (this.idle > IDLE_AUTO) this.openGate(g);
        }
        break;

      case 'filling': {
        const cur = this.world.gates[this.gateIndex];
        const dest = this.world.pondById[cur.def.dest];
        const frac = (dest.level - FLOOR) / (dest.def.full - FLOOR);
        if (frac > 0.92 && this.phaseTime > 3.0) {
          this.gateIndex++;
          if (this.gateIndex < this.world.gates.length) {
            const next = this.world.gates[this.gateIndex];
            this.setPhase('gate', POSES[next.def.id], 2.4);
          } else {
            this.setPhase('sun', POSES.sun, 3.2);
          }
        }
        break;
      }

      case 'sun': {
        // 太陽そのものの手前にヒントを出す（カメラから見て必ず太陽に重なる位置）
        const p = this.camera.position
          .clone()
          .addScaledVector(this.shared.uSunDir.value, 26);
        this.hint.show(p, 'tap', 1.5);
        this.hint.setUrgency(smoothstep(IDLE_HELP, IDLE_HELP + 6, this.idle));
        if (this.idle > IDLE_AUTO) this.doSun();
        break;
      }

      case 'wind': {
        this.hint.show(new THREE.Vector3(0, TOP + 2.2, 4.0), 'swipe', 1.5);
        this.hint.setUrgency(smoothstep(IDLE_HELP, IDLE_HELP + 6, this.idle));
        if (this.idle > IDLE_AUTO) this.doWind();
        break;
      }

      case 'climax':
        // 高い視点へ上がりながら、ピンクが地平線まで広がっていく
        this.goldT = damp(this.goldT, 1, 0.42, dt);
        this.reveal = clamp(this.reveal + dt * 0.145, 0, 1);
        this.sparkleAmt = damp(this.sparkleAmt, 0.6, 0.5, dt);
        if (this.phaseTime > 8.5) {
          this.phase = 'finale';
          this.phaseTime = 0;
          this.rig.lookEnabled = true;
          this.rig.sway = 1.6;
          this.rig.moveTo(POSES.vista, 6.0);
        }
        break;

      case 'finale':
        this.goldT = damp(this.goldT, 1, 0.42, dt);
        this.reveal = clamp(this.reveal + dt * 0.06, 0, 1);
        this.sparkleAmt = damp(this.sparkleAmt, 0.42, 0.5, dt);
        break;
    }
  }

  stepWater(dt) {
    // 蒸発が進むほど水位は下がり、塩分は濃くなる。これがピンクの理由。
    let sumLevel = 0;
    let nFilled = 0;

    for (const p of this.world.ponds) {
      const cap = p.def.full - 0.13 * this.evap;

      if (p.filling && p.level < cap) {
        const rate = (p.def.full - FLOOR) / FILL_SECONDS;
        p.level = Math.min(cap, p.level + rate * dt);
        p.inflow = damp(p.inflow, 1, 3, dt);
      } else if (p.filling) {
        p.filled = true;
        p.level = damp(p.level, cap, 1.4, dt);
        p.inflow = damp(p.inflow, 0.42, 1.2, dt);
      } else {
        p.inflow = damp(p.inflow, 0, 2, dt);
      }

      const frac = clamp((p.level - FLOOR) / (p.def.full - FLOOR), 0, 1);
      // 入ってきたばかりの水は海に近い色。溜まるほどその池の基準濃度に近づき、
      // さらに蒸発が進むほど濃くなる。
      const base = lerp(0.04, p.def.salt, smoothstep(0.05, 0.85, frac));
      const target = Math.min(1, base + this.evap * 0.66 * smoothstep(0.05, 0.45, frac));
      p.salinity = damp(p.salinity, target, 1.5, dt);
      p.crust = damp(p.crust, smoothstep(0.1, 0.95, this.evap) * frac, 1.1, dt);

      p.mat.uniforms.uWind.value = this.windLevel;
      p.mat.uniforms.uSparkle.value = this.sparkleAmt;
      updatePondMesh(p);

      if (p.level > FLOOR + 0.05) {
        sumLevel += p.level;
        nFilled++;
      }
    }

    // 畦の法面に残る塩の跡は、いま水が触れている高さを基準に描く
    const wy = nFilled ? sumLevel / nFilled : FLOOR;
    this.world.crustUniforms.uWaterY.value = damp(
      this.world.crustUniforms.uWaterY.value,
      wy,
      2,
      dt
    );
    this.world.crustUniforms.uCrust.value = damp(
      this.world.crustUniforms.uCrust.value,
      smoothstep(0.15, 0.9, this.evap),
      1,
      dt
    );

    this.world.seaMat.uniforms.uWind.value = 0.35 + this.windLevel * 0.5;
    this.world.canalMat.uniforms.uWind.value = this.windLevel;
    this.far.farMat.uniforms.uReveal.value = this.reveal;
    this.far.farMat.uniforms.uWind.value = this.windLevel * 0.8;
    this.far.farMat.uniforms.uSparkle.value = this.sparkleAmt * 0.5;
  }

  stepGates(dt) {
    let flowSound = 0;
    for (const g of this.world.gates) {
      g.open = damp(g.open, g.targetOpen, 3.2, dt);
      const src = g.def.source === 'sea' ? SEA_LEVEL : this.world.pondById[g.def.source].level;
      const dst = this.world.pondById[g.def.dest].level;
      const flowing = updateGateMesh(g, src, dst, dt);
      g.flowMat.uniforms.uWind.value = 0.5 + this.windLevel * 0.4;
      if (flowing) {
        const dest = this.world.pondById[g.def.dest];
        flowSound = Math.max(flowSound, dest.filled ? 0.35 : 1);
      }
    }
    this.sound.setFlow(flowSound);
  }

  stepEffects(dt, t) {
    // 風は吹いたあとゆっくり収まる
    this.windBurst = damp(this.windBurst, 0, 0.55, dt);
    const baseWind = 0.12 + this.evap * 0.1;
    this.windLevel = baseWind + this.windBurst * 0.75;

    // 風の筋
    for (const st of this.props.streaks) {
      if (st.life <= 0) continue;
      st.life -= dt * 0.5;
      st.x += st.speed * dt;
      const s = st.sprite;
      s.position.set(st.x, st.y, st.z);
      s.scale.set(st.len, st.len * 0.16, 1);
      s.material.opacity = Math.max(0, Math.sin(st.life * Math.PI)) * 0.42;
      if (st.life <= 0 || st.x > 40) {
        st.life = 0;
        s.visible = false;
      }
    }

    // 太陽の光の玉。触ると一瞬ふくらむ。
    const glowOn = this.phase === 'sun' ? 1 : this.phase === 'climax' || this.phase === 'finale' ? 0.5 : 0.25;
    const gm = this.props.glow.material;
    gm.opacity = damp(gm.opacity, glowOn * (0.5 + this.sunHeat * 0.5), 3, dt);
    const gs = 30 * (1 + this.sunHeat * 0.35 + this.evap * 0.1);
    this.props.glow.scale.setScalar(gs);

    // フラミンゴ：舞い降りて、そっと羽を動かす
    for (const f of this.props.flamingos) {
      if (!f.group.visible) continue;
      const s = f.group.scale.x;
      f.group.scale.setScalar(damp(s, 1, 1.1, dt));
      f.group.position.y = FLOOR + Math.sin(t * 0.9 + f.phase) * 0.015;
      f.group.rotation.y += Math.sin(t * 0.35 + f.phase) * dt * 0.12;
    }

    this.sparkles.material.uniforms.uOpacity.value = this.sparkleAmt;
  }

  updateReplayButton(dt) {
    const want = this.phase === 'finale' && this.phaseTime > 2.2 ? 1 : 0;
    this.replay.opacity = damp(this.replay.opacity, want, 2.4, dt);
    const g = this.replay.group;
    g.visible = this.replay.opacity > 0.02;
    if (!g.visible) return;

    // 画面の下側に、指の届くところへ固定する（カメラの子なので向きは常に正面）
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = 1.0;
    const halfH = Math.tan(vFov / 2) * dist;
    g.position.set(0, -halfH * 0.66, -dist);
    const pulse = 1 + Math.sin(this.phaseTime * 2.6) * 0.06;
    g.scale.setScalar(this.replay.opacity * pulse * Math.min(1.6, Math.max(0.9, halfH * 2.2)));
    this.replay.parts[0].material.opacity = this.replay.opacity * 0.92;
    for (let i = 1; i < this.replay.parts.length; i++) {
      this.replay.parts[i].material.opacity = this.replay.opacity;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
