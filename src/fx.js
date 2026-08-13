// FX: 加熱の火花 / 点灯のきらめき / 空気中の塵 / トーチの炎
import * as THREE from 'three';
import { radialSprite, flameSprite } from './textures.js';

class ParticlePool {
  constructor(scene, count, texture, size, blending = THREE.AdditiveBlending) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);   // 残り寿命
    this.maxLife = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    this.baseCol = new Float32Array(count * 3);
    this.sizeArr = new Float32Array(count);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArr, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: { value: size }, uPR: { value: 1 } },
      vertexShader: `
        attribute float aSize;
        varying vec3 vCol;
        uniform float uScale;
        uniform float uPR;
        void main(){
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // aSize≈1..10 → 距離1mで aSize*uScale px、上限クランプで暴走防止
          gl_PointSize = clamp(aSize * uScale / max(0.3, -mv.z), 1.0, 44.0) * uPR;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vCol;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          vec3 c = vCol * t.rgb;
          if (c.r + c.g + c.b < 0.01) discard;
          gl_FragColor = vec4(c, 1.0);
        }`,
      vertexColors: true,
      transparent: true,
      blending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this.gravity = 0;
    this.drag = 1;
    for (let i = 0; i < count; i++) this.life[i] = 0;
  }

  spawn(p, v, color, life, size) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.baseCol[i * 3] = color.r; this.baseCol[i * 3 + 1] = color.g; this.baseCol[i * 3 + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.sizeArr[i] = size;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { continue; }
      any = true;
      this.life[i] -= dt;
      const f = Math.max(this.life[i] / this.maxLife[i], 0);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += this.gravity * dt;
      const dr = Math.pow(this.drag, dt * 60);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      // 出現直後にふわっと立ち上がり、寿命の後半で消えていく
      const fadeIn = 1 - f > 0.12 ? 1 : (1 - f) / 0.12;
      const fadeOut = f < 0.45 ? f / 0.45 : 1;
      const fade = Math.max(0, fadeIn * fadeOut * fadeOut);
      this.col[i * 3] = this.baseCol[i * 3] * fade;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * fade;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * fade;
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
    }
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const dot = radialSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64, 0.3);
    this.sparks = new ParticlePool(scene, 90, dot, 5);
    this.sparks.gravity = 0.55; // 上昇後ゆっくり落ちる火の粉
    this.sparks.drag = 0.965;
    this.twinkles = new ParticlePool(scene, 160, dot, 7);
    this.twinkles.gravity = -0.05;
    this.twinkles.drag = 0.94;

    // 塵（作業灯の光の中を漂う）
    this.dustGeo = new THREE.BufferGeometry();
    const N = 110;
    const dp = new Float32Array(N * 3);
    this.dustSeed = [];
    for (let i = 0; i < N; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 2.6;
      dp[i * 3 + 1] = 0.7 + Math.random() * 1.9;
      dp[i * 3 + 2] = -1.1 + Math.random() * 2.2;
      this.dustSeed.push(Math.random() * 100);
    }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dustMat = new THREE.PointsMaterial({
      map: dot, size: 0.014, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff2d8, sizeAttenuation: true,
    });
    const dust = new THREE.Points(this.dustGeo, this.dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    // トーチ炎（スプライト2枚 + ポイントライト）
    this.flame = new THREE.Group();
    const ft = flameSprite();
    this.flameOuter = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flameOuter.scale.set(0.09, 0.15, 1);
    this.flameOuter.center.set(0.5, 0.15);
    this.flameOuter.renderOrder = 30;
    this.flame.add(this.flameOuter);
    this.flameLight = new THREE.PointLight(0xff9a3a, 0, 2.4, 2);
    this.flame.add(this.flameLight);
    this.flame.visible = false;
    scene.add(this.flame);
    this.flamePower = 0; // 0=off, 0.2=種火, 1=全開

    this._tmp = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  setFlame(worldPos, power, up = null) {
    this.flame.visible = power > 0.01;
    if (worldPos) this.flame.position.copy(worldPos);
    this.flamePower = power;
  }

  burstSparks(worldPos, n = 4, heatCol = 0xffa63e) {
    for (let i = 0; i < n; i++) {
      this._tmp.set(
        (Math.random() - 0.5) * 0.5,
        0.4 + Math.random() * 0.9,
        (Math.random() - 0.5) * 0.5
      );
      this._col.setHex(heatCol).multiplyScalar(0.7 + Math.random() * 0.5);
      this.sparks.spawn(
        { x: worldPos.x + (Math.random() - 0.5) * 0.03, y: worldPos.y, z: worldPos.z + (Math.random() - 0.5) * 0.03 },
        this._tmp, this._col, 0.4 + Math.random() * 0.5, 3 + Math.random() * 4
      );
    }
  }

  burstTwinkles(getPoint, n, colorAt) {
    for (let i = 0; i < n; i++) {
      const s = Math.random();
      const p = getPoint(s);
      this._tmp.set((Math.random() - 0.5) * 0.7, Math.random() * 0.5, 0.2 + Math.random() * 0.5);
      const c = colorAt(s);
      this.twinkles.spawn(p, this._tmp, c, 0.7 + Math.random() * 0.9, 3 + Math.random() * 5);
    }
  }

  softTwinkle(getPoint, colorAt) {
    const s = Math.random();
    const p = getPoint(s);
    this._tmp.set((Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.12, 0.1);
    this.twinkles.spawn(p, this._tmp, colorAt(s), 1.1, 2.5 + Math.random() * 3.5);
  }

  setDustTint(color, opacity) {
    this.dustMat.color.copy(color);
    this.dustMat.opacity = opacity;
  }

  update(dt, time) {
    this.sparks.update(dt);
    this.twinkles.update(dt);
    // 塵の漂い
    const p = this.dustGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const seed = this.dustSeed[i];
      p.array[i * 3] += Math.sin(time * 0.3 + seed) * 0.0004;
      p.array[i * 3 + 1] += Math.cos(time * 0.23 + seed * 1.7) * 0.0003 - 0.00012;
      if (p.array[i * 3 + 1] < 0.4) p.array[i * 3 + 1] = 2.6;
    }
    p.needsUpdate = true;
    // 炎のゆらぎ
    if (this.flame.visible) {
      const fl = this.flamePower;
      const flick = 1 + Math.sin(time * 31) * 0.14 + Math.sin(time * 53.7) * 0.09;
      this.flameOuter.scale.set(0.05 + 0.075 * fl * flick, 0.08 + 0.13 * fl * flick, 1);
      this.flameOuter.material.opacity = Math.min(1, 0.35 + fl * 0.75);
      this.flameLight.intensity = fl * 2.6 * flick;
    } else {
      this.flameLight.intensity = 0;
    }
  }
}
