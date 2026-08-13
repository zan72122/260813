// 近景・中景・遠景を分けるための小物と生き物。
// 手前には触れそうな道具、中景には作業小屋、遠景には霞んだ山並みを置き、
// 一目で奥行きが読める画面をつくる。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { grassTexture, glowTexture, streakTexture } from './textures.js';
import { TOP, FLOOR } from './world.js';
import { makeRng } from './util.js';

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

// --- 作業小屋（中景） ---------------------------------------------------
function buildHut(matWood, matRoof, matSalt) {
  const g = new THREE.Group();
  const parts = [];
  const add = (geo, x, y, z, ry = 0) => {
    geo = geo.clone();
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    parts.push(geo);
  };
  // 高床の柱。塩水で足元が傷むので、実際の塩田小屋も床を上げる。
  for (const sx of [-1.4, 1.4]) {
    for (const sz of [-1.05, 1.05]) add(box(0.17, 1.25, 0.17), sx, 0.62, sz);
  }
  add(box(3.3, 0.16, 2.6), 0, 1.32, 0); // 床
  add(box(3.0, 1.55, 2.35), 0, 2.17, 0); // 壁
  add(box(3.5, 0.12, 2.9), 0, 2.98, 0); // 軒桁
  const hut = new THREE.Mesh(mergeGeometries(parts), matWood);
  hut.castShadow = true;
  hut.receiveShadow = true;
  g.add(hut);

  // 四角錐の屋根
  const roofGeo = new THREE.ConeGeometry(2.55, 1.15, 4);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, matRoof);
  roof.position.y = 3.6;
  roof.scale.set(1, 1, 0.86);
  roof.castShadow = true;
  g.add(roof);

  // 小屋の脇に積まれた塩
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.95, 14), matSalt);
  pile.position.set(2.6, TOP + 0.42, 1.2);
  pile.castShadow = true;
  pile.receiveShadow = true;
  g.add(pile);
  return g;
}

// --- ひとかたまりの道具（近景） -----------------------------------------
function buildTools(matWood) {
  const parts = [];
  const add = (geo, x, y, z, rot) => {
    geo = geo.clone();
    if (rot) geo.rotateZ(rot[0] || 0), geo.rotateY(rot[1] || 0), geo.rotateX(rot[2] || 0);
    geo.translate(x, y, z);
    parts.push(geo);
  };
  // 積み上げた板
  for (let i = 0; i < 5; i++) {
    add(box(2.4, 0.06, 0.34), (i % 2) * 0.06, TOP + 0.04 + i * 0.065, i * 0.02);
  }
  // 木の桶 2 つ
  for (const [ox, oz] of [
    [1.9, 0.9],
    [2.5, 0.35],
  ]) {
    const bucket = new THREE.CylinderGeometry(0.24, 0.2, 0.34, 12, 1, true);
    add(bucket, ox, TOP + 0.17, oz);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), ox, TOP + 0.02, oz);
  }
  // 塩を掻き寄せる木のレーキ（斜めに立てかける）
  add(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), -1.4, TOP + 0.82, 0.5, [0.42, 0, 0.18]);
  add(box(0.9, 0.07, 0.09), -1.85, TOP + 0.06, 0.7);
  return new THREE.Mesh(mergeGeometries(parts), matWood);
}

// --- 杭とロープ（近景・中景の境目をつくる） -----------------------------
function buildPostLine(matWood, matRope, points, height = 0.95) {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.075, 0.09, height, 7);
  const parts = [];
  for (const p of points) {
    const geo = postGeo.clone();
    geo.translate(p.x, TOP + height / 2 - 0.05, p.z);
    parts.push(geo);
  }
  const posts = new THREE.Mesh(mergeGeometries(parts), matWood);
  posts.castShadow = true;
  g.add(posts);

  // たるんだロープ
  const curvePts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (let t = 0; t <= 1.0001; t += 0.25) {
      const sag = Math.sin(t * Math.PI) * 0.13;
      curvePts.push(
        new THREE.Vector3(
          a.x + (b.x - a.x) * t,
          TOP + height - 0.14 - sag,
          a.z + (b.z - a.z) * t
        )
      );
    }
  }
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), curvePts.length * 2, 0.022, 5),
    matRope
  );
  g.add(rope);
  return g;
}

