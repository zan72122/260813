// パーティクル・ブロブ影・ちょっとした演出。
// モバイル向けにスプライトのプールを使い回す。

import * as THREE from 'three';

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size * 0.46 : size * 0.2;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let softTex = null;
let starTex = null;
let shadowTex = null;

export function initFxTextures() {
  softTex = radialTexture();
  starTex = starTexture();
  shadowTex = radialTexture('rgba(60,40,80,0.55)', 'rgba(60,40,80,0)', 128);
}

// --- ブロブ影 ---
export function makeBlobShadow(radius) {
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.scale.setScalar(radius * 2.4);
  mesh.renderOrder = 1;
  return mesh;
}

// --- パーティクルシステム ---
export class Particles {
  constructor(scene, max = 160) {
    this.pool = [];
    this.active = [];
    this.scene = scene;
    for (let i = 0; i < max; i++) {
      const mat = new THREE.SpriteMaterial({
        map: softTex, transparent: true, depthWrite: false, opacity: 0
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push(s);
    }
  }

  spawn(pos, { color = 0xffffff, n = 10, speed = 2, up = 2.5, gravity = -5, life = 0.7,
               size = 0.25, star = false, spreadY = 0.2 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = this.pool.pop();
      if (!s) return;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      s.userData.vel = new THREE.Vector3(
        Math.cos(a) * sp,
        up * (0.5 + Math.random() * 0.5),
        Math.sin(a) * sp
      );
      s.userData.life = s.userData.maxLife = life * (0.6 + Math.random() * 0.4);
      s.userData.gravity = gravity;
      s.userData.size = size * (0.6 + Math.random() * 0.8);
      s.material.map = star ? starTex : softTex;
      s.material.color.set(color);
      s.material.opacity = 1;
      s.position.copy(pos);
      s.position.y += Math.random() * spreadY;
      s.visible = true;
      this.active.push(s);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.userData.life -= dt;
      if (s.userData.life <= 0 || s.position.y < 0) {
        s.visible = false;
        s.material.opacity = 0;
        this.active.splice(i, 1);
        this.pool.push(s);
        continue;
      }
      s.userData.vel.y += s.userData.gravity * dt;
      s.position.addScaledVector(s.userData.vel, dt);
      const t = s.userData.life / s.userData.maxLife;
      s.material.opacity = Math.min(1, t * 2);
      const sc = s.userData.size * (0.5 + t * 0.7);
      s.scale.set(sc, sc, sc);
    }
  }
}

// --- ゴールマット（星の敷物） ---
export function makeGoalMat(radius = 1.6, color = 0xfff3b0) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(255,240,170,0.85)', 'rgba(255,240,170,0)'),
    transparent: true, depthWrite: false, color
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar(radius * 2);
  disc.position.y = 0.02;
  group.add(disc);
  const starMat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, color: 0xffd76e });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), starMat);
  star.rotation.x = -Math.PI / 2;
  star.scale.setScalar(radius * 0.9);
  star.position.y = 0.03;
  group.add(star);
  group.userData.star = star;
  return group;
}
