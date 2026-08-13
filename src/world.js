import * as THREE from 'three';
import {
  ENV_GLSL,
  MATTE_VERT,
  MATTE_FRAG,
  MELT_VERT,
  MELT_FRAG,
  SKY_VERT,
  SKY_FRAG,
  FLAME_VERT,
  FLAME_FRAG,
  FIRE_RING_VERT,
  FIRE_RING_FRAG,
  BEAM_VERT,
  BEAM_FRAG,
  SPARK_VERT,
  SPARK_FRAG,
  DROP_VERT,
  DROP_FRAG,
} from './shaders.js';
import { makeCrystalMaterial } from './crystal.js';

// 中がよく見えるように、ひらたくて 広い おなべの形にしている
const CRUCIBLE_PROFILE = [
  [0.001, 0.1],
  [0.4, 0.075],
  [0.72, 0.11],
  [0.9, 0.22],
  [0.97, 0.4],
  [1.0, 0.48],
  [1.12, 0.5],
  [1.13, 0.4],
  [1.08, 0.2],
  [0.98, 0.05],
  [0.66, 0.0],
  [0.001, 0.0],
];

const matteMats = [];

function matteMaterial(color, rough = 0.85) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(color) },
      uRough: { value: rough },
      uHeat: { value: 0 },
      uTime: { value: 0 },
      uDim: { value: 1 },
    },
    vertexShader: MATTE_VERT,
    fragmentShader: MATTE_FRAG,
  });
  matteMats.push(m);
  return m;
}

/** 工房ぜんたいの明るさ（仕上げのときだけ おとす） */
function setWorkshopDim(v) {
  for (const m of matteMats) m.uniforms.uDim.value = v;
}

