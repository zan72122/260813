// 工房の3D空間: 部屋・作業台・職人・照明・壁のギャラリー
// 近景=作業台と管 / 中景=職人と道具 / 遠景=レンガ壁・棚・窓 と奥行きを分離
import * as THREE from 'three';
import { woodTexture, benchTexture, brickTexture, floorTexture, windowTexture, radialSprite } from './textures.js';
import { UniformPolyCurve, additiveMat, GRAD_GLSL, VERT } from './neonTube.js';
import { gradColorAt } from './shapes.js';

const ROOM = { w: 7.4, d: 7.0, h: 3.1, backZ: -2.35 };
const _aimTmp = new THREE.Vector3();

const GALLERY_FRAG = `
precision highp float;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform float uOn;
${GRAD_GLSL}
void main(){
  float edge = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 col = grad(vUv.x) * uOn * pow(edge, 0.6) * 1.5;
  gl_FragColor = vec4(col, 1.0);
}`;

export class World {
  constructor(scene) {
    this.scene = scene;
    this.neonLightTargets = [];
    this._buildRoom();
    this._buildBench();
    this._buildCraftsman();
    this._buildLights();
    this._buildGallery();
    this.time = 0;
  }

  _std(opts) { return new THREE.MeshStandardMaterial(opts); }

