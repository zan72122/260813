import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Materials } from './materials';
import { softCircleTexture, starTexture, clamp, damp, dampV3 } from './util';

/** 汎用ビルボードパーティクルプール */
export class ParticlePool {
  group = new THREE.Group();
  private items: { m: THREE.Sprite; life: number; max: number; vel: THREE.Vector3; grow: number; g: number }[] = [];
  private mat: THREE.SpriteMaterial;
  constructor(scene: THREE.Object3D, tex: THREE.Texture, count: number, opts: { color?: number; blending?: THREE.Blending; opacity?: number } = {}) {
    this.mat = new THREE.SpriteMaterial({
      map: tex,
      color: opts.color ?? 0xffffff,
      transparent: true,
      opacity: opts.opacity ?? 0.8,
      blending: opts.blending ?? THREE.NormalBlending,
      depthWrite: false,
    });
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.mat.clone());
      s.visible = false;
      this.group.add(s);
      this.items.push({ m: s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, g: 0 });
    }
    scene.add(this.group);
  }
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, grow = 0, gravity = 0, opacity = 0.8) {
    const it = this.items.find(i => i.life <= 0);
    if (!it) return;
    it.m.visible = true;
    it.m.position.copy(pos);
    it.m.scale.setScalar(size);
    (it.m.material as THREE.SpriteMaterial).opacity = opacity;
    it.vel.copy(vel);
    it.life = it.max = life;
    it.grow = grow;
    it.g = gravity;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.m.visible = false; continue; }
      it.vel.y -= it.g * dt;
      it.m.position.addScaledVector(it.vel, dt);
      const t = it.life / it.max;
      it.m.scale.addScalar(it.grow * dt);
      (it.m.material as THREE.SpriteMaterial).opacity = 0.8 * t;
    }
  }
}

/** 注ぎ流(お湯/クリーム)の簡易メッシュ */
export class Stream {
  mesh: THREE.Mesh;
  private geo: THREE.CylinderGeometry;
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  level = 0; // 0..1 流量
  constructor(parent: THREE.Object3D, mat: THREE.Material, radius = 0.03) {
    this.geo = new THREE.CylinderGeometry(radius * 0.7, radius, 1, 10, 6, true);
    this.geo.translate(0, -0.5, 0);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  update(t: number) {
    if (this.level <= 0.02) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const len = this.from.distanceTo(this.to);
    this.mesh.position.copy(this.from);
    this.mesh.scale.set(this.level * 0.7 + 0.3, len, this.level * 0.7 + 0.3);
    this.mesh.lookAt(this.to);
    this.mesh.rotateX(-Math.PI / 2);
    // ゆらぎ
    this.mesh.rotation.z += Math.sin(t * 14) * 0.02 * this.level;
  }
}

/** 波紋リングプール(水面用) */
export class RipplePool {
  private items: { m: THREE.Mesh; life: number; max: number }[] = [];
  constructor(parent: THREE.Object3D, color = 0xffffff, count = 6) {
    const geo = new THREE.RingGeometry(0.9, 1, 40);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      parent.add(m);
      this.items.push({ m, life: 0, max: 1 });
    }
  }
  spawn(pos: THREE.Vector3, life = 1) {
    const it = this.items.find(i => i.life <= 0);
    if (!it) return;
    it.m.visible = true;
    it.m.position.copy(pos);
    it.life = it.max = life;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const t = 1 - it.life / it.max;
      if (it.life <= 0) { it.m.visible = false; continue; }
      const s = 0.06 + t * 0.4;
      it.m.scale.setScalar(s);
      (it.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    }
  }
}

function makeFaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  // ほほ
  g.fillStyle = 'rgba(255,150,180,0.7)';
  g.beginPath(); g.arc(52, 168, 30, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(204, 168, 30, 0, Math.PI * 2); g.fill();
  // 目 (まる目)
  g.fillStyle = '#4a3826';
  g.beginPath(); g.arc(84, 110, 20, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(172, 110, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(90, 103, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(178, 103, 7, 0, Math.PI * 2); g.fill();
  // 口
  g.strokeStyle = '#4a3826';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath(); g.arc(128, 150, 26, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** チーズ職人ロボット */
export class Chef {
  root = new THREE.Group();
  head: THREE.Group;
  apronMesh: THREE.Mesh;
  handL: THREE.Group;
  handR: THREE.Group;
  private handLTarget = new THREE.Vector3(-0.42, 0.62, -0.9);
  private handRTarget = new THREE.Vector3(0.42, 0.62, -0.9);
  private restL = new THREE.Vector3(-0.42, 0.62, -0.9);
  private restR = new THREE.Vector3(0.42, 0.62, -0.9);
  private lookTarget: THREE.Vector3 | null = null;
  bob = 0;

  constructor(mats: Materials) {
    const r = this.root;
    // 体
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.4, 8, 20), mats.robot);
    body.position.y = 0.62;
    body.castShadow = true;
    r.add(body);
    // エプロン (胸あて + 前掛け)
    this.apronMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.3, 8, 20),
      mats.apron,
    );
    this.apronMesh.position.set(0, 0.5, 0.1);
    this.apronMesh.scale.set(0.97, 0.9, 0.9);
    r.add(this.apronMesh);
    const apronTie = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.apron);
    apronTie.position.set(0, 0.9, 0.3);
    r.add(apronTie);
    // 頭
    this.head = new THREE.Group();
    this.head.position.y = 1.28;
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 26, 20), mats.robot);
    headM.castShadow = true;
    this.head.add(headM);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.21, 24),
      new THREE.MeshBasicMaterial({ map: makeFaceTexture(), transparent: false }),
    );
    face.position.set(0, -0.01, 0.302);
    face.scale.y = 0.95;
    this.head.add(face);
    // コック帽
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    );
    hat.position.y = 0.36;
    this.head.add(hat);
    const hatTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), hat.material);
    hatTop.position.y = 0.5;
    hatTop.scale.y = 0.6;
    this.head.add(hatTop);
    r.add(this.head);
    // 腕(手のみ表示、腕は細チューブ)
    this.handL = this.makeHand(mats);
    this.handR = this.makeHand(mats);
    r.add(this.handL, this.handR);
    this.handL.position.copy(this.restL);
    this.handR.position.copy(this.restR);
  }

  private makeHand(mats: Materials): THREE.Group {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), mats.robot);
    s.castShadow = true;
    g.add(s);
    return g;
  }

  /** ワールド座標で手の目標を指定 (null で休め) */
  setHands(l: THREE.Vector3 | null, r: THREE.Vector3 | null) {
    this.handLTarget.copy(l ?? this.restL.clone().add(this.root.position));
    this.handRTarget.copy(r ?? this.restR.clone().add(this.root.position));
    if (!l) this.handLTarget.copy(this.restL).add(this.root.position);
    if (!r) this.handRTarget.copy(this.restR).add(this.root.position);
  }

  look(target: THREE.Vector3 | null) {
    this.lookTarget = target ? target.clone() : null;
  }

  update(dt: number, t: number) {
    this.bob = Math.sin(t * 1.6) * 0.02;
    this.root.position.y = this.bob;
    // 手 (root ローカルへ変換)
    const lt = this.root.worldToLocal(this.handLTarget.clone());
    const rt = this.root.worldToLocal(this.handRTarget.clone());
    dampV3(this.handL.position, lt, 8, dt);
    dampV3(this.handR.position, rt, 8, dt);
    // 頭の向き
    if (this.lookTarget) {
      const local = this.root.worldToLocal(this.lookTarget.clone());
      const yaw = clamp(Math.atan2(local.x, local.z + 2), -0.5, 0.5);
      const pitch = clamp(-Math.atan2(local.y - 1.28, 1.6) * 0.8, -0.35, 0.25);
      this.head.rotation.y = damp(this.head.rotation.y, yaw, 6, dt);
      this.head.rotation.x = damp(this.head.rotation.x, pitch, 6, dt);
    } else {
      this.head.rotation.y = damp(this.head.rotation.y, 0, 4, dt);
      this.head.rotation.x = damp(this.head.rotation.x, 0, 4, dt);
    }
  }
}

function makeBowl(radius: number, height: number, mat: THREE.Material, rimColor: number | null): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = Math.sin(t * Math.PI * 0.5) * radius;
    const y = (1 - Math.cos(t * Math.PI * 0.5)) * height;
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  (body.material as THREE.Material).side = THREE.DoubleSide;
  g.add(body);
  if (rimColor !== null) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius, height * 0.09, 10, 40),
      new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.5 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = height;
    rim.name = 'rim';
    g.add(rim);
  }
  return g;
}

