// 文字を一切使わずに「ここを触って」を伝えるための 3D マーカー。
// 動きだけで意味を作る：上に引くなら矢印が上へ繰り返し動き、
// 触るだけなら輪が広がり、風なら光の点が左右に流れる。
import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { clamp } from './util.js';

export class Hint {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'hint';
    this.group.renderOrder = 950;
    this.group.visible = false;
    scene.add(this.group);

    const white = () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });

    // やわらかい光の玉：対象そのものを目立たせる
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.glow.renderOrder = 949;
    this.group.add(this.glow);

    // 広がる輪 2 枚（時間差でパルスする）
    this.rings = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), white());
      m.renderOrder = 951;
      this.group.add(m);
      this.rings.push(m);
    }

    // 矢印（上げる／触るで向きを変える）
    const arrow = new THREE.Group();
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), white());
    head.rotation.y = Math.PI / 4;
    head.position.y = 0.30;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.45, 0.19), white());
    shaft.position.y = -0.06;
    arrow.add(head, shaft);
    this.arrow = arrow;
    this.arrow.renderOrder = 952;
    this.group.add(arrow);

    // 指先を表す点（なぞる動きを見せる）
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), white());
    this.dot.renderOrder = 952;
    this.group.add(this.dot);

    this.mode = 'tap';
    this.t = 0;
    this.pos = new THREE.Vector3();
    this.scaleBase = 1;
    this.urgency = 0; // 待たせるほど大きくはっきりさせる
    this.opacity = 0;
    this.wantVisible = false;
  }

  // 毎フレーム呼んでよい。種類が変わったときだけアニメーションを頭出しする。
  show(pos, mode = 'tap', scale = 1) {
    this.pos.copy(pos);
    this.scaleBase = scale;
    if (this.mode !== mode || !this.wantVisible) {
      this.mode = mode;
      this.t = 0;
    }
    this.wantVisible = true;
  }

  hide() {
    this.wantVisible = false;
  }

  setUrgency(u) {
    this.urgency = clamp(u, 0, 1);
  }

  update(dt, camera) {
    const target = this.wantVisible ? 1 : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 6);
    this.group.visible = this.opacity > 0.01;
    if (!this.group.visible) return;

    this.t += dt;
    this.group.position.copy(this.pos);

    // 常にカメラに正対させる（画面のどこにあっても同じ大きさで読める）
    this.group.quaternion.copy(camera.quaternion);

    // 距離に応じて拡大し、遠くても近くても同じくらいの大きさに見せる
    const d = camera.position.distanceTo(this.pos);
    const s = this.scaleBase * (0.055 * d) * (1 + this.urgency * 0.28);
    this.group.scale.setScalar(s);

    const a = this.opacity * (0.75 + this.urgency * 0.25);

    // 輪のパルス
    for (let i = 0; i < this.rings.length; i++) {
      const ph = (this.t * 0.85 + i * 0.5) % 1;
      const r = this.rings[i];
      r.scale.setScalar(0.55 + ph * 1.15);
      r.material.opacity = a * (1 - ph) * 0.85;
      r.visible = this.mode !== 'swipe';
    }

    this.glow.material.opacity = a * (0.28 + 0.16 * Math.sin(this.t * 3.4));
    this.glow.scale.setScalar(2.6);

    if (this.mode === 'lift') {
      // 上へ引き上げる動き
      const ph = (this.t * 1.05) % 1;
      const rise = -0.25 + ph * 1.35;
      this.arrow.visible = true;
      this.arrow.rotation.z = 0;
      this.arrow.position.set(0, rise, 0.02);
      this.arrow.scale.setScalar(1);
      for (const c of this.arrow.children) c.material.opacity = a * Math.sin(ph * Math.PI) * 1.1;
      this.dot.visible = true;
      this.dot.position.set(0, -0.32 + ph * 1.2, 0.02);
      this.dot.material.opacity = a * 0.55 * Math.sin(ph * Math.PI);
    } else if (this.mode === 'swipe') {
      // 左右に流れる指
      const ph = (this.t * 0.6) % 1;
      const x = -1.5 + ph * 3.0;
      this.arrow.visible = true;
      this.arrow.rotation.z = -Math.PI / 2;
      this.arrow.position.set(x + 0.55, 0, 0.02);
      for (const c of this.arrow.children) c.material.opacity = a * Math.sin(ph * Math.PI);
      this.dot.visible = true;
      this.dot.position.set(x, 0, 0.02);
      this.dot.material.opacity = a * Math.sin(ph * Math.PI);
    } else {
      // 触る：指が降りてきて押す
      const ph = (this.t * 1.15) % 1;
      const press = Math.pow(Math.sin(ph * Math.PI), 2);
      this.arrow.visible = true;
      this.arrow.rotation.z = Math.PI;
      this.arrow.position.set(0, 1.05 - press * 0.5, 0.02);
      for (const c of this.arrow.children) c.material.opacity = a * (0.55 + 0.45 * press);
      this.dot.visible = false;
    }
  }
}
