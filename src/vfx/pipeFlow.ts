// src/vfx/pipeFlow.ts
// createPipeFlow(curve) — a glowing water slug traveling t:0..1 through a
// cutaway pipe. The pipe shell is a partial-arc tube (open on top so the
// interior reads as "cutaway"); the water itself is a full-arc tube driven
// entirely by an animated shader keyed on tube-length UV vs. a uProgress
// uniform — no geometry is rebuilt per frame, and no fluid simulation.

import * as THREE from 'three';
import { buildArcTubeGeometry } from './tubeGeometry';

export interface PipeFlow {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setProgress(t: number): void;
  dispose(): void;
}

const SLUG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SLUG_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uProgress;
  uniform float uWindow;
  uniform float uTime;
  uniform vec3 uColorBase;
  uniform vec3 uColorGlow;
  varying vec2 vUv;
  void main() {
    // Distance behind (positive) / ahead (negative) of the traveling slug.
    float d = vUv.y - uProgress;
    float trail = smoothstep(uWindow * 1.6, 0.0, max(d, 0.0));      // fades out behind
    float head = smoothstep(uWindow * 0.5, 0.0, max(-d, 0.0));      // sharper ahead edge
    float band = max(trail * 0.7, head);
    float shimmer = 0.9 + 0.1 * sin(vUv.x * 18.0 + uTime * 4.0);
    vec3 color = mix(uColorBase, uColorGlow, smoothstep(uWindow * 0.4, 0.0, abs(d)));
    float alpha = band * shimmer * 0.85;
    // Very faint ambient wetness along the already-passed pipe interior.
    alpha += 0.02 * step(0.0, uProgress) * step(vUv.y, uProgress);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export function createPipeFlow(curve: THREE.CatmullRomCurve3, radialSegments = 10): PipeFlow {
  const group = new THREE.Group();
  group.name = 'vfx-pipe-flow';

  const tubularSegments = Math.max(24, Math.min(96, Math.round(curve.getLength() * 12)));
  const shellRadius = 0.16;
  const waterRadius = shellRadius * 0.7;

  // Cutaway casing: leaves a ~100° gap at the top of the arc open.
  const gapDeg = 100;
  const shellGeo = buildArcTubeGeometry(
    curve,
    tubularSegments,
    shellRadius,
    radialSegments,
    THREE.MathUtils.degToRad(gapDeg / 2),
    THREE.MathUtils.degToRad(360 - gapDeg),
  );
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8f8672'),
    roughness: 0.85,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeo, shellMaterial);
  shell.name = 'fountain-pipe-shell';
  shell.receiveShadow = true;
  group.add(shell);

  const waterGeo = buildArcTubeGeometry(curve, tubularSegments, waterRadius, radialSegments, 0, Math.PI * 2);
  const slugMaterial = new THREE.ShaderMaterial({
    vertexShader: SLUG_VERTEX,
    fragmentShader: SLUG_FRAGMENT,
    uniforms: {
      uProgress: { value: 0 },
      uWindow: { value: 0.09 },
      uTime: { value: 0 },
      uColorBase: { value: new THREE.Color('#3f8fa3') },
      uColorGlow: { value: new THREE.Color('#eafcff') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  slugMaterial.toneMapped = false;
  const water = new THREE.Mesh(waterGeo, slugMaterial);
  water.name = 'fountain-pipe-water';
  water.renderOrder = 2;
  group.add(water);

  return {
    group,
    update(_dt: number, elapsed: number): void {
      slugMaterial.uniforms.uTime!.value = elapsed;
    },
    setProgress(t: number): void {
      slugMaterial.uniforms.uProgress!.value = Math.max(0, Math.min(1, t));
    },
    dispose(): void {
      shellGeo.dispose();
      shellMaterial.dispose();
      waterGeo.dispose();
      slugMaterial.dispose();
    },
  };
}