// --- フラミンゴ（遠景〜中景のシルエット） -------------------------------
// ピンクの池といえばこの鳥。クライマックスで静かに舞い降りてくる。
function buildFlamingoGeometries() {
  const bodyParts = [];
  const darkParts = [];

  const body = new THREE.SphereGeometry(0.28, 12, 9);
  body.scale(1.7, 1.0, 0.85);
  body.translate(0, 0.95, 0);
  bodyParts.push(body);

  // 尾
  const tail = new THREE.ConeGeometry(0.16, 0.42, 7);
  tail.rotateZ(Math.PI / 2 + 0.35);
  tail.translate(-0.55, 1.02, 0);
  bodyParts.push(tail);

  // S 字の首
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.32, 1.02, 0),
    new THREE.Vector3(0.52, 1.32, 0),
    new THREE.Vector3(0.5, 1.62, 0),
    new THREE.Vector3(0.3, 1.75, 0),
    new THREE.Vector3(0.14, 1.66, 0),
  ]);
  bodyParts.push(new THREE.TubeGeometry(neckCurve, 16, 0.055, 6));

  const head = new THREE.SphereGeometry(0.1, 10, 8);
  head.translate(0.12, 1.65, 0);
  bodyParts.push(head);

  // くちばし（黒い先端）
  const beak = new THREE.ConeGeometry(0.06, 0.26, 7);
  beak.rotateZ(Math.PI / 2 + 0.9);
  beak.translate(0.02, 1.55, 0);
  darkParts.push(beak);

  // 脚
  for (const zz of [-0.09, 0.09]) {
    const leg = new THREE.CylinderGeometry(0.026, 0.022, 0.95, 6);
    leg.translate(0.02, 0.47, zz);
    darkParts.push(leg);
  }

  return {
    body: mergeGeometries(bodyParts),
    dark: mergeGeometries(darkParts),
  };
}

// --- 遠くの山並み（空気遠近で霞む） -------------------------------------
function buildHills() {
  const R = 470;
  const segs = 160;
  const pos = [];
  const idx = [];
  const rng = makeRng(9182);
  const heights = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * Math.PI * 2;
    let h = 0;
    h += Math.sin(a * 2.1 + 0.7) * 9;
    h += Math.sin(a * 5.3 + 2.1) * 5.5;
    h += Math.sin(a * 11.7 + 4.4) * 2.6;
    h += (rng() - 0.5) * 2;
    heights.push(15 + h);
  }
  heights[segs] = heights[0];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    pos.push(x, FLOOR - 4, z);
    pos.push(x, FLOOR + heights[i], z);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x7d8a99),
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hills';
  return mesh;
}

