// 塩田そのものを組み立てる。
// 実寸を意識した寸法（畦幅 2.8〜4 m、池の深さ 0.3 m 前後、板の厚み 6 cm）を使い、
// 近景・中景・遠景が読み取れる立体として構成する。
import * as THREE from 'three';
import { createWaterMaterial } from './water.js';
import {
  soilTexture,
  bankTexture,
  saltBedTexture,
  pondFloorTexture,
  woodTexture,
  concreteTexture,
  spillTexture,
} from './textures.js';
import { clamp, lerp } from './util.js';

// --- 地形の基準高さ（メートル） ---------------------------------------
export const FLOOR = -0.62; // 池の底＝塩の床
export const TOP = 0.16; // 畦の天端（畦の高さは 0.78 m ＝ 大人の膝上あたり）
export const SLOPE = 1.1; // 畦の法面の水平方向の出（およそ 1:0.7 の土の安息角）

export const SEA_LEVEL = -0.05;

// 池の輪郭（底面での矩形）と満水位。下流ほど水位を下げ、自然に流れ落ちるようにする。
export const PONDS = [
  { id: 'p1', x0: -15.0, x1: -2.0, z0: -17.0, z1: -4.8, full: -0.20, salt: 0.20 },
  { id: 'p2', x0: 2.0, x1: 15.0, z0: -17.0, z1: -4.8, full: -0.25, salt: 0.28 },
  { id: 'p3', x0: -15.0, x1: 15.0, z0: -1.2, z1: 10.0, full: -0.30, salt: 0.32 },
];

// 畦。端どうしを重ねてあるので、交差部は立体の和として自然につながる。
const BUNDS = [
  { x0: -90, x1: 90, z0: -21, z1: -17, cut: { axis: 'x', a: -9.4, b: -6.6 } }, // A 奥の畦（樋口 0）
  { x0: -220, x1: 220, z0: -34, z1: -30 }, // 取水路の向こう岸
  { x0: -19, x1: -15, z0: -21, z1: 20 }, // B 左の畦
  { x0: 15, x1: 19, z0: -21, z1: 20 }, // C 右の畦
  { x0: -2.0, x1: 2.0, z0: -18, z1: -3.2, cut: { axis: 'z', a: -11.4, b: -9.0 } }, // D 中の畦（樋口 1）
  { x0: -17, x1: 17, z0: -4.8, z1: -1.2, cut: { axis: 'x', a: 4.6, b: 7.4 } }, // E 横の畦（樋口 2）
  { x0: -19, x1: 19, z0: 10, z1: 20 }, // F 手前の畦（近景の作業場）
];

// 樋門（といもん）。source から dest へ、指で板を上げると水が流れる。
export const GATE_DEFS = [
  {
    id: 'g0',
    source: 'sea',
    dest: 'p1',
    axis: 'z', // 水は -z から +z へ流れる
    center: new THREE.Vector3(-8.0, 0, -19.0),
    width: 2.8,
    span: [-21, -17],
    sill: -0.34,
    flowDir: 1,
  },
  {
    id: 'g1',
    source: 'p1',
    dest: 'p2',
    axis: 'x',
    center: new THREE.Vector3(0, 0, -10.2),
    width: 2.4,
    span: [-2.0, 2.0],
    sill: -0.44,
    flowDir: 1,
  },
  {
    id: 'g2',
    source: 'p2',
    dest: 'p3',
    axis: 'z',
    center: new THREE.Vector3(6.0, 0, -3.0),
    width: 2.8,
    span: [-4.8, -1.2],
    sill: -0.50,
    flowDir: 1,
  },
];

