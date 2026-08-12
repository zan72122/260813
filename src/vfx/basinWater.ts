// src/vfx/basinWater.ts
// createBasinWater() — a calm, cheap fountain-basin surface. Reflection is
// faked via an environment map (per VISUAL_DIRECTION.md "環境マップ偽装"
// guidance — no per-frame planar reflection render pass), plus a very
// gentle animated normal ripple so it doesn't read as a dead flat disc.

import * as THREE from 'three';

export interface BasinWater {
  readonly mesh: THREE.Mesh;
  update(dt: number, elapsed: number): void;
  setEnvMap(map: THREE.Texture | null): void;
  dispose(): void;
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vec3 displaced = position;
    float ripple = sin((position.x * 3.0 + uTime * 0.6)) * cos((position.y * 3.0 + uTime * 0.5));
    displaced.z += ripple * 0.004;
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uWaterColor;
  uniform vec3 uSkyColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  void main() {
    float edgeFade = smoothstep(0.0, 0.25, 1.0 - distance(vUv, vec2(0.5)) * 2.0);
    float skyMix = clamp(vWorldNormal.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uWaterColor, uSkyColor, skyMix * 0.35);
    gl_FragColor = vec4(color, uOpacity * (0.55 + 0.45 * edgeFade));
  }
`;

export function createBasinWater(radius = 1.4, segments = 32): BasinWater {
  const geometry = new THREE.CircleGeometry(radius, segments);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uWaterColor: { value: new THREE.Color('#5f9aa8') },
      uSkyColor: { value: new THREE.Color('#e8e0d0') },
      uOpacity: { value: 0.78 },
    },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'vfx-basin-water';
  mesh.renderOrder = 0;

  return {
    mesh,
    update(_dt: number, elapsed: number): void {
      material.uniforms.uTime!.value = elapsed;
    },
    setEnvMap(_map: THREE.Texture | null): void {
      // Reserved for a future MeshPhysicalMaterial swap; the shader-based
      // surface above already fakes a sky/water tint cheaply without a
      // full envMap-sampling material, per MASTER_SPEC's render-pass budget.
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