  _buildRoom() {
    const s = this.scene;
    // 床
    const floorT = floorTexture();
    floorT.repeat.set(2.4, 2.4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      this._std({ map: floorT, roughness: 0.42, metalness: 0.06, envMapIntensity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.6);
    floor.receiveShadow = true;
    s.add(floor);

    // 背面レンガ壁
    const brickT = brickTexture();
    brickT.repeat.set(2.6, 1.2);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.w, ROOM.h),
      this._std({ map: brickT, roughness: 0.92, metalness: 0, envMapIntensity: 0.22 })
    );
    back.position.set(0, ROOM.h / 2, ROOM.backZ);
    back.receiveShadow = true;
    s.add(back);

    // 側壁（漆喰、暗め）
    const sideMat = this._std({ color: 0x3a3340, roughness: 0.95, envMapIntensity: 0.15 });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.d, ROOM.h), sideMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-ROOM.w / 2, ROOM.h / 2, 0.6);
    s.add(left);
    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.x = ROOM.w / 2;
    s.add(right);
    // 天井
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d),
      this._std({ color: 0x241f2c, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM.h, 0.6);
    s.add(ceil);

    // 窓（夜景）
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.12),
      new THREE.MeshBasicMaterial({ map: windowTexture() })
    );
    win.position.set(-2.15, 1.85, ROOM.backZ + 0.012);
    s.add(win);
    const frameMat = this._std({ color: 0x2b2018, roughness: 0.8 });
    const mkBar = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
      m.position.set(-2.15 + x, 1.85 + y, ROOM.backZ + 0.03);
      s.add(m);
    };
    mkBar(1.02, 0.06, 0, 0.59); mkBar(1.02, 0.06, 0, -0.59);
    mkBar(0.06, 1.24, 0.49, 0); mkBar(0.06, 1.24, -0.49, 0);
    mkBar(0.04, 1.12, 0, 0); mkBar(0.92, 0.04, 0, 0);

    // 棚 + ガラス瓶（遠景の小物）
    const shelfMat = this._std({ map: woodTexture('#54402a', 256, 128, 12), roughness: 0.85 });
    const jarMat = new THREE.MeshPhysicalMaterial({
      color: 0xaad4cf, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.4,
      envMapIntensity: 0.9,
    });
    const powderMats = [0xc7743a, 0x7a9c56, 0x8a6ab0, 0xb0a04e].map(c =>
      this._std({ color: c, roughness: 0.9 }));
    for (const [sx, sy] of [[1.85, 2.15], [1.85, 1.7]]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.045, 0.26), shelfMat);
      shelf.position.set(sx, sy, ROOM.backZ + 0.15);
      shelf.castShadow = shelf.receiveShadow = true;
      this.scene.add(shelf);
      for (let i = 0; i < 5; i++) {
        const h = 0.13 + (i % 3) * 0.045;
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, h, 10), jarMat);
        jar.position.set(sx - 0.7 + i * 0.34, sy + h / 2 + 0.024, ROOM.backZ + 0.15);
        this.scene.add(jar);
        const powder = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.048, h * 0.55, 10),
          powderMats[i % 4]);
        powder.position.copy(jar.position);
        powder.position.y -= h * 0.2;
        this.scene.add(powder);
      }
    }

    // 壁に立て掛けたガラス管の在庫（左奥）
    const stockMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8ecef, roughness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 1.0,
    });
    for (let i = 0; i < 6; i++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.7, 8), stockMat);
      tube.position.set(-3.15 + i * 0.055, 0.86, ROOM.backZ + 0.35 + (i % 2) * 0.04);
      tube.rotation.z = 0.06 + i * 0.012;
      this.scene.add(tube);
    }
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.24),
      this._std({ color: 0x2c2118, roughness: 0.9 }));
    rack.position.set(-3.0, 0.04, ROOM.backZ + 0.38);
    this.scene.add(rack);
  }

  _buildBench() {
    const s = this.scene;
    const bench = new THREE.Group();
    const topT = benchTexture();
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.06, 0.78),
      this._std({ map: topT, roughness: 0.6, metalness: 0.02, envMapIntensity: 0.4 })
    );
    top.position.y = 0.89;
    top.castShadow = top.receiveShadow = true;
    bench.add(top);
    const legMat = this._std({ color: 0x33261a, roughness: 0.85 });
    for (const [x, z] of [[-0.95, -0.3], [0.95, -0.3], [-0.95, 0.3], [0.95, 0.3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.09), legMat);
      leg.position.set(x, 0.43, z);
      leg.castShadow = true;
      bench.add(leg);
      // 接地の影だまり
      const blob = new THREE.Mesh(
        new THREE.CircleGeometry(0.11, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.set(x, 0.004, z);
      bench.add(blob);
    }
    // 貫
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.06), legMat);
    rail.position.set(0, 0.24, -0.3);
    bench.add(rail);

    // サインの背板（暗色ボード: 透明な管を見やすく、点灯時は反射板に）
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.98, 0.03),
      this._std({ color: 0x17141d, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.4 })
    );
    board.position.set(0, 1.42, -0.37);
    board.rotation.x = -0.10;
    board.castShadow = board.receiveShadow = true;
    bench.add(board);
    // 背板の枠と支柱
    const fm = this._std({ color: 0x4a3826, roughness: 0.7 });
    for (const dy of [-0.5, 0.5]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.045, 0.05), fm);
      bar.position.set(0, 1.42 + dy * 0.98, -0.37 - dy * 0.098);
      bar.rotation.x = -0.10;
      bench.add(bar);
    }
    for (const dx of [-0.56, 0.56]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.06, 0.05), fm);
      post.position.set(dx, 1.42, -0.372);
      post.rotation.x = -0.10;
      bench.add(post);
    }

    // 道具: ペンチ・予備管・雑巾
    const toolMat = this._std({ color: 0x54565e, roughness: 0.4, metalness: 0.8 });
    const plier1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.03), toolMat);
    plier1.position.set(-0.72, 0.935, 0.18);
    plier1.rotation.y = 0.6;
    bench.add(plier1);
    const spare = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.6, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xd8ecef, roughness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1 })
    );
    spare.rotation.z = Math.PI / 2;
    spare.rotation.y = -0.2;
    spare.position.set(0.62, 0.94, 0.22);
    bench.add(spare);
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14),
      this._std({ color: 0x6b5f7a, roughness: 1 }));
    rag.position.set(0.85, 0.93, -0.05);
    rag.rotation.y = -0.4;
    bench.add(rag);

    s.add(bench);
    this.bench = bench;
  }

  _buildCraftsman() {
    // やさしい大男の職人（プリミティブ構成・革エプロン・ゴーグル）
    const g = new THREE.Group();
    const skin = this._std({ color: 0xd9a077, roughness: 0.7 });
    const sweater = this._std({ color: 0x7a5236, roughness: 0.95 });
    const apron = this._std({ color: 0x3f2c1c, roughness: 0.85 });
    const dark = this._std({ color: 0x2a2430, roughness: 0.9 });

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.72, 10), dark);
    legL.position.set(-0.13, 0.36, 0);
    const legR = legL.clone(); legR.position.x = 0.13;
    g.add(legL, legR);
    for (const x of [-0.13, 0.13]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), dark);
      boot.position.set(x, 0.045, 0.05);
      g.add(boot);
    }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 6, 12), sweater);
    torso.position.y = 1.05;
    torso.castShadow = true;
    g.add(torso);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.54, 0.08), apron);
    belly.position.set(0, 1.0, 0.18);
    belly.rotation.x = 0.08;
    g.add(belly);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.04), apron);
    strap.position.set(0, 1.42, 0.22); strap.rotation.x = 0.1;
    g.add(strap);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    this.head = head;
    // ひげ
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), this._std({ color: 0x8d8072, roughness: 1 }));
    beard.scale.set(0.95, 0.6, 0.72);
    beard.position.set(0, -0.085, 0.055);
    head.add(beard);
    // 目（にっこり）
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241a12 });
    for (const x of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), eyeMat);
      eye.position.set(x, 0.035, 0.14);
      head.add(eye);
    }
    // 額のゴーグル
    const goggle = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 20), dark);
    goggle.rotation.x = Math.PI / 2 - 0.25;
    goggle.position.y = 0.125;
    head.add(goggle);
    for (const x of [-0.06, 0.06]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12),
        new THREE.MeshPhysicalMaterial({ color: 0x88ccb0, roughness: 0.2, metalness: 0.3, envMapIntensity: 1 }));
      lens.rotation.x = Math.PI / 2 - 0.25;
      lens.position.set(x, 0.155, 0.07);
      head.add(lens);
    }

    // 左腕（固定・管を支える構え）
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), sweater);
    armL.position.set(-0.27, 1.12, 0.05);
    armL.rotation.z = 0.28; armL.rotation.x = -0.12;
    g.add(armL);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skin);
    handL.position.set(-0.34, 0.88, 0.09);
    g.add(handL);

    // 右腕（トーチを持つ・作業点に向けて可動）
    const armPivot = new THREE.Group();
    armPivot.position.set(0.28, 1.32, 0.1);
    g.add(armPivot);
    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 1, 4, 8), sweater);
    armR.position.z = 0.5 + 0.03;
    armR.rotation.x = Math.PI / 2;
    armPivot.add(armR);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), skin);
    handR.position.z = 1.02;
    armPivot.add(handR);
    // トーチ
    const torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.17, 10),
      this._std({ color: 0x8c4a2a, roughness: 0.35, metalness: 0.75 }));
    body.rotation.x = Math.PI / 2;
    torch.add(body);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.016, 0.09, 8),
      this._std({ color: 0x777d88, roughness: 0.3, metalness: 0.9 }));
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 0.12;
    torch.add(nozzle);
    torch.position.z = 1.1;
    armPivot.add(torch);
    this.armPivot = armPivot;
    this.armR = armR;
    this.handR = handR;
    this.torch = torch;
    this.torchTip = new THREE.Object3D();
    this.torchTip.position.z = 1.28;
    armPivot.add(this.torchTip);

    g.position.set(-1.28, 0, -0.92);
    g.rotation.y = 0.62;
    this.scene.add(g);
    this.craftsman = g;

    // 接地影
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(-1.28, 0.005, -0.86);
    this.scene.add(blob);

    this._armRest = new THREE.Vector3(-0.55, 0.95, -0.35); // 待機時に向ける位置
    this._armTarget = this._armRest.clone();
    this._armLen = 1.28;
  }

  _buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x9aa0c0, 0x352818, 0.34);
    s.add(this.hemi);

    // 作業灯（笠付きランプ）
    this.lamp = new THREE.SpotLight(0xffd9a6, 55, 9, 0.95, 0.55, 1.6);
    this.lamp.position.set(0.35, 2.5, 0.45);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.002;
    this.lamp.target.position.set(0, 0.9, -0.2);
    s.add(this.lamp, this.lamp.target);
    // ランプの笠と電球
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.14, 16, 1, true),
      this._std({ color: 0x1e3a2a, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide })
    );
    shade.position.set(0.35, 2.52, 0.45);
    s.add(shade);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe8bb }));
    this.bulb.position.set(0.35, 2.47, 0.45);
    s.add(this.bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.52, 6),
      this._std({ color: 0x111111 }));
    cord.position.set(0.35, 2.84, 0.45);
    s.add(cord);

    // 窓からの月明かり
    this.moon = new THREE.DirectionalLight(0x8fa5d8, 0.35);
    this.moon.position.set(-2.1, 2.4, -1.0);
    this.moon.target.position.set(0.5, 0.8, 0.6);
    s.add(this.moon, this.moon.target);

    // 点灯時のネオン色ポイントライト（後で色・位置設定）
    this.neonLights = [];
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 7, 2);
      s.add(pl);
      this.neonLights.push(pl);
    }

    // 点灯時の床・壁のにじみ（加算平面）
    const glowT = radialSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 256, 0.2);
    this.floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.6),
      new THREE.MeshBasicMaterial({
        map: glowT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.floorGlow.rotation.x = -Math.PI / 2;
    this.floorGlow.position.set(0, 0.012, -0.1);
    s.add(this.floorGlow);
    this.wallGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 2.8),
      new THREE.MeshBasicMaterial({
        map: glowT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.wallGlow.position.set(0, 1.5, ROOM.backZ + 0.02);
    s.add(this.wallGlow);

    this.darkness = 0; // 0=作業灯 → 1=暗転
  }

  // 暗転度 0..1
  setDarkness(d) {
    this.darkness = d;
    const k = 1 - d;
    this.hemi.intensity = 0.34 * k + 0.015;
    this.lamp.intensity = 55 * Math.pow(k, 1.6);
    this.moon.intensity = 0.35 * k + 0.14 * d;
    this.bulb.material.color.setHex(k > 0.4 ? 0xffe8bb : 0x40372a);
    this.scene.environmentIntensity = 0.55 * k + 0.04;
    if (this.scene.fog) {
      this.scene.fog.color.setHex(0x141021).lerp(new THREE.Color(0x050409), d);
      this.scene.fog.density = 0.075 + d * 0.02;
    }
  }

  // 点灯 0..1（フリッカー値をそのまま渡す）
  setNeonLight(v, shape, tube) {
    const pts = [0.12, 0.4, 0.65, 0.9];
    for (let i = 0; i < 4; i++) {
      const pl = this.neonLights[i];
      if (shape && tube) {
        tube.pointWorldAt(pts[i], pl.position);
        pl.position.z += 0.55; // 面から離して減衰の爆発を防ぐ
        pl.color.copy(gradColorAt(shape, pts[i])); // 曲線上その位置の色
      }
      pl.intensity = v * 1.15;
    }
    if (shape) {
      this.floorGlow.material.color.copy(shape.avg);
      this.wallGlow.material.color.copy(shape.avg);
    }
    this.floorGlow.material.opacity = v * 0.11;
    this.wallGlow.material.opacity = v * 0.09;
  }

  // 右腕でトーチを作業点へ
  aimTorch(worldTarget, dt) {
    // 炎がサイン面より手前に出るように少し引き寄せる（背板に隠れない）
    _aimTmp.copy(worldTarget); _aimTmp.z += 0.16; _aimTmp.y += 0.01;
    this._armTarget.lerp(_aimTmp, Math.min(1, dt * 6));
    this.armPivot.updateWorldMatrix(true, false);
    const pivotW = new THREE.Vector3().setFromMatrixPosition(this.armPivot.matrixWorld);
    const dist = pivotW.distanceTo(this._armTarget);
    const stretch = Math.min(Math.max(dist - 0.18, 0.7), 1.75) / this._armLen;
    this.armPivot.lookAt(this._armTarget);
    this.armPivot.scale.z = stretch;
    this.head.lookAt(this._armTarget);
    this.head.rotation.y = Math.max(-0.9, Math.min(0.9, this.head.rotation.y));
  }
  restTorch(dt) { this.aimTorch(this._armRest, dt * 0.6); }

  torchTipWorld(target = new THREE.Vector3()) {
    this.torchTip.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.torchTip.matrixWorld);
  }

  _buildGallery() {
    // 壁に飾られる過去の作品 + 最初からある見本（虹の渦巻き・稲妻）
    this.gallerySlots = [
      { pos: new THREE.Vector3(-1.05, 2.35, ROOM.backZ + 0.06), used: false },
      { pos: new THREE.Vector3(0.0, 2.5, ROOM.backZ + 0.06), used: false },
      { pos: new THREE.Vector3(1.05, 2.35, ROOM.backZ + 0.06), used: false },
      { pos: new THREE.Vector3(-2.9, 1.9, ROOM.backZ + 0.06), used: false },
      { pos: new THREE.Vector3(2.95, 1.55, ROOM.backZ + 0.06), used: false },
      { pos: new THREE.Vector3(2.4, 2.55, ROOM.backZ + 0.06), used: false },
    ];
    this.galleryMats = [];
    // 見本: 小さな渦巻きネオン（店の飾り、常時ほんのり点灯）
    const spiral = [];
    for (let i = 0; i <= 90; i++) {
      const a = i / 90 * Math.PI * 3.6;
      const r = 0.05 + i / 90 * 0.16;
      spiral.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    this.addGalleryPiece(spiral, [
      { stop: 0, color: new THREE.Color(0x27e0b8) }, { stop: 1, color: new THREE.Color(0x1f9bff) },
    ], new THREE.Vector3(3.0, 2.3, ROOM.backZ + 0.06), 0.55);
    const bolt = [
      [-0.1, 0.3], [0.02, 0.06], [-0.05, 0.04], [0.1, -0.3],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const boltDense = [];
    for (let i = 0; i < bolt.length - 1; i++) {
      for (let k = 0; k < 12; k++) boltDense.push(bolt[i].clone().lerp(bolt[i + 1], k / 12));
    }
    boltDense.push(bolt[bolt.length - 1]);
    this.addGalleryPiece(boltDense, [
      { stop: 0, color: new THREE.Color(0xffe93e) }, { stop: 1, color: new THREE.Color(0xffb02e) },
    ], new THREE.Vector3(-2.9, 2.45, ROOM.backZ + 0.06), 0.5);
  }

  // 作品を壁へ。points はサイン面ローカル点列
  addGalleryPiece(points, grad, pos = null, on = 0.5, scale = 0.42) {
    if (!pos) {
      const slot = this.gallerySlots.find((sl) => !sl.used);
      if (!slot) return null;
      slot.used = true;
      pos = slot.pos;
    }
    const uniforms = {
      uOn: { value: on },
      uCols: { value: [...Array(6)].map(() => new THREE.Color(1, 1, 1)) },
      uStops: { value: [0, 0.2, 0.4, 0.6, 0.8, 1] },
      uNCol: { value: grad.length },
    };
    for (let i = 0; i < 6; i++) {
      const g = grad[Math.min(i, grad.length - 1)];
      uniforms.uCols.value[i].copy(g.color);
      uniforms.uStops.value[i] = g.stop;
    }
    const pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
    // 中心合わせ
    const c = new THREE.Vector3();
    pts.forEach((p) => c.add(p));
    c.multiplyScalar(1 / pts.length);
    pts.forEach((p) => { p.sub(c); p.multiplyScalar(scale); });
    const curve = new UniformPolyCurve(pts);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.min(160, pts.length * 2), 0.008, 6, false),
      additiveMat(GALLERY_FRAG, uniforms)
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.galleryMats.push(uniforms);
    // 小さな色にじみを壁へ
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshBasicMaterial({
        map: radialSprite(), color: grad[0].color, transparent: true,
        opacity: 0.10 * on, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.position.copy(pos).add(new THREE.Vector3(0, 0, -0.02));
    this.scene.add(glow);
    return mesh;
  }

  update(dt, time) {
    this.time = time;
    // 職人の呼吸
    if (this.craftsman) {
      this.craftsman.position.y = Math.sin(time * 1.4) * 0.008;
    }
    // 電球のゆらぎ（作業灯モード時のみ）
    if (this.darkness < 0.5) {
      this.lamp.intensity = 55 * (1 - this.darkness) * (1 + Math.sin(time * 13.7) * 0.015);
    }
  }
}