export function createWorld({ fast = false } = {}) {
  matteMats.length = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 2.4, 4.2);

  /** uCam を毎フレーム更新したいマテリアル */
  const camMats = [];
  /** uTime を毎フレーム更新したいマテリアル */
  const timeMats = [];
  const track = (m) => {
    if (m.uniforms.uCam) camMats.push(m);
    if (m.uniforms.uTime) timeMats.push(m);
    return m;
  };

  /* ---------------- 背景 ---------------- */
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNiji: { value: 0 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  track(skyMat);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------------- 台 ---------------- */
  const tableMat = track(matteMaterial(0x53355e, 0.92));
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.55, 0.34, fast ? 24 : 48),
    tableMat,
  );
  table.position.y = -0.18;
  scene.add(table);

  const matMat = track(matteMaterial(0x2e1d40, 0.95));
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.68, 0.05, fast ? 20 : 40), matMat);
  mat.position.y = 0.005;
  scene.add(mat);

  const matRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.66, 0.05, 8, fast ? 24 : 44),
    track(matteMaterial(0x6d4a7d, 0.6)),
  );
  matRim.rotation.x = Math.PI / 2;
  matRim.position.y = 0.03;
  scene.add(matRim);

  // 台のうえの あたたかい にじみ（加熱すると強くなる）
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uHeat;
      uniform float uTime;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
        vec3 c = mix(vec3(0.55, 0.30, 0.85), vec3(1.0, 0.42, 0.10), uHeat);
        float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
        gl_FragColor = vec4(c, a * (0.20 + 0.55 * uHeat) * pulse);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  track(glowMat);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.035;
  scene.add(glow);

  /* ---------------- バーナー ---------------- */
  const burnerMat = track(matteMaterial(0x1c1626, 0.75));
  const burner = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 8, fast ? 18 : 32), burnerMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  burner.add(ring);
  const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.2, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(legGeo, burnerMat);
    leg.position.set(Math.cos(a) * 0.82, 0.02, Math.sin(a) * 0.82);
    burner.add(leg);
  }
  scene.add(burner);

  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  track(flameMat);
  const flame = new THREE.Group();

  // るつぼを ぐるりと 囲む 炎（前がわは additive なので なべの上に重なって見える）
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: FIRE_RING_VERT,
    fragmentShader: FIRE_RING_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  track(ringMat);
  const fireRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.04, 1.18, 1.05, fast ? 20 : 36, 1, true),
    ringMat,
  );
  fireRing.position.y = 0.52;
  flame.add(fireRing);

  // なべの下でゆれる 小さな炎
  const tongueGeo = new THREE.PlaneGeometry(0.5, 0.5, 1, 6);
  for (let i = 0; i < (fast ? 2 : 4); i++) {
    const t = new THREE.Mesh(tongueGeo, flameMat);
    t.rotation.y = (i / 4) * Math.PI;
    t.position.y = 0.16;
    flame.add(t);
  }
  flame.position.y = 0.0;
  flame.visible = false;
  scene.add(flame);

  /* ---------------- るつぼ（かたむく） ---------------- */
  const crucibleGroup = new THREE.Group(); // これを回して傾ける
  crucibleGroup.position.y = 0.12;
  scene.add(crucibleGroup);

  const crucibleMat = track(matteMaterial(0x2b2431, 0.88));
  const profile = CRUCIBLE_PROFILE.map(([x, y]) => new THREE.Vector2(x, y));
  const crucible = new THREE.Mesh(new THREE.LatheGeometry(profile, fast ? 24 : 48), crucibleMat);
  crucibleGroup.add(crucible);

  // るつぼの内側（暗く）
  const innerMat = track(matteMaterial(0x120e18, 1.0));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.9, fast ? 20 : 40), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.085;
  crucibleGroup.add(inner);

  /* ---------------- とけた金属 ---------------- */
  const meltMat = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uRainbow: { value: 0 },
      uWobble: { value: 0 },
      uTopY: { value: 0.5 },
    },
    vertexShader: MELT_VERT,
    fragmentShader: MELT_FRAG,
  });
  track(meltMat);
  const melt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.8, 1, fast ? 24 : 44, fast ? 4 : 10),
    meltMat,
  );
  melt.position.y = 0.1;
  melt.scale.y = 0.0001;
  melt.visible = false;
  crucibleGroup.add(melt);

  /** 液面の高さ（0..1）をセットする */
  function setMeltLevel(level) {
    const h = Math.max(0.0001, level * 0.3);
    melt.scale.y = h;
    melt.position.y = 0.09 + h * 0.5;
    melt.visible = level > 0.005;
    meltMat.uniforms.uWobble.value = level > 0.01 ? 1.0 / Math.max(h, 0.05) : 0;
  }
  setMeltLevel(0);

  /** 液面の高さ（るつぼローカル座標） */
  function meltSurfaceY(level) {
    return 0.09 + Math.max(0.0001, level * 0.3);
  }

  /* ---------------- 金属のかけら ---------------- */
  const chunkMat = track(matteMaterial(0x767d90, 0.22));
  const chunks = [];
  const chunkHome = [
    new THREE.Vector3(-1.42, 0.15, 0.72),
    new THREE.Vector3(-0.78, 0.15, 1.24),
    new THREE.Vector3(0.02, 0.15, 1.46),
    new THREE.Vector3(0.82, 0.15, 1.24),
    new THREE.Vector3(1.44, 0.15, 0.7),
  ];
  for (let i = 0; i < chunkHome.length; i++) {
    const g = new THREE.IcosahedronGeometry(0.24, 0);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setXYZ(
        v,
        pos.getX(v) * (0.82 + ((v * 37) % 11) / 26),
        pos.getY(v) * (0.72 + ((v * 53) % 13) / 22),
        pos.getZ(v) * (0.86 + ((v * 29) % 7) / 18),
      );
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, chunkMat);
    m.position.copy(chunkHome[i]);
    m.rotation.set(i * 1.1, i * 2.3, i * 0.7);
    m.userData.home = chunkHome[i].clone();
    m.userData.index = i;
    scene.add(m);
    chunks.push(m);
  }

  /* ---------------- 結晶 ---------------- */
  const crystalMat = makeCrystalMaterial();
  track(crystalMat);
  const crystalHolder = new THREE.Group();
  crystalHolder.position.y = 0.09;
  crucibleGroup.add(crystalHolder);
  const crystal = new THREE.Mesh(new THREE.BufferGeometry(), crystalMat);
  crystal.frustumCulled = false;
  crystal.visible = false;
  crystalHolder.add(crystal);

  /** spec（レシピから作った設計図）と、そのジオメトリを セットする */
  function setCrystal(spec, geometry) {
    crystal.geometry.dispose();
    crystal.geometry = geometry;
    crystalMat.uniforms.uLayers.value = spec.maxLayers;
    crystalMat.uniforms.uWaterline.value = spec.waterline;
    crystal.visible = true;
  }

  /* ---------------- たねの目印 ---------------- */
  // 液面をタップした場所に出る、光る点と ひろがる輪。
  const seedMarks = [];
  const seedMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uT: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uT;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        // まんなかの点
        float dot0 = smoothstep(0.22, 0.0, d);
        // ひろがっていく輪（何本か）
        float ring = 0.0;
        for (int i = 0; i < 2; i++) {
          float p = fract(uTime * 0.55 + float(i) * 0.5);
          ring += smoothstep(0.05, 0.0, abs(d - p * 0.95)) * (1.0 - p);
        }
        float a = clamp(dot0 * 1.3 + ring * 0.6, 0.0, 1.0);
        vec3 c = mix(vec3(1.0, 0.95, 0.75), vec3(0.6, 0.95, 1.0), 0.35 + 0.35 * sin(uTime * 3.0));
        gl_FragColor = vec4(c, a * 0.9);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  track(seedMat);
  const seedGeo = new THREE.PlaneGeometry(0.34, 0.34);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(seedGeo, seedMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    crucibleGroup.add(m);
    seedMarks.push(m);
  }

  /** たねの目印を 液面の高さに ならべる */
  function showSeedMarks(seeds, surfaceY) {
    seedMarks.forEach((m, i) => {
      const s = seeds[i];
      m.visible = !!s;
      if (s) m.position.set(s.x, surfaceY + 0.012, s.z);
    });
  }

  /* ---------------- 仕上げの台座（大きさのものさし） ---------------- */
  // これは いつも おなじ大きさ。となりに置くことで、結晶の大小が わかる。
  const pedestalMat = track(matteMaterial(0x2a2038, 0.7));
  const pedestal = new THREE.Group();
  const pedTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.54, 0.055, fast ? 16 : 30),
    pedestalMat,
  );
  pedTop.position.y = -0.03;
  pedestal.add(pedTop);
  const pedBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.5, 0.16, fast ? 14 : 24),
    pedestalMat,
  );
  pedBody.position.y = -0.12;
  pedestal.add(pedBody);
  const pedRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.026, 6, fast ? 16 : 28),
    track(matteMaterial(0xffb95e, 0.55)),
  );
  pedRim.rotation.x = Math.PI / 2;
  pedRim.position.y = -0.005;
  pedestal.add(pedRim);
  pedestal.visible = false;
  scene.add(pedestal);

  /* ---------------- トング ---------------- */
  const tongMat = track(matteMaterial(0xb9c0d0, 0.3));
  const gripMat = track(matteMaterial(0xff8a4a, 0.85));
  const tongs = new THREE.Group();
  const arms = [];
  // 腕は「ちょうつがい（上）でつながって、下があく」形。
  // 腕グループの原点をちょうつがいに置いて、回すだけで開閉できるようにする。
  const HINGE_Y = 1.05;
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(0, HINGE_Y, 0);
    arm.userData.side = s;

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.02, 0.085), tongMat);
    shaft.position.y = -0.51;
    arm.add(shaft);

    // つかむ部分（内がわに曲がっている）
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.16), tongMat);
    jaw.position.set(s * 0.12, -1.0, 0);
    jaw.rotation.z = s * 0.28;
    arm.add(jaw);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.16), tongMat);
    tip.position.set(s * 0.24, -1.06, 0);
    arm.add(tip);

    // にぎるところ（オレンジ）
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), gripMat);
    grip.position.y = -0.16;
    arm.add(grip);

    tongs.add(arm);
    arms.push(arm);
  }
  const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), tongMat);
  hinge.position.y = HINGE_Y;
  tongs.add(hinge);
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 18), gripMat);
  ringTop.position.y = HINGE_Y + 0.16;
  tongs.add(ringTop);
  tongs.position.set(0, 2.6, 0);
  tongs.visible = false;
  scene.add(tongs);

  /** 0 = ひらく, 1 = とじる */
  function setTongsGrip(t) {
    for (const arm of arms) {
      arm.rotation.z = arm.userData.side * 0.22 * (1 - t);
    }
  }
  setTongsGrip(0);

  /* ---------------- 受け皿（余分な液を流す先） ---------------- */
  const trayMat = track(matteMaterial(0x3d2b4e, 0.85));
  const tray = new THREE.Group();
  const trayBowl = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.001, 0.09],
        [0.5, 0.05],
        [0.66, 0.16],
        [0.7, 0.2],
        [0.62, 0.02],
        [0.001, 0.0],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      fast ? 18 : 32,
    ),
    trayMat,
  );
  tray.add(trayBowl);
  const trayRim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 8, fast ? 16 : 26), trayMat);
  trayRim.rotation.x = Math.PI / 2;
  trayRim.position.y = 0.19;
  tray.add(trayRim);
  tray.position.set(1.85, 0.02, 0.35);
  scene.add(tray);

  // 受け皿にたまる液
  const poolMat = new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uHeat: { value: 0.75 },
      uRainbow: { value: 0.4 },
      uWobble: { value: 1 },
      uTopY: { value: 0.5 },
    },
    vertexShader: MELT_VERT,
    fragmentShader: MELT_FRAG,
  });
  track(poolMat);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1, fast ? 16 : 28, 3), poolMat);
  pool.visible = false;
  tray.add(pool);
  function setPoolLevel(level) {
    const h = Math.max(0.0001, level * 0.13);
    pool.scale.y = h;
    pool.position.y = 0.06 + h * 0.5;
    pool.visible = level > 0.01;
    poolMat.uniforms.uWobble.value = 1.0 / Math.max(h, 0.05);
  }

  /* ---------------- しずく粒子 ---------------- */
  const DROP_MAX = fast ? 60 : 160;
  const dropPos = new Float32Array(DROP_MAX * 3);
  const dropCol = new Float32Array(DROP_MAX * 3);
  const dropSize = new Float32Array(DROP_MAX);
  const dropVel = new Float32Array(DROP_MAX * 3);
  const dropLife = new Float32Array(DROP_MAX);
  const dropGrav = new Float32Array(DROP_MAX);
  const dropFall = new Float32Array(DROP_MAX);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  dropGeo.setAttribute('aColor', new THREE.BufferAttribute(dropCol, 3));
  dropGeo.setAttribute('aSize', new THREE.BufferAttribute(dropSize, 1));
  const dropMat = new THREE.ShaderMaterial({
    uniforms: { uPix: { value: 400 } },
    vertexShader: DROP_VERT,
    fragmentShader: DROP_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.visible = false;
  scene.add(drops);
  let dropHead = 0;

  /**
   * 粒をひとつ飛ばす。opts で色・重力・寿命・floor（消える高さ）を変えられる。
   * とけた金属のしずくにも、ひやす風にも使う。
   */
  function emitDrop(x, y, z, vx, vy, vz, opts = {}) {
    const {
      color = [1.0, 0.55, 0.12],
      size = 0.014 + Math.random() * 0.018,
      gravity = 4.2,
      life = 1,
      floor = 0.16,
    } = opts;
    const i = dropHead;
    dropHead = (dropHead + 1) % DROP_MAX;
    dropPos[i * 3] = x;
    dropPos[i * 3 + 1] = y;
    dropPos[i * 3 + 2] = z;
    dropVel[i * 3] = vx;
    dropVel[i * 3 + 1] = vy;
    dropVel[i * 3 + 2] = vz;
    dropLife[i] = life;
    dropGrav[i] = gravity;
    dropFall[i] = floor;
    dropSize[i] = size;
    dropCol[i * 3] = color[0];
    dropCol[i * 3 + 1] = color[1];
    dropCol[i * 3 + 2] = color[2];
    drops.visible = true;
  }

  function updateDrops(dt) {
    if (!drops.visible) return;
    let any = false;
    for (let i = 0; i < DROP_MAX; i++) {
      if (dropLife[i] <= 0) continue;
      any = true;
      dropLife[i] -= dt * 0.75;
      dropVel[i * 3 + 1] -= dt * dropGrav[i];
      dropPos[i * 3] += dropVel[i * 3] * dt;
      dropPos[i * 3 + 1] += dropVel[i * 3 + 1] * dt;
      dropPos[i * 3 + 2] += dropVel[i * 3 + 2] * dt;
      if (dropPos[i * 3 + 1] < dropFall[i]) {
        dropLife[i] = 0;
        dropSize[i] = 0;
      }
      if (dropLife[i] <= 0) dropSize[i] = 0;
    }
    dropGeo.attributes.position.needsUpdate = true;
    dropGeo.attributes.aSize.needsUpdate = true;
    dropGeo.attributes.aColor.needsUpdate = true;
    drops.visible = any;
  }

  /* ---------------- きらきら ---------------- */
  const SPARK_N = fast ? 40 : 130;
  const sparkPos = new Float32Array(SPARK_N * 3);
  const sparkSeed = new Float32Array(SPARK_N);
  const sparkSize = new Float32Array(SPARK_N);
  for (let i = 0; i < SPARK_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.25 + Math.random() * 0.55;
    sparkPos[i * 3] = Math.cos(a) * r;
    sparkPos[i * 3 + 1] = (Math.random() - 0.3) * 0.7;
    sparkPos[i * 3 + 2] = Math.sin(a) * r;
    sparkSeed[i] = Math.random();
    sparkSize[i] = 0.02 + Math.random() * 0.045;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeed, 1));
  sparkGeo.setAttribute('aSize', new THREE.BufferAttribute(sparkSize, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLife: { value: 0 },
      uPix: { value: 400 },
      uOpacity: { value: 0 },
    },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  track(sparkMat);
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);

  /* ---------------- 仕上げのスポットライト ---------------- */
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uNiji: { value: 0 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  track(beamMat);
  // 光の柱は「結晶の すこし上」で止める。カメラの中に入ってしまうと
  // 画面がまっ白になるので、下までは のばさない。
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.5, fast ? 16 : 28, 1, true), beamMat);
  beam.position.set(0, 3.72, 0);
  beam.visible = false;
  scene.add(beam);

  const lampMat = track(matteMaterial(0x191324, 0.8));
  const lamp = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.52, 0.46, fast ? 12 : 24, 1, true),
    lampMat,
  );
  shade.position.y = 4.62;
  lamp.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2d0 }),
  );
  bulb.position.y = 4.46;
  lamp.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.2, 6), lampMat);
  cord.position.y = 5.44;
  lamp.add(cord);
  lamp.visible = false;
  scene.add(lamp);

  // 結晶のうしろに置く やわらかい光（いつもカメラを向く板）
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uNiji: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uNiji;
      ${ENV_GLSL}
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
        vec3 c = vec3(1.0, 0.94, 0.86);
        c = mix(c, thinFilm(atan(vUv.y - 0.5, vUv.x - 0.5) * 0.6 + uTime * 0.15), uNiji * 0.6);
        gl_FragColor = vec4(c, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  track(haloMat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), haloMat);
  halo.visible = false;
  scene.add(halo);

  /** 結晶のうしろ側に halo を置いて、カメラのほうを向かせる */
  function placeHalo(center) {
    const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
    halo.position.copy(center).addScaledVector(dir, -1.15);
    halo.quaternion.copy(camera.quaternion);
  }

  /* ---------------- 毎フレーム ---------------- */
  const camPos = new THREE.Vector3();
  function update(t, dt, bufferHeightPx) {
    camera.getWorldPosition(camPos);
    for (const m of camMats) m.uniforms.uCam.value.copy(camPos);
    for (const m of timeMats) m.uniforms.uTime.value = t;
    // 点の大きさ＝ワールドサイズ × この係数 ÷ カメラからの距離
    const proj = bufferHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    dropMat.uniforms.uPix.value = proj;
    sparkMat.uniforms.uPix.value = proj;
    updateDrops(dt);
  }

  return {
    scene,
    camera,
    sky,
    skyMat,
    table,
    burner,
    flame,
    flameMat,
    ringMat,
    crucibleGroup,
    crucible,
    crucibleMat,
    melt,
    meltMat,
    setMeltLevel,
    meltSurfaceY,
    glowMat,
    setWorkshopDim,
    chunks,
    crystal,
    crystalMat,
    crystalHolder,
    setCrystal,
    showSeedMarks,
    pedestal,
    tongs,
    setTongsGrip,
    tray,
    setPoolLevel,
    poolMat,
    emitDrop,
    sparks,
    sparkMat,
    beam,
    beamMat,
    lamp,
    halo,
    haloMat,
    placeHalo,
    matMat,
    tableMat,
    burnerMat,
    update,
  };
}