function makePlate(mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.05, 36), mats.plate);
  base.position.y = 0.025;
  base.receiveShadow = true;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 10, 40), mats.plate);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.055;
  g.add(rim);
  // 飾りスタンプ (accent) — 小さな花びら
  const deco = new THREE.Group();
  deco.name = 'deco';
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffb3d1, roughness: 0.6 });
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), petalMat);
    const a = (i / 8) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.36, 0.055, Math.sin(a) * 0.36);
    p.scale.y = 0.5;
    deco.add(p);
  }
  g.add(deco);
  return g;
}

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  mats = new Materials();
  chef: Chef;
  props: Record<string, THREE.Object3D> = {};
  steam: ParticlePool;
  splash: ParticlePool;
  sparkle: ParticlePool;
  drips: ParticlePool;
  hotStream: Stream;
  creamStream: Stream;
  ripples: RipplePool;
  coldRipples: RipplePool;
  time = 0;
  private targetDpr: number;
  private fpsAcc = 0; private fpsN = 0; private fpsTimer = 0;
  reduceMotion = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    this.targetDpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
    this.renderer.setPixelRatio(this.targetDpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0xfdf0da);
    this.scene.fog = new THREE.Fog(0xfdf0da, 7, 14);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
    this.camera.position.set(0, 1.6, 3.2);
    this.camera.lookAt(0, 0.3, 0);

    // 環境光沢
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as any).environmentIntensity = 0.55;

    // ライト
    const hemi = new THREE.HemisphereLight(0xfff6e6, 0xd8b98f, 0.75);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2dc, 1.6);
    key.position.set(1.8, 3.4, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.2; key.shadow.camera.right = 2.2;
    key.shadow.camera.top = 2.5; key.shadow.camera.bottom = -1.5;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 9;
    key.shadow.bias = -0.002;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfeaff, 0.4);
    fill.position.set(-2, 2, 1);
    this.scene.add(fill);

    this.buildSet();
    this.chef = new Chef(this.mats);
    this.chef.root.position.set(0, 0, -1.35);
    this.scene.add(this.chef.root);

    // パーティクル
    const soft = softCircleTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    this.steam = new ParticlePool(this.scene, soft, 14, { opacity: 0.35 });
    this.splash = new ParticlePool(this.scene, softCircleTexture('rgba(210,240,255,1)', 'rgba(210,240,255,0)'), 20);
    this.sparkle = new ParticlePool(this.scene, starTexture(), 16, { blending: THREE.AdditiveBlending });
    this.drips = new ParticlePool(this.scene, softCircleTexture('rgba(200,235,255,1)', 'rgba(200,235,255,0)'), 12);
    this.hotStream = new Stream(this.scene, this.mats.hotWater, 0.035);
    this.creamStream = new Stream(this.scene, this.mats.cream, 0.03);

    const mainBowl = this.props.mainBowl;
    this.ripples = new RipplePool(mainBowl, 0xffffff, 5);
    this.coldRipples = new RipplePool(this.props.coldBowl, 0xffffff, 6);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  private buildSet() {
    const m = this.mats;
    // 床
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xe8cba0, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.92;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // 作業台
    const table = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 2.6), m.wood);
    table.position.y = -0.08;
    table.receiveShadow = true;
    table.castShadow = true;
    this.scene.add(table);
    const legGeo = new THREE.BoxGeometry(0.14, 0.85, 0.14);
    for (const [x, z] of [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.1], [2.1, 1.1]]) {
      const leg = new THREE.Mesh(legGeo, m.woodDark);
      leg.position.set(x, -0.5, z);
      this.scene.add(leg);
    }
    // 背景の壁 + 窓 + 棚
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), m.wall);
    wall.position.set(0, 2, -3.4);
    wall.receiveShadow = true;
    this.scene.add(wall);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.4), new THREE.MeshBasicMaterial({ color: 0xcfe8ff }));
    win.position.set(-1.9, 2.0, -3.38);
    this.scene.add(win);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.55, 0.06), m.woodDark);
    winFrame.position.set(-1.9, 2.0, -3.42);
    this.scene.add(winFrame);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), m.woodDark);
    shelf.position.set(1.7, 2.1, -3.15);
    this.scene.add(shelf);
    // 棚上の小物 (チーズの丸太・瓶)
    for (let i = 0; i < 3; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 - i * 0.03, 0.2 - i * 0.03, 0.14, 20),
        new THREE.MeshStandardMaterial({ color: 0xf5e6b8, roughness: 0.7 }),
      );
      wheel.position.set(1.15 + i * 0.55, 2.22, -3.15);
      this.scene.add(wheel);
    }

    // メインボウル (ステンレス)
    const mainBowl = makeBowl(0.62, 0.34, m.steel, 0xffb3d1);
    mainBowl.position.set(0, 0, 0);
    this.scene.add(mainBowl);
    this.props.mainBowl = mainBowl;
    // お湯の水面
    const hotSurf = new THREE.Mesh(new THREE.CircleGeometry(0.55, 36), m.hotWater);
    hotSurf.rotation.x = -Math.PI / 2;
    hotSurf.position.y = 0.06;
    hotSurf.visible = false;
    hotSurf.name = 'hotSurf';
    mainBowl.add(hotSurf);

    // ケトル(お湯) + スタンド + レバー
    const kettleG = new THREE.Group();
    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), m.steel);
    kettle.scale.y = 0.85;
    kettle.castShadow = true;
    kettleG.add(kettle);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.42, 12), m.steel);
    spout.position.set(-0.3, 0.1, 0);
    spout.rotation.z = Math.PI / 3.2;
    kettleG.add(spout);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), m.steel);
    lid.position.y = 0.26;
    lid.scale.y = 0.5;
    kettleG.add(lid);
    kettleG.position.set(1.15, 0.62, -0.5);
    this.scene.add(kettleG);
    this.props.kettle = kettleG;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.42, 14), m.woodDark);
    stand.position.set(1.15, 0.2, -0.5);
    this.scene.add(stand);
    this.props.kettleStand = stand;
    // レバー (大きな取っ手)
    const leverG = new THREE.Group();
    const leverArm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), m.woodDark);
    leverArm.position.y = 0.25;
    leverG.add(leverArm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), new THREE.MeshStandardMaterial({ color: 0xff9ec6, roughness: 0.5 }));
    knob.position.y = 0.52;
    knob.name = 'knob';
    leverG.add(knob);
    leverG.position.set(1.12, 0.1, 0.14);
    this.scene.add(leverG);
    this.props.lever = leverG;

    // stracciatella ボウル (レインボー縁)
    const sideBowl = makeBowl(0.42, 0.26, new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.4 }), null);
    // レインボー縁: 色付きセグメントのトーラス
    const rimColors = [0xff9ec6, 0xffd166, 0x8dd7c7, 0x9ed1ff, 0xc9a7f5, 0xffb289];
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.024, 8, 10, Math.PI / 3),
        new THREE.MeshStandardMaterial({ color: rimColors[i], roughness: 0.5 }),
      );
      seg.rotation.x = Math.PI / 2;
      seg.rotation.z = (i * Math.PI) / 3;
      seg.position.y = 0.26;
      sideBowl.add(seg);
    }
    sideBowl.position.set(-1.15, 0, 0.1);
    this.scene.add(sideBowl);
    this.props.sideBowl = sideBowl;

    // クリームピッチャー + レバー
    const pitcher = new THREE.Group();
    const pbody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 18), new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.35 }));
    pbody.position.y = 0.2;
    pbody.castShadow = true;
    pitcher.add(pbody);
    const plip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), pbody.material);
    plip.position.set(-0.14, 0.42, 0);
    plip.rotation.z = 0.8;
    pitcher.add(plip);
    const pknob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 }));
    pknob.position.set(0.22, 0.5, 0);
    pknob.name = 'creamKnob';
    pitcher.add(pknob);
    pitcher.position.set(-1.1, 0, -0.75);
    this.scene.add(pitcher);
    this.props.pitcher = pitcher;

    // 冷水ボウル
    const coldBowl = makeBowl(0.5, 0.3, m.steel, 0x9ed1ff);
    coldBowl.position.set(1.55, 0, 0.45);
    this.scene.add(coldBowl);
    this.props.coldBowl = coldBowl;
    const coldSurf = new THREE.Mesh(new THREE.CircleGeometry(0.44, 36), m.coldWater);
    coldSurf.rotation.x = -Math.PI / 2;
    coldSurf.position.y = 0.2;
    coldSurf.name = 'coldSurf';
    coldBowl.add(coldSurf);

    // 皿
    const plate = makePlate(m);
    plate.position.set(0.7, 0, 0.95);
    this.scene.add(plate);
    this.props.plate = plate;

    // 道具: パドル / スプーン / 穴あき杓子
    const paddle = new THREE.Group();
    const pHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 10), m.woodDark);
    pHandle.rotation.x = Math.PI / 3;
    pHandle.position.set(0, 0.18, 0.18);
    paddle.add(pHandle);
    const pBlade = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), m.wood);
    pBlade.scale.set(1, 0.3, 1.4);
    paddle.add(pBlade);
    paddle.visible = false;
    this.scene.add(paddle);
    this.props.paddle = paddle;

    const spoon = new THREE.Group();
    const sHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), m.woodDark);
    sHandle.rotation.x = Math.PI / 2.6;
    sHandle.position.set(0, 0.21, 0.2);
    spoon.add(sHandle);
    const sCup = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), m.wood);
    sCup.scale.set(1, 0.45, 1.15);
    spoon.add(sCup);
    const scoopBlob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), m.cream);
    scoopBlob.position.y = 0.05;
    scoopBlob.scale.set(1, 0.7, 1.1);
    scoopBlob.name = 'scoopBlob';
    scoopBlob.visible = false;
    spoon.add(scoopBlob);
    spoon.visible = false;
    this.scene.add(spoon);
    this.props.spoon = spoon;

    // ナイフ(職人用) — 丸い安全な見た目
    const knife = new THREE.Group();
    const kHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), m.woodDark);
    kHandle.rotation.z = Math.PI / 2;
    kHandle.position.x = 0.15;
    knife.add(kHandle);
    const kBlade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.012), m.steel);
    kBlade.position.x = -0.04;
    knife.add(kBlade);
    knife.visible = false;
    this.scene.add(knife);
    this.props.knife = knife;
  }

  /** 装飾の適用 */
  applyDecor(apron: number, bowlRim: number, plateStyle: number) {
    const { APRON_COLORS, BOWL_RIMS, PLATE_STYLES } = (this as any).constructor._colors ?? {};
    void APRON_COLORS; void BOWL_RIMS; void PLATE_STYLES; void apron; void bowlRim; void plateStyle;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get portrait() { return window.innerHeight > window.innerWidth; }

  /** adaptive DPR: 低FPSが続いたら解像度を下げる */
  private adaptDpr(dt: number) {
    this.fpsAcc += dt; this.fpsN++;
    this.fpsTimer += dt;
    if (this.fpsTimer > 3) {
      const avg = this.fpsAcc / this.fpsN;
      this.fpsTimer = 0; this.fpsAcc = 0; this.fpsN = 0;
      const cur = this.renderer.getPixelRatio();
      if (avg > 1 / 35 && cur > 1.0) {
        this.renderer.setPixelRatio(Math.max(1.0, cur - 0.25));
        this.resize();
      } else if (avg < 1 / 55 && cur < this.targetDpr) {
        this.renderer.setPixelRatio(Math.min(this.targetDpr, cur + 0.25));
        this.resize();
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    this.chef.update(dt, this.time);
    this.steam.update(dt);
    this.splash.update(dt);
    this.sparkle.update(dt);
    this.drips.update(dt);
    this.hotStream.update(this.time);
    this.creamStream.update(this.time);
    this.ripples.update(dt);
    this.coldRipples.update(dt);
    this.adaptDpr(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** 成功のキラキラ */
  celebrate(pos: THREE.Vector3) {
    if (this.reduceMotion) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.sparkle.spawn(
        pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15)),
        new THREE.Vector3(Math.cos(a) * 0.5, 1.2 + Math.sin(i * 3.7) * 0.4, Math.sin(a) * 0.5),
        0.9, 0.09, 0.02, 2.2,
      );
    }
  }
}
