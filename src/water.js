import * as THREE from 'three';

/* Simplified liquid: an animated fresnel surface plane, a translucent volume
 * box seen through the tank window, electrolysis bubble streams (GPU points),
 * and a small CPU drip system for when the piece comes out wet. */

export function makeWaterSurface(width, depth) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x0d3d44) },
    uShallow: { value: new THREE.Color(0x7fb8c4) },
    uLightDir: { value: new THREE.Vector3(-0.5, 0.8, 0.35).normalize() },
    uRippleT: { value: 10 },
    uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uDim: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uLightDir;
      uniform float uRippleT;
      uniform vec2 uRippleCenter;
      uniform float uDim;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float h(vec2 p) {
        return sin(p.x * 42.0 + uTime * 1.5) * 0.45
             + sin(p.y * 35.0 - uTime * 1.15) * 0.45
             + sin((p.x + p.y) * 24.0 + uTime * 0.8) * 0.6
             + sin((p.x - p.y * 1.7) * 15.0 - uTime * 0.55) * 0.5;
      }
      float ripple(vec2 p) {
        float d = distance(p, uRippleCenter);
        float t = uRippleT;
        return sin(d * 70.0 - t * 11.0) * exp(-d * 7.0) * exp(-t * 1.4) * 3.5;
      }
      void main() {
        float e = 0.012;
        float h0 = h(vUv) + ripple(vUv);
        float hx = h(vUv + vec2(e, 0.0)) + ripple(vUv + vec2(e, 0.0));
        float hy = h(vUv + vec2(0.0, e)) + ripple(vUv + vec2(0.0, e));
        vec3 n = normalize(vec3((h0 - hx) * 0.9, 1.0, (h0 - hy) * 0.9));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
        vec3 col = mix(uDeep, uShallow, fres * 0.85 + 0.06);

        vec3 R = reflect(-uLightDir, n);
        float spec = pow(max(dot(R, V), 0.0), 90.0) * 1.4;
        col += vec3(spec);

        // faint moving highlight bands
        col += uShallow * 0.018 * (0.5 + 0.5 * sin(vUv.x * 30.0 + uTime * 0.9 + h0));

        col *= uDim;
        float alpha = 0.62 + 0.3 * fres;
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const geo = new THREE.PlaneGeometry(width, depth, 1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

export function makeWaterVolume(width, height, depth) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x1e7078,
    transparent: true,
    opacity: 0.18,
    roughness: 0.4,
    metalness: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.renderOrder = 1;
  return mesh;
}

/** Electrolysis bubbles: streams rising from the submerged piece.
 *  All motion in the vertex shader; JS only moves the origin + intensity. */
export function makeBubbles(count = 320) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3); // unused, required attr
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = Math.random();              // phase
    seeds[i * 4 + 1] = Math.random() * Math.PI * 2; // angle around piece
    seeds[i * 4 + 2] = 0.012 + Math.random() * 0.085; // radius from origin
    seeds[i * 4 + 3] = 0.55 + Math.random() * 0.9;  // speed factor
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

  const uniforms = {
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector3(0, -10, 0) },
    uWaterY: { value: 1.22 },
    uIntensity: { value: 0 },
    uPixelRatio: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uWaterY;
      uniform float uIntensity;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        float height = max(uWaterY - uOrigin.y, 0.001);
        float life = fract(uTime * 0.22 * aSeed.w + aSeed.x);
        float wob = sin(uTime * 6.0 + aSeed.y * 7.0) * 0.006 * life;
        vec3 pos = uOrigin;
        pos.x += cos(aSeed.y) * aSeed.z + wob;
        pos.z += sin(aSeed.y) * aSeed.z * 0.55 + wob * 0.6;
        pos.y += life * height;
        vAlpha = uIntensity * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.9, 1.0, life));
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (1.2 + life * 1.6) * (1.0 + step(0.93, aSeed.x) * 1.3);
        gl_PointSize = size * uPixelRatio * (140.0 / max(-mv.z, 0.1)) * 0.02;
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float ring = smoothstep(0.5, 0.32, d) * 0.75 + smoothstep(0.2, 0.0, d) * 0.4;
        float hl = smoothstep(0.16, 0.0, length(c + vec2(0.10, 0.10)));
        vec3 col = vec3(0.75, 0.9, 0.95) + hl * 0.6;
        gl_FragColor = vec4(col, ring * vAlpha * 0.85);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 2;
  points.frustumCulled = false;
  points.userData.uniforms = uniforms;
  return points;
}

/** Drips falling off the raised piece: small CPU particle pool. */
export class DripSystem {
  constructor(scene, waterY) {
    this.waterY = waterY;
    const N = this.N = 48;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.alive = new Uint8Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.attr = geo.getAttribute('position');
    const mat = new THREE.PointsMaterial({
      color: 0xbfe4ea, size: 0.011, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.visible = false;
    scene.add(this.points);
    this.emitAcc = 0;
    this.onSplash = null;
  }
  emitFrom(center, radius, rate, dt) {
    this.emitAcc += rate * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      for (let i = 0; i < this.N; i++) {
        if (!this.alive[i]) {
          this.alive[i] = 1;
          this.pos[i * 3] = center.x + (Math.random() - 0.5) * radius * 2;
          this.pos[i * 3 + 1] = center.y - Math.random() * 0.05;
          this.pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * radius;
          this.vel[i * 3] = (Math.random() - 0.5) * 0.02;
          this.vel[i * 3 + 1] = -0.05;
          this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
          break;
        }
      }
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (!this.alive[i]) { this.pos[i * 3 + 1] = -10; continue; }
      any = true;
      this.vel[i * 3 + 1] -= 9.8 * dt * 0.55; // slightly damped (surface tension fudge)
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < this.waterY) {
        this.alive[i] = 0;
        this.pos[i * 3 + 1] = -10;
        if (this.onSplash && Math.random() < 0.5) this.onSplash();
      }
    }
    this.points.visible = any;
    this.attr.needsUpdate = true;
  }
}

/** Tiny sparkles that twinkle around the displayed piece. */
export function makeSparkles(count = 26) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.05 + Math.random() * 0.13;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.35) * 0.2;
    pos[i * 3 + 2] = Math.sin(a) * r * 0.7 + 0.03;
    seed[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 }, uPixelRatio: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTw;
      void main() {
        vTw = max(0.0, sin(uTime * 1.7 + aSeed * 13.0));
        vTw = pow(vTw, 6.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + vTw * 5.0) * uPixelRatio * (60.0 / max(-mv.z, 0.1)) * 0.02;
      }`,
    fragmentShader: /* glsl */`
      uniform float uIntensity;
      varying float vTw;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float star = smoothstep(0.5, 0.0, d);
        star += smoothstep(0.06, 0.0, abs(c.x)) * smoothstep(0.5, 0.1, abs(c.y)) * 0.6;
        star += smoothstep(0.06, 0.0, abs(c.y)) * smoothstep(0.5, 0.1, abs(c.x)) * 0.6;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.9), star * vTw * uIntensity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.uniforms = uniforms;
  return points;
}
