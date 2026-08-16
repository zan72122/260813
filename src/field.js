// 不思議なフィールド — 半透明の虹色に光る円盤。
// 「ここに入ると変わる」と一目で分かるよう、常時アニメーションする。

import * as THREE from 'three';

const fieldVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 虹色の薄膜: 中心は淡く、縁に向かって虹のリングが流れる
const fieldFrag = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  uniform float uActive;   // 押し潰し中 1
  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float ang = atan(p.y, p.x);
    float ring = smoothstep(0.55, 0.95, r) * smoothstep(1.0, 0.97, r);
    vec3 rainbow = hue(fract(r * 1.4 - uTime * 0.25 + ang * 0.08));
    vec3 base = mix(vec3(1.0, 0.85, 0.95), vec3(0.75, 0.9, 1.0), 0.5 + 0.5 * sin(uTime * 0.7));
    float centerGlow = smoothstep(1.0, 0.0, r) * 0.35;
    float pulse = 0.75 + 0.25 * sin(uTime * (3.0 + uActive * 6.0));
    vec3 col = base * centerGlow + rainbow * ring * (0.55 + uActive * 0.45) * pulse;
    float alpha = centerGlow * (0.5 + uActive * 0.3) + ring * 0.85 * pulse;
    gl_FragColor = vec4(col, alpha * 0.9);
  }
`;

export class Field {
  constructor(scene) {
    this.scene = scene;
    this.radius = 1.3;
    this.targetRadius = 1.3;
    this.pos = new THREE.Vector3(0, 0, 4);
    this.target = new THREE.Vector3(0, 0, 4);
    this.active = 0;

    this.group = new THREE.Group();

    this.discMat = new THREE.ShaderMaterial({
      vertexShader: fieldVert,
      fragmentShader: fieldFrag,
      uniforms: { uTime: { value: 0 }, uActive: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.04;
    this.disc.renderOrder = 3;
    this.group.add(this.disc);

    // 縁のリング（実体感）
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd6ff, transparent: true, opacity: 0.9, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);

    scene.add(this.group);
    this.time = 0;
    this.growFx = 0;
  }

  setTarget(x, z) {
    this.target.set(x, 0, z);
  }

  grow(r) {
    this.targetRadius = r;
    this.growFx = 1;
  }

  contains(pos, margin = 0) {
    const dx = pos.x - this.pos.x;
    const dz = pos.z - this.pos.z;
    return Math.hypot(dx, dz) <= this.radius + margin;
  }

  update(dt, isDown, isSquashing) {
    this.time += dt;
    // 指へ滑らかに追従（急ぎすぎない — ふわっと漂う感じ）
    const k = isDown ? 10 : 4;
    this.pos.lerp(this.target, Math.min(1, k * dt));

    // 半径の成長（シュワーッ）
    this.radius += (this.targetRadius - this.radius) * Math.min(1, 3 * dt);
    this.growFx = Math.max(0, this.growFx - dt);

    this.active += ((isSquashing ? 1 : 0) - this.active) * Math.min(1, 8 * dt);

    const breathe = 1 + Math.sin(this.time * 2.2) * 0.015 + this.growFx * 0.12 * Math.sin(this.growFx * 20);
    const r = this.radius * breathe;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.disc.scale.setScalar(r);
    this.ring.scale.setScalar(r);
    this.discMat.uniforms.uTime.value = this.time;
    this.discMat.uniforms.uActive.value = this.active;
    this.ring.material.opacity = 0.55 + this.active * 0.4 + Math.sin(this.time * 3) * 0.1;
    this.ring.material.color.setHSL(0.85 + Math.sin(this.time * 0.8) * 0.1, 0.75, 0.8);
  }
}