// --- 草むら（風で揺れる） -----------------------------------------------
function buildGrass(rng) {
  const tex = grassTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  const geo = new THREE.PlaneGeometry(1.1, 0.85, 1, 3);
  // 根元を固定し、穂先だけ風で揺らすための重み
  const p = geo.attributes.position;
  const sway = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    sway[i] = Math.max(0, (p.getY(i) + 0.425) / 0.85);
  }
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  geo.translate(0, 0.425, 0);

  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.15 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform float uWind;'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.9;
         float s = aSway * aSway;
         transformed.x += sin( uTime * 2.3 + ph ) * s * ( 0.05 + uWind * 0.42 );
         transformed.z += cos( uTime * 1.7 + ph * 1.3 ) * s * ( 0.03 + uWind * 0.24 );`
      );
  };
  mat.customProgramCacheKey = () => 'grass-sway';

  // 畦の上に沿って生やす
  const spots = [];
  const lines = [
    { x0: -18.4, x1: 18.4, z: 12.4, n: 34 },
    { x0: -18.4, x1: 18.4, z: 13.6, n: 30 },
    { x0: -16.6, x1: -16.0, z: 0, n: 0 },
  ];
  for (const l of lines) {
    for (let i = 0; i < l.n; i++) {
      const t = i / Math.max(1, l.n - 1);
      spots.push([l.x0 + (l.x1 - l.x0) * t + (rng() - 0.5) * 0.9, l.z + (rng() - 0.5) * 0.7]);
    }
  }
  for (let i = 0; i < 40; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    spots.push([side * (16.2 + rng() * 2.0), -20 + rng() * 33]);
  }
  for (let i = 0; i < 16; i++) {
    spots.push([(rng() - 0.5) * 2.0, -18 + rng() * 15]);
  }

  const mesh = new THREE.InstancedMesh(geo, mat, spots.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let k = 0;
  for (const [x, z] of spots) {
    for (let c = 0; c < 2; c++) {
      const s = 0.75 + rng() * 0.7;
      pos.set(x + (rng() - 0.5) * 0.25, TOP - 0.06, z + (rng() - 0.5) * 0.25);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c * Math.PI * 0.5 + rng() * 0.7);
      sc.set(s, s * (0.8 + rng() * 0.5), s);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(k++, m);
    }
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function buildProps(scene, world) {
  const rng = makeRng(31337);
  const { matWood } = world.materials;

  const matRoof = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.85 });
  const matSalt = new THREE.MeshStandardMaterial({ color: 0xe9e4de, roughness: 0.62 });
  const matRope = new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 1 });

  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  // 中景：作業小屋
  const hut = buildHut(matWood, matRoof, matSalt);
  hut.position.set(17.0, TOP, -7.5);
  hut.rotation.y = -0.34;
  group.add(hut);

  // 近景：手前の畦に置かれた道具一式
  const tools = buildTools(matWood);
  tools.position.set(-6.5, 0, 12.6);
  tools.rotation.y = 0.2;
  tools.castShadow = true;
  tools.receiveShadow = true;
  group.add(tools);

  // 近景の杭とロープ。手前に横切る線があるだけで距離感が一段はっきりする。
  group.add(
    buildPostLine(matWood, matRope, [
      { x: -14, z: 11.6 },
      { x: -7.5, z: 11.4 },
      { x: -1, z: 11.6 },
      { x: 5.5, z: 11.4 },
      { x: 12, z: 11.6 },
    ])
  );

  // 塩の山（中景）
  const pileGeo = new THREE.ConeGeometry(1.0, 0.8, 13);
  const piles = [];
  for (const [x, z, s] of [
    [-16.9, -12.0, 1.0],
    [-16.9, -8.6, 0.82],
    [16.9, -14.0, 0.9],
    [0, -6.4, 0.7],
  ]) {
    const p = new THREE.Mesh(pileGeo, matSalt);
    p.position.set(x, TOP + 0.34 * s, z);
    p.scale.setScalar(s);
    p.castShadow = true;
    p.receiveShadow = true;
    group.add(p);
    piles.push(p);
  }

  // フラミンゴ。クライマックスまでは隠しておく。
  const fg = buildFlamingoGeometries();
  const matFlamBody = new THREE.MeshStandardMaterial({ color: 0xf58aa6, roughness: 0.72 });
  const matFlamDark = new THREE.MeshStandardMaterial({ color: 0x2b2429, roughness: 0.7 });
  const flamingos = [];
  const flamSpots = [
    [-9.5, 5.2, 0.6],
    [-7.6, 3.4, -0.9],
    [8.4, 6.1, 2.4],
    [11.2, 3.0, -2.2],
    [-4.0, -13.5, 1.4],
    [9.6, -11.0, -0.4],
    [4.2, 7.4, 3.0],
  ];
  for (const [x, z, ry] of flamSpots) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(fg.body, matFlamBody);
    const d = new THREE.Mesh(fg.dark, matFlamDark);
    b.castShadow = true;
    d.castShadow = true;
    g.add(b, d);
    g.position.set(x, FLOOR, z);
    g.rotation.y = ry;
    const s = 0.92 + rng() * 0.22;
    g.scale.setScalar(s);
    g.visible = false;
    group.add(g);
    flamingos.push({ group: g, phase: rng() * 6.28, baseY: FLOOR, x, z });
  }

  // 遠景：霞む山並み
  const hills = buildHills();
  scene.add(hills);

  // 草
  const grass = buildGrass(rng);
  group.add(grass.mesh);

  // 太陽（触れる対象）。空シェーダが描く太陽の位置に、光の玉と当たり判定を置く。
  const sunGroup = new THREE.Group();
  sunGroup.name = 'sunGroup';
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xfff0cf,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.0,
    })
  );
  glow.scale.setScalar(30);
  glow.renderOrder = 900;
  sunGroup.add(glow);
  const sunHit = new THREE.Mesh(
    new THREE.SphereGeometry(22, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  sunHit.name = 'hit_sun';
  sunGroup.add(sunHit);
  scene.add(sunGroup);

  // 風の筋（近景を横切って風の存在を見せる）
  const streakMat = new THREE.SpriteMaterial({
    map: streakTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const streaks = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(streakMat.clone());
    s.visible = false;
    s.renderOrder = 800;
    scene.add(s);
    streaks.push({ sprite: s, life: 0, speed: 0, y: 0, z: 0, x: 0, len: 1 });
  }

  return { group, hut, tools, piles, flamingos, hills, grass, sunGroup, glow, sunHit, streaks, rng };
}
