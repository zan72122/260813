// src/vfx/rainbow.ts
// createFinaleRainbow() — a very faint mist rainbow arc for the finale.
// Explicitly NOT flashing: opacity only ever drifts slowly (period ~6s) and
// is capped low, per VISUAL_DIRECTION.md "画面全体の高速点滅は禁止".

import * as THREE from 'three';

export interface FinaleRainbow {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setIntensity(v: number): void;
  dispose(): void;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Soft 7-band rainbow gradient across the arc, faded at both radial edges
// and both angular ends so it reads as a mist band, not a hard-edged decal.
const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  vec3 hueToRgb(float h) {
    vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c;
  }

  void main() {
    float angularFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float radialFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
    vec3 rainbow = hueToRgb(vUv.x * 0.85 + 0.02);
    vec3 misted = mix(rainbow, vec3(1.0), 0.3);
    float shimmer = 0.92 + 0.08 * sin(vUv.x * 20.0 + uTime * 0.4);
    float alpha = uOpacity * angularFade * radialFade * shimmer;
    gl_FragColor = vec4(misted, alpha);
  }
`;

export function createFinaleRainbow(radius = 3.2, arcDeg = 100, bandWidth = 0.55): FinaleRainbow {
  const group = new THREE.Group();
  group.name = 'vfx-finale-rainbow';

  const geometry = new THREE.RingGeometry(
    radius - bandWidth / 2,
    radius + bandWidth / 2,
    48,
    1,
    THREE.MathUtils.degToRad(90 - arcDeg / 2),
    THREE.MathUtils.degToRad(arcDeg),
  );
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  material.toneMapped = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'vfx-finale-rainbow-mesh';
  mesh.renderOrder = 5;
  group.add(mesh);

  let target = 0;
  let current = 0;
  const PEAK_OPACITY = 0.22; // deliberately low — "very faint mist rainbow"

  return {
    group,
    update(dt: number, elapsed: number): void {
      current += (target - current) * Math.min(1, dt * 1.5);
      const slowDrift = 0.9 + 0.1 * Math.sin(elapsed * (Math.PI * 2) / 6);
      material.uniforms.uOpacity!.value = current * PEAK_OPACITY * slowDrift;
      material.uniforms.uTime!.value = elapsed;
    },
    setIntensity(v: number): void {
      target = Math.max(0, Math.min(1, v));
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