// 台形断面の畦（畦は下が広く上が狭い）。上面と法面で材質を分ける。
function bundGeometry(x0, x1, z0, z1, s = SLOPE) {
  const pos = [];
  const uv = [];
  const idx = [];
  const groups = [];

  const o = [
    [x0, FLOOR, z0],
    [x1, FLOOR, z0],
    [x1, FLOOR, z1],
    [x0, FLOOR, z1],
  ];
  const i = [
    [x0 + s, TOP, z0 + s],
    [x1 - s, TOP, z0 + s],
    [x1 - s, TOP, z1 - s],
    [x0 + s, TOP, z1 - s],
  ];

  const push = (v, u, vv) => {
    pos.push(v[0], v[1], v[2]);
    uv.push(u, vv);
    return pos.length / 3 - 1;
  };
  const quad = (a, b, c, d, uvs) => {
    const ia = push(a, uvs[0][0], uvs[0][1]);
    const ib = push(b, uvs[1][0], uvs[1][1]);
    const ic = push(c, uvs[2][0], uvs[2][1]);
    const id = push(d, uvs[3][0], uvs[3][1]);
    idx.push(ia, ib, ic, ia, ic, id);
  };

  const H = (TOP - FLOOR) / 3.2; // 法面の縦方向 UV スケール（横と同じ密度に揃える）
  const W = 1 / 3.2; // 法面の横方向 UV スケール

  // 法面 4 枚（外向き）
  const lenX = (x1 - x0) * W;
  const lenZ = (z1 - z0) * W;
  quad(o[1], o[0], i[0], i[1], [[lenX, 0], [0, 0], [0.12, H], [lenX - 0.12, H]]);
  quad(o[2], o[1], i[1], i[2], [[lenZ, 0], [0, 0], [0.12, H], [lenZ - 0.12, H]]);
  quad(o[3], o[2], i[2], i[3], [[lenX, 0], [0, 0], [0.12, H], [lenX - 0.12, H]]);
  quad(o[0], o[3], i[3], i[0], [[lenZ, 0], [0, 0], [0.12, H], [lenZ - 0.12, H]]);
  groups.push([0, idx.length, 0]);

  // 天端（歩ける道）
  const start = idx.length;
  const u0 = (x0 + s) / 4;
  const u1 = (x1 - s) / 4;
  const v0 = (z0 + s) / 4;
  const v1 = (z1 - s) / 4;
  quad(i[0], i[3], i[2], i[1], [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]);
  groups.push([start, idx.length - start, 1]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  for (const [s0, count, mat] of groups) geo.addGroup(s0, count, mat);
  geo.computeVertexNormals();
  return geo;
}

// 樋門で切り欠かれた畦を、2 本の畦に分けて返す。
function splitBund(b) {
  if (!b.cut) return [[b.x0, b.x1, b.z0, b.z1]];
  const { axis, a, c } = { axis: b.cut.axis, a: b.cut.a, c: b.cut.b };
  if (axis === 'x') {
    return [
      [b.x0, a, b.z0, b.z1],
      [c, b.x1, b.z0, b.z1],
    ];
  }
  return [
    [b.x0, b.x1, b.z0, a],
    [b.x0, b.x1, c, b.z1],
  ];
}

// 水位 y のとき、池の水面が底面矩形からどれだけ外へ広がるか。
export function waterInset(level) {
  return SLOPE * clamp((level - FLOOR) / (TOP - FLOOR), 0, 1);
}

export function buildWorld(scene, shared) {
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const texSoil = soilTexture();
  const texBank = bankTexture();
  const texBed = saltBedTexture();
  const texPondFloor = pondFloorTexture();
  const texWood = woodTexture();
  const texConcrete = concreteTexture();

  const matBank = new THREE.MeshStandardMaterial({ map: texBank, roughness: 0.95, metalness: 0 });
  const matSoil = new THREE.MeshStandardMaterial({ map: texSoil, roughness: 0.92, metalness: 0 });
  const matBed = new THREE.MeshStandardMaterial({ map: texBed, roughness: 0.88, metalness: 0 });
  const matPondFloor = new THREE.MeshStandardMaterial({
    map: texPondFloor,
    roughness: 0.96,
    metalness: 0,
  });
  const matWood = new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.82, metalness: 0 });
  const matConcrete = new THREE.MeshStandardMaterial({ map: texConcrete, roughness: 0.93, metalness: 0 });

  // 水位より上に残る白い塩の跡。水が引いた高さに応じて畦の法面が白くなる。
  const crustUniforms = { uWaterY: { value: FLOOR }, uCrust: { value: 0 } };
  matBank.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterY = crustUniforms.uWaterY;
    sh.uniforms.uCrust = crustUniforms.uCrust;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;'
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vWorldY;\nuniform float uWaterY;\nuniform float uCrust;'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float band = smoothstep( 0.16, 0.0, vWorldY - uWaterY ) * step( 0.0, vWorldY - uWaterY );
         float wet = smoothstep( 0.02, -0.14, vWorldY - uWaterY );
         diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.62, wet * 0.75 );
         diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.85, 0.86 ), band * uCrust * 0.9 );`
      );
  };
  matBank.customProgramCacheKey = () => 'bank-crust';

  // --- 塩の床（すべての池の底であり、遠景まで続く平原） ------------------
  texBed.repeat.set(100, 100); // 700 m の平面に対し 7 m ごとの繰り返し
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), matBed);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = FLOOR;
  bed.receiveShadow = true;
  bed.name = 'saltBed';
  group.add(bed);

  // --- 畦 --------------------------------------------------------------
  const bundGroup = new THREE.Group();
  bundGroup.name = 'bunds';
  for (const b of BUNDS) {
    for (const [x0, x1, z0, z1] of splitBund(b)) {
      const m = new THREE.Mesh(bundGeometry(x0, x1, z0, z1), [matBank, matSoil]);
      m.castShadow = true;
      m.receiveShadow = true;
      bundGroup.add(m);
    }
  }
  group.add(bundGroup);

  // --- 池の底 -----------------------------------------------------------
  // 周囲の乾いた塩原よりも暗く湿った面を敷き、水が入る前から「窪み」として読ませる。
  for (const def of PONDS) {
    const w = def.x1 - def.x0;
    const h = def.z1 - def.z0;
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (w / 6), uv.getY(i) * (h / 6));
    }
    const f = new THREE.Mesh(geo, matPondFloor);
    f.rotation.x = -Math.PI / 2;
    f.position.set((def.x0 + def.x1) / 2, FLOOR + 0.006, (def.z0 + def.z1) / 2);
    f.receiveShadow = true;
    f.name = `floor_${def.id}`;
    group.add(f);
  }

  // --- 池の水面 ---------------------------------------------------------
  const waterGeo = new THREE.PlaneGeometry(1, 1);
  const ponds = PONDS.map((def) => {
    const mat = createWaterMaterial(shared);
    const mesh = new THREE.Mesh(waterGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = `water_${def.id}`;
    mesh.renderOrder = 1;
    mesh.visible = false;
    group.add(mesh);
    return {
      def,
      mesh,
      mat,
      level: FLOOR,
      salinity: 0,
      inflow: 0,
      inflowPos: new THREE.Vector2(),
      crust: 0,
      cx: (def.x0 + def.x1) / 2,
      cz: (def.z0 + def.z1) / 2,
    };
  });
  const pondById = Object.fromEntries(ponds.map((p) => [p.def.id, p]));

  // --- 海と取水路 -------------------------------------------------------
  // 塩分 0 の暗い青緑のまま変わらない。この色があるからこそ、
  // 池のピンクが「濃くなった塩水の色」として読める。
  const seaMat = createWaterMaterial(shared);
  seaMat.uniforms.uSalinity.value = 0;
  seaMat.uniforms.uDepth.value = 2.5;
  seaMat.uniforms.uSize.value.set(1200, 300);
  seaMat.uniforms.uWind.value = 0.4;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 300), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_LEVEL - 0.02, -330);
  sea.renderOrder = 1;
  sea.name = 'sea';
  group.add(sea);

  // 塩田すべてに水を配る長い取水路。畦 A と向こう岸の畦にはさまれている。
  const canalMat = createWaterMaterial(shared);
  canalMat.uniforms.uSalinity.value = 0.05;
  canalMat.uniforms.uDepth.value = 0.55;
  canalMat.uniforms.uSize.value.set(440, 10.4);
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(440, 10.4), canalMat);
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(0, SEA_LEVEL, -25.5);
  canal.renderOrder = 1;
  canal.name = 'canal';
  group.add(canal);

  // --- 樋門 -------------------------------------------------------------
  const texSpill = spillTexture();
  const spillMat = new THREE.MeshBasicMaterial({
    map: texSpill,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });

  const gates = GATE_DEFS.map((def) => {
    const g = new THREE.Group();
    g.name = def.id;
    const along = def.axis === 'z' ? 'z' : 'x';
    const across = def.axis === 'z' ? 'x' : 'z';
    const len = def.span[1] - def.span[0];
    const midAlong = (def.span[0] + def.span[1]) / 2;
    const cAcross = along === 'z' ? def.center.x : def.center.z;

    const sizeFor = (w, h, l) =>
      along === 'z' ? new THREE.BoxGeometry(w, h, l) : new THREE.BoxGeometry(l, h, w);
    const place = (mesh, acrossOff, y, alongPos) => {
      if (along === 'z') mesh.position.set(cAcross + acrossOff, y, alongPos);
      else mesh.position.set(alongPos, y, cAcross + acrossOff);
      return mesh;
    };

    // 底樋（水が通るコンクリートの床）
    const sillH = def.sill - FLOOR;
    const sill = new THREE.Mesh(sizeFor(def.width + 0.7, sillH, len), matConcrete);
    place(sill, 0, FLOOR + sillH / 2, midAlong);
    sill.receiveShadow = true;
    g.add(sill);

    // 両側の袖壁
    for (const sgn of [-1, 1]) {
      const cheek = new THREE.Mesh(sizeFor(0.36, TOP + 0.16 - FLOOR, len), matConcrete);
      place(cheek, sgn * (def.width / 2 + 0.18), (FLOOR + TOP + 0.16) / 2, midAlong);
      cheek.castShadow = true;
      cheek.receiveShadow = true;
      g.add(cheek);
      // 袖壁の上に立つ木の柱（板を案内する溝柱）
      const post = new THREE.Mesh(sizeFor(0.16, 1.15, 0.16), matWood);
      place(post, sgn * (def.width / 2 + 0.13), TOP + 0.16 + 0.5, def.center[along]);
      post.castShadow = true;
      g.add(post);
    }

    // 上げ下げする板（実際に上がる部品）
    const boardH = TOP + 0.1 - def.sill;
    const board = new THREE.Group();
    const plank = new THREE.Mesh(sizeFor(def.width + 0.12, boardH, 0.07), matWood);
    plank.castShadow = true;
    board.add(plank);
    // 掴むための横木。これがあるだけで「上に引く物」だと伝わる。
    const handle = new THREE.Mesh(sizeFor(def.width + 0.44, 0.13, 0.13), matWood);
    handle.position.y = boardH / 2 + 0.16;
    handle.castShadow = true;
    board.add(handle);
    for (const sgn of [-1, 1]) {
      const arm = new THREE.Mesh(sizeFor(0.09, 0.3, 0.09), matWood);
      arm.position.set(
        along === 'z' ? sgn * (def.width / 2 + 0.14) : 0,
        boardH / 2 + 0.03,
        along === 'z' ? 0 : sgn * (def.width / 2 + 0.14)
      );
      board.add(arm);
    }
    const boardClosedY = def.sill + boardH / 2;
    board.position.set(def.center.x, boardClosedY, def.center.z);
    if (along === 'z') board.position.z = def.center.z;
    else board.position.x = def.center.x;
    g.add(board);

    // 樋の中を流れる水
    const flowMat = createWaterMaterial(shared);
    flowMat.uniforms.uSalinity.value = 0.08;
    flowMat.uniforms.uDepth.value = 0.09;
    flowMat.uniforms.uWind.value = 0.55;
    flowMat.uniforms.uInflow.value = 1;
    flowMat.uniforms.uSize.value.set(def.width, len);
    const flowGeo = new THREE.PlaneGeometry(def.width, len);
    const flow = new THREE.Mesh(flowGeo, flowMat);
    flow.rotation.x = -Math.PI / 2;
    if (along === 'x') flow.rotation.z = Math.PI / 2;
    flow.position.set(def.center.x, def.sill + 0.14, def.center.z);
    if (along === 'z') flow.position.z = midAlong;
    else flow.position.x = midAlong;
    flow.renderOrder = 2;
    flow.visible = false;
    g.add(flow);

    // 落ち口の水しぶき
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(def.width * 0.92, 1), spillMat.clone());
    spill.visible = false;
    spill.renderOrder = 3;
    g.add(spill);

    // 指で触る当たり判定。実物よりかなり大きく取り、雑に触っても届くようにする。
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 3.2, 3.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(def.center.x, TOP + 0.6, def.center.z);
    proxy.name = `hit_${def.id}`;
    proxy.userData.gateId = def.id;
    g.add(proxy);

    group.add(g);

    // 落ち口（下流側）の座標
    const dropAlong = def.span[def.flowDir > 0 ? 1 : 0];
    const dropPos = new THREE.Vector2(
      along === 'z' ? def.center.x : dropAlong,
      along === 'z' ? dropAlong : def.center.z
    );

    return {
      def,
      group: g,
      board,
      boardClosedY,
      boardOpenY: boardClosedY + boardH * 0.86 + 0.12,
      flow,
      flowMat,
      spill,
      proxy,
      dropPos,
      open: 0,
      targetOpen: 0,
      unlocked: false,
      done: false,
      handleWorld: new THREE.Vector3(def.center.x, TOP + 0.62, def.center.z),
    };
  });

  return {
    group,
    ponds,
    pondById,
    gates,
    sea,
    canal,
    seaMat,
    canalMat,
    crustUniforms,
    materials: { matBank, matSoil, matBed, matPondFloor, matWood, matConcrete },
    textures: { texSoil, texBank, texBed, texPondFloor, texWood, texConcrete },
  };
}

// 池の水面メッシュを、いまの水位に合わせて更新する。
export function updatePondMesh(p) {
  const def = p.def;
  const inset = waterInset(p.level);
  const w = def.x1 - def.x0 + inset * 2;
  const h = def.z1 - def.z0 + inset * 2;
  const cx = (def.x0 + def.x1) / 2;
  const cz = (def.z0 + def.z1) / 2;
  p.mesh.scale.set(w, h, 1);
  p.mesh.position.set(cx, p.level, cz);
  p.mesh.visible = p.level > FLOOR + 0.012;
  const u = p.mat.uniforms;
  u.uSize.value.set(w, h);
  u.uDepth.value = Math.max(p.level - FLOOR, 0.001);
  u.uSalinity.value = p.salinity;
  u.uCrust.value = p.crust;
  u.uInflow.value = p.inflow;
  u.uInflowPos.value.copy(p.inflowPos);
}

// 樋門の見た目（板の高さ、流れ、落ち口）を更新する。
export function updateGateMesh(g, sourceLevel, destLevel, dt) {
  g.board.position.y = lerp(g.boardClosedY, g.boardOpenY, g.open);
  const flowing = g.open > 0.06 && sourceLevel > g.def.sill + 0.02;
  g.flow.visible = flowing;
  if (flowing) {
    const surface = Math.min(sourceLevel - 0.015, g.def.sill + 0.22);
    g.flow.position.y = surface;
    g.flowMat.uniforms.uDepth.value = Math.max(surface - g.def.sill, 0.02);
    g.flowMat.uniforms.uInflowPos.value.set(g.def.center.x, g.def.center.z);

    // 落ち口：下流の水位まで落ちる水のカーテン
    const dropTop = surface;
    const dropBottom = Math.max(destLevel, FLOOR);
    const h = Math.max(dropTop - dropBottom, 0);
    g.spill.visible = h > 0.02;
    if (g.spill.visible) {
      g.spill.scale.set(1, h / 1, 1);
      g.spill.position.set(g.dropPos.x, dropBottom + h / 2, g.dropPos.y);
      if (g.def.axis === 'x') g.spill.rotation.y = Math.PI / 2;
      g.spill.material.opacity = 0.55 + 0.35 * Math.min(1, g.open);
      g.spill.material.map.offset.y -= dt * 2.4;
    }
  } else {
    g.spill.visible = false;
  }
  return flowing;
}
